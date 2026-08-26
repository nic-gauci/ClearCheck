import { timingSafeEqual } from "node:crypto";

export const stripePrices:Record<string,string|undefined>={
  single:process.env.STRIPE_PRICE_SINGLE,
  bundle_20:process.env.STRIPE_PRICE_BUNDLE_20,
  monthly_100:process.env.STRIPE_PRICE_MONTHLY_100,
};

function stripeKey(){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key)throw new Error("Stripe is not configured yet.");
  if(key.startsWith("sk_live_")&&process.env.ALLOW_LIVE_STRIPE!=="true")throw new Error("Live Stripe charges are disabled. Use test credentials until the production launch gate is approved.");
  if(key.startsWith("sk_live_")&&process.env.CLEARCHECK_LEGAL_IDENTITY_COMPLETE!=="true")throw new Error("Live Stripe charges are blocked until the operator identity, tax details, customer terms and privacy contact are approved.");
  if(!key.startsWith("sk_test_")&&!key.startsWith("sk_live_"))throw new Error("The Stripe secret key format is invalid.");
  return key;
}

export async function stripeRequest(path:string,params:URLSearchParams,idempotencyKey?:string){
  const headers:Record<string,string>={Authorization:`Bearer ${stripeKey()}`,"Content-Type":"application/x-www-form-urlencoded"};
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:"POST",headers,body:params});
  const payload=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(String((payload.error as {message?:string}|undefined)?.message||"Stripe request failed."));
  return payload;
}

export async function stripeRead(path:string,params=new URLSearchParams()){
  const query=params.size?`?${params}`:"";
  const response=await fetch(`https://api.stripe.com/v1/${path}${query}`,{headers:{Authorization:`Bearer ${stripeKey()}`}});
  const payload=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(String((payload.error as {message?:string}|undefined)?.message||"Stripe request failed."));
  return payload;
}

function isLocalHost(hostname:string){return hostname==="localhost"||hostname==="127.0.0.1"||hostname==="[::1]"}

export function resolveAppUrl(configuredValue:string|undefined,requestOrigin?:string){
  if(!configuredValue)throw new Error("The canonical app URL is not configured.");
  const configured=new URL(configuredValue);
  if(configured.protocol!=="https:"&&!isLocalHost(configured.hostname))throw new Error("The canonical app URL must use HTTPS.");
  if(requestOrigin&&isLocalHost(configured.hostname)){
    const requestUrl=new URL(requestOrigin);
    if(isLocalHost(requestUrl.hostname)&&(requestUrl.protocol==="http:"||requestUrl.protocol==="https:"))return requestUrl.origin;
  }
  return configured.origin;
}

export function getAppUrl(requestOrigin?:string){
  return resolveAppUrl(process.env.APP_URL,requestOrigin);
}

export async function verifyStripeSignature(payload:string,header:string,secret:string){
  const parts=header.split(",").map(part=>part.trim().split("=",2));
  const timestamp=parts.find(([key])=>key==="t")?.[1];
  const signatures=parts.filter(([key])=>key==="v1").map(([,value])=>value);
  if(!timestamp||!signatures.length||!Number.isFinite(Number(timestamp))||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected=Buffer.from(digest).toString("hex");
  const left=Buffer.from(expected);
  return signatures.some(signature=>{const right=Buffer.from(signature);return left.length===right.length&&timingSafeEqual(left,right)});
}
