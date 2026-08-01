import { timingSafeEqual } from "node:crypto";

export const stripePrices:Record<string,string|undefined>={
  single:process.env.STRIPE_PRICE_SINGLE,
  bundle_20:process.env.STRIPE_PRICE_BUNDLE_20,
  monthly_100:process.env.STRIPE_PRICE_MONTHLY_100,
};

function stripeKey(){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key)throw new Error("Stripe is not configured yet.");
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

export function getAppUrl(){
  const value=process.env.APP_URL;
  if(!value)throw new Error("The canonical app URL is not configured.");
  const url=new URL(value);
  if(url.protocol!=="https:"&&url.hostname!=="localhost")throw new Error("The canonical app URL must use HTTPS.");
  return url.origin;
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
