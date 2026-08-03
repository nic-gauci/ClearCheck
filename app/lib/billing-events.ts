export type StripeObject={
  id:string;customer?:string;subscription?:string;payment_status?:string;status?:string;current_period_end?:number;
  amount_total?:number;amount_paid?:number;currency?:string;metadata?:Record<string,string>;
  parent?:{subscription_details?:{subscription?:string}};
};
export type StripeEvent={id:string;type:string;data:{object:StripeObject}};
export type BillingData={organisationId?:string;planId?:string;priceId?:string;customerId?:string;subscriptionId?:string;status?:string;currentPeriodEnd?:string;grantCredits:boolean;amountPaidCents?:number;currency?:string};

function subscriptionIdFromInvoice(object:StripeObject){return object.subscription||object.parent?.subscription_details?.subscription}

export async function normalizeStripeEvent(event:StripeEvent,readSubscription:(id:string)=>Promise<StripeObject>):Promise<BillingData>{
  const object=event.data.object;
  let metadata=object.metadata||{};
  const subscriptionId=event.type.startsWith("invoice.")?subscriptionIdFromInvoice(object):object.subscription;
  let status=event.type.startsWith("customer.subscription.")?object.status:undefined;
  let currentPeriodEnd=object.current_period_end?new Date(object.current_period_end*1000).toISOString():undefined;
  if(subscriptionId&&event.type.startsWith("invoice.")){
    const subscription=await readSubscription(subscriptionId);
    metadata=subscription.metadata||{};status=subscription.status;
    currentPeriodEnd=subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():undefined;
  }
  const oneTimePaid=((event.type==="checkout.session.completed"&&object.payment_status==="paid")||event.type==="checkout.session.async_payment_succeeded")&&!object.subscription;
  const recurringPaid=event.type==="invoice.paid"&&Boolean(subscriptionId);
  return{organisationId:metadata.organisation_id,planId:metadata.plan_id,priceId:metadata.price_id,customerId:object.customer,subscriptionId:event.type.startsWith("customer.subscription.")?object.id:subscriptionId,status,currentPeriodEnd,grantCredits:oneTimePaid||recurringPaid,amountPaidCents:event.type.startsWith("invoice.")?object.amount_paid:object.amount_total,currency:object.currency?.toUpperCase()};
}

export function stripeProcessingReference(event:StripeEvent,data:BillingData){
  if(event.type.startsWith("invoice."))return `invoice:${event.data.object.id}`;
  if(data.grantCredits&&event.type.startsWith("checkout.session."))return `checkout:${event.data.object.id}`;
  return `event:${event.id}`;
}
