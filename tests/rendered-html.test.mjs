import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path="/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`,{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

test("server-renders the ClearCheck product home page",async()=>{
  const response=await render();
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")??"",/^text\/html\b/i);
  const html=await response.text();
  assert.match(html,/<title>ClearCheck — AML Screening, Made Clear<\/title>/i);
  assert.match(html,/Compliance checks/);
  assert.match(html,/Log in to run screening/);
  assert.match(html,/Create your workspace/);
  assert.match(html,/25[\s\S]*complimentary credits/);
  assert.doesNotMatch(html,/codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders governance pages and removes the starter preview",async()=>{
  for(const [path,heading] of [["/privacy","Privacy notice"],["/terms","ClearCheck service terms"],["/security","How ClearCheck protects the workspace"],["/providers","Sources and licensing"]]){
    const response=await render(path),html=await response.text();
    assert.equal(response.status,200);
    assert.match(html,new RegExp(heading,"i"));
    assert.match(html,/Back to website/);
    assert.match(html,/On this page/);
  }
  await assert.rejects(access(new URL("../app/_sites-preview",import.meta.url)));
});

test("screening API verifies a user and persists an audit record",async()=>{
  const source=await readFile(new URL("../app/api/screen/route.ts",import.meta.url),"utf8");
  assert.match(source,/getBearerToken/);
  assert.match(source,/auth\.getUser/);
  assert.match(source,/record_screening/);
  assert.match(source,/isMissingRpc\(recordError,"record_screening_v2"\)/);
  assert.match(source,/supabase\.rpc\("record_screening",legacyPayload\)/);
  assert.match(source,/no screening credits/i);
});

test("EU screenings use the official Commission consolidated snapshot with safe fallback",async()=>{
  const screening=await readFile(new URL("../app/api/screen/route.ts",import.meta.url),"utf8");
  assert.match(screening,/data\.europa\.eu\/apps\/eusanctionstracker/);
  assert.match(screening,/screenEU\(query,subjectType\)/);
  assert.match(screening,/source_snapshots/);
  assert.match(screening,/eu_consolidated/);
  assert.match(screening,/screenEUConsolidatedCsv/);
  assert.match(screening,/Official consolidated list unavailable/);
  assert.match(screening,/manifest\.json/);
  assert.match(screening,/subjects\.jsonpack/);
  assert.match(screening,/jsonpack\.unpack/);
  assert.doesNotMatch(screening,/gels-avoirs\.dgtresor\.gouv\.fr/);
});
