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

test("report downloads fall back to the authenticated legacy audit function",async()=>{
  const route=await read("../app/api/reports/route.ts");
  assert.match(route,/isMissingRpc\(error,"record_report_download_v2"\)/);
  assert.match(route,/supabase\.rpc\("record_report_download"/);
  assert.doesNotMatch(route,/getSupabaseAdmin\(\)\.rpc\("record_report_download"/);
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

test("health monitoring fails closed when the official EU source is stale",async()=>{
  const health=await read("../app/api/health/route.ts");
  assert.match(health,/ageHours<=36/);
  assert.match(health,/status:sourceHealthy\?200:503/);
  assert.match(health,/euConsolidated/);
  assert.match(health,/euOfficialJournal/);
  assert.match(health,/consolidated\.healthy&&officialJournal\.healthy/);
});
