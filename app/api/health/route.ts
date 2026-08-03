import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../lib/supabase-server";
import { EU_OFFICIAL_JOURNAL_SUPPLEMENT_REVIEWED_AT, officialJournalSupplementIsCurrent } from "../../lib/eu-official-journal";
export const dynamic="force-dynamic";
export async function GET(){
  const time=new Date().toISOString();
  try{
    const {data,error}=await getSupabaseAdmin().from("source_snapshots").select("status,refreshed_at,row_count").eq("source_key","eu_consolidated").maybeSingle();
    const ageHours=data?.refreshed_at?(Date.now()-new Date(data.refreshed_at).getTime())/3_600_000:null;
    const supplementCurrent=officialJournalSupplementIsCurrent(),sourceHealthy=!error&&data?.status==="ready"&&ageHours!==null&&ageHours<=36&&Number(data.row_count)>=500&&supplementCurrent;
    return NextResponse.json({status:sourceHealthy?"ok":"degraded",service:"clearcheck",time,sources:{euConsolidated:{status:sourceHealthy?"ready":"unavailable",lastUpdated:data?.refreshed_at||null,ageHours:ageHours===null?null:Math.round(ageHours*10)/10},euOfficialJournalSupplement:{status:supplementCurrent?"ready":"stale",reviewedAt:EU_OFFICIAL_JOURNAL_SUPPLEMENT_REVIEWED_AT}}},{status:sourceHealthy?200:503,headers:{"Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({status:"degraded",service:"clearcheck",time,sources:{euConsolidated:{status:"unavailable"}}},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
