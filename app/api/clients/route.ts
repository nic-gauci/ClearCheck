import { clientContext,clientFailure,ClientError,mutateClient,limitedBody } from "../../lib/client-server";
import { validateClient,validateItem,uuid,textValue,clientStages } from "../../lib/clients";
export const dynamic="force-dynamic";
const respond=(body:unknown)=>Response.json(body,{headers:{"Cache-Control":"no-store"}});
async function list(context:Awaited<ReturnType<typeof clientContext>>,search="",page=0){
  let query=context.db.from("clients").select("*",{count:"exact"}).eq("organisation_id",context.org).order("updated_at",{ascending:false}).range(page*25,page*25+24);
  if(search)query=query.ilike("name",`%${search.replace(/[\\%_]/g,"\\$&")}%`);
  const {data,error,count}=await query;if(error)throw error;
  const {data:tasks,error:taskError}=await context.db.from("client_items").select("*,clients(name)").eq("organisation_id",context.org).in("kind",["task","request"]).eq("status","open").order("due_at",{nullsFirst:false}).limit(100);
  if(taskError)throw taskError;
  const {data:due,error:dueError}=await context.db.from("clients").select("*").eq("organisation_id",context.org).not("stage","in","(archived,rejected)").lte("next_review",new Date().toISOString().slice(0,10)).order("next_review").limit(100);
  if(dueError)throw dueError;
  const {data:expired,error:expiredError}=await context.db.from("client_documents").select("id,client_id,name,expires_at,clients(name)").eq("organisation_id",context.org).lt("expires_at",new Date().toISOString().slice(0,10)).order("expires_at").limit(100);
  if(expiredError)throw expiredError;
  return respond({clients:data,total:count,page,tasks,due,expired,role:context.role,userId:context.user.id});
}
export async function GET(request:Request){try{
  const context=await clientContext(request);const clientId=new URL(request.url).searchParams.get("client");
  if(!clientId)return await list(context);
  try{uuid(clientId)}catch{throw new ClientError("Invalid client reference.")}
  const {db,org}=context;
  const [{data:client,error},{data:items,error:ie},{data:documents,error:de},{data:links,error:le},{data:events,error:ae},{data:available,error:se}]=await Promise.all([
    db.from("clients").select("*").eq("organisation_id",org).eq("id",clientId).maybeSingle(),
    db.from("client_items").select("*").eq("organisation_id",org).eq("client_id",clientId).order("created_at",{ascending:false}).limit(500),
    db.from("client_documents").select("id,client_id,name,category,expires_at,size,created_at").eq("organisation_id",org).eq("client_id",clientId).order("created_at",{ascending:false}).limit(500),
    db.from("client_screenings").select("screening_id,screenings(id,subject_name,subject_type,case_reference,risk_state,match_count,review_status,checked_at)").eq("organisation_id",org).eq("client_id",clientId).limit(500),
    db.from("audit_events").select("id,event_type,created_at,metadata").eq("organisation_id",org).eq("entity_type","client").eq("entity_id",clientId).order("created_at",{ascending:false}).limit(100),
    db.from("screenings").select("id,subject_name,subject_type,case_reference,checked_at").eq("organisation_id",org).order("checked_at",{ascending:false}).limit(100),
  ]);
  if(error||ie||de||le||ae||se)throw error||ie||de||le||ae||se;
  if(!client)throw new ClientError("Client not found.",404);
  return respond({client,items,documents,links,events,available,role:context.role,userId:context.user.id});
}catch(error){return clientFailure(error)}}
export async function POST(request:Request){try{
  const raw=new TextDecoder().decode(await limitedBody(request,32000));
  let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{throw new ClientError("Invalid request.")}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new ClientError("Invalid request.");
  const action=String(body.action);const context=await clientContext(request,action!=="search");
  if(action==="search"){
    let search:string;try{search=textValue(body.search,"Search",120)}catch{throw new ClientError("Search must be text of 120 characters or fewer.")}
    return await list(context,search,Math.max(0,Math.min(10000,Math.floor(Number(body.page)||0))));
  }
  let data:unknown;
  try{
    const input=body.data&&typeof body.data==="object"?body.data as Record<string,unknown>:{};
    if(action==="create"||action==="update")data=validateClient(input);
    else if(action==="item")data=validateItem(input);
    else if(action==="item_status"){if(!["open","complete"].includes(String(input.status)))throw new Error("Invalid task status.");data={item_id:uuid(input.item_id),status:input.status}}
    else if(action==="link")data={screening_id:uuid(input.screening_id)};
    else if(action==="stage"){if(!clientStages.includes(input.stage as typeof clientStages[number]))throw new Error("Invalid stage.");const notes=textValue(input.notes,"Decision notes",4000,true);if(notes.length<20)throw new Error("Explain the decision in at least 20 characters.");data={stage:input.stage,notes}}
    else throw new Error("Invalid action.");
    if(action!=="create")uuid(body.clientId);
    if(action!=="create"&&(!Number.isInteger(body.version)||Number(body.version)<1))throw new Error("Reload this client before saving.");
  }catch(error){throw new ClientError(error instanceof Error?error.message:"Invalid input.")}
  const templateId=action==="create"?(body.data as Record<string,unknown>)?.template_id:null;
  if(templateId){
    try{uuid(templateId)}catch{throw new ClientError("Select a valid onboarding template.")}
    const {data:client,error}=await context.admin.rpc("client_create_from_template",{p_actor:context.user.id,p_org:context.org,p_template:templateId,p_data:data});
    if(error){if(error.code==="P0001")throw new ClientError(error.message);throw error}return respond({client});
  }
  const client=await mutateClient(context,action==="create"?null:String(body.clientId),action,data,action==="create"?null:Number(body.version));
  return respond({client});
}catch(error){return clientFailure(error)}}
