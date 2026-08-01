import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../../lib/supabase-server";
import { getAppUrl, stripeRequest } from "../../../lib/stripe";

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  try{
    const token=getBearerToken(request);if(!token)return NextResponse.json({error:"Log in to continue."},{status:401});
    const supabase=getSupabaseForToken(token),admin=getSupabaseAdmin();
    const {data:{user}}=await supabase.auth.getUser(token);if(!user)return NextResponse.json({error:"Your session has expired."},{status:401});
    const {data:membership}=await supabase.from("organisation_members").select("organisation_id,role").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!membership||!["owner","admin"].includes(membership.role))return NextResponse.json({error:"Only organisation owners and admins can manage billing."},{status:403});
    const {data:billing}=await admin.from("billing_customers").select("stripe_customer_id").eq("organisation_id",membership.organisation_id).maybeSingle();
    if(!billing?.stripe_customer_id)return NextResponse.json({error:"No Stripe billing account exists yet. Complete a checkout first."},{status:404});
    const session=await stripeRequest("billing_portal/sessions",new URLSearchParams({customer:billing.stripe_customer_id,return_url:`${getAppUrl()}/account`}));
    return NextResponse.json({url:session.url});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"The billing portal could not be opened."},{status:503})}
}
