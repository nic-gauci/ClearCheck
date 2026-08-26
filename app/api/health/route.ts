import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../lib/supabase-server";
import { screenUNConsolidatedXml } from "../../lib/un-sanctions";

export const dynamic="force-dynamic";
const UN_XML="https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const MT_API="https://assetrecovery.mt/wp-admin/admin-ajax.php";
const CACHE_MS=5*60*1000;
type HealthItem={status:"ready"|"attention"|"unavailable";healthy:boolean;refreshAttention?:boolean;lastUpdated:string|null;checkedAt:string;ageHours:number|null;rowCount:number;message:string;version?:string|null};
let liveCache:{at:number;unConsolidated:HealthItem;maltaArb:HealthItem}|undefined;

async function checkedFetch(url:string,options?:RequestInit){
  const response=await fetch(url,{...options,cache:"no-store",signal:AbortSignal.timeout(15000),headers:{"User-Agent":"ClearCheck/1.0 source-health-monitor",...(options?.headers||{})}});
  if(!response.ok)throw new Error(`Source returned ${response.status}`);
  return response.text();
}

async function checkUN(checkedAt:string):Promise<HealthItem>{
  try{
    const xml=await checkedFetch(UN_XML);
    if(xml.length<100_000)throw new Error("Response failed size validation");
    const people=screenUNConsolidatedXml(xml,"health-check-no-match","person"),entities=screenUNConsolidatedXml(xml,"health-check-no-match","business");
    const generatedAt=people.generatedAt||entities.generatedAt||null,ageHours=generatedAt?(Date.now()-new Date(generatedAt).getTime())/3_600_000:null;
    const healthy=Boolean(generatedAt)&&ageHours!==null&&Number.isFinite(ageHours)&&people.recordCount>0&&entities.recordCount>0,refreshAttention=healthy&&ageHours!>48;
    return{status:healthy?(refreshAttention?"attention":"ready"):"unavailable",healthy,refreshAttention,lastUpdated:generatedAt,checkedAt,ageHours:ageHours===null?null:Math.round(ageHours*10)/10,rowCount:people.recordCount+entities.recordCount,message:healthy?(refreshAttention?`The latest publisher dataset validated (${people.recordCount+entities.recordCount} records), but the scheduled refresh confirmation is overdue.`:`Latest publisher dataset validated (${people.recordCount+entities.recordCount} records).`):"The UN list is missing or failed validation.",version:generatedAt};
  }catch(error){return{status:"unavailable",healthy:false,lastUpdated:null,checkedAt,ageHours:null,rowCount:0,message:error instanceof Error?error.message:"UN source check failed"}}
}

async function checkMalta(checkedAt:string):Promise<HealthItem>{
  try{
    const body=new URLSearchParams({action:"get_court_orders_paginated",name:"",draw:"1",start:"0",length:"1",compilation:"",idno:"",year:""});
    const text=await checkedFetch(MT_API,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    const payload=JSON.parse(text) as {data?:unknown;draw?:unknown;recordsTotal?:unknown;recordsFiltered?:unknown};
    const rowCount=Number(payload.recordsTotal??payload.recordsFiltered);
    const healthy=Array.isArray(payload.data)&&typeof payload.draw==="number"&&Number.isFinite(rowCount);
    return{status:healthy?"ready":"unavailable",healthy,lastUpdated:null,checkedAt,ageHours:null,rowCount:healthy?rowCount:0,message:healthy?`Live publisher response validated (${rowCount} published records).`:"The live publisher response failed validation.",version:"live query"};
  }catch(error){return{status:"unavailable",healthy:false,lastUpdated:null,checkedAt,ageHours:null,rowCount:0,message:error instanceof Error?error.message:"Malta source check failed"}}
}

async function liveHealth(checkedAt:string){
  if(liveCache&&Date.now()-liveCache.at<CACHE_MS)return liveCache;
  const [unConsolidated,maltaArb]=await Promise.all([checkUN(checkedAt),checkMalta(checkedAt)]);
  liveCache={at:Date.now(),unConsolidated,maltaArb};
  return liveCache;
}

export async function GET(){
  const time=new Date().toISOString();
  try{
    const [{data,error},live]=await Promise.all([
      getSupabaseAdmin().from("source_snapshots").select("source_key,status,refreshed_at,row_count,checksum_sha256,error_message").in("source_key",["eu_consolidated","eu_official_journal"]),
      liveHealth(time),
    ]);
    const statusFor=(key:string,minRows:number):HealthItem=>{const source=data?.find(item=>item.source_key===key),refreshedAt=source?.refreshed_at?new Date(source.refreshed_at).getTime():NaN,ageHours=Number.isFinite(refreshedAt)?(Date.now()-refreshedAt)/3_600_000:null,healthy=!error&&source?.status==="ready"&&Number.isFinite(refreshedAt)&&Number(source.row_count)>=minRows&&Boolean(source.checksum_sha256),refreshAttention=healthy&&ageHours!>48;return{status:healthy?(refreshAttention?"attention":"ready"):"unavailable",lastUpdated:source?.refreshed_at||null,checkedAt:time,ageHours:ageHours===null?null:Math.round(ageHours*10)/10,rowCount:Number(source?.row_count)||0,version:source?.checksum_sha256||null,healthy,refreshAttention,message:healthy?(refreshAttention?`Latest successful snapshot validated (${Number(source?.row_count)||0} records), but the scheduled refresh confirmation is overdue.`:`Latest refresh confirmed (${Number(source?.row_count)||0} records).`):source?.error_message||"Snapshot is missing or failed validation."}};
    const euConsolidated=statusFor("eu_consolidated",500),euOfficialJournal=statusFor("eu_official_journal",10);
    const sources={euConsolidated,euOfficialJournal,unConsolidated:live.unConsolidated,maltaArb:live.maltaArb};
    const sourceHealthy=Object.values(sources).every(source=>source.healthy);
    const refreshAttention=Object.values(sources).some(source=>source.refreshAttention);
    return NextResponse.json({status:sourceHealthy?(refreshAttention?"attention":"ok"):"degraded",service:"clearcheck",time,sources},{status:sourceHealthy?200:503,headers:{"Cache-Control":"no-store"}});
  }catch{
    const unavailable={status:"unavailable" as const,healthy:false,lastUpdated:null,checkedAt:time,ageHours:null,rowCount:0,message:"Source health check failed."};
    return NextResponse.json({status:"degraded",service:"clearcheck",time,sources:{euConsolidated:unavailable,euOfficialJournal:unavailable,unConsolidated:unavailable,maltaArb:unavailable}},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
