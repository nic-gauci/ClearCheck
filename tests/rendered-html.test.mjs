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
  assert.equal(response.headers.get("cache-control"),"private, no-store");
  const html=await response.text();
  assert.match(html,/<title>ClearCheck — Sanctions &amp; Public-Record Screening<\/title>/i);
  assert.match(html,/Sanctions screening[\s\S]*across EU, UN and Malta sources/);
  assert.match(html,/EXAMPLE RESULT/);
  assert.match(html,/Log in to run screening/);
  assert.doesNotMatch(html,/name="password"|aria-label="Full legal name"/);
  assert.match(html,/Create your workspace/);
  assert.match(html,/25[\s\S]*complimentary credits/);
  assert.match(html,/href="\/cookies"/);
  assert.match(html,/href="\/terms#refunds"/);
  assert.doesNotMatch(html,/codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("the screening route starts behind the workspace login check",async()=>{
  const response=await render("/screening");
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Opening screening/);
  assert.doesNotMatch(html,/aria-label="Full legal name"|See what a screening returns/);
});

test("renders governance pages and removes the starter preview",async()=>{
  for(const [path,heading] of [["/cookies","Cookies and browser storage"],["/privacy","Privacy notice"],["/terms","ClearCheck service terms"],["/security","How ClearCheck protects the workspace"],["/providers","Sources and licensing"]]){
    const response=await render(path),html=await response.text();
    assert.equal(response.status,200);
    assert.match(html,new RegExp(heading,"i"));
    assert.match(html,/Back to website/);
    assert.match(html,/On this page/);
    if(path==="/terms")assert.match(html,/id="refunds"/);
    if(path==="/privacy")assert.match(html,/href="\/account\?tab=settings"/);
  }
  await assert.rejects(access(new URL("../app/_sites-preview",import.meta.url)));
});

test("shared headers provide a persistent accessible light and dark theme",async()=>{
  const [themeButton,layout,styles]=await Promise.all([readFile(new URL("../app/ThemeButton.tsx",import.meta.url),"utf8"),readFile(new URL("../app/layout.tsx",import.meta.url),"utf8"),readFile(new URL("../app/globals.css",import.meta.url),"utf8")]);
  assert.match(themeButton,/className="themeToggle"/);
  assert.match(themeButton,/Switch to light mode/);
  assert.match(themeButton,/Switch to dark mode/);
  assert.match(themeButton,/localStorage\.setItem\("clearcheck-theme",next\)/);
  assert.match(layout,/prefers-color-scheme: dark/);
  assert.match(layout,/clearcheck-theme/);
  assert.match(styles,/Final dark palette/);
  for(const surface of ["appHeader","authCard","dashboardPanel","resultSection","sourceRegister"]){assert.match(styles,new RegExp(surface))}
});

test("account screening history supports server-side search, review filters, sorting, and pagination",async()=>{
  const account=await readFile(new URL("../app/account/page.tsx",import.meta.url),"utf8");
  assert.match(account,/Search name or case reference/);
  assert.match(account,/All source results/);
  assert.match(account,/All review outcomes/);
  assert.match(account,/People &amp; businesses/);
  assert.match(account,/Newest first/);
  assert.match(account,/Most matches/);
  assert.match(account,/rpc\("search_screenings"/);
  assert.match(account,/SCREENINGS_PER_PAGE/);
  assert.match(account,/Save review decision/);
  assert.match(account,/Human judgement required/);
  assert.match(account,/fetch\("\/api\/reviews"/);
  assert.match(account,/Clear all filters/);
  assert.match(account,/Unreviewed matches/);
  assert.match(account,/More information required/);
  assert.match(account,/popstate/);
});

test("account billing uses honest receipts and role-scoped team controls",async()=>{
  const [account,receipt,team]=await Promise.all([readFile(new URL("../app/account/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/lib/invoice.ts",import.meta.url),"utf8"),readFile(new URL("../app/api/team/route.ts",import.meta.url),"utf8")]);
  assert.match(account,/Download receipt/);
  assert.doesNotMatch(account,/Print invoice/);
  assert.match(receipt,/PURCHASE RECEIPT/);
  assert.match(receipt,/not a tax invoice/i);
  assert.match(account,/Members &amp; roles/);
  assert.match(team,/\["owner","admin"\]\.includes\(current\.role\)/);
  assert.match(team,/workspace\.member_role_updated/);
  assert.match(team,/auth\.getUser/);
});

test("account overview shows monitored EU, UN, and Malta source health",async()=>{
  const account=await readFile(new URL("../app/account/page.tsx",import.meta.url),"utf8");
  assert.match(account,/Official-data availability/);
  assert.match(account,/EU consolidated list/);
  assert.match(account,/UN consolidated list/);
  assert.match(account,/Malta ARB court orders/);
  assert.match(account,/Refresh status/);
});

test("screening API verifies a user and persists an audit record",async()=>{
  const [source,page]=await Promise.all([readFile(new URL("../app/api/screen/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/screening/page.tsx",import.meta.url),"utf8")]);
  assert.match(source,/export async function POST/);
  assert.doesNotMatch(source,/nextUrl\.searchParams|get\("q"\)/);
  assert.match(page,/fetch\("\/api\/screen",\{method:"POST"/);
  assert.match(page,/body:JSON\.stringify\(\{query:clean,subjectType,customerReference,screeningPurpose,identifiers\}\)/);
  assert.match(source,/input_identifiers:identifiers/);
  assert.match(source,/getBearerToken/);
  assert.match(source,/auth\.getUser/);
  assert.match(source,/record_screening/);
  assert.match(source,/getSupabaseAdmin\(\)\.rpc\("record_screening_v3"/);
  assert.doesNotMatch(source,/supabase\.rpc\("record_screening"/);
  assert.match(source,/no screening credits/i);
});

test("result downloads use the shared professional report and local action errors",async()=>{
  const [page,styles]=await Promise.all([readFile(new URL("../app/screening/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/globals.css",import.meta.url),"utf8")]);
  assert.match(page,/import \{ downloadScreeningReport \} from "\.\.\/lib\/report"/);
  assert.match(page,/downloadScreeningReport\(currentRecord\)/);
  assert.doesNotMatch(page,/import \{ jsPDF \}|new jsPDF/);
  assert.match(page,/reportActionError/);
  assert.match(page,/role="alert"/);
  assert.match(styles,/\.reportActionError/);
});

test("result review requires evidence and opens external web searches safely",async()=>{
  const page=await readFile(new URL("../app/screening/page.tsx",import.meta.url),"utf8");
  assert.match(page,/Record review decision/);
  assert.match(page,/reviewIdentifiers/);
  assert.match(page,/reviewValidationMessage/);
  assert.match(page,/disabled=\{reviewBusy\}/);
  assert.doesNotMatch(page,/disabled=\{reviewBusy\|\|reviewNotes/);
  assert.match(page,/false_positive/);
  assert.match(page,/confirmed_match/);
  assert.match(page,/more_information_required/);
  assert.match(page,/target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(page,/<iframe/);
});

test("source coverage highlights completed sources with potential matches",async()=>{
  const [page,styles]=await Promise.all([readFile(new URL("../app/screening/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/globals.css",import.meta.url),"utf8")]);
  assert.match(page,/hasPotentialMatch=s\.status==="complete"&&s\.count>0/);
  assert.match(page,/Potential match/);
  assert.match(styles,/article\.potential/);
  assert.match(styles,/sourceReport \.potential \.sourceStatus/);
});

test("EU screenings require both official EU datasets and fail closed with a safe fallback",async()=>{
  const screening=await readFile(new URL("../app/api/screen/route.ts",import.meta.url),"utf8");
  assert.match(screening,/data\.europa\.eu\/apps\/eusanctionstracker/);
  assert.match(screening,/screenEU\(query,subjectType\)/);
  assert.match(screening,/screenUN\(query,subjectType\)/);
  assert.match(screening,/source_snapshots/);
  assert.match(screening,/eu_consolidated/);
  assert.match(screening,/eu_official_journal/);
  assert.match(screening,/screenEUConsolidatedCsv/);
  assert.match(screening,/screenEUOfficialJournalDataset/);
  assert.match(screening,/One or more required official EU datasets are unavailable/);
  assert.match(screening,/manifest\.json/);
  assert.match(screening,/subjects\.jsonpack/);
  assert.match(screening,/jsonpack\.unpack/);
  assert.doesNotMatch(screening,/gels-avoirs\.dgtresor\.gouv\.fr/);
});
