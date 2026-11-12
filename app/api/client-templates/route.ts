import { clientContext,clientFailure,ClientError,limitedBody } from "../../lib/client-server";
import {validateTemplate,uuid} from "../../lib/clients";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
 const ctx=await clientContext(request);const {data,error}=await ctx.db.from("client_templates").select("*").eq("organisation_id",ctx.org).order("name").limit(100);if(error)throw error;
 return Response.json({templates:data},{headers:{"Cache-Control":"no-store"}});
}catch(error){return clientFailure(error)}}
export async function POST(request:Request){try{
 const ctx=await clientContext(request,true);if(!["owner","admin"].includes(ctx.role))throw new ClientError("Only owners and admins can configure templates.",403);
 let input:Record<string,unknown>,template:ReturnType<typeof validateTemplate>;try{input=JSON.parse(new TextDecoder().decode(await limitedBody(request,25000)));template=validateTemplate(input);if(input.id)uuid(input.id);if(input.id&&(!Number.isInteger(input.version)||Number(input.version)<1))throw new Error("Reload the template before saving.")}catch(error){throw new ClientError(error instanceof Error?error.message:"Invalid template.")}
 const {data,error}=await ctx.admin.rpc("client_template_save",{p_actor:ctx.user.id,p_org:ctx.org,p_id:input.id||null,p_name:template.name,p_questions:template.questions,p_tasks:template.tasks,p_version:input.version||null});
 if(error){if(error.code==="P0001")throw new ClientError(error.message,409);throw error}
 return Response.json({template:data},{headers:{"Cache-Control":"no-store"}});
}catch(error){return clientFailure(error)}}
