import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, getSupabaseForToken } from "../../../lib/supabase-server";
import { stripePrices, stripeRead } from "../../../lib/stripe";
import { logServerError } from "../../../lib/server-log";

export const dynamic="force-dynamic";

type CheckoutSession={
  id:string;
  customer?:string;
  subscription?:string;
  status?:string;
  payment_status?:string;
  amount_total?:number;
  currency?:string;
  metadata?:Record<string,string>;
};

type Subscription={latest_invoice?:string;status?:string;current_period_end?:number};

export async function POST(request:NextRequest){
  try{
    const token=getBearerToken(request);
    if(!token)return NextResponse.json({error:"Log in to finish your purchase."},{status:401});
    const supabase=getSupabaseForToken(token),admin=getSupabaseAdmin();
    const {data:{user}}=await supabase.auth.getUser(token);
    if(!user)return NextResponse.json({error:"Your session has expired."},{status:401});
    const {sessionId}=await request.json() as {sessionId?:string};
    if(!sessionId?.startsWith("cs_"))return NextResponse.json({error:"The checkout reference is invalid."},{status:400});

    const {data:membership}=await supabase.from("organisation_members").select("organisation_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!membership)return NextResponse.json({error:"Your organisation could not be found."},{status:403});

    const session=await stripeRead(`checkout/sessions/${encodeURIComponent(sessionId)}`) as CheckoutSession;
    const metadata=session.metadata||{},planId=metadata.plan_id,priceId=metadata.price_id;
    if(metadata.organisation_id!==membership.organisation_id)return NextResponse.json({error:"This purchase belongs to another organisation."},{status:403});
    if(!planId||!priceId||stripePrices[planId]!==priceId)return NextResponse.json({error:"The purchased plan could not be verified."},{status:400});
    if(session.status!=="complete"||session.payment_status!=="paid")return NextResponse.json({error:"Stripe has not confirmed this payment yet."},{status:409});

    let reference=`checkout:${session.id}`,subscriptionStatus:string|null=null,currentPeriodEnd:string|null=null;
    if(session.subscription){
      const subscription=await stripeRead(`subscriptions/${encodeURIComponent(session.subscription)}`) as Subscription;
      if(!subscription.latest_invoice)throw new Error("The subscription invoice could not be verified.");
      reference=`invoice:${subscription.latest_invoice}`;
      subscriptionStatus=subscription.status||null;
      currentPeriodEnd=subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null;
    }

    const {data:processed,error}=await admin.rpc("process_stripe_event_v2",{
      p_event_id:reference,
      p_event_type:"checkout.session.confirmed",
      p_organisation_id:membership.organisation_id,
      p_plan_id:planId,
      p_customer_id:session.customer||null,
      p_subscription_id:session.subscription||null,
      p_subscription_status:subscriptionStatus,
      p_current_period_end:currentPeriodEnd,
      p_grant_credits:true,
      p_amount_paid_cents:session.amount_total||null,
      p_currency:(session.currency||"").toUpperCase()||null,
    });
    if(error)throw error;
    const {data:plan}=await admin.from("plans").select("name,credits,price_cents").eq("id",planId).single();
    return NextResponse.json({purchase:{planName:plan?.name||"ClearCheck plan",credits:plan?.credits||0,amount:session.amount_total||plan?.price_cents||0,currency:(session.currency||"eur").toUpperCase()},alreadyProcessed:processed===false});
  }catch(error){const incidentId=logServerError("billing.confirm",error);return NextResponse.json({error:"The payment could not be confirmed yet. No duplicate credits will be issued when you retry.",incidentId},{status:503})}
}
