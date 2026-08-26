import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../lib/supabase-server";
import { logServerError } from "../../lib/server-log";

export const dynamic="force-dynamic";

async function actor(request:NextRequest){
  const token=getBearerToken(request);if(!token)return null;
  const supabase=getSupabaseForToken(token),{data:{user}}=await supabase.auth.getUser(token);if(!user)return null;
  const {data:membership}=await supabase.from("organisation_members").select("organisation_id,role").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  return membership?{user,organisationId:membership.organisation_id as string,role:membership.role as string}:null;
}

export async function GET(request:NextRequest){
  try{
    const current=await actor(request);if(!current)return NextResponse.json({error:"Log in to view workspace members."},{status:401});
    const admin=getSupabaseAdmin(),{data:members,error}=await admin.from("organisation_members").select("user_id,role,status,joined_at").eq("organisation_id",current.organisationId).order("joined_at");
    if(error)throw error;
    const ids=(members||[]).map(member=>member.user_id),{data:profiles}=ids.length?await admin.from("profiles").select("id,display_name").in("id",ids):{data:[]};
    const names=new Map((profiles||[]).map(profile=>[profile.id,profile.display_name]));
    return NextResponse.json({members:(members||[]).map(member=>({...member,display_name:names.get(member.user_id)||"Workspace member"})),canManage:["owner","admin"].includes(current.role)},{headers:{"Cache-Control":"no-store"}});
  }catch(error){const incidentId=logServerError("team.list",error);return NextResponse.json({error:"Workspace members could not be loaded.",incidentId},{status:500})}
}

export async function PATCH(request:NextRequest){
  try{
    const current=await actor(request);if(!current)return NextResponse.json({error:"Log in to manage workspace members."},{status:401});
    if(!["owner","admin"].includes(current.role))return NextResponse.json({error:"Only owners and admins can manage roles."},{status:403});
    const {userId,role}=await request.json() as {userId?:string;role?:string};
    if(!userId||!/^[0-9a-f-]{36}$/i.test(userId)||!role||!["admin","reviewer","member"].includes(role))return NextResponse.json({error:"Choose a valid member and role."},{status:400});
    if(current.role!=="owner"&&role==="admin")return NextResponse.json({error:"Only the workspace owner can appoint an admin."},{status:403});
    const admin=getSupabaseAdmin(),{data:target}=await admin.from("organisation_members").select("role").eq("organisation_id",current.organisationId).eq("user_id",userId).eq("status","active").maybeSingle();
    if(!target||target.role==="owner")return NextResponse.json({error:"The workspace owner role cannot be changed here."},{status:400});
    const {error}=await admin.from("organisation_members").update({role}).eq("organisation_id",current.organisationId).eq("user_id",userId);if(error)throw error;
    await admin.from("audit_events").insert({organisation_id:current.organisationId,actor_user_id:current.user.id,event_type:"workspace.member_role_updated",entity_type:"organisation_member",entity_id:userId,metadata:{previous_role:target.role,role}});
    return NextResponse.json({ok:true});
  }catch(error){const incidentId=logServerError("team.role_update",error);return NextResponse.json({error:"The member role could not be changed.",incidentId},{status:500})}
}
