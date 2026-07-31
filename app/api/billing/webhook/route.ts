import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-server";
import { verifyStripeSignature } from "../../../lib/stripe";

export const dynamic="force-dynamic";
type StripeObject={id:string;customer?:string;subscription?:string;status?:string;current_period_end?:number;billing_reason?:string;metadata?:Record<string,string>};
type StripeEvent={id:string;type:string;data:{object:StripeObject}};

export async function POST(request:NextRequest){
  const secret=process.env.STRIPE_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature")||"",raw=await request.text();
  if(!secret||!await verifyStripeSignature(raw,signature,secret))return NextResponse.json({error:"Invalid webhook signature."},{status:400});
  try{
    const event=JSON.parse(raw) as StripeEvent,admin=getSupabaseAdmin(),object=event.data.object;
    const {data:seen}=await admin.from("billing_events").select("stripe_event_id").eq("stripe_event_id",event.id).maybeSingle();
    if(seen)return NextResponse.json({received:true,duplicate:true});
    const metadata=object.metadata||{},organisationId=metadata.organisation_id,planId=metadata.plan_id,credits=Number(metadata.credits||0);
    if(event.type==="checkout.session.completed"&&organisationId){
      await admin.from("billing_customers").upsert({organisation_id:organisationId,stripe_customer_id:object.customer||null,stripe_subscription_id:object.subscription||null,plan_id:planId||null,subscription_status:object.subscription?"active":null});
      if(credits>0)await admin.from("credit_ledger").insert({organisation_id:organisationId,amount:credits,entry_type:object.subscription?"subscription":planId?.startsWith("bundle")?"bundle":"purchase",external_reference:event.id});
    }
    if(event.type==="invoice.paid"&&object.billing_reason==="subscription_cycle"&&organisationId&&credits>0){
      await admin.from("credit_ledger").insert({organisation_id:organisationId,amount:credits,entry_type:"subscription",external_reference:event.id});
    }
    if(event.type.startsWith("customer.subscription.")&&organisationId){
      await admin.from("billing_customers").upsert({organisation_id:organisationId,stripe_customer_id:object.customer||null,stripe_subscription_id:object.id,plan_id:planId||null,subscription_status:object.status||null,current_period_end:object.current_period_end?new Date(object.current_period_end*1000).toISOString():null});
    }
    await admin.from("billing_events").insert({stripe_event_id:event.id,event_type:event.type});
    return NextResponse.json({received:true});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Webhook processing failed."},{status:500})}
}
