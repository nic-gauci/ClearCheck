import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-server";
import { stripePrices, stripeRead, verifyStripeSignature } from "../../../lib/stripe";

export const dynamic="force-dynamic";

type StripeObject={
  id:string;
  customer?:string;
  subscription?:string;
  payment_status?:string;
  status?:string;
  current_period_end?:number;
  metadata?:Record<string,string>;
  parent?:{subscription_details?:{subscription?:string}};
};
type StripeEvent={id:string;type:string;data:{object:StripeObject}};
type BillingData={
  organisationId?:string;
  planId?:string;
  priceId?:string;
  customerId?:string;
  subscriptionId?:string;
  status?:string;
  currentPeriodEnd?:string;
  grantCredits:boolean;
};

function subscriptionIdFromInvoice(object:StripeObject){
  return object.subscription||object.parent?.subscription_details?.subscription;
}

async function normalize(event:StripeEvent):Promise<BillingData>{
  const object=event.data.object;
  let metadata=object.metadata||{};
  const subscriptionId=event.type.startsWith("invoice.")?subscriptionIdFromInvoice(object):object.subscription;
  let status=event.type.startsWith("customer.subscription.")?object.status:undefined;
  let currentPeriodEnd=object.current_period_end?new Date(object.current_period_end*1000).toISOString():undefined;

  if(subscriptionId&&event.type.startsWith("invoice.")){
    const subscription=await stripeRead(`subscriptions/${encodeURIComponent(subscriptionId)}`) as StripeObject;
    metadata=subscription.metadata||{};
    status=subscription.status;
    currentPeriodEnd=subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():undefined;
  }

  const oneTimePaid=(event.type==="checkout.session.completed"&&object.payment_status==="paid")||event.type==="checkout.session.async_payment_succeeded";
  const recurringPaid=event.type==="invoice.paid"&&Boolean(subscriptionId);
  return {
    organisationId:metadata.organisation_id,
    planId:metadata.plan_id,
    priceId:metadata.price_id,
    customerId:object.customer,
    subscriptionId:event.type.startsWith("customer.subscription.")?object.id:subscriptionId,
    status,
    currentPeriodEnd,
    grantCredits:oneTimePaid||recurringPaid,
  };
}

export async function POST(request:NextRequest){
  const secret=process.env.STRIPE_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature")||"",raw=await request.text();
  if(!secret||!await verifyStripeSignature(raw,signature,secret))return NextResponse.json({error:"Invalid webhook signature."},{status:400});
  try{
    const event=JSON.parse(raw) as StripeEvent;
    const data=await normalize(event);
    if(data.planId&&stripePrices[data.planId]!==data.priceId)throw new Error("Stripe event price does not match the configured plan.");
    if(data.grantCredits&&(!data.organisationId||!data.planId||!data.priceId))throw new Error("Paid Stripe event is missing fulfilment metadata.");

    const {data:processed,error}=await getSupabaseAdmin().rpc("process_stripe_event",{
      p_event_id:event.id,
      p_event_type:event.type,
      p_organisation_id:data.organisationId||null,
      p_plan_id:data.planId||null,
      p_customer_id:data.customerId||null,
      p_subscription_id:data.subscriptionId||null,
      p_subscription_status:data.status||null,
      p_current_period_end:data.currentPeriodEnd||null,
      p_grant_credits:data.grantCredits,
    });
    if(error)throw error;
    return NextResponse.json({received:true,duplicate:processed===false});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Webhook processing failed."},{status:500})}
}
