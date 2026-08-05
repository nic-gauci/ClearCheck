import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-server";
import { stripePrices, stripeRead, verifyStripeSignature } from "../../../lib/stripe";
import { logServerError } from "../../../lib/server-log";
import { isMissingStripeV2Function, normalizeStripeEvent, stripeProcessingReference, type StripeEvent, type StripeObject } from "../../../lib/billing-events";

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  const secret=process.env.STRIPE_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature")||"",raw=await request.text();
  if(!secret||!await verifyStripeSignature(raw,signature,secret))return NextResponse.json({error:"Invalid webhook signature."},{status:400});
  try{
    const event=JSON.parse(raw) as StripeEvent;
    const data=await normalizeStripeEvent(event,async id=>await stripeRead(`subscriptions/${encodeURIComponent(id)}`) as StripeObject);
    if(data.planId&&stripePrices[data.planId]!==data.priceId)throw new Error("Stripe event price does not match the configured plan.");
    if(data.grantCredits&&(!data.organisationId||!data.planId||!data.priceId))throw new Error("Paid Stripe event is missing fulfilment metadata.");

    const admin=getSupabaseAdmin();
    let {data:processed,error}=await admin.rpc("process_stripe_event_v2",{
      p_event_id:stripeProcessingReference(event,data),
      p_event_type:event.type,
      p_organisation_id:data.organisationId||null,
      p_plan_id:data.planId||null,
      p_customer_id:data.customerId||null,
      p_subscription_id:data.subscriptionId||null,
      p_subscription_status:data.status||null,
      p_current_period_end:data.currentPeriodEnd||null,
      p_grant_credits:data.grantCredits,
      p_amount_paid_cents:data.amountPaidCents||null,
      p_currency:data.currency||null,
    });
    if(isMissingStripeV2Function(error)){
      ({data:processed,error}=await admin.rpc("process_stripe_event",{
        p_event_id:stripeProcessingReference(event,data),
        p_event_type:event.type,
        p_organisation_id:data.organisationId||null,
        p_plan_id:data.planId||null,
        p_customer_id:data.customerId||null,
        p_subscription_id:data.subscriptionId||null,
        p_subscription_status:data.status||null,
        p_current_period_end:data.currentPeriodEnd||null,
        p_grant_credits:data.grantCredits,
      }));
    }
    if(error)throw error;
    return NextResponse.json({received:true,duplicate:processed===false});
  }catch(error){const incidentId=logServerError("billing.webhook",error);return NextResponse.json({error:"Webhook processing failed.",incidentId},{status:500})}
}
