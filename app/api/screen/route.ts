import { NextRequest, NextResponse } from "next/server";
import jsonpack from "jsonpack";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../lib/supabase-server";
import { screenEUConsolidatedCsv } from "../../lib/eu-sanctions";
import { screenUNConsolidatedXml } from "../../lib/un-sanctions";
import { matchNames, normalizeName } from "../../lib/name-matching";
import { logServerError } from "../../lib/server-log";
import { EUOfficialJournalDataset, screenEUOfficialJournalDataset } from "../../lib/eu-official-journal";

export const dynamic = "force-dynamic";
const EU_TRACKER = "https://data.europa.eu/apps/eusanctionstracker";
const EU_TRACKER_DATASETS = `${EU_TRACKER}/datasets`;
const EU_CONSOLIDATED_PAGE = "https://webgate.ec.europa.eu/fsd/fsf/#!/files";
const EU_SOURCE_KEY = "eu_consolidated";
const EU_JOURNAL_SOURCE_KEY = "eu_official_journal";
const UN_XML = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const UN_PAGE = "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list";
const UN_SOURCE_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const MT_API = "https://assetrecovery.mt/wp-admin/admin-ajax.php";
const MT_PAGE = "https://assetrecovery.mt/court-orders/";
type Match = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string; aliases?:string[]; dateOfBirth?:string; nationalities?:string[]; identificationNumbers?:string[]; matchReason?:string; legalBasis?:string };
type SourceResult = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string; sourceUrl?:string; version?:string; lastUpdated?:string; licence?:string };
type EUTrackerSubject = { id:string; subjectType?:string; date?:string; identity?:Array<{ firstName?:string; middleName?:string; lastName?:string; wholeName?:string; function?:string }>; origin?:{ birthDate?:string; countryDescription?:string; city?:string }; nationality?:string[]; regime?:string; financialSanction?:{ title?:string; url?:string }; travelBan?:unknown; remarks?:string };
let euTrackerCache:{ subjects:EUTrackerSubject[]; at:number; updatedAt:string }|undefined, euConsolidatedCache:{csv:string;at:number;version:string;lastUpdated:string}|undefined, euJournalCache:{dataset:EUOfficialJournalDataset;at:number;version:string;lastUpdated:string}|undefined, unCache:{ text:string; at:number }|undefined;
const CACHE_MS = 15 * 60 * 1000;

function norm(v:string){return normalizeName(v)}
function score(candidate:string, query:string){return matchNames([candidate],query).confidence}
async function fetchText(url:string,options?:RequestInit){const response=await fetch(url,{...options,cache:"no-store",signal:AbortSignal.timeout(35000),headers:{"User-Agent":"ClearCheck/1.0 official-list-screening",...(options?.headers||{})}});if(!response.ok)throw new Error(`Source returned ${response.status}`);return response.text()}
async function loadEUConsolidated(){
  if(euConsolidatedCache&&Date.now()-euConsolidatedCache.at<CACHE_MS)return euConsolidatedCache;
  const admin=getSupabaseAdmin(),{data:snapshot,error}=await admin.from("source_snapshots").select("storage_bucket,storage_path,checksum_sha256,row_count,refreshed_at,status,error_message").eq("source_key",EU_SOURCE_KEY).maybeSingle();
  if(error||!snapshot)throw new Error("Official EU consolidated-list snapshot is not configured");
  if(snapshot.status!=="ready"||!snapshot.refreshed_at)throw new Error("Official EU consolidated-list snapshot is unavailable");
  const refreshedAt=new Date(snapshot.refreshed_at).getTime();
  if(!Number.isFinite(refreshedAt))throw new Error("Official EU consolidated-list snapshot has an invalid update time");
  const {data:file,error:downloadError}=await admin.storage.from(snapshot.storage_bucket).download(snapshot.storage_path);
  if(downloadError||!file)throw new Error("Official EU consolidated-list snapshot could not be read");
  const csv=await file.text();
  if(csv.length<100_000)throw new Error("Official EU consolidated-list snapshot failed validation");
  euConsolidatedCache={csv,at:Date.now(),version:snapshot.checksum_sha256||`rows:${snapshot.row_count||"unknown"}`,lastUpdated:snapshot.refreshed_at};
  return euConsolidatedCache;
}
async function loadEUOfficialJournal(){
  if(euJournalCache&&Date.now()-euJournalCache.at<CACHE_MS)return euJournalCache;
  const admin=getSupabaseAdmin(),{data:snapshot,error}=await admin.from("source_snapshots").select("storage_bucket,storage_path,checksum_sha256,row_count,refreshed_at,status").eq("source_key",EU_JOURNAL_SOURCE_KEY).maybeSingle();
  if(error||!snapshot)throw new Error("Official EU legal-designation snapshot is not configured");
  if(snapshot.status!=="ready"||!snapshot.refreshed_at)throw new Error("Official EU legal-designation snapshot is unavailable");
  const refreshedAt=new Date(snapshot.refreshed_at).getTime();
  if(!Number.isFinite(refreshedAt))throw new Error("Official EU legal-designation snapshot has an invalid update time");
  const {data:file,error:downloadError}=await admin.storage.from(snapshot.storage_bucket).download(snapshot.storage_path);
  if(downloadError||!file)throw new Error("Official EU legal-designation snapshot could not be read");
  const dataset=JSON.parse(await file.text()) as EUOfficialJournalDataset;
  if(!dataset||!Array.isArray(dataset.entries)||dataset.entries.length<10||!dataset.version||dataset.entries.some(entry=>!entry.name||!entry.type||!entry.legalUrl))throw new Error("Official EU legal-designation snapshot failed validation");
  euJournalCache={dataset,at:Date.now(),version:snapshot.checksum_sha256||dataset.version,lastUpdated:snapshot.refreshed_at};
  return euJournalCache;
}
async function loadEUTracker(){
  const manifest=JSON.parse(await fetchText(`${EU_TRACKER_DATASETS}/manifest.json`)) as { updated?:string; versions?:Record<string,string> };
  const version=manifest.versions?.subjects;
  if(!version||!manifest.updated)throw new Error("EU Sanctions Tracker manifest is unavailable");
  const subjects=jsonpack.unpack<EUTrackerSubject[]>(await fetchText(`${EU_TRACKER_DATASETS}/subjects.jsonpack?v=${encodeURIComponent(version)}`));
  if(!Array.isArray(subjects)||subjects.length<500||!subjects.some(subject=>subject.id&&subject.identity?.length))throw new Error("EU Sanctions Tracker dataset failed validation");
  return{subjects,at:Date.now(),updatedAt:manifest.updated};
}
async function screenEU(query:string,subjectType:"person"|"business"){
  const checkedAt=new Date().toISOString();
  try{
    const [snapshot,journal]=await Promise.all([loadEUConsolidated(),loadEUOfficialJournal()]),screened=screenEUConsolidatedCsv(snapshot.csv,query,subjectType);
    const officialJournalMatches:Match[]=screenEUOfficialJournalDataset(journal.dataset,query,subjectType).map(match=>({source:"EU",sourceClass:"eu",name:match.name,type:subjectType==="person"?"Individual":"Entity",confidence:match.confidence,detail:match.detail,meta:["EU Official Journal legal designation — confirm current status",match.legalBasis,match.listedOn?`Listed ${match.listedOn}`:"",match.dateOfBirth||"",match.nationalities.length?`Nationality: ${match.nationalities.join(", ")}`:"",match.identificationNumbers.length?`ID: ${match.identificationNumbers.join(", ")}`:""].filter(Boolean),href:match.legalUrl,aliases:match.aliases,dateOfBirth:match.dateOfBirth,nationalities:match.nationalities,identificationNumbers:match.identificationNumbers,matchReason:match.matchReason,legalBasis:match.legalBasis}));
    const found:Match[]=screened.matches.map(match=>({
      source:"EU",sourceClass:"eu",name:match.name,type:match.type,confidence:match.confidence,detail:match.detail,
      meta:["European Commission consolidated list",match.euReference,match.legalBasis,match.programme,match.dateOfBirth,match.nationalities.length?`Nationality: ${match.nationalities.join(", ")}`:"",match.identificationNumbers.length?`ID: ${match.identificationNumbers.join(", ")}`:""].filter((value):value is string=>Boolean(value)),
      href:match.legalUrl,aliases:match.aliases,dateOfBirth:match.dateOfBirth,nationalities:match.nationalities,identificationNumbers:match.identificationNumbers,matchReason:match.matchReason,legalBasis:match.legalBasis,
    }));
    const known=new Set(found.map(match=>`${norm(match.name)}:${match.legalBasis||""}`));for(const match of officialJournalMatches){const key=`${norm(match.name)}:${match.legalBasis||""}`;if(!known.has(key)){known.add(key);found.push(match)}}
    return{matches:found,source:{key:"EU",name:"European Union",status:"complete",count:found.length,checkedAt,sourceUrl:EU_CONSOLIDATED_PAGE,version:`consolidated:${snapshot.version};official-journal:${journal.version}`,lastUpdated:[screened.generationDate||snapshot.lastUpdated,journal.lastUpdated].sort().at(-1),licence:"European Commission reuse policy; Official Journal text prevails",message:`European Commission Consolidated Financial Sanctions List checked (${screened.rowCount} rows), plus ${journal.dataset.entries.length} legal designations extracted dataset-wide from ${journal.dataset.acts} recent Official Journal acts. Potential matches require manual current-status review.`} satisfies SourceResult};
  }catch(consolidatedError){
    const fallback:Match[]=[];
    try{
      const now=Date.now();if(!euTrackerCache||now-euTrackerCache.at>CACHE_MS)euTrackerCache=await loadEUTracker();
      for(const subject of euTrackerCache.subjects){
        if(fallback.length>=25)break;
        if(subject.subjectType!==(subjectType==="person"?"person":"enterprise"))continue;
        const aliases=(subject.identity||[]).map(identity=>identity.wholeName||[identity.firstName,identity.middleName,identity.lastName].filter(Boolean).join(" ")).filter(Boolean),nameMatch=matchNames(aliases,query);
        if(!nameMatch.matched)continue;
        const legalBasis=subject.financialSanction?.title||subject.regime||"EU restrictive measure",candidateUrl=subject.financialSanction?.url||"",href=/^https:\/\/eur-lex\.europa\.eu\//i.test(candidateUrl)?candidateUrl:`https://eur-lex.europa.eu/search.html?scope=EURLEX&text=${encodeURIComponent(legalBasis)}`;
        fallback.push({source:"EU",sourceClass:"eu",name:aliases[0]||nameMatch.matchedName||query,type:subject.subjectType==="person"?"Individual":"Entity",confidence:nameMatch.confidence,detail:subject.remarks||"Potential name match in the European Commission EU Sanctions Tracker.",meta:["Tracker fallback — consolidated list unavailable",legalBasis,subject.origin?.birthDate||subject.date,...(subject.nationality||[])].filter((value):value is string=>Boolean(value)),href,aliases,dateOfBirth:subject.origin?.birthDate||subject.date,nationalities:subject.nationality||[],matchReason:nameMatch.reason,legalBasis});
      }
    }catch{}
    return{matches:fallback,source:{key:"EU",name:"European Union",status:"unavailable",count:fallback.length,checkedAt,sourceUrl:EU_CONSOLIDATED_PAGE,lastUpdated:euTrackerCache?.updatedAt,version:euTrackerCache?.updatedAt||"unavailable",licence:"European Commission reuse policy; Official Journal text prevails",message:`One or more required official EU datasets are unavailable; tracker results are informational only and this screening is incomplete. ${consolidatedError instanceof Error?consolidatedError.message:"Source check failed"}`} satisfies SourceResult};
  }
}
async function screenUN(query:string,subjectType:"person"|"business"){
  const now=Date.now();if(!unCache||now-unCache.at>CACHE_MS)unCache={text:await fetchText(UN_XML),at:now};
  if(unCache.text.length<100_000)throw new Error("UN consolidated list failed validation");
  const screened=screenUNConsolidatedXml(unCache.text,query,subjectType),generatedAt=screened.generatedAt?new Date(screened.generatedAt).getTime():NaN;
  if(!Number.isFinite(generatedAt)||now-generatedAt>UN_SOURCE_MAX_AGE_MS)throw new Error("UN consolidated list is older than 72 hours");
  const matches:Match[]=screened.matches.map(match=>({...match,source:"UN",sourceClass:"un",href:UN_PAGE}));
  return{matches,source:{key:"UN",name:"United Nations",status:"complete",count:matches.length,checkedAt:new Date().toISOString(),sourceUrl:UN_PAGE,lastUpdated:screened.generatedAt,version:screened.generatedAt||"live",licence:"United Nations public sanctions data",message:`Live UN consolidated list checked (${screened.recordCount} ${subjectType==="person"?"individuals":"entities"}).`} satisfies SourceResult}
}
async function screenMT(query:string){const body=new URLSearchParams({action:"get_court_orders_paginated",name:query,draw:"1",start:"0",length:"100",compilation:"",idno:"",year:""});const text=await fetchText(MT_API,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});const payload=JSON.parse(text) as {data?:unknown;draw?:unknown;recordsFiltered?:unknown};if(!Array.isArray(payload.data)||typeof payload.draw!=="number"||typeof payload.recordsFiltered!=="number")throw new Error("Malta ARB response failed validation");const found:Match[]=payload.data.map((r:Record<string,string>)=>{const href=r.document?.match(/href=['"]([^'"]+)/i)?.[1]?.replace(/\\\//g,"/")||MT_PAGE;return{source:"MT",sourceClass:"mt",name:r.names||query,type:"Court-order subject",confidence:score(r.names||query,query),detail:`${r.court_order||"Court"} order published by Malta's Asset Recovery Bureau.`,meta:[r.compilation_number,r.identification_numbers,r.date].filter(Boolean),href,identificationNumbers:r.identification_numbers?[r.identification_numbers]:undefined}});return{matches:found,source:{key:"MT",name:"Malta ARB",status:"complete",count:found.length,checkedAt:new Date().toISOString(),sourceUrl:MT_PAGE,version:"live query",licence:"Publisher terms require confirmation before commercial launch",message:`Live Malta ARB court-order search checked (${payload.recordsFiltered} returned records).`} satisfies SourceResult}}

export async function POST(request:NextRequest){
  const token=getBearerToken(request);
  if(!token)return NextResponse.json({error:"Log in before running a screening."},{status:401});
  const supabase=getSupabaseForToken(token);
  const {data:{user},error:userError}=await supabase.auth.getUser(token);
  if(userError||!user)return NextResponse.json({error:"Your session has expired. Log in again."},{status:401});
  const {data:membership,error:membershipError}=await supabase.from("organisation_members").select("organisation_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(membershipError||!membership)return NextResponse.json({error:"Your organisation workspace is not ready. Contact support."},{status:403});

  const body=await request.json().catch(()=>null) as {query?:unknown;subjectType?:unknown;customerReference?:unknown;screeningPurpose?:unknown;identifiers?:unknown}|null;
  const query=typeof body?.query==="string"?body.query.trim():"";
  const subjectType=body?.subjectType==="business"?"business":"person";
  const customerReference=typeof body?.customerReference==="string"?body.customerReference.trim().slice(0,120):"";
  const screeningPurpose=typeof body?.screeningPurpose==="string"?body.screeningPurpose.trim().slice(0,500):"";
  const rawIdentifiers=body?.identifiers&&typeof body.identifiers==="object"?body.identifiers as Record<string,unknown>:{};
  const identifiers=Object.fromEntries(Object.entries(rawIdentifiers).filter(([,value])=>typeof value==="string"&&value.trim()).map(([key,value])=>[key,String(value).trim().slice(0,160)]));
  if(query.length<2||query.length>120)return NextResponse.json({error:"Enter a name between 2 and 120 characters."},{status:400});
  const jobs=[{key:"EU",name:"European Union",run:()=>screenEU(query,subjectType)},{key:"UN",name:"United Nations",run:()=>screenUN(query,subjectType)},{key:"MT",name:"Malta ARB",run:()=>screenMT(query)}];
  const settled=await Promise.allSettled(jobs.map(job=>job.run())),all:Match[]=[],sources:SourceResult[]=[];
  settled.forEach((result,index)=>{if(result.status==="fulfilled"){all.push(...result.value.matches);sources.push(result.value.source)}else{const incidentId=logServerError(`screening.source.${jobs[index].key}`,result.reason);sources.push({key:jobs[index].key,name:jobs[index].name,status:"unavailable",count:0,checkedAt:new Date().toISOString(),message:`Official source unavailable. Reference ${incidentId}`})}});
  const terms=["fraud","eCourts","money laundering","financial crime"];
  const webSearches=terms.map(term=>{const phrase=`\"${query}\" \"${term}\"`;return{term,label:term==="eCourts"?"eCourts":term.replace(/\b\w/g,c=>c.toUpperCase()),query:phrase,href:`https://www.google.com/search?igu=1&hl=en&q=${encodeURIComponent(phrase)}`}});
  const checkedAt=new Date().toISOString();
  sources.push({key:"WEB",name:"Google web checks",status:"review",count:webSearches.length,checkedAt,message:"Four structured Google searches prepared for human review"});
  const riskState=sources.some(source=>source.status==="unavailable")?"incomplete":"review";
  const auditPayload={
    p_actor_id:user.id,
    p_organisation_id:membership.organisation_id,
    p_subject_name:query,
    p_subject_type:subjectType,
    p_risk_state:riskState,
    p_results:all,
    p_sources:sources,
    p_web_searches:webSearches,
    p_checked_at:checkedAt,
  };
  const {data:record,error:recordError}=await getSupabaseAdmin().rpc("record_screening_v3",auditPayload).single();
  if(recordError){
    if(recordError.code==="PGRST202"){
      const incidentId=logServerError("screening.credit_policy_unavailable",recordError);
      return NextResponse.json({error:"Screening is temporarily unavailable. No credit was used.",incidentId},{status:503});
    }
    const noCredits=recordError.message.toLowerCase().includes("no screening credits");
    const incidentId=noCredits?undefined:logServerError("screening.audit_record",recordError);
    return NextResponse.json({error:noCredits?"You have no screening credits remaining. Choose a plan in your dashboard.":"The screening completed, but its audit record could not be saved. No result was returned.",incidentId},{status:noCredits?402:500});
  }
  const savedRecord=record as {screening_id:string;case_reference:string;credits_charged:number};
  const contextUpdate=await getSupabaseAdmin().from("screenings").update({customer_reference:customerReference||null,screening_purpose:screeningPurpose||null,input_identifiers:identifiers}).eq("id",savedRecord.screening_id);
  if(contextUpdate.error&&!['42703','PGRST204'].includes(contextUpdate.error.code||""))logServerError("screening.context_record",contextUpdate.error);
  return NextResponse.json({query,matches:all,sources,webSearches,complete:savedRecord.credits_charged===1,creditsCharged:savedRecord.credits_charged,checkedAt,screeningId:savedRecord.screening_id,caseReference:savedRecord.case_reference},{headers:{"Cache-Control":"no-store"}});
}
