import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isMissingRpc } from "../app/lib/supabase-server.ts";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("RPC compatibility fallback activates only for the named missing function",()=>{
  assert.equal(isMissingRpc({code:"PGRST202",message:"Could not find public.record_screening_v2"},"record_screening_v2"),true);
  assert.equal(isMissingRpc({code:"PGRST202",message:"Could not find another_function"},"record_screening_v2"),false);
  assert.equal(isMissingRpc({code:"42501",message:"permission denied"},"record_screening_v2"),false);
});

test("report downloads use only the server-authorised audit function",async()=>{
  const route=await read("../app/api/reports/route.ts");
  assert.match(route,/getSupabaseAdmin\(\)\.rpc\("record_report_download_v2"/);
  assert.doesNotMatch(route,/supabase\.rpc\("record_report_download"/);
});

test("Supabase tables are protected with RLS, scoped policies, and explicit grants",async()=>{
  const [foundation,hardening]=await Promise.all([read("../supabase/migrations/20260731183000_commercial_platform_foundation.sql"),read("../supabase/migrations/20260803020402_billing_audit_privacy_controls.sql")]);
  for(const table of["profiles","organisations","organisation_members","screenings","reports","audit_events","credit_ledger","billing_customers","compliance_settings","data_deletion_requests"]){assert.match(foundation,new RegExp(`alter table public\\.${table} enable row level security`,`i`))}
  assert.match(foundation,/private\.is_org_member/);
  assert.match(foundation,/private\.has_org_role/);
  assert.match(hardening,/grant insert \(organisation_id,requested_by,reason,request_type\)/i);
  assert.match(hardening,/to service_role/i);
  for(const fn of["process_stripe_event_v2","record_screening_v2","record_report_download_v2"]){
    assert.match(hardening,new RegExp(`revoke execute on function public\\.${fn}\\([^;]+from public,\\s*anon,\\s*authenticated`,`is`));
    assert.match(hardening,new RegExp(`grant execute on function public\\.${fn}\\([^;]+to service_role`,`is`));
  }
});

test("server secrets are not exposed through NEXT_PUBLIC variables",async()=>{
  const files=await Promise.all([read("../app/lib/supabase-server.ts"),read("../app/lib/stripe.ts"),read("../.env.example")]);
  const joined=files.join("\n");
  assert.doesNotMatch(joined,/NEXT_PUBLIC_(?:SUPABASE_)?(?:SECRET|SERVICE)|NEXT_PUBLIC_STRIPE_SECRET/);
  assert.match(joined,/SUPABASE_SECRET_KEY/);
  assert.match(joined,/STRIPE_SECRET_KEY/);
});

test("live payments require both operational and legal launch approval",async()=>{
  const stripe=await read("../app/lib/stripe.ts");
  assert.match(stripe,/ALLOW_LIVE_STRIPE/);
  assert.match(stripe,/CLEARCHECK_LEGAL_IDENTITY_COMPLETE/);
  assert.match(stripe,/sk_live_/);
});

test("health monitoring validates EU snapshots without an arbitrary age expiry",async()=>{
  const [health,screening]=await Promise.all([read("../app/api/health/route.ts"),read("../app/api/screen/route.ts")]);
  assert.doesNotMatch(health,/ageHours<=36/);
  assert.doesNotMatch(screening,/EU_SOURCE_MAX_AGE_MS|older than 36 hours/);
  assert.match(health,/source\?\.status==="ready"/);
  assert.match(health,/Boolean\(source\.checksum_sha256\)/);
  assert.match(health,/Number\(source\.row_count\)>=minRows/);
  assert.match(health,/status:sourceHealthy\?200:503/);
  assert.match(health,/euConsolidated/);
  assert.match(health,/euOfficialJournal/);
  assert.match(health,/unConsolidated/);
  assert.match(health,/maltaArb/);
  assert.match(health,/Object\.values\(sources\)\.every/);
  assert.doesNotMatch(health,/ageHours<=72/);
  assert.match(health,/refreshAttention/);
  assert.match(health,/scheduled refresh confirmation is overdue/);
});

test("screening review decisions are role-scoped, atomic, and audit logged",async()=>{
  const [migration,hardening,complete,route]=await Promise.all([read("../supabase/migrations/20260826120000_screening_review_workflow.sql"),read("../supabase/migrations/20260826123000_harden_screening_review_rpc.sql"),read("../supabase/migrations/20260826152907_complete_review_workflow.sql"),read("../app/api/reviews/route.ts")]);
  assert.match(migration,/review_status in \('unreviewed','under_review','closed_no_match','escalated'\)/);
  assert.match(migration,/private\.has_org_role\(target_org,array\['owner','admin','reviewer'\]/);
  assert.match(migration,/screening\.review_updated/);
  assert.match(migration,/insert into public\.audit_events/);
  assert.match(migration,/security definer/);
  assert.match(hardening,/revoke execute on function public\.update_screening_review\([^;]+from authenticated/is);
  assert.match(hardening,/revoke execute on function public\.update_screening_review_v2[^;]+from public,anon,authenticated/is);
  assert.match(hardening,/grant execute on function public\.update_screening_review_v2[^;]+to service_role/is);
  assert.match(migration,/security invoker/);
  assert.match(migration,/count\(\*\) over \(\)/);
  assert.match(route,/auth\.getUser/);
  assert.match(complete,/update_screening_review_v3/);
  assert.match(complete,/review_identifiers/);
  assert.match(complete,/false_positive/);
  assert.match(complete,/confirmed_match/);
  assert.match(complete,/assigned_to/);
  assert.match(complete,/security definer set search_path = ''/);
  assert.match(route,/getSupabaseAdmin\(\)\.rpc\("update_screening_review_v3"/);
  assert.match(route,/reviewNotes\.trim\(\)\.length<20/);
});
