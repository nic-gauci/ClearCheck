import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../lib/supabase-server";
import { logServerError } from "../../lib/server-log";

export const dynamic="force-dynamic";
const outcomes=new Set(["under_review","false_positive","confirmed_match","more_information_required","escalated"]);

export async function POST(request:NextRequest){
  try{
    const token=getBearerToken(request);if(!token)return NextResponse.json({error:"Log in before reviewing a screening."},{status:401});
    const supabase=getSupabaseForToken(token),{data:{user}}=await supabase.auth.getUser(token);
    if(!user)return NextResponse.json({error:"Your session has expired."},{status:401});
    const {screeningId,reviewStatus,reviewNotes,reviewIdentifiers,reviewDueAt}=await request.json() as {screeningId?:string;reviewStatus?:string;reviewNotes?:string;reviewIdentifiers?:string;reviewDueAt?:string|null};
    if(!screeningId||!/^[0-9a-f-]{36}$/i.test(screeningId))return NextResponse.json({error:"The screening reference is invalid."},{status:400});
    if(!reviewStatus||!outcomes.has(reviewStatus))return NextResponse.json({error:"Choose a valid review outcome."},{status:400});
    if(typeof reviewNotes!=="string"||reviewNotes.trim().length<20||reviewNotes.length>4000)return NextResponse.json({error:"Record at least 20 characters explaining the evidence and decision."},{status:400});
    if(typeof reviewIdentifiers!=="string"||reviewIdentifiers.trim().length<3||reviewIdentifiers.length>2000)return NextResponse.json({error:"Record the identifiers checked, or explain why none were available."},{status:400});
    if(reviewDueAt&&Number.isNaN(new Date(reviewDueAt).getTime()))return NextResponse.json({error:"Choose a valid review due date."},{status:400});
    const {data,error}=await getSupabaseAdmin().rpc("update_screening_review_v3",{p_actor_id:user.id,p_screening_id:screeningId,p_review_status:reviewStatus,p_review_notes:reviewNotes.trim(),p_review_identifiers:reviewIdentifiers.trim(),p_review_due_at:reviewDueAt||null});
    if(error){if(/access denied/i.test(error.message))return NextResponse.json({error:"You do not have permission to review this screening."},{status:403});throw error}
    return NextResponse.json({review:data?.[0]||null},{headers:{"Cache-Control":"no-store"}});
  }catch(error){const incidentId=logServerError("screening.review_update",error);return NextResponse.json({error:"The review decision could not be saved.",incidentId},{status:500})}
}
