import { createClient } from "@supabase/supabase-js";

export function getBearerToken(request:Request){
  const value=request.headers.get("authorization")||"";
  return value.toLowerCase().startsWith("bearer ")?value.slice(7).trim():"";
}

export function getSupabaseForToken(token:string){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error("Account services are not configured.");
  return createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
}

export function getSupabaseAdmin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)throw new Error("Secure server database access is not configured.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
