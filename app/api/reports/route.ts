import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../lib/supabase-server";
import { logServerError } from "../../lib/server-log";

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  try{
    const token=getBearerToken(request);if(!token)return NextResponse.json({error:"Log in before downloading a report."},{status:401});
    const supabase=getSupabaseForToken(token),{data:{user}}=await supabase.auth.getUser(token);
    if(!user)return NextResponse.json({error:"Your session has expired."},{status:401});
    const {screeningId}=await request.json() as {screeningId?:string};
    if(!screeningId||!/^[0-9a-f-]{36}$/i.test(screeningId))return NextResponse.json({error:"The screening reference is invalid."},{status:400});
    const {data,error}=await getSupabaseAdmin().rpc("record_report_download_v2",{p_actor_id:user.id,p_screening_id:screeningId,p_checksum:null});
    if(error)throw error;
    return NextResponse.json({reportId:data},{headers:{"Cache-Control":"no-store"}});
  }catch(error){const incidentId=logServerError("report.audit_record",error);return NextResponse.json({error:"The report audit event could not be recorded.",incidentId},{status:500})}
}
