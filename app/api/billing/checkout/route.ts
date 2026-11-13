import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../../lib/supabase-server";
import { getAppUrl, matchesStripePlan, stripePrices, stripeRead, stripeRequest } from "../../../lib/stripe";
import { logServerError } from "../../../lib/server-log";

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  try{
    const token=getBearerToken(request);if(!token)return NextResponse.json({error:"Log in to continue."},{status:401});
    const supabase=getSupabaseForToken(token),admin=getSupabaseAdmin();
    const {data:{user}}=await supabase.auth.getUser(token);if(!user)return NextResponse.json({error:"Your session has expired."},{status:401});
    const body=await request.json() as {planId?:string},planId=body.planId||"",priceId=stripePrices[planId];
    if(!priceId)return NextResponse.json({error:"Stripe price IDs have not been connected yet. Add them before enabling live checkout."},{status:503});
    const {data:membership}=await supabase.from("organisation_members").select("organisation_id,role").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!membership||!["owner","admin"].includes(membership.role))return NextResponse.json({error:"Only organisation owners and admins can manage billing."},{status:403});
    const {data:plan}=await supabase.from("plans").select("id,billing_mode,price_cents").eq("id",planId).eq("active",true).maybeSingle();
    if(!plan)return NextResponse.json({error:"That plan is not available."},{status:400});
    const price=await stripeRead(`prices/${encodeURIComponent(priceId)}`);
    if(!matchesStripePlan(price,plan))throw new Error(`Stripe price does not match the ClearCheck catalogue for plan ${plan.id}.`);
    const {data:billing}=await admin.from("billing_customers").select("stripe_customer_id").eq("organisation_id",membership.organisation_id).maybeSingle();
    let customerId=billing?.stripe_customer_id as string|undefined;
    if(customerId){
      try{
        const customer=await stripeRead(`customers/${encodeURIComponent(customerId)}`);
        if(customer.deleted)customerId=undefined;
      }catch(error){
        if(error instanceof Error&&error.message.includes("No such customer"))customerId=undefined;
        else throw error;
      }
    }
    if(!customerId){
      const customer=await stripeRequest("customers",new URLSearchParams({email:user.email||"","metadata[organisation_id]":membership.organisation_id}),`clearcheck-customer-${membership.organisation_id}`);
      customerId=String(customer.id);
      await admin.from("billing_customers").upsert({organisation_id:membership.organisation_id,stripe_customer_id:customerId});
    }
    const origin=getAppUrl(request.nextUrl.origin),mode=plan.billing_mode==="monthly"?"subscription":"payment";
    const params=new URLSearchParams({customer:customerId,mode,"line_items[0][price]":priceId,"line_items[0][quantity]":"1","automatic_tax[enabled]":"true","tax_id_collection[enabled]":"true",billing_address_collection:"required","customer_update[address]":"auto","customer_update[name]":"auto",success_url:`${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/checkout/cancelled`,client_reference_id:membership.organisation_id,"metadata[organisation_id]":membership.organisation_id,"metadata[plan_id]":plan.id,"metadata[price_id]":priceId});
    if(mode==="subscription"){
      params.set("subscription_data[metadata][organisation_id]",membership.organisation_id);
      params.set("subscription_data[metadata][plan_id]",plan.id);
      params.set("subscription_data[metadata][price_id]",priceId);
    }
    const session=await stripeRequest("checkout/sessions",params,`clearcheck-checkout-${membership.organisation_id}-${plan.id}-${crypto.randomUUID()}`);
    return NextResponse.json({url:session.url});
  }catch(error){const incidentId=logServerError("billing.checkout",error);return NextResponse.json({error:"Checkout could not be created. Try again or contact support with the reference shown.",incidentId},{status:503})}
}
