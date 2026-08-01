import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";
const EU_PAGE = "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions?locale=en";
const EU_TRACKER = "https://data.europa.eu/apps/eusanctionstracker";
const EU_SNAPSHOT_BUCKET = "screening-source-data";
const EU_SNAPSHOT_PATH = "eu/latest.csv";
const UN_XML = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const UN_PAGE = "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list";
const MT_API = "https://assetrecovery.mt/wp-admin/admin-ajax.php";
const MT_PAGE = "https://assetrecovery.mt/court-orders/";
type Match = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string };
type SourceResult = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string };
let euCache:{ text:string; at:number; refreshedAt:string }|undefined, euTrackerCache:{ individuals:string; entities:string; at:number }|undefined, unCache:{ text:string; at:number }|undefined;
const CACHE_MS = 15 * 60 * 1000;
const TRACKER_CACHE_MS = 5 * 60 * 1000;
const MAX_EU_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000;

function norm(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function score(candidate:string, query:string){const c=norm(candidate),q=norm(query);if(c===q)return 100;if(c.includes(q))return 94;const ct=new Set(c.split(" ")),qt=q.split(" ").filter(Boolean);return Math.round(qt.filter(t=>ct.has(t)).length/Math.max(qt.length,1)*88)}
function matches(candidate:string,query:string){const c=norm(candidate),q=norm(query);return !!q&&!!c&&(c.includes(q)||q.split(" ").every(t=>t.length>1&&c.split(" ").includes(t)))}
async function fetchText(url:string,options?:RequestInit){const response=await fetch(url,{...options,cache:"no-store",signal:AbortSignal.timeout(35000),headers:{"User-Agent":"ClearCheck/1.0 official-list-screening",...(options?.headers||{})}});if(!response.ok)throw new Error(`Source returned ${response.status}`);return response.text()}
function row(line:string){const out:string[]=[],q=false;let cell="",quoted=q;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&quoted&&line[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=!quoted;else if(ch===';'&&!quoted){out.push(cell);cell=""}else cell+=ch}out.push(cell);return out}
function decodeHtml(value:string){return value.replace(/<[^>]+>/g,"").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim()}
function trackerSubjects(html:string,type:string){const subjects:{id:string;name:string;type:string}[]=[];for(const match of html.matchAll(/<a\s+href="https?:\/\/data\.europa\.eu\/apps\/eusanctionstracker\/subjects\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)){const name=decodeHtml(match[2]);if(name)subjects.push({id:match[1],name,type})}return subjects}
async function loadEUSnapshot(){const admin=getSupabaseAdmin();const [{data:file,error:fileError},{data:metadata,error:metadataError}]=await Promise.all([admin.storage.from(EU_SNAPSHOT_BUCKET).download(EU_SNAPSHOT_PATH),admin.from("source_snapshots").select("refreshed_at,status").eq("source_key","eu_consolidated").maybeSingle()]);if(fileError||!file)throw new Error("Stored EU sanctions database is unavailable");if(metadataError||!metadata?.refreshed_at)throw new Error("EU sanctions refresh status is unavailable");if(metadata.status!=="ready")throw new Error("The latest EU sanctions database refresh did not complete");const refreshedAt=String(metadata.refreshed_at),age=Date.now()-new Date(refreshedAt).getTime();if(!Number.isFinite(age)||age>MAX_EU_SNAPSHOT_AGE_MS)throw new Error("EU sanctions database has not refreshed within 48 hours");const text=await file.text();if(!text.includes("NameAlias_WholeName")||!text.includes("Entity_LogicalId"))throw new Error("Stored EU sanctions database failed validation");return{text,at:Date.now(),refreshedAt}}
async function screenEU(query:string){const now=Date.now();const jobs:Promise<unknown>[]=[];if(!euCache||now-euCache.at>CACHE_MS)jobs.push(loadEUSnapshot().then(snapshot=>{euCache=snapshot}));if(!euTrackerCache||now-euTrackerCache.at>TRACKER_CACHE_MS)jobs.push(Promise.all([fetchText(`${EU_TRACKER}/individuals`),fetchText(`${EU_TRACKER}/entities`)]).then(([individuals,entities])=>{euTrackerCache={individuals,entities,at:now}}));await Promise.all(jobs);if(!euCache||!euTrackerCache)throw new Error("EU sanctions data unavailable");const lines=euCache.text.replace(/^\uFEFF/,"").split(/\r?\n/),headers=row(lines[0]),ix=(n:string)=>headers.indexOf(n),seen=new Set<string>(),seenNames=new Set<string>(),found:Match[]=[];for(let i=1;i<lines.length&&found.length<25;i++){if(!lines[i])continue;const r=row(lines[i]);const name=r[ix("NameAlias_WholeName")]||[r[ix("NameAlias_FirstName")],r[ix("NameAlias_MiddleName")],r[ix("NameAlias_LastName")]].filter(Boolean).join(" ");if(!name||!matches(name,query))continue;const unique=`${r[ix("Entity_LogicalId")]}:${norm(name)}`;if(seen.has(unique))continue;seen.add(unique);seenNames.add(norm(name));found.push({source:"EU",sourceClass:"eu",name,type:r[ix("Entity_SubjectType")]||"Listed subject",confidence:score(name,query),detail:r[ix("Entity_Remark")]||"Name appears in the EU consolidated financial sanctions file.",meta:[r[ix("Entity_EU_ReferenceNumber")],r[ix("Entity_Regulation_Programme")],r[ix("BirthDate_BirthDate")]||r[ix("BirthDate_Year")]].filter(Boolean),href:r[ix("Entity_Regulation_PublicationUrl")]||EU_PAGE})}const latest=[...trackerSubjects(euTrackerCache.individuals,"Individual"),...trackerSubjects(euTrackerCache.entities,"Entity")];for(const subject of latest){if(found.length>=25)break;if(!matches(subject.name,query)||seenNames.has(norm(subject.name)))continue;seenNames.add(norm(subject.name));found.push({source:"EU",sourceClass:"eu",name:subject.name,type:subject.type,confidence:score(subject.name,query),detail:"Name appears in the European Commission's EU Sanctions Tracker, which monitors the latest EU financial sanctions and travel bans.",meta:["EU Sanctions Tracker"],href:`${EU_TRACKER}/subjects/${subject.id}`})}return{matches:found,source:{key:"EU",name:"European Union",status:"complete",count:found.length,checkedAt:euCache.refreshedAt,message:"Daily stored European Commission consolidated database and live EU Sanctions Tracker checked."} satisfies SourceResult}}
function tag(block:string,name:string){const m=block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,"i"));return(m?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim()}
async function screenUN(query:string){const now=Date.now();if(!unCache||now-unCache.at>CACHE_MS)unCache={text:await fetchText(UN_XML),at:now};const found:Match[]=[],seen=new Set<string>();for(const kind of["INDIVIDUAL","ENTITY"]){const blocks=unCache.text.match(new RegExp(`<${kind}>[\\s\\S]*?<\\/${kind}>`,"gi"))||[];for(const block of blocks){const primary=kind==="INDIVIDUAL"?[tag(block,"FIRST_NAME"),tag(block,"SECOND_NAME"),tag(block,"THIRD_NAME"),tag(block,"FOURTH_NAME")].filter(Boolean).join(" "):tag(block,"FIRST_NAME")||tag(block,"NAME");const aliases=[...block.matchAll(/<ALIAS_NAME>([\s\S]*?)<\/ALIAS_NAME>/gi)].map(m=>m[1].trim()),hit=[primary,...aliases].find(n=>matches(n,query));if(!hit)continue;const ref=tag(block,"REFERENCE_NUMBER")||tag(block,"DATAID");if(seen.has(ref||norm(hit)))continue;seen.add(ref||norm(hit));found.push({source:"UN",sourceClass:"un",name:primary||hit,type:kind==="INDIVIDUAL"?"Individual":"Entity",confidence:score(hit,query),detail:tag(block,"COMMENTS1")||"Name appears in the UN Security Council Consolidated List.",meta:[ref,tag(block,"LISTED_ON"),tag(block,"UN_LIST_TYPE")].filter(Boolean),href:UN_PAGE});if(found.length>=25)break}}return{matches:found,source:{key:"UN",name:"United Nations",status:"complete",count:found.length,checkedAt:new Date().toISOString()} satisfies SourceResult}}
async function screenMT(query:string){const body=new URLSearchParams({action:"get_court_orders_paginated",name:query,draw:"1",start:"0",length:"100",compilation:"",idno:"",year:""});const text=await fetchText(MT_API,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});const data=JSON.parse(text).data||[];const found:Match[]=data.map((r:Record<string,string>)=>{const href=r.document?.match(/href=['"]([^'"]+)/i)?.[1]?.replace(/\\\//g,"/")||MT_PAGE;return{source:"MT",sourceClass:"mt",name:r.names||query,type:"Court-order subject",confidence:score(r.names||query,query),detail:`${r.court_order||"Court"} order published by Malta's Asset Recovery Bureau.`,meta:[r.compilation_number,r.identification_numbers,r.date].filter(Boolean),href}});return{matches:found,source:{key:"MT",name:"Malta ARB",status:"complete",count:found.length,checkedAt:new Date().toISOString()} satisfies SourceResult}}

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
  const jobs=[{key:"EU",name:"European Union",run:()=>screenEU(query)},{key:"UN",name:"United Nations",run:()=>screenUN(query)},{key:"MT",name:"Malta ARB",run:()=>screenMT(query)}];
  const settled=await Promise.allSettled(jobs.map(job=>job.run())),all:Match[]=[],sources:SourceResult[]=[];
  settled.forEach((result,index)=>{if(result.status==="fulfilled"){all.push(...result.value.matches);sources.push(result.value.source)}else sources.push({key:jobs[index].key,name:jobs[index].name,status:"unavailable",count:0,checkedAt:new Date().toISOString(),message:result.reason instanceof Error?result.reason.message:"Source unavailable"})});
  const terms=["fraud","eCourts","money laundering","financial crime"];
  const webSearches=terms.map(term=>{const phrase=`\"${query}\" \"${term}\"`;return{term,label:term==="eCourts"?"eCourts":term.replace(/\b\w/g,c=>c.toUpperCase()),query:phrase,href:`https://www.google.com/search?igu=1&hl=en&q=${encodeURIComponent(phrase)}`}});
  const checkedAt=new Date().toISOString();
  sources.push({key:"WEB",name:"Google web checks",status:"review",count:webSearches.length,checkedAt,message:"Four structured Google searches prepared for human review"});
  const riskState=sources.some(source=>source.status==="unavailable")?"incomplete":"review";
  const {data:record,error:recordError}=await supabase.rpc("record_screening",{
    p_organisation_id:membership.organisation_id,
    p_subject_name:query,
    p_subject_type:subjectType,
    p_risk_state:riskState,
    p_results:all,
    p_sources:sources,
    p_web_searches:webSearches,
    p_checked_at:checkedAt,
  }).single();
  if(recordError){
    const noCredits=recordError.message.toLowerCase().includes("no screening credits");
    return NextResponse.json({error:noCredits?"You have no screening credits remaining. Choose a plan in your dashboard.":"The screening completed, but its audit record could not be saved. No result was returned."},{status:noCredits?402:500});
  }
  return NextResponse.json({query,matches:all,sources,webSearches,complete:true,checkedAt,screeningId:record.screening_id,caseReference:record.case_reference},{headers:{"Cache-Control":"no-store"}});
}
