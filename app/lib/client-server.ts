import { getBearerToken,getSupabaseForToken,getSupabaseAdmin } from "./supabase-server";
import { logServerError } from "./server-log";
export class ClientError extends Error { status:number; constructor(message:string,status=400){super(message);this.status=status} }
export async function limitedBody(request:Request,max:number){
  if(Number(request.headers.get("content-length"))>max)throw new ClientError("Request is too large.",413);
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new ClientError("Request is too large.",413)}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return bytes;
}
export async function clientContext(request:Request,write=false){
  const token=getBearerToken(request);if(!token)throw new ClientError("Log in to open your workspace.",401);
  const db=getSupabaseForToken(token);const {data:{user}}=await db.auth.getUser(token);
  if(!user)throw new ClientError("Your session has expired. Log in again.",401);
  const {data:member,error}=await db.from("organisation_members").select("organisation_id,role").eq("user_id",user.id).eq("status","active").order("joined_at").limit(1).maybeSingle();
  if(error||!member)throw new ClientError("No active workspace membership was found.",403);
  if(write&&!["owner","admin","reviewer"].includes(member.role))throw new ClientError("A reviewer, admin or owner role is required.",403);
  return {db,admin:getSupabaseAdmin(),user,org:member.organisation_id as string,role:member.role as string};
}
export function clientFailure(error:unknown){
  if(error instanceof ClientError)return Response.json({error:error.message},{status:error.status,headers:{"Cache-Control":"no-store"}});
  const incidentId=logServerError("client.workspace",error);
  return Response.json({error:"The workspace request could not be completed. Please retry.",incidentId},{status:500,headers:{"Cache-Control":"no-store"}});
}
export async function mutateClient(context:Awaited<ReturnType<typeof clientContext>>,clientId:string|null,action:string,data:unknown,version:number|null){
  const {data:client,error}=await context.admin.rpc("client_workspace_mutate",{p_actor:context.user.id,p_org:context.org,p_client:clientId,p_action:action,p_data:data,p_version:version});
  if(error){
    if(error.code==="23505")throw new ClientError("This screening is already linked to a client.",409);
    if(error.code==="P0001")throw new ClientError(error.message,/changed/.test(error.message)?409:400);
    throw error;
  }
  return client;
}
