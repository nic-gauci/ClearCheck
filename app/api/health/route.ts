import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../lib/supabase-server";
export const dynamic="force-dynamic";
export async function GET(){
  const time=new Date().toISOString();
  try{
    const {data,error}=await getSupabaseAdmin().from("source_snapshots").select("source_key,status,refreshed_at,row_count,checksum_sha256").in("source_key",["eu_consolidated","eu_official_journal"]);
    const statusFor=(key:string,minRows:number)=>{const source=data?.find(item=>item.source_key===key),ageHours=source?.refreshed_at?(Date.now()-new Date(source.refreshed_at).getTime())/3_600_000:null,healthy=!error&&source?.status==="ready"&&ageHours!==null&&ageHours<=36&&Number(source.row_count)>=minRows;return{status:healthy?"ready":"unavailable",lastUpdated:source?.refreshed_at||null,ageHours:ageHours===null?null:Math.round(ageHours*10)/10,rowCount:Number(source?.row_count)||0,version:source?.checksum_sha256||null,healthy}};
    const consolidated=statusFor("eu_consolidated",500),officialJournal=statusFor("eu_official_journal",10),sourceHealthy=consolidated.healthy&&officialJournal.healthy;
    return NextResponse.json({status:sourceHealthy?"ok":"degraded",service:"clearcheck",time,sources:{euConsolidated:consolidated,euOfficialJournal:officialJournal}},{status:sourceHealthy?200:503,headers:{"Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({status:"degraded",service:"clearcheck",time,sources:{euConsolidated:{status:"unavailable"},euOfficialJournal:{status:"unavailable"}}},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
