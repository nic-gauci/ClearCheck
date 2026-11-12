import { clientContext,clientFailure,ClientError,mutateClient,limitedBody } from "../../lib/client-server";
import { dateValue,textValue,uuid } from "../../lib/clients";
export const dynamic="force-dynamic";
const bucket="client-documents";
export async function POST(request:Request){try{
  const context=await clientContext(request,true);
  if(Number(request.headers.get("content-length"))>5500000)throw new ClientError("Maximum document size is 5 MB.",413);
  const bytesBody=await limitedBody(request,5500000);
  const form=await new Request(request.url,{method:"POST",headers:request.headers,body:bytesBody}).formData(),file=form.get("file");
  if(!(file instanceof File)||file.size<1||file.size>5242880)throw new ClientError("Select a PDF, JPEG or PNG document up to 5 MB.");
  let clientId:string,category:string,expiry:string|null;
  try{clientId=uuid(form.get("clientId"));category=textValue(form.get("category"),"Category",80,true);expiry=dateValue(form.get("expires_at"))}catch{throw new ClientError("Check the client, document category and expiry date.")}
  const version=Number(form.get("version"));if(!Number.isInteger(version)||version<1)throw new ClientError("Reload the client before uploading.");
  const {data:client,error}=await context.db.from("clients").select("id").eq("id",clientId).eq("organisation_id",context.org).maybeSingle();
  if(error||!client)throw new ClientError("Client not found.",404);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const pdf=new TextDecoder().decode(bytes.slice(0,5))==="%PDF-",png=bytes.slice(0,8).join(",")==="137,80,78,71,13,10,26,10",jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const mime=pdf?"application/pdf":png?"image/png":jpeg?"image/jpeg":"";
  if(!mime||file.type!==mime)throw new ClientError("The file content must match a PDF, JPEG or PNG document.");
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
  const path=`${context.org}/${clientId}/${crypto.randomUUID()}`;
  const uploaded=await context.admin.storage.from(bucket).upload(path,bytes,{contentType:mime,upsert:false});if(uploaded.error)throw uploaded.error;
  try{
    const result=await mutateClient(context,clientId,"document",{name:file.name.replace(/[\x00-\x1f]/g,"").slice(0,200),path,category,mime_type:mime,size:file.size,sha256:hash,expires_at:expiry},version);
    return Response.json({client:result},{headers:{"Cache-Control":"no-store"}});
  }catch(error){await context.admin.storage.from(bucket).remove([path]);throw error}
}catch(error){return clientFailure(error)}}
export async function GET(request:Request){try{
  const context=await clientContext(request);let id:string;try{id=uuid(new URL(request.url).searchParams.get("id"))}catch{throw new ClientError("Invalid document reference.")}
  const {data:doc,error}=await context.db.from("client_documents").select("*").eq("id",id).eq("organisation_id",context.org).maybeSingle();
  if(error||!doc)throw new ClientError("Document not found.",404);
  const {error:auditError}=await context.admin.from("audit_events").insert({organisation_id:context.org,actor_user_id:context.user.id,event_type:"client.document_download",entity_type:"client",entity_id:doc.client_id,metadata:{document_id:id}});if(auditError)throw auditError;
  const {data,error:downloadError}=await context.admin.storage.from(bucket).download(doc.path);if(downloadError||!data)throw downloadError;
  return new Response(data,{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}catch(error){return clientFailure(error)}}
