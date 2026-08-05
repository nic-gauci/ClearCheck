import { NextRequest, NextResponse } from "next/server";
import jsonpack from "jsonpack";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken, isMissingRpc } from "../../lib/supabase-server";
import { screenEUConsolidatedCsv } from "../../lib/eu-sanctions";
import { matchNames, normalizeName } from "../../lib/name-matching";
import { logServerError } from "../../lib/server-log";
import { EU_OFFICIAL_JOURNAL_SUPPLEMENT_REVIEWED_AT, officialJournalSupplementIsCurrent, screenEUOfficialJournalSupplements } from "../../lib/eu-official-journal";

export const dynamic = "force-dynamic";
const EU_TRACKER = "https://data.europa.eu/apps/eusanctionstracker";
const EU_TRACKER_DATASETS = `${EU_TRACKER}/datasets`;
const EU_CONSOLIDATED_PAGE = "https://webgate.ec.europa.eu/fsd/fsf/#!/files";
const EU_SOURCE_KEY = "eu_consolidated";
const EU_SOURCE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const UN_XML = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const UN_PAGE = "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list";
const MT_API = "https://assetrecovery.mt/wp-admin/admin-ajax.php";
const MT_PAGE = "https://assetrecovery.mt/court-orders/";
type Match = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string; aliases?:string[]; dateOfBirth?:string; nationalities?:string[]; identificationNumbers?:string[]; matchReason?:string; legalBasis?:string };
type SourceResult = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string; sourceUrl?:string; version?:string; lastUpdated?:string; licence?:string };
type EUTrackerSubject = { id:string; subjectType?:string; date?:string; identity?:Array<{ firstName?:string; middleName?:string; lastName?:string; wholeName?:string; function?:string }>; origin?:{ birthDate?:string; countryDescription?:string; city?:string }; nationality?:string[]; regime?:string; financialSanction?:{ title?:string; url?:string }; travelBan?:unknown; remarks?:string };
let euTrackerCache:{ subjects:EUTrackerSubject[]; at:number; updatedAt:string }|undefined, euConsolidatedCache:{csv:string;at:number;version:string;lastUpdated:string}|undefined, unCache:{ text:string; at:number }|undefined;
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
  if(!Number.isFinite(refreshedAt)||Date.now()-refreshedAt>EU_SOURCE_MAX_AGE_MS)throw new Error("Official EU consolidated-list snapshot is older than 36 hours");
  const {data:file,error:downloadError}=await admin.storage.from(snapshot.storage_bucket).download(snapshot.storage_path);
  if(downloadError||!file)throw new Error("Official EU consolidated-list snapshot could not be read");
  const csv=await file.text();
  if(csv.length<100_000)throw new Error("Official EU consolidated-list snapshot failed validation");
  euConsolidatedCache={csv,at:Date.now(),version:snapshot.checksum_sha256||`rows:${snapshot.row_count||"unknown"}`,lastUpdated:snapshot.refreshed_at};
  return euConsolidatedCache;
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
  const officialJournalMatches:Match[]=screenEUOfficialJournalSupplements(query,subjectType).map(match=>({source:"EU",sourceClass:"eu",name:match.name,type:subjectType==="person"?"Individual":"Entity",confidence:match.confidence,detail:match.detail,meta:["Official Journal verified supplement",match.legalBasis,match.programme,`Listed ${match.listedOn}`,match.dateOfBirth,`Nationality: ${match.nationalities.join(", ")}`],href:match.legalUrl,aliases:match.aliases,dateOfBirth:match.dateOfBirth,nationalities:match.nationalities,identificationNumbers:match.identificationNumbers,matchReason:match.matchReason,legalBasis:match.legalBasis}));
  try{
    const snapshot=await loadEUConsolidated(),screened=screenEUConsolidatedCsv(snapshot.csv,query,subjectType);
    const found:Match[]=screened.matches.map(match=>({
      source:"EU",sourceClass:"eu",name:match.name,type:match.type,confidence:match.confidence,detail:match.detail,
      meta:["European Commission consolidated list",match.euReference,match.legalBasis,match.programme,match.dateOfBirth,match.nationalities.length?`Nationality: ${match.nationalities.join(", ")}`:"",match.identificationNumbers.length?`ID: ${match.identificationNumbers.join(", ")}`:""].filter((value):value is string=>Boolean(value)),
      href:match.legalUrl,aliases:match.aliases,dateOfBirth:match.dateOfBirth,nationalities:match.nationalities,identificationNumbers:match.identificationNumbers,matchReason:match.matchReason,legalBasis:match.legalBasis,
    }));
    const known=new Set(found.map(match=>`${norm(match.name)}:${match.legalBasis||""}`));for(const match of officialJournalMatches){const key=`${norm(match.name)}:${match.legalBasis||""}`;if(!known.has(key)){known.add(key);found.push(match)}}
    const supplementCurrent=officialJournalSupplementIsCurrent();
    return{matches:found,source:{key:"EU",name:"European Union",status:supplementCurrent?"complete":"unavailable",count:found.length,checkedAt,sourceUrl:EU_CONSOLIDATED_PAGE,version:`${snapshot.version};oj-review:${EU_OFFICIAL_JOURNAL_SUPPLEMENT_REVIEWED_AT}`,lastUpdated:screened.generationDate||snapshot.lastUpdated,licence:"European Commission reuse policy; Official Journal text prevails",message:supplementCurrent?`European Commission Consolidated Financial Sanctions List checked (${screened.rowCount} rows) with a reviewed Official Journal supplement.`:"Official Journal supplement review is older than seven days; do not treat the EU result as clear."} satisfies SourceResult};
  }catch(consolidatedError){
    const fallback:Match[]=[];
    try{
      const now=Date.now();if(!euTrackerCache||now-euTrackerCache.at>CACHE_MS)euTrackerCache=await loadEUTracker();
      for(const subject of euTrackerCache.subjects){
        if(fallback.length>=25)break;
        if(subjectType==="person"&&subject.subjectType!=="person")continue;
        if(subjectType==="business"&&subject.subjectType==="person")continue;
        const aliases=(subject.identity||[]).map(identity=>identity.wholeName||[identity.firstName,identity.middleName,identity.lastName].filter(Boolean).join(" ")).filter(Boolean),nameMatch=matchNames(aliases,query);
        if(!nameMatch.matched)continue;
        const legalBasis=subject.financialSanction?.title||subject.regime||"EU restrictive measure",candidateUrl=subject.financialSanction?.url||"",href=/^https:\/\/eur-lex\.europa\.eu\//i.test(candidateUrl)?candidateUrl:`https://eur-lex.europa.eu/search.html?scope=EURLEX&text=${encodeURIComponent(legalBasis)}`;
        fallback.push({source:"EU",sourceClass:"eu",name:aliases[0]||nameMatch.matchedName||query,type:subject.subjectType==="person"?"Individual":"Entity",confidence:nameMatch.confidence,detail:subject.remarks||"Potential name match in the European Commission EU Sanctions Tracker.",meta:["Tracker fallback — consolidated list unavailable",legalBasis,subject.origin?.birthDate||subject.date,...(subject.nationality||[])].filter((value):value is string=>Boolean(value)),href,aliases,dateOfBirth:subject.origin?.birthDate||subject.date,nationalities:subject.nationality||[],matchReason:nameMatch.reason,legalBasis});
      }
    }catch{}
    const known=new Set(fallback.map(match=>`${norm(match.name)}:${match.legalBasis||""}`));for(const match of officialJournalMatches){const key=`${norm(match.name)}:${match.legalBasis||""}`;if(!known.has(key)){known.add(key);fallback.push(match)}}
    return{matches:fallback,source:{key:"EU",name:"European Union",status:"unavailable",count:fallback.length,checkedAt,sourceUrl:EU_CONSOLIDATED_PAGE,lastUpdated:euTrackerCache?.updatedAt,version:`${euTrackerCache?.updatedAt||"unavailable"};oj-review:${EU_OFFICIAL_JOURNAL_SUPPLEMENT_REVIEWED_AT}`,licence:"European Commission reuse policy; Official Journal text prevails",message:`Official consolidated list unavailable; tracker and Official Journal supplement results are informational only. ${consolidatedError instanceof Error?consolidatedError.message:"Source check failed"}`} satisfies SourceResult};
  }
}
function tag(block:string,name:string){const m=block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,"i"));return(m?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim()}
async function screenUN(query:string){const now=Date.now();if(!unCache||now-unCache.at>CACHE_MS)unCache={text:await fetchText(UN_XML),at:now};const found:Match[]=[],seen=new Set<string>();for(const kind of["INDIVIDUAL","ENTITY"]){const blocks=unCache.text.match(new RegExp(`<${kind}>[\\s\\S]*?<\\/${kind}>`,"gi"))||[];for(const block of blocks){const primary=kind==="INDIVIDUAL"?[tag(block,"FIRST_NAME"),tag(block,"SECOND_NAME"),tag(block,"THIRD_NAME"),tag(block,"FOURTH_NAME")].filter(Boolean).join(" "):tag(block,"FIRST_NAME")||tag(block,"NAME");const aliases=[...block.matchAll(/<ALIAS_NAME>([\s\S]*?)<\/ALIAS_NAME>/gi)].map(m=>m[1].trim()),nameMatch=matchNames([primary,...aliases],query);if(!nameMatch.matched)continue;const ref=tag(block,"REFERENCE_NUMBER")||tag(block,"DATAID");if(seen.has(ref||norm(nameMatch.matchedName||primary)))continue;seen.add(ref||norm(nameMatch.matchedName||primary));found.push({source:"UN",sourceClass:"un",name:primary||nameMatch.matchedName||query,type:kind==="INDIVIDUAL"?"Individual":"Entity",confidence:nameMatch.confidence,detail:tag(block,"COMMENTS1")||"Name appears in the UN Security Council Consolidated List.",meta:[ref,tag(block,"LISTED_ON"),tag(block,"UN_LIST_TYPE")].filter(Boolean),href:UN_PAGE,aliases,matchReason:nameMatch.reason});if(found.length>=25)break}}const generated=unCache.text.match(/dateGenerated=["']([^"']+)/i)?.[1];return{matches:found,source:{key:"UN",name:"United Nations",status:"complete",count:found.length,checkedAt:new Date().toISOString(),sourceUrl:UN_PAGE,lastUpdated:generated,version:generated||"live",licence:"United Nations public sanctions data"} satisfies SourceResult}}
async function screenMT(query:string){const body=new URLSearchParams({action:"get_court_orders_paginated",name:query,draw:"1",start:"0",length:"100",compilation:"",idno:"",year:""});const text=await fetchText(MT_API,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});const data=JSON.parse(text).data||[];const found:Match[]=data.map((r:Record<string,string>)=>{const href=r.document?.match(/href=['"]([^'"]+)/i)?.[1]?.replace(/\\\//g,"/")||MT_PAGE;return{source:"MT",sourceClass:"mt",name:r.names||query,type:"Court-order subject",confidence:score(r.names||query,query),detail:`${r.court_order||"Court"} order published by Malta's Asset Recovery Bureau.`,meta:[r.compilation_number,r.identification_numbers,r.date].filter(Boolean),href,identificationNumbers:r.identification_numbers?[r.identification_numbers]:undefined}});return{matches:found,source:{key:"MT",name:"Malta ARB",status:"complete",count:found.length,checkedAt:new Date().toISOString(),sourceUrl:MT_PAGE,version:"live query",licence:"Publisher terms require confirmation before commercial launch"} satisfies SourceResult}}

export async function GET(request:NextRequest){
  const token=getBearerToken(request);
  if(!token)return NextResponse.json({error:"Log in before running a screening."},{status:401});
  const supabase=getSupabaseForToken(token);
  const {data:{user},error:userError}=await supabase.auth.getUser(token);
  if(userError||!user)return NextResponse.json({error:"Your session has expired. Log in again."},{status:401});
  const {data:membership,error:membershipError}=await supabase.from("organisation_members").select("organisation_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(membershipError||!membership)return NextResponse.json({error:"Your organisation workspace is not ready. Contact support."},{status:403});

  const query=request.nextUrl.searchParams.get("q")?.trim()||"";
  const subjectType=request.nextUrl.searchParams.get("type")==="business"?"business":"person";
  if(query.length<2||query.length>120)return NextResponse.json({error:"Enter a name between 2 and 120 characters."},{status:400});
  const jobs=[{key:"EU",name:"European Union",run:()=>screenEU(query,subjectType)},{key:"UN",name:"United Nations",run:()=>screenUN(query)},{key:"MT",name:"Malta ARB",run:()=>screenMT(query)}];
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
  let {data:record,error:recordError}=await getSupabaseAdmin().rpc("record_screening_v2",auditPayload).single();
  if(isMissingRpc(recordError,"record_screening_v2")){
    const legacyPayload={
      p_organisation_id:auditPayload.p_organisation_id,
      p_subject_name:auditPayload.p_subject_name,
      p_subject_type:auditPayload.p_subject_type,
      p_risk_state:auditPayload.p_risk_state,
      p_results:auditPayload.p_results,
      p_sources:auditPayload.p_sources,
      p_web_searches:auditPayload.p_web_searches,
      p_checked_at:auditPayload.p_checked_at,
    };
    ({data:record,error:recordError}=await supabase.rpc("record_screening",legacyPayload).single());
  }
  if(recordError){
    const noCredits=recordError.message.toLowerCase().includes("no screening credits");
    const incidentId=noCredits?undefined:logServerError("screening.audit_record",recordError);
    return NextResponse.json({error:noCredits?"You have no screening credits remaining. Choose a plan in your dashboard.":"The screening completed, but its audit record could not be saved. No result was returned.",incidentId},{status:noCredits?402:500});
  }
  return NextResponse.json({query,matches:all,sources,webSearches,complete:!sources.some(source=>source.status==="unavailable"),checkedAt,screeningId:record.screening_id,caseReference:record.case_reference},{headers:{"Cache-Control":"no-store"}});
}
