import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isMissingStripeV2Function, normalizeStripeEvent, stripeProcessingReference } from "../app/lib/billing-events.ts";
import { resolveAppUrl } from "../app/lib/stripe.ts";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("checkout returns through the success screen and live charging is gated",async()=>{
  const [checkout,stripe,success]=await Promise.all([read("../app/api/billing/checkout/route.ts"),read("../app/lib/stripe.ts"),read("../app/checkout/success/page.tsx")]);
  assert.match(checkout,/\/checkout\/success\?session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(checkout,/getAppUrl\(request\.nextUrl\.origin\)/);
  assert.match(success,/\/account\?billing=success&session_id=/);
  assert.match(stripe,/ALLOW_LIVE_STRIPE/);
  assert.match(stripe,/sk_live_/);
  assert.equal(resolveAppUrl("http://localhost:3000","http://localhost:3002"),"http://localhost:3002");
  assert.equal(resolveAppUrl("https://clearcheck.example","https://attacker.example"),"https://clearcheck.example");
});

test("Stripe credit fulfilment and purchase history use one idempotent provider reference",async()=>{
  const [confirm,webhook,billingEvents,migration,account]=await Promise.all([read("../app/api/billing/confirm/route.ts"),read("../app/api/billing/webhook/route.ts"),read("../app/lib/billing-events.ts"),read("../supabase/migrations/20260803020402_billing_audit_privacy_controls.sql"),read("../app/account/page.tsx")]);
  assert.match(confirm,/process_stripe_event_v2/);
  assert.match(confirm,/process_stripe_event"/);
  assert.match(webhook,/process_stripe_event_v2/);
  assert.match(webhook,/process_stripe_event"/);
  assert.match(confirm,/invoice:\$\{subscription\.latest_invoice\}|checkout:\$\{session\.id\}/);
  assert.match(billingEvents,/invoice:\$\{event\.data\.object\.id\}/);
  assert.match(billingEvents,/checkout:\$\{event\.data\.object\.id\}/);
  assert.match(migration,/on conflict \(stripe_event_id\) do nothing/i);
  assert.match(migration,/credit_ledger.*external_reference/is);
  assert.match(migration,/amount_paid_cents/);
  assert.match(account,/PURCHASE HISTORY/);
  assert.match(account,/payment_status/);
  assert.equal(isMissingStripeV2Function({code:"PGRST202",message:"Could not find process_stripe_event_v2"}),true);
  assert.equal(isMissingStripeV2Function({code:"23505",message:"duplicate"}),false);
});

test("successful, failed, repeated, and subscription events produce safe credit decisions",async()=>{
  const paid={id:"evt_paid",type:"checkout.session.completed",data:{object:{id:"cs_same",payment_status:"paid",amount_total:12900,currency:"eur",metadata:{organisation_id:"org",plan_id:"bundle_20",price_id:"price_test"}}}};
  const failed={id:"evt_failed",type:"checkout.session.completed",data:{object:{id:"cs_failed",payment_status:"unpaid",metadata:{organisation_id:"org",plan_id:"bundle_20",price_id:"price_test"}}}};
  const paidData=await normalizeStripeEvent(paid,async()=>{throw new Error("not expected")});
  const failedData=await normalizeStripeEvent(failed,async()=>{throw new Error("not expected")});
  assert.equal(paidData.grantCredits,true);
  assert.equal(paidData.amountPaidCents,12900);
  assert.equal(failedData.grantCredits,false);
  assert.equal(stripeProcessingReference(paid,paidData),"checkout:cs_same");
  assert.equal(stripeProcessingReference({...paid,id:"evt_retry"},paidData),"checkout:cs_same");

  const invoice={id:"evt_invoice",type:"invoice.paid",data:{object:{id:"in_123",amount_paid:24900,currency:"eur",parent:{subscription_details:{subscription:"sub_123"}}}}};
  const invoiceData=await normalizeStripeEvent(invoice,async()=>({id:"sub_123",status:"active",metadata:{organisation_id:"org",plan_id:"monthly_100",price_id:"price_monthly"}}));
  assert.equal(invoiceData.grantCredits,true);
  assert.equal(stripeProcessingReference(invoice,invoiceData),"invoice:in_123");
});

test("server logs use incident references without logging searched names",async()=>{
  const logger=await read("../app/lib/server-log.ts");
  assert.match(logger,/incidentId/);
  assert.doesNotMatch(logger,/error\.message|stack/);
});
