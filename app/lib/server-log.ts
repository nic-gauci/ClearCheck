export function logServerError(context:string,error:unknown){
  const incidentId=crypto.randomUUID();
  const errorName=error instanceof Error?error.name:"UnknownError";
  console.error(JSON.stringify({level:"error",event:"clearcheck.server_error",context,incidentId,errorName,occurredAt:new Date().toISOString()}));
  return incidentId;
}
