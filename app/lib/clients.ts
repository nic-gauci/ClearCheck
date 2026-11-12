export const clientStages = ["onboarding", "in_review", "approved", "rejected", "archived"] as const;
export type ClientStage = typeof clientStages[number];
export type Client = {
  id:string; organisation_id:string; name:string; subject_type:"person"|"business";
  reference:string; country:string; email:string; stage:ClientStage; next_review:string|null;
  details:Record<string,string>; version:number; created_at:string; updated_at:string;
  onboarding_schema?:TemplateQuestion[]; template_reference?:{name:string;version:number};
};
export type TemplateQuestion={key:string;label:string;type:"text"|"date"|"textarea";required:boolean};
export type ClientTemplate={id:string;name:string;version:number;questions:TemplateQuestion[];tasks:{title:string;kind:"task"|"request";due_days:number}[]};
export type ClientItem = {
  id:string; client_id:string; organisation_id:string; kind:"task"|"request"|"note"|"relationship"|"assessment";
  title:string; status:"open"|"complete"; due_at:string|null; assigned_to:string|null;
  payload:Record<string,unknown>; created_at:string; created_by:string;
};
export type ClientDocument = {id:string; client_id:string; name:string; category:string; expires_at:string|null; size:number; created_at:string};
export const riskFactors = ["Geography", "Product / service", "Delivery channel", "Ownership / activity"] as const;
export function calculateRisk(scores:number[], weights:number[]){
  if(scores.length!==4||weights.length!==4||scores.some(n=>!Number.isInteger(n)||n<0||n>5)||weights.some(n=>!Number.isInteger(n)||n<1||n>100)||weights.reduce((a,b)=>a+b,0)!==100)throw new Error("Provide four scores from 0–5 and positive weights totalling 100%.");
  const score=Math.round(scores.reduce((sum,n,i)=>sum+n*weights[i]/5,0));
  return {score,level:score>=70?"high":score>=35?"medium":"low",scores,weights,modelVersion:"clearcheck-working-model-v1"};
}
export function textValue(value:unknown,label:string,max:number,required=false){
  if(value!==undefined&&value!==null&&typeof value!=="string")throw new Error(`${label} must be text.`);
  const result=String(value??"").trim();
  if((required&&!result)||result.length>max)throw new Error(`${label} is required and must be ${max} characters or fewer.`);
  return result;
}
export function dateValue(value:unknown){
  const result=textValue(value,"Date",10);
  if(!result)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number.isNaN(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)throw new Error("Choose a valid date.");
  return result;
}
export function uuid(value:unknown){if(typeof value!=="string"||!/^\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b$/i.test(value))throw new Error("Invalid record reference.");return value}
export function validateClient(value:Record<string,unknown>){
  if(!["person","business"].includes(String(value.subject_type)))throw new Error("Choose person or business.");
  const details:Record<string,string>={};
  const source=value.details&&typeof value.details==="object"?value.details as Record<string,unknown>:{};
  for(const key of ["date_of_birth","nationality","registration_number","address","purpose","source_of_funds","occupation","ownership_summary"])details[key]=textValue(source[key],key,2000);
  const custom=Object.keys(source).filter(key=>/^custom_[a-z0-9_]{1,40}$/.test(key));if(custom.length>20)throw new Error("Too many custom answers.");for(const key of custom)details[key]=textValue(source[key],"Custom answer",2000);
  if(details.date_of_birth)dateValue(details.date_of_birth);
  const email=textValue(value.email,"Email",254);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid email address.");
  return {name:textValue(value.name,"Client name",120,true),subject_type:value.subject_type,reference:textValue(value.reference,"Reference",120),country:textValue(value.country,"Country",120),email,next_review:dateValue(value.next_review),details};
}
export function validateTemplate(input:Record<string,unknown>){
  const name=textValue(input.name,"Template name",120,true);
  if(!Array.isArray(input.questions)||!Array.isArray(input.tasks)||input.questions.length>20||input.tasks.length>20)throw new Error("Use up to 20 questions and tasks.");
  const questions=input.questions.map(q=>{if(!q||!/^custom_[a-z0-9_]{1,40}$/.test(q.key)||!["text","date","textarea"].includes(q.type)||typeof q.required!=="boolean")throw new Error("Invalid question.");return {key:q.key,label:textValue(q.label,"Question label",200,true),type:q.type,required:q.required}});
  if(new Set(questions.map(q=>q.key)).size!==questions.length)throw new Error("Question references must be unique.");
  const tasks=input.tasks.map(t=>{if(!t||!["task","request"].includes(t.kind)||!Number.isInteger(t.due_days)||t.due_days<0||t.due_days>365)throw new Error("Task deadlines must be 0–365 days after creation.");return {title:textValue(t.title,"Task title",200,true),kind:t.kind,due_days:t.due_days}});
  return {name,questions,tasks};
}
export function validateItem(value:Record<string,unknown>){
  const kind=String(value.kind);if(!["task","request","note","relationship","assessment"].includes(kind))throw new Error("Invalid client activity.");
  const payload:Record<string,unknown>={notes:textValue(value.notes,"Notes",4000,kind==="assessment")};
  if(kind==="assessment"){
    if(String(payload.notes).length<20)throw new Error("Explain the assessment in at least 20 characters.");
    Object.assign(payload,calculateRisk(value.scores as number[],value.weights as number[]));
    payload.policyReference=textValue(value.policyReference,"Policy reference",200,true);
    payload.screeningResultSeparate=true;
  }
  if(kind==="relationship"){
    payload.relationship=textValue(value.relationship,"Relationship",100,true);
    if(value.ownership!==""&&value.ownership!==undefined){const n=Number(value.ownership);if(!Number.isFinite(n)||n<0||n>100)throw new Error("Ownership must be between 0 and 100%.");payload.ownership=n}
  }
  return {kind,title:textValue(value.title,"Title",200,true),due_at:dateValue(value.due_at),assigned_to:value.assigned_to?uuid(value.assigned_to):null,payload};
}
