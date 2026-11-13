"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import CopyMatchedName from "../CopyMatchedName";
import { describeScreeningCoverage } from "../lib/screening-coverage.js";
import WorkspaceShell from "../WorkspaceShell";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { downloadScreeningReport } from "../lib/report";
import { useSourceHealth } from "../lib/use-source-health";
import { matchedEvidenceHref } from "../lib/evidence-link";
import type { SavedScreening } from "../lib/screening";
import type { Client } from "../lib/clients";
import type { AdverseMediaResult } from "../lib/adverse-media";

const sourceHealthNames:Record<string,string>={
  euConsolidated:"EU consolidated list",
  euOfficialJournal:"EU Official Journal",
  unConsolidated:"UN consolidated list",
  maltaArb:"Malta court orders",
};

type Result = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string; aliases?:string[];dateOfBirth?:string;nationalities?:string[];identificationNumbers?:string[];matchReason?:string;legalBasis?:string };
type SourceStatus = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string;sourceUrl?:string;version?:string;lastUpdated?:string;licence?:string };
type WebSearch = { term:string; label:string; query:string; href:string };
type ReviewDisposition="under_review"|"false_positive"|"confirmed_match"|"more_information_required"|"escalated";
function isReviewDisposition(value:unknown):value is ReviewDisposition{return typeof value==="string"&&["under_review","false_positive","confirmed_match","more_information_required","escalated"].includes(value)}
function reviewValidationMessage(notes:string,identifiers:string){if(identifiers.trim().length<3)return "Add the identifiers you checked, or explain why none were available.";if(notes.trim().length<20)return `Add at least ${20-notes.trim().length} more character${20-notes.trim().length===1?"":"s"} to the evidence and reasoning.`;return "Ready to save to the audit trail."}

export default function ScreeningPage(){
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
  const [adverseMedia,setAdverseMedia]=useState<AdverseMediaResult | {status:"loading"}>({status:"disabled"});
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);
  const [error,setError]=useState("");
  const [caseRef,setCaseRef]=useState("");
  const [checkedAt,setCheckedAt]=useState("");
  const [screeningId,setScreeningId]=useState("");
  const [currentRecord,setCurrentRecord]=useState<SavedScreening|null>(null);
  const [reportError,setReportError]=useState("");
  const [reportLoading,setReportLoading]=useState(false);
  const [role,setRole]=useState<string|null>(null);
  const [user,setUser]=useState<User|null>(null);
  const [authReady,setAuthReady]=useState(false);
  const [credits,setCredits]=useState<number|null>(null);
  const {sourceHealth:health}=useSourceHealth();
  const sourceHealth=!health?"checking":health.status==="ok"?"available":health.status==="attention"?"attention":"degraded";
  const unavailableSources=Object.entries(health?.sources||{}).filter(([,source])=>!source.healthy).map(([key])=>sourceHealthNames[key]||key);
  const [canReview,setCanReview]=useState(false);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [reviewStatus,setReviewStatus]=useState<ReviewDisposition>("under_review");
  const [reviewNotes,setReviewNotes]=useState("");
  const [reviewIdentifiers,setReviewIdentifiers]=useState("");
  const [reviewDueAt,setReviewDueAt]=useState("");
  const [reviewBusy,setReviewBusy]=useState(false);
  const [reviewNotice,setReviewNotice]=useState("");
  const [linkedClient,setLinkedClient]=useState<Client|null>(null);
  const [clientLinkNotice,setClientLinkNotice]=useState("");

  function openSaved(record:SavedScreening){
    setAdverseMedia({status:"loading"});
    setScreeningId(record.id);setCurrentRecord(record);setReportError("");setScreened(record.subject_name);setQuery(record.subject_name);setScreenedType(record.subject_type);setResults(record.results||[]);setSources(record.sources||[]);setWebSearches(record.web_searches||[]);setWebExpanded(false);setCheckedAt(record.checked_at);setCaseRef(record.case_reference);setCustomerReference(record.customer_reference||"");setScreeningPurpose(record.screening_purpose||"");setReviewNotes(record.review_notes||"");setReviewIdentifiers(record.review_identifiers||"");setReviewDueAt(record.review_due_at?.slice(0,10)||"");if(isReviewDisposition(record.review_status))setReviewStatus(record.review_status);setSearched(true);
  }

  useEffect(()=>{
    const supabase=getSupabaseBrowserClient();
    let active=true;
    supabase.auth.getUser().then(async({data})=>{
      if(!active)return;
      if(!data.user){
        window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname+window.location.search)}`);
        return;
      }
      setUser(data.user);setAuthReady(true);
      if(data.user){const {data:membership}=await supabase.from("organisation_members").select("organisation_id,role").eq("user_id",data.user.id).eq("status","active").limit(1).maybeSingle();if(active&&membership){setRole(membership.role);setCanReview(["owner","admin","reviewer"].includes(membership.role));const {data:ledger}=await supabase.from("credit_ledger").select("amount").eq("organisation_id",membership.organisation_id);setCredits((ledger||[]).reduce((sum,row)=>sum+Number(row.amount),0))}}
      const requested=new URLSearchParams(window.location.search).get("screening");
      const requestedClient=new URLSearchParams(window.location.search).get("client");
      if(data.user&&requestedClient&&!requested){
        try{
          const {data:{session}}=await supabase.auth.getSession();
          const response=await fetch(`/api/clients?client=${encodeURIComponent(requestedClient)}`,{headers:{Authorization:`Bearer ${session?.access_token||""}`}});
          const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Client could not be loaded.");
          if(!active)return;const client=payload.client as Client;setLinkedClient(client);setQuery(client.name);setSubjectType(client.subject_type);setCustomerReference(client.reference);setScreeningPurpose(client.details.purpose||"");setDateOfBirth(client.details.date_of_birth||"");setNationality(client.details.nationality||"");setCountry(client.country);setIdentificationNumber(client.details.registration_number||"");
        }catch(caught){if(active)setError(caught instanceof Error?caught.message:"Client could not be loaded.")}
      }
      if(data.user&&requested){
        setLoading(true);
        const {data:record,error:recordError}=await supabase.from("screenings").select("*").eq("id",requested).maybeSingle();
        if(!active)return;
        if(recordError||!record)setError("That saved screening could not be opened.");
        else openSaved(record as SavedScreening);
        setLoading(false);
      }
    });
    return()=>{active=false};
  },[]);

  useEffect(()=>{
    if(!screeningId)return;
    const controller=new AbortController();

    async function loadAdverseMedia(){
      try{
        const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
        if(controller.signal.aborted)return;
        if(!session){setAdverseMedia({status:"unavailable"});return;}
        const response=await fetch("/api/screen/adverse-media",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
          body:JSON.stringify({screeningId}),
          signal:controller.signal,
        });
        const result:AdverseMediaResult=response.ok?await response.json():{status:"unavailable"};
        if(!controller.signal.aborted)setAdverseMedia(result);
      }catch{
        if(!controller.signal.aborted)setAdverseMedia({status:"unavailable"});
      }
    }

    void loadAdverseMedia();
    return()=>controller.abort();
  },[screeningId]);

  async function screen(e:FormEvent){
    e.preventDefault();
    const clean=query.trim();
    if(!clean)return;
    if(!user){window.location.assign("/login?returnTo=/screening");return}
    setLoading(true);setError("");
    try{
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      if(!session?.access_token){window.location.assign("/login?returnTo=/screening");return}
      const identifiers=subjectType==="person"?{dateOfBirth,nationality,identificationNumber}:{country,registrationNumber:identificationNumber};
      const response=await fetch("/api/screen",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({query:clean,subjectType,customerReference,screeningPurpose,identifiers})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Screening could not be completed.");
      const stamp=data.checkedAt||new Date().toISOString();
      const nextResults=(data.matches||[]) as Result[],nextSources=(data.sources||[]) as SourceStatus[],nextWebSearches=(data.webSearches||[]) as WebSearch[];
      const record:SavedScreening={id:data.screeningId,case_reference:data.caseReference,subject_name:clean,subject_type:subjectType,status:"completed",risk_state:data.complete?"review":"incomplete",credits_charged:data.creditsCharged,match_count:nextResults.length,source_count:nextSources.length,results:nextResults,sources:nextSources,web_searches:nextWebSearches,checked_at:stamp,completed_at:stamp,created_at:stamp,customer_reference:customerReference||null,screening_purpose:screeningPurpose||null,input_identifiers:identifiers};
      setClientLinkNotice("");setReviewNotes("");setReviewIdentifiers("");setReviewStatus("under_review");setReviewDueAt("");setReviewNotice("");
      if(linkedClient){
        try{
          const linked=await fetch("/api/clients",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:"link",clientId:linkedClient.id,version:linkedClient.version,data:{screening_id:data.screeningId}})});
          if(!linked.ok)throw new Error("Link failed");setClientLinkNotice("Screening saved and linked to the client file.");
        }catch{setClientLinkNotice("Screening saved successfully, but could not be linked. Open the client file and attach it from Screening history.")}
      }
      setScreeningId(data.screeningId);setCurrentRecord(record);setReportError("");setScreened(clean);setScreenedType(subjectType);setResults(nextResults);setSources(nextSources);setWebSearches(nextWebSearches);setWebExpanded(false);setCheckedAt(stamp);setCaseRef(data.caseReference);setSearched(true);
      setAdverseMedia({status:"loading"});
      setCredits(value=>value===null?value:Math.max(0,value-data.creditsCharged));
      window.history.replaceState({},"",`/screening?screening=${encodeURIComponent(data.screeningId)}`);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(err){setError(err instanceof Error?err.message:"Screening could not be completed.")}
    finally{setLoading(false)}
  }

  function startAnotherScreening(){
    setSearched(false);
    setScreeningId("");
    setAdverseMedia({status:"disabled"});
    setSubjectType("person");
    setQuery("");
    setCustomerReference("");
    setScreeningPurpose("");
    setDateOfBirth("");
    setNationality("");
    setIdentificationNumber("");
    setCountry("");
    setError("");
    setReportError("");
    setReviewOpen(false);
    setCurrentRecord(null);
    setLinkedClient(null);
    setClientLinkNotice("");
    window.history.replaceState({},"","/screening");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  const {incomplete,completed,total:officialSourceTotal,noMatches,missingSources}=describeScreeningCoverage(sources,currentRecord?.risk_state==="incomplete");
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
    const validationMessage=reviewValidationMessage(reviewNotes,reviewIdentifiers);
    if(validationMessage!=="Ready to save to the audit trail."){setReviewNotice(validationMessage);return}
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

  if(!authReady||!user)return <main className="accountPage"><div className="accountLoading" role="status">Opening screening…</div></main>;

  if(!searched)return <WorkspaceShell section="screening" role={role}>
    <main className="screeningWorkArea">
      <header className="softwarePageTitle"><h1>New screening</h1><p>Check a person or business against EU and UN sanctions lists and Malta court orders.</p></header>
    {sourceHealth==="degraded"&&<p className="searchError" role="status">
      {unavailableSources.length?`Unavailable: ${unavailableSources.join(", ")}. A screening may be incomplete.`:"Source status could not be verified. Check coverage before relying on the result."}
    </p>}
    <div className="screenCard" id="screen">
      <div className="screenCardHead"><div><span>NAME SCREENING</span><h2>Screen a person or business</h2></div><span className={`liveBadge ${sourceHealth}`}><i/> {sourceHealth==="checking"?"Checking sources":sourceHealth==="available"?"Official sources available":sourceHealth==="attention"?"Refresh check due":"Source issue detected"}</span></div>
      <div className="typeTabs" role="tablist" aria-label="Subject type"><button type="button" role="tab" aria-selected={subjectType==="person"} className={subjectType==="person"?"active":""} onClick={()=>setSubjectType("person")}><span aria-hidden="true">●</span> Person</button><button type="button" role="tab" aria-selected={subjectType==="business"} className={subjectType==="business"?"active":""} onClick={()=>setSubjectType("business")}><span aria-hidden="true">◆</span> Business</button></div>
      <form className="kycSearch" onSubmit={screen}>
        {linkedClient&&<p className="nameOnlyWarning">Screening for client: <a href={`/workspace?client=${linkedClient.id}`}>{linkedClient.name} ↗</a></p>}
        <label>{subjectType==="person"?"Full legal name":"Registered business name"}<div><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} aria-label={subjectType==="person"?"Full legal name":"Registered business name"} placeholder={subjectType==="person"?"e.g. Alina Juc":"e.g. Example Holdings Ltd"}/></div></label>
        <details className="caseDetails" open={linkedClient?true:undefined}><summary className="disclosureControl">
          <span className="caseDisclosureIcon" aria-hidden="true"/>
          <span className="caseDisclosureClosed">Add case details</span>
          <span className="caseDisclosureOpen">Hide case details</span>
          <span className="caseDisclosureHint">Optional</span>
        </summary><div className="screeningContext"><label>Customer / case reference <span>Optional</span><input value={customerReference} maxLength={120} onChange={event=>setCustomerReference(event.target.value)} placeholder="Your internal reference"/></label><label>Screening purpose <span>Optional</span><input value={screeningPurpose} maxLength={500} onChange={event=>setScreeningPurpose(event.target.value)} placeholder="Onboarding, periodic review…"/></label><label>{subjectType==="person"?"Date of birth":"Country of incorporation"} <span>Optional</span><input type={subjectType==="person"?"date":"text"} value={subjectType==="person"?dateOfBirth:country} onChange={event=>subjectType==="person"?setDateOfBirth(event.target.value):setCountry(event.target.value)}/></label>{subjectType==="person"&&<label>Nationality <span>Optional</span><input value={nationality} onChange={event=>setNationality(event.target.value)}/></label>}<label>{subjectType==="person"?"Identification number":"Registration number"} <span>Optional</span><input value={identificationNumber} onChange={event=>setIdentificationNumber(event.target.value)}/></label></div></details>
        <p className="nameOnlyWarning">Automated matching is name-led. Identifiers are recorded to support the required human comparison.</p><button type="submit" disabled={loading||!authReady||credits===0}>{loading?"Checking every source…":credits===0?"No credits remaining":"Run screening · up to 1 credit"}<span>→</span></button>
      </form>
      <div className="screenCardMeta"><span><b>PRIVATE BETA</b> Complete checks use one credit. Incomplete checks are saved free.</span><span>{credits===null?"Usually 20–40 seconds":`${credits} credit${credits===1?"":"s"} remaining`}</span></div>
      {loading&&<div className="screenProgress"><i/><span>Checking EU, UN, Malta and web-intelligence sources…</span></div>}
      {error&&<div className="searchError">{error}</div>}
    </div>
    </main>
  </WorkspaceShell>;

  return <WorkspaceShell section="screening" role={role}><main className="reportPage">
    <section className={`resultHero ${resultState}`}>
      <div className="resultHeroInner">
        <div className="resultIdentity"><div className="resultStateLine"><span className="resultEyebrow">SCREENING RESULT</span><span className="resultStateBadge"><i/>{resultTitle}</span></div><h1>{screened}</h1><div className="resultMeta"><span>{caseRef}</span><span>{screenedType==="person"?"Person":"Business or organisation"}</span><span>Checked {new Date(checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"})}</span></div></div>
        <div className="resultActionArea"><div className="resultActions"><button className="anotherScreening" onClick={startAnotherScreening}>Run another screening</button><button className="export" disabled={reportLoading} onClick={exportReport}>{reportLoading?"Preparing PDF…":"Download PDF"} <span>↓</span></button></div>{reportError&&<div className="reportActionError" role="alert">{reportError}</div>}</div>
        <div className="resultMetrics"><article><small>OFFICIAL SOURCES</small><strong>{completed}<span>/{officialSourceTotal}</span></strong><p>{incomplete?"Coverage is incomplete":"All required sources checked"}</p></article><article><small>POTENTIAL MATCHES</small><strong>{results.length}</strong><p>{results.length?"Manual comparison required":noMatches}</p></article><article><small>NEXT STEP</small><strong className="wordMetric">{incomplete?"Retry":results.length?"Review":"Web review"}</strong><p>{incomplete?"Complete every official source":results.length?"Compare identity details":"Complete adverse-media checks"}</p></article></div>
      </div>
    </section>
    <section className="resultCanvas"><div className="resultContent">
      {clientLinkNotice&&<div className="dashboardNotice" role="status">{clientLinkNotice} <a href={`/workspace?client=${linkedClient?.id}&tab=screenings`}>Open client file →</a></div>}
      {error&&<div className="searchError">{error}</div>}
      {incomplete&&currentRecord?.credits_charged===0&&<p className="dashboardNotice">Saved to history. No credit was used.</p>}
      <section className={`decisionPanel ${resultState}`}><div className="decisionIcon">{incomplete?"!":results.length?"!":"✓"}</div><div><span className="panelKicker">ASSESSMENT</span><h2>{incomplete?"Do not treat this result as clear":results.length?"Potential match — manual review required":"Official lists checked — continue review"}</h2><p>{incomplete?`${missingSources || "Official source coverage is incomplete."} Retry the screening before making a compliance decision.`:results.length?"A similar name was found. Compare dates of birth, nationality, identification details and the linked legal evidence before deciding whether it is the same subject.":"No matching names were found on the available official lists. Complete the web-intelligence review before closing the case."}</p></div><span className="decisionTag">{incomplete?"INCOMPLETE":results.length?`${results.length} TO REVIEW`:"WEB REVIEW"}</span></section>


      {canReview&&<section className="resultSection resultReviewSection">
        <button type="button" className="resultReviewToggle" aria-expanded={reviewOpen} aria-controls="screening-review-editor" onClick={()=>setReviewOpen(open=>!open)}><span><small className="panelKicker">REVIEW DECISION</small><strong>{currentRecord?.review_status&&currentRecord.review_status!=="unreviewed"?currentRecord.review_status.replaceAll("_"," "):"Record review decision"}</strong></span><b>{reviewOpen?"Close editor":"Open editor"} →</b></button>
        <div className="resultReviewEditor" id="screening-review-editor" hidden={!reviewOpen}>
          <div className="reviewFields"><label>Outcome<select value={reviewStatus} onChange={event=>setReviewStatus(event.target.value as typeof reviewStatus)}><option value="under_review">Under review</option><option value="more_information_required">More information required</option><option value="false_positive">False positive</option><option value="confirmed_match">Confirmed match</option><option value="escalated">Escalated</option></select></label><label>Review due date <span>Optional</span><input type="date" value={reviewDueAt} onChange={event=>setReviewDueAt(event.target.value)}/></label><label>Identifiers checked<textarea rows={3} maxLength={2000} required value={reviewIdentifiers} onChange={event=>{setReviewIdentifiers(event.target.value);setReviewNotice("")}} placeholder="DOB, nationality, ID or registration number—or why none were available…"/></label><label>Evidence and reasoning<textarea rows={5} minLength={20} maxLength={4000} required value={reviewNotes} onChange={event=>{setReviewNotes(event.target.value);setReviewNotice("")}} placeholder="Explain the evidence considered and why this disposition is appropriate…"/></label></div>
          <div className="reviewActions"><small className={reviewValidationMessage(reviewNotes,reviewIdentifiers)==="Ready to save to the audit trail."?"reviewReady":"reviewRequired"}>{reviewValidationMessage(reviewNotes,reviewIdentifiers)}</small><button type="button" disabled={reviewBusy} onClick={saveResultReview}>{reviewBusy?"Saving…":"Save review decision"}</button></div>
          {reviewNotice&&<p className="resultReviewNotice" role="status">{reviewNotice}</p>}
        </div>
      </section>}

      <section className="resultSection sourceSection"><div className="resultSectionHead"><div><span className="panelKicker">SOURCE COVERAGE</span><h2>What was checked</h2></div><p>Each source keeps its own status, full checked time and dataset reference.</p></div><div className="sourceReport">{sources.map(s=>{const hasPotentialMatch=s.status==="complete"&&s.count>0;return <article className={`${s.status}${hasPotentialMatch?" potential":""}`} key={s.key}><div className="sourceCardTop"><span className={`sourceBadge ${s.key.toLowerCase()}`}>{s.key}</span><span className="sourceStatus"><i/>{hasPotentialMatch?`Potential match${s.count===1?"":"es"}`:s.status==="complete"?"Checked":s.status==="review"?"Manual review":"Unavailable"}</span></div><h3>{s.name}</h3><p>{s.status==="complete"?`${s.count} potential match${s.count===1?"":"es"}`:s.message||"Could not be checked"}</p><dl><div><dt>Checked</dt><dd>{new Date(s.checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"medium"})}</dd></div>{s.lastUpdated&&<div><dt>Source updated</dt><dd>{new Date(s.lastUpdated).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"medium"})}</dd></div>}{s.version&&<div><dt>Dataset reference</dt><dd title={s.version}>{s.version}</dd></div>}</dl></article>})}</div></section>

      <section className="resultSection findingsSection">
        {results.length>0?<details className="findingsDisclosure" key={screeningId}>
          <summary>
            <span><small className="panelKicker">OFFICIAL-LIST FINDINGS</small>
              <strong>{results.length} potential match{results.length===1?"":"es"}</strong>
              <span className="findingsHint">Verify the subject’s identity using the source evidence.</span>
            </span>
            <span className="resultDisclosureAction"><span className="findingsShow">Show matches</span><span className="findingsHide">Hide matches</span></span>
          </summary>
          <div className="matches">{results.map((r,i)=>{const evidenceHref=matchedEvidenceHref(r);return <article className="match" key={`${r.source}-${i}`}><div className="matchTop"><span className={`sourceBadge ${r.sourceClass}`}>{r.source}</span><div><span className="matchNumber">POTENTIAL MATCH {String(i+1).padStart(2,"0")}</span><h3>{r.name}</h3><p>{r.type}{r.matchReason?` · ${r.matchReason} name match`:""}</p></div><div className="confidence"><strong>{r.confidence}%</strong><small>NAME SIMILARITY</small></div></div><p className="matchDetail">{r.detail}</p>{(r.aliases?.length||r.dateOfBirth||r.nationalities?.length||r.identificationNumbers?.length)&&<div className="identifierGrid">{r.aliases?.length&&<div><small>ALIASES</small><strong>{r.aliases.join(", ")}</strong></div>}{r.dateOfBirth&&<div><small>DATE OF BIRTH</small><strong>{r.dateOfBirth}</strong></div>}{r.nationalities?.length&&<div><small>NATIONALITY</small><strong>{r.nationalities.join(", ")}</strong></div>}{r.identificationNumbers?.length&&<div><small>IDENTIFICATION</small><strong>{r.identificationNumbers.join(", ")}</strong></div>}</div>}<div className="chips">{r.meta.map((m,j)=><span key={`${m}-${j}`}>{m}</span>)}</div><div className="matchFooter"><span>{r.legalBasis||"Official publisher evidence"}</span>{evidenceHref&&<a href={evidenceHref} target="_blank" rel="noreferrer" title={`Find ${r.name} in the official evidence`}>Open source document <span>↗</span></a>}<CopyMatchedName name={r.name}/></div></article>})}</div>
        </details>:<>
          <div className="resultSectionHead"><div><span className="panelKicker">OFFICIAL-LIST FINDINGS</span><h2>{noMatches}</h2></div><p>{incomplete?missingSources||"Coverage is incomplete.":"Alternative spellings may still require review."}</p></div>
          <div className="emptyResult"><span className="emptyResultIcon">{incomplete?"!":"✓"}</span><div><h3>{incomplete?"Screening needs another check":"Continue with web review"}</h3><p>{incomplete?"Retry the screening to check the missing official sources.":"Continue with the web-intelligence review and consider alternative spellings where appropriate."}</p></div></div>
        </>}
      </section>

      {webSearches.length>0&&<section className="resultSection webSection"><div className={`webChecks ${webExpanded?"expanded":""}`}><button type="button" className="webToggle" aria-expanded={webExpanded} aria-controls="web-intelligence-panel" onClick={()=>setWebExpanded(open=>!open)}><span><small className="panelKicker">HUMAN REVIEW</small><strong>Adverse media</strong><em>{adverseMedia.status==="complete"?`${adverseMedia.articles.length} web results to review`:"Focused web searches for adverse-media indicators"}</em></span><span className="resultDisclosureAction">{webExpanded?"Hide searches":"Review searches"}</span></button>{webExpanded&&<div className="webPanel" id="web-intelligence-panel">
          <div className="adverseMedia">
            <div role="status">
              {adverseMedia.status==="disabled"&&<p>Automatic web search is disabled. Use the manual searches below.</p>}
              {adverseMedia.status==="loading"&&<p>Searching for articles…</p>}
              {adverseMedia.status==="unavailable"&&<p>Web search unavailable. Use the manual searches below.</p>}
              {adverseMedia.status==="complete"&&!adverseMedia.articles.length&&<p>No articles found for these searches.</p>}
            </div>
            {adverseMedia.status==="complete"&&adverseMedia.articles.length>0&&<>
              <h3>Web results</h3>
              <p>Open the original page to check whether it refers to the subject.</p>
              <ul>{adverseMedia.articles.map(article=><li key={article.url}>
                <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
                <small>{article.publisher}{article.date&&<> · Page date <time dateTime={article.date}>{article.date}</time></>}</small>
              </li>)}</ul>
            </>}
            <h3>Manual searches</h3>
          </div>
          <div className="webLinkGrid">{webSearches.map(w=><a href={w.href} target="_blank" rel="noopener noreferrer" key={w.term}><span>↗</span><div><strong>{w.label}</strong><small>{w.query}</small></div><b>Open external search</b></a>)}</div><p className="webNote">External results are dynamic, may concern another person with the same name and are not proof of wrongdoing. Retain relevant evidence separately.</p></div>}</div></section>}
      <div className="resultNotice"><span>i</span><p><strong>ClearCheck supports human review; it does not make a legal determination.</strong> Verify potential matches using official evidence and reliable identifiers before taking action.</p></div>
    </div>
    </section>
  </main></WorkspaceShell>;
}
