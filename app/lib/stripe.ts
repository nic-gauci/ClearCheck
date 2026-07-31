import { timingSafeEqual } from "node:crypto";

export const stripePrices:Record<string,string|undefined>={
  single:process.env.STRIPE_PRICE_SINGLE,
  bundle_20:process.env.STRIPE_PRICE_BUNDLE_20,
  monthly_100:process.env.STRIPE_PRICE_MONTHLY_100,
};

export async function stripeRequest(path:string,params:URLSearchParams){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key)throw new Error("Stripe is not configured yet.");
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body:params});
  const payload=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(String((payload.error as {message?:string}|undefined)?.message||"Stripe request failed."));
  return payload;
}

export async function verifyStripeSignature(payload:string,header:string,secret:string){
  const values=Object.fromEntries(header.split(",").map(part=>part.split("=",2) as [string,string]));
  const timestamp=values.t,signature=values.v1;
  if(!timestamp||!signature||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected=Buffer.from(digest).toString("hex");
  const left=Buffer.from(expected),right=Buffer.from(signature);
  return left.length===right.length&&timingSafeEqual(left,right);
}
