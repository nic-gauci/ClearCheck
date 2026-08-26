"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import AppHeader from "./AppHeader";
import { getSupabaseBrowserClient } from "./lib/supabase";
import { downloadScreeningReport } from "./lib/report";
import type { SavedScreening } from "./lib/screening";

type Result = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string; aliases?:string[];dateOfBirth?:string;nationalities?:string[];identificationNumbers?:string[];matchReason?:string;legalBasis?:string };
type SourceStatus = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string;sourceUrl?:string;version?:string;lastUpdated?:string;licence?:string };
type WebSearch = { term:string; label:string; query:string; href:string };
type PublicPlan = { id:string;name:string;billing_mode:string;price_cents:number;credits:number|null;interval_name:string|null;description:string };
type ReviewDisposition="under_review"|"false_positive"|"confirmed_match"|"more_information_required"|"escalated";
function isReviewDisposition(value:unknown):value is ReviewDisposition{return typeof value==="string"&&["under_review","false_positive","confirmed_match","more_information_required","escalated"].includes(value)}

export default function Home(){
  const [subjectType,setSubjectType]=useState<"person"|"business">("person");
  const [screenedType,setScreenedType]=useState<"person"|"business">("person");
  const [query,setQuery]=useState("");
  const [customerReference,setCustomerReference]=useState("");
  const [screeningPurpose,setScreeningPurpose]=useState("");
  const [dateOfBirth,setDateOfBirth]=useState("");
  const [nationality,setNationality]=useState("");
  const [identificationNumber,setIdentificationNumber]=useState("");
  const [country,setCountry]=useState("");
  const [screened,setScreened]=useState("");
  const [results,setResults]=useState<Result[]>([]);
  const [sources,setSources]=useState<SourceStatus[]>([]);
  const [webSearches,setWebSearches]=useState<WebSearch[]>([]);
  const [webExpanded,setWebExpanded]=useState(false);
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);
  const [error,setError]=useState("");
  const [caseRef,setCaseRef]=useState("");
  const [checkedAt,setCheckedAt]=useState("");
  const [screeningId,setScreeningId]=useState("");
  const [currentRecord,setCurrentRecord]=useState<SavedScreening|null>(null);
  const [reportError,setReportError]=useState("");
  const [reportLoading,setReportLoading]=useState(false);
  const [user,setUser]=useState<User|null>(null);
  const [authReady,setAuthReady]=useState(false);
  const [credits,setCredits]=useState<number|null>(null);
  const [sourceHealth,setSourceHealth]=useState<"checking"|"available"|"attention"|"degraded">("checking");
  const [canReview,setCanReview]=useState(false);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [reviewStatus,setReviewStatus]=useState<ReviewDisposition>("under_review");
  const [reviewNotes,setReviewNotes]=useState("");
  const [reviewIdentifiers,setReviewIdentifiers]=useState("");
  const [reviewDueAt,setReviewDueAt]=useState("");
  const [reviewBusy,setReviewBusy]=useState(false);
  const [reviewNotice,setReviewNotice]=useState("");
  const [publicPlans,setPublicPlans]=useState<PublicPlan[]>([]);

  function openSaved(record:SavedScreening){
    setScreeningId(record.id);setCurrentRecord(record);setReportError("");setScreened(record.subject_name);setQuery(record.subject_name);setScreenedType(record.subject_type);setResults(record.results||[]);setSources(record.sources||[]);setWebSearches(record.web_searches||[]);setWebExpanded(false);setCheckedAt(record.checked_at);setCaseRef(record.case_reference);setCustomerReference(record.customer_reference||"");setScreeningPurpose(record.screening_purpose||"");setReviewNotes(record.review_notes||"");setReviewIdentifiers(record.review_identifiers||"");setReviewDueAt(record.review_due_at?.slice(0,10)||"");if(isReviewDisposition(record.review_status))setReviewStatus(record.review_status);setSearched(true);
  }

  useEffect(()=>{
    const supabase=getSupabaseBrowserClient();
    let active=true;
    void supabase.from("plans").select("id,name,billing_mode,price_cents,credits,interval_name,description").neq("billing_mode","beta").order("sort_order").then(({data})=>{if(active)setPublicPlans((data||[]) as PublicPlan[])});
    supabase.auth.getUser().then(async({data})=>{
      if(!active)return;
      setUser(data.user);setAuthReady(true);
      void fetch("/api/health",{cache:"no-store"}).then(response=>response.json()).then(payload=>setSourceHealth(payload.status==="ok"?"available":payload.status==="attention"?"attention":"degraded")).catch(()=>setSourceHealth("degraded"));
      if(data.user){const {data:membership}=await supabase.from("organisation_members").select("organisation_id,role").eq("user_id",data.user.id).eq("status","active").limit(1).maybeSingle();if(membership){setCanReview(["owner","admin","reviewer"].includes(membership.role));const {data:ledger}=await supabase.from("credit_ledger").select("amount").eq("organisation_id",membership.organisation_id);setCredits((ledger||[]).reduce((sum,row)=>sum+Number(row.amount),0))}}
      const requested=new URLSearchParams(window.location.search).get("screening");
      if(data.user&&requested){
        setLoading(true);
        const {data:record,error:recordError}=await supabase.from("screenings").select("*").eq("id",requested).maybeSingle();
        if(!active)return;
        if(recordError||!record)setError("That saved screening could not be opened.");
        else openSaved(record as SavedScreening);
        setLoading(false);
      }
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null);setAuthReady(true)});
    return()=>{active=false;subscription.unsubscribe()};
  },[]);

  async function screen(e:FormEvent){
    e.preventDefault();
    const clean=query.trim();
    if(!clean)return;
    if(!user){window.location.assign("/login?returnTo=/");return}
    setLoading(true);setError("");
    try{
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      if(!session?.access_token){window.location.assign("/login?returnTo=/");return}
      const identifiers=subjectType==="person"?{dateOfBirth,nationality,identificationNumber}:{country,registrationNumber:identificationNumber};
      const response=await fetch("/api/screen",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({query:clean,subjectType,customerReference,screeningPurpose,identifiers})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Screening could not be completed.");
      const stamp=data.checkedAt||new Date().toISOString();
      const nextResults=(data.matches||[]) as Result[],nextSources=(data.sources||[]) as SourceStatus[],nextWebSearches=(data.webSearches||[]) as WebSearch[];
      const record:SavedScreening={id:data.screeningId,case_reference:data.caseReference,subject_name:clean,subject_type:subjectType,status:"completed",risk_state:nextSources.some(source=>source.status==="unavailable")?"incomplete":"review",match_count:nextResults.length,source_count:nextSources.length,results:nextResults,sources:nextSources,web_searches:nextWebSearches,checked_at:stamp,completed_at:stamp,created_at:stamp,customer_reference:customerReference||null,screening_purpose:screeningPurpose||null,input_identifiers:identifiers};
      setScreeningId(data.screeningId);setCurrentRecord(record);setReportError("");setScreened(clean);setScreenedType(subjectType);setResults(nextResults);setSources(nextSources);setWebSearches(nextWebSearches);setWebExpanded(false);setCheckedAt(stamp);setCaseRef(data.caseReference);setSearched(true);
      setCredits(value=>value===null?value:Math.max(0,value-1));
      window.history.replaceState({},"",`/?screening=${encodeURIComponent(data.screeningId)}`);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(err){setError(err instanceof Error?err.message:"Screening could not be completed.")}
    finally{setLoading(false)}
  }

  function goHome(){setSearched(false);setQuery("");setError("");setReportError("");setCurrentRecord(null);window.history.replaceState({},"","/");window.scrollTo({top:0,behavior:"smooth"})}

  const incomplete=sources.some(s=>s.status==="unavailable");
  const completed=sources.filter(s=>s.status==="complete").length;
  const officialSourceTotal=sources.filter(s=>s.key!=="WEB").length;
  const resultState=incomplete?"incomplete":results.length?"potential":"review";
  const resultTitle=incomplete?"Screening incomplete":results.length?"Potential match":"No official-list matches";

  async function exportReport(){
    if(!screeningId||!currentRecord){setReportError("This screening is not ready to download yet.");return}
    setReportLoading(true);setReportError("");
    try{
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      if(!session?.access_token)throw new Error("Your session has expired. Log in again before downloading the report.");
      const response=await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({screeningId})});
      const payload=await response.json().catch(()=>({error:"The report service returned an invalid response."}));
      if(!response.ok)throw new Error(payload.error||"The report audit event could not be saved. Please try again.");
      downloadScreeningReport(currentRecord);
    }catch(caught){setReportError(caught instanceof Error?caught.message:"The report could not be downloaded. Please try again.")}
    finally{setReportLoading(false)}
  }

  async function saveResultReview(){
    if(!currentRecord)return;
    setReviewBusy(true);setReviewNotice("");
    try{
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      if(!session?.access_token)throw new Error("Your session has expired. Log in again before saving the review.");
      const response=await fetch("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({screeningId:currentRecord.id,reviewStatus,reviewNotes,reviewIdentifiers,reviewDueAt:reviewDueAt?new Date(`${reviewDueAt}T17:00:00`).toISOString():null})});
      const payload=await response.json().catch(()=>({error:"The review service returned an invalid response."}));
      if(!response.ok)throw new Error(payload.error||"The review decision could not be saved.");
      setCurrentRecord(record=>record?{...record,...payload.review}:record);setReviewNotice("Review decision saved to the audit trail.");
    }catch(caught){setReviewNotice(caught instanceof Error?caught.message:"The review decision could not be saved.")}
    finally{setReviewBusy(false)}
  }

  if(!searched){
    return <main className="homePage">
      <AppHeader variant="public" onHome={goHome}/>
      <section className="kycHero" id="top">
        <div className="heroGlow heroGlowOne"/><div className="heroGlow heroGlowTwo"/>
        <div className="kycHeroInner">
          <div className="heroCopy">
            <span className="heroPill"><i/> SANCTIONS &amp; PUBLIC-RECORD SCREENING</span>
            <h1>Compliance checks<br/>without the <em>complexity.</em></h1>
            <p>Screen people and businesses across official sanctions, Maltese court orders and focused web intelligence—in one clear, evidence-linked report.</p>
            <div className="heroBenefits"><span><b>✓</b> Live source checks</span><span><b>✓</b> Official evidence links</span><span><b>✓</b> Downloadable PDF report</span></div>
            <div className="heroProof"><span>Built for</span><strong>Financial services</strong><strong>Legal teams</strong><strong>Real estate</strong><strong>Gaming</strong></div>
          </div>
          <div className="screenCard" id="screen">
            <div className="screenCardHead"><div><span>NAME SCREENING</span><h2>Run a compliance check</h2></div><span className={`liveBadge ${sourceHealth}`}><i/> {sourceHealth==="checking"?"Checking sources":sourceHealth==="available"?"Official sources available":sourceHealth==="attention"?"Refresh check due":"Source issue detected"}</span></div>
            <div className="typeTabs" role="tablist" aria-label="Subject type"><button type="button" role="tab" aria-selected={subjectType==="person"} className={subjectType==="person"?"active":""} onClick={()=>setSubjectType("person")}><span aria-hidden="true">●</span> Person</button><button type="button" role="tab" aria-selected={subjectType==="business"} className={subjectType==="business"?"active":""} onClick={()=>setSubjectType("business")}><span aria-hidden="true">◆</span> Business</button></div>
            <form className="kycSearch" onSubmit={screen}>
              <label>{subjectType==="person"?"Full legal name":"Registered business name"}<div><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} aria-label={subjectType==="person"?"Full legal name":"Registered business name"} placeholder={subjectType==="person"?"e.g. Alina Juc":"e.g. Example Holdings Ltd"}/></div></label>
              <div className="screeningContext"><label>Customer / case reference <span>Optional</span><input value={customerReference} maxLength={120} onChange={event=>setCustomerReference(event.target.value)} placeholder="Your internal reference"/></label><label>Screening purpose <span>Optional</span><input value={screeningPurpose} maxLength={500} onChange={event=>setScreeningPurpose(event.target.value)} placeholder="Onboarding, periodic review…"/></label><label>{subjectType==="person"?"Date of birth":"Country of incorporation"} <span>Optional</span><input type={subjectType==="person"?"date":"text"} value={subjectType==="person"?dateOfBirth:country} onChange={event=>subjectType==="person"?setDateOfBirth(event.target.value):setCountry(event.target.value)}/></label>{subjectType==="person"&&<label>Nationality <span>Optional</span><input value={nationality} onChange={event=>setNationality(event.target.value)}/></label>}<label>{subjectType==="person"?"Identification number":"Registration number"} <span>Optional</span><input value={identificationNumber} onChange={event=>setIdentificationNumber(event.target.value)}/></label></div>
              <p className="nameOnlyWarning">Automated matching is name-led. Identifiers are recorded to support the required human comparison.</p><button type="submit" disabled={loading||!authReady||credits===0}>{loading?"Checking every source…":!user?"Log in to run screening":credits===0?"No credits remaining":"Run screening"}<span>→</span></button>
            </form>
            <div className="screenCardMeta"><span><b>PRIVATE BETA</b> One saved screening uses one credit</span><span>{credits===null?"Usually 20–40 seconds":`${credits} credit${credits===1?"":"s"} remaining`}</span></div>
            {loading&&<div className="screenProgress"><i/><span>Checking EU, UN, Malta and web-intelligence sources…</span></div>}
            {error&&<div className="searchError">{error}</div>}
          </div>
        </div>
      </section>
      <section className="platformSection" id="platform">
        <div className="sectionIntro"><span className="sectionKicker">THE CLEARCHECK PLATFORM</span><h2>From a name to a documented<br/><em>compliance decision.</em></h2><p>ClearCheck brings fragmented public sources into a focused review workflow, helping small compliance teams move quickly without losing the evidence trail.</p></div>
        <div className="platformGrid">
          <article className="featurePrimary"><span className="featureIcon">01</span><small>SCREENING</small><h3>One search across multiple risk sources</h3><p>Check a person or business against EU and UN sanctions, Malta Asset Recovery Bureau court orders and the latest EU Official Journal designations.</p><div className="miniResult"><span className="miniAvatar">AJ</span><div><small>POTENTIAL MATCH</small><strong>Alina JUC</strong><span>EU restrictive measures · 100% name match</span></div><b>Review →</b></div></article>
          <article><span className="featureIcon">02</span><small>EVIDENCE</small><h3>Official links beside every match</h3><p>Move directly from a result to EUR-Lex, the UN list or the Maltese court-order record.</p></article>
          <article><span className="featureIcon">03</span><small>REPORTING</small><h3>Audit-ready PDF reports</h3><p>Save the case reference, time checked, source status, matches and review guidance.</p></article>
          <article><span className="featureIcon">04</span><small>WEB INTELLIGENCE</small><h3>Focused adverse-media review</h3><p>Open structured external searches for fraud, eCourts, money laundering and financial crime.</p></article>
          <article><span className="featureIcon">05</span><small>TRACEABILITY</small><h3>Source-by-source status</h3><p>See when a source completed, returned matches or was unavailable—never mistake an incomplete check for a clear result.</p></article>
        </div>
      </section>
      <section className="coverageSection" id="coverage"><div className="coverageCopy"><span className="sectionKicker">CURRENT COVERAGE</span><h2>The right sources,<br/>checked together.</h2><p>Every search records what completed, what requires review and the dataset reference used. Current availability is confirmed again when a screening runs.</p><ol className="coverageSteps"><li><b>1</b><span>Enter the fullest legal name and available identifiers</span></li><li><b>2</b><span>Review identifiers and official evidence</span></li><li><b>3</b><span>Record a human disposition</span></li></ol></div><div className="coverageList"><div><span className="sourceBadge eu">EU</span><div><strong>European Union sanctions</strong><p>Consolidated financial sanctions and Official Journal designations.</p></div><b>MONITORED</b></div><div><span className="sourceBadge un">UN</span><div><strong>United Nations sanctions</strong><p>The UN Security Council Consolidated List, including names and aliases.</p></div><b>MONITORED</b></div><div><span className="sourceBadge mt">MT</span><div><strong>Malta court orders</strong><p>Freezing, seizure and related orders published by the Asset Recovery Bureau.</p></div><b>MONITORED</b></div><div><span className="sourceBadge web">WEB</span><div><strong>Web intelligence</strong><p>Focused external searches prepared for a reviewer; results are not embedded or treated as official data.</p></div><b>REVIEW</b></div></div></section>
      <section className="industrySection" id="industries"><div className="sectionIntro"><span className="sectionKicker">BUILT FOR OBLIGED ENTITIES</span><h2>Sanctions and public-record screening<br/>for teams that need clarity.</h2><p>ClearCheck does not currently provide politically exposed person (PEP) database coverage or a complete AML risk assessment.</p></div><div className="industryGrid"><article><span>FS</span><h3>Financial services</h3><p>Support onboarding and periodic customer reviews.</p></article><article><span>LN</span><h3>Legal &amp; notarial</h3><p>Document checks on clients and transaction parties.</p></article><article><span>RE</span><h3>Real estate</h3><p>Screen buyers, sellers and connected parties.</p></article><article><span>GP</span><h3>Gaming &amp; payments</h3><p>Identify potential sanctions exposure for escalation.</p></article></div></section>
      <section className="pricingSection" id="pricing"><div><span className="sectionKicker">FLEXIBLE SCREENING</span><h2>Clear pricing,<br/>one credit per check.</h2><p>New private-beta workspaces receive 25 complimentary credits. Paid options appear below when available; tax and final totals are confirmed before payment.</p></div><div className="publicPricing">{publicPlans.length?publicPlans.map(plan=><article key={plan.id}><span>{plan.billing_mode.toUpperCase()}</span><h3>{plan.name}</h3><strong>€{(plan.price_cents/100).toFixed(2)}{plan.interval_name==="month"?<small>/month</small>:null}</strong><p>{plan.credits?`${plan.credits} screening credit${plan.credits===1?"":"s"}. `:""}{plan.description}</p><a href={user?"/account?tab=billing":"/register"}>{user?"Choose in account":"Create workspace"} <span>→</span></a></article>):<div className="betaCard"><span>EARLY ACCESS</span><strong>25</strong><small>complimentary credits per new workspace</small><a href="/register">Create your workspace <span>→</span></a></div>}</div></section>
      <section className="finalCta"><span>START WITH A NAME</span><h2>Make the next compliance check<br/>your clearest one yet.</h2><a href="#screen">Run a sanctions screening <span>→</span></a></section>
      <Footer/>
    </main>
  }

  return <main className="reportPage">
    <AppHeader variant="authenticated" onHome={goHome}/>
    <section className={`resultHero ${resultState}`}>
      <div className="resultHeroInner">
        <div className="resultIdentity"><div className="resultStateLine"><span className="resultEyebrow">SCREENING RESULT</span><span className="resultStateBadge"><i/>{resultTitle}</span></div><h1>{screened}</h1><div className="resultMeta"><span>{caseRef}</span><span>{screenedType==="person"?"Person":"Business or organisation"}</span><span>Checked {new Date(checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"})}</span></div></div>
        <div className="resultActionArea"><div className="resultActions"><button className="anotherScreening" onClick={goHome}>Run another screening</button><button className="export" disabled={reportLoading} onClick={exportReport}>{reportLoading?"Preparing PDF…":"Download PDF"} <span>↓</span></button></div>{reportError&&<div className="reportActionError" role="alert">{reportError}</div>}</div>
        <div className="resultMetrics"><article><small>OFFICIAL SOURCES</small><strong>{completed}<span>/{officialSourceTotal}</span></strong><p>{completed===officialSourceTotal?"All available sources checked":"Coverage is incomplete"}</p></article><article><small>POTENTIAL MATCHES</small><strong>{results.length}</strong><p>{results.length?"Manual comparison required":"No official-list names found"}</p></article><article><small>NEXT STEP</small><strong className="wordMetric">{incomplete?"Retry":results.length?"Review":"Web review"}</strong><p>{incomplete?"Complete every official source":results.length?"Compare identity details":"Complete adverse-media checks"}</p></article></div>
      </div>
    </section>
    <section className="resultCanvas"><div className="resultContent">
      {error&&<div className="searchError">{error}</div>}
      <section className={`decisionPanel ${resultState}`}><div className="decisionIcon">{incomplete?"!":results.length?"!":"✓"}</div><div><span className="panelKicker">ASSESSMENT</span><h2>{incomplete?"Do not treat this result as clear":results.length?"Potential match — manual review required":"Official lists checked — continue review"}</h2><p>{incomplete?"At least one official source could not be checked. Retry the screening before making a compliance decision.":results.length?"A similar name was found. Compare dates of birth, nationality, identification details and the linked legal evidence before deciding whether it is the same subject.":"No matching names were found on the available official lists. Complete the web-intelligence review before closing the case."}</p></div><span className="decisionTag">{incomplete?"INCOMPLETE":results.length?`${results.length} TO REVIEW`:"WEB REVIEW"}</span></section>
      {canReview&&<section className="resultSection resultReviewSection"><button type="button" className="resultReviewToggle" aria-expanded={reviewOpen} onClick={()=>setReviewOpen(open=>!open)}><span><small className="panelKicker">HUMAN DISPOSITION</small><strong>{currentRecord?.review_status&&currentRecord.review_status!=="unreviewed"?currentRecord.review_status.replaceAll("_"," "):"Record review decision"}</strong></span><b>{reviewOpen?"Close editor":"Open editor"} →</b></button>{reviewOpen&&<div className="resultReviewEditor"><div className="reviewFields"><label>Outcome<select value={reviewStatus} onChange={event=>setReviewStatus(event.target.value as typeof reviewStatus)}><option value="under_review">Under review</option><option value="more_information_required">More information required</option><option value="false_positive">False positive</option><option value="confirmed_match">Confirmed match</option><option value="escalated">Escalated</option></select></label><label>Review due date <span>Optional</span><input type="date" value={reviewDueAt} onChange={event=>setReviewDueAt(event.target.value)}/></label><label>Identifiers checked<textarea rows={3} maxLength={2000} required value={reviewIdentifiers} onChange={event=>setReviewIdentifiers(event.target.value)} placeholder="DOB, nationality, ID or registration number—or why none were available…"/></label><label>Evidence and reasoning<textarea rows={5} minLength={20} maxLength={4000} required value={reviewNotes} onChange={event=>setReviewNotes(event.target.value)} placeholder="Explain the evidence considered and why this disposition is appropriate…"/></label></div><div className="reviewActions"><small>Automated source results remain unchanged. The human disposition is separately audit logged.</small><button type="button" disabled={reviewBusy||reviewNotes.trim().length<20||reviewIdentifiers.trim().length<3} onClick={saveResultReview}>{reviewBusy?"Saving…":"Save review decision"}</button></div>{reviewNotice&&<p className="resultReviewNotice" role="status">{reviewNotice}</p>}</div>}</section>}

      <section className="resultSection sourceSection"><div className="resultSectionHead"><div><span className="panelKicker">SOURCE COVERAGE</span><h2>What was checked</h2></div><p>Each source keeps its own status, full checked time and dataset reference.</p></div><div className="sourceReport">{sources.map(s=>{const hasPotentialMatch=s.status==="complete"&&s.count>0;return <article className={`${s.status}${hasPotentialMatch?" potential":""}`} key={s.key}><div className="sourceCardTop"><span className={`sourceBadge ${s.key.toLowerCase()}`}>{s.key}</span><span className="sourceStatus"><i/>{hasPotentialMatch?`Potential match${s.count===1?"":"es"}`:s.status==="complete"?"Checked":s.status==="review"?"Manual review":"Unavailable"}</span></div><h3>{s.name}</h3><p>{s.status==="complete"?`${s.count} potential match${s.count===1?"":"es"}`:s.message||"Could not be checked"}</p><dl><div><dt>Checked</dt><dd>{new Date(s.checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"medium"})}</dd></div>{s.lastUpdated&&<div><dt>Source updated</dt><dd>{new Date(s.lastUpdated).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"medium"})}</dd></div>}{s.version&&<div><dt>Dataset reference</dt><dd title={s.version}>{s.version}</dd></div>}</dl></article>})}</div></section>

      <section className="resultSection findingsSection"><div className="resultSectionHead"><div><span className="panelKicker">OFFICIAL-LIST FINDINGS</span><h2>{results.length?`${results.length} potential match${results.length===1?"":"es"}`:"No potential matches"}</h2></div><p>{results.length?"Similarity is not proof of identity.":"Alternative spellings may still require review."}</p></div>{results.length>0?<div className="matches">{results.map((r,i)=><article className="match" key={`${r.source}-${i}`}><div className="matchTop"><span className={`sourceBadge ${r.sourceClass}`}>{r.source}</span><div><span className="matchNumber">POTENTIAL MATCH {String(i+1).padStart(2,"0")}</span><h3>{r.name}</h3><p>{r.type}{r.matchReason?` · ${r.matchReason} name match`:""}</p></div><div className="confidence"><strong>{r.confidence}%</strong><small>NAME SIMILARITY</small></div></div><p className="matchDetail">{r.detail}</p>{(r.aliases?.length||r.dateOfBirth||r.nationalities?.length||r.identificationNumbers?.length)&&<div className="identifierGrid">{r.aliases?.length&&<div><small>ALIASES</small><strong>{r.aliases.join(", ")}</strong></div>}{r.dateOfBirth&&<div><small>DATE OF BIRTH</small><strong>{r.dateOfBirth}</strong></div>}{r.nationalities?.length&&<div><small>NATIONALITY</small><strong>{r.nationalities.join(", ")}</strong></div>}{r.identificationNumbers?.length&&<div><small>IDENTIFICATION</small><strong>{r.identificationNumbers.join(", ")}</strong></div>}</div>}<div className="chips">{r.meta.map((m,j)=><span key={`${m}-${j}`}>{m}</span>)}</div><div className="matchFooter"><span>{r.legalBasis||"Official publisher evidence"}</span><a href={r.href} target="_blank" rel="noreferrer">Open official evidence <span>↗</span></a></div></article>)}</div>:<div className="emptyResult"><span className="emptyResultIcon">✓</span><div><h3>No official-list names matched</h3><p>Continue with the web-intelligence review and consider alternative spellings where appropriate.</p></div></div>}</section>

      {webSearches.length>0&&<section className="resultSection webSection"><div className={`webChecks ${webExpanded?"expanded":""}`}><button type="button" className="webToggle" aria-expanded={webExpanded} aria-controls="web-intelligence-panel" onClick={()=>setWebExpanded(open=>!open)}><span><small className="panelKicker">MANUAL REVIEW</small><strong>Web intelligence</strong><em>Focused external searches for adverse-media indicators</em></span><b>{webExpanded?"Hide searches":"Review searches"}<i aria-hidden="true">⌄</i></b></button>{webExpanded&&<div className="webPanel" id="web-intelligence-panel"><div className="webLinkGrid">{webSearches.map(w=><a href={w.href} target="_blank" rel="noopener noreferrer" key={w.term}><span>↗</span><div><strong>{w.label}</strong><small>{w.query}</small></div><b>Open external search</b></a>)}</div><p className="webNote">External results are dynamic, may concern another person with the same name and are not proof of wrongdoing. Retain relevant evidence separately.</p></div>}</div></section>}
      <div className="resultNotice"><span>i</span><p><strong>ClearCheck supports human review; it does not make a legal determination.</strong> Verify potential matches using official evidence and reliable identifiers before taking action.</p></div>
    </div>
    </section>
    <Footer/>
  </main>
}

function Footer(){return <footer className="dashboardFooter"><span>© 2026 ClearCheck <small>Private beta · Operator identity pending launch approval</small></span><div><a href="/providers">Data sources</a><a href="/privacy#contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security">Security</a></div></footer>}
