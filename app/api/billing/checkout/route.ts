import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../../lib/supabase-server";
import { stripePrices, stripeRequest } from "../../../lib/stripe";

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  try{
    const token=getBearerToken(request);if(!token)return NextResponse.json({error:"Log in to continue."},{status:401});
    const supabase=getSupabaseForToken(token),admin=getSupabaseAdmin();
    const {data:{user}}=await supabase.auth.getUser(token);if(!user)return NextResponse.json({error:"Your session has expired."},{status:401});
    const body=await request.json() as {planId?:string},planId=body.planId||"",priceId=stripePrices[planId];
    if(!priceId)return NextResponse.json({error:"Stripe price IDs have not been connected yet. Add them before enabling live checkout."},{status:503});
    const {data:membership}=await supabase.from("organisation_members").select("organisation_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!membership)return NextResponse.json({error:"Organisation access was not found."},{status:403});
    const {data:plan}=await supabase.from("plans").select("id,billing_mode,credits").eq("id",planId).eq("active",true).maybeSingle();
    if(!plan)return NextResponse.json({error:"That plan is not available."},{status:400});
    const {data:billing}=await admin.from("billing_customers").select("stripe_customer_id").eq("organisation_id",membership.organisation_id).maybeSingle();
    let customerId=billing?.stripe_customer_id as string|undefined;
    if(!customerId){
      const customer=await stripeRequest("customers",new URLSearchParams({email:user.email||"",name:String(user.user_metadata?.full_name||""),"metadata[organisation_id]":membership.organisation_id}));
      customerId=String(customer.id);
      await admin.from("billing_customers").upsert({organisation_id:membership.organisation_id,stripe_customer_id:customerId});
    }
    const origin=request.nextUrl.origin,mode=plan.billing_mode==="monthly"?"subscription":"payment";
    const params=new URLSearchParams({customer:customerId,mode,"line_items[0][price]":priceId,"line_items[0][quantity]":"1",success_url:`${origin}/account?billing=success`,cancel_url:`${origin}/account?billing=cancelled`,client_reference_id:membership.organisation_id,"metadata[organisation_id]":membership.organisation_id,"metadata[plan_id]":plan.id,"metadata[credits]":String(plan.credits||0)});
    if(mode==="subscription"){
      params.set("subscription_data[metadata][organisation_id]",membership.organisation_id);
      params.set("subscription_data[metadata][plan_id]",plan.id);
      params.set("subscription_data[metadata][credits]",String(plan.credits||0));
    }
    const session=await stripeRequest("checkout/sessions",params);
    return NextResponse.json({url:session.url});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Checkout could not be created."},{status:503})}
}
