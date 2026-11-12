"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { useSourceHealth } from "../lib/use-source-health";
import { downloadScreeningReport } from "../lib/report";
import { downloadPurchaseReceipt } from "../lib/invoice";
import type { SavedScreening } from "../lib/screening";
import AppHeader from "../AppHeader";

type Profile={first_name:string;last_name:string;display_name:string;company:string|null;phone:string|null};
type Organisation={id:string;name:string;billing_email:string|null};
type Plan={id:string;name:string;billing_mode:string;price_cents:number;credits:number|null;interval_name:string|null;description:string};
type Compliance={retention_months:number;automatic_deletion:boolean;legal_hold:boolean};
type LedgerEntry={amount:number;entry_type:string;external_reference:string|null;created_at:string;plan_id:string|null;amount_paid_cents:number|null;currency:string|null;payment_status:string|null};
type AccountTab="overview"|"screenings"|"billing"|"settings";
type ScreeningStatus="all"|SavedScreening["risk_state"];
type ScreeningType="all"|SavedScreening["subject_type"];
type ScreeningSort="newest"|"oldest"|"name"|"matches";
type ReviewStatus="all"|NonNullable<SavedScreening["review_status"]>;
type ReviewOutcome=Exclude<ReviewStatus,"all"|"unreviewed">;
type TeamMember={user_id:string;display_name:string;role:"owner"|"admin"|"reviewer"|"member";status:string;joined_at:string};
const SCREENINGS_PER_PAGE=20;

export default function AccountPage(){
  const [user,setUser]=useState<User|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [organisation,setOrganisation]=useState<Organisation|null>(null);
  const [role,setRole]=useState("");
  const [screenings,setScreenings]=useState<SavedScreening[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [compliance,setCompliance]=useState<Compliance|null>(null);
  const [credits,setCredits]=useState(0);
  const [purchases,setPurchases]=useState<LedgerEntry[]>([]);
  const [activeTab,setActiveTab]=useState<AccountTab>("overview");
  const [reportCount,setReportCount]=useState(0);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const [screeningSearch,setScreeningSearch]=useState("");
  const [screeningStatus,setScreeningStatus]=useState<ScreeningStatus>("all");
  const [screeningType,setScreeningType]=useState<ScreeningType>("all");
  const [screeningSort,setScreeningSort]=useState<ScreeningSort>("newest");
  const [reviewStatus,setReviewStatus]=useState<ReviewStatus>("all");
  const [screeningPage,setScreeningPage]=useState(0);
  const [screeningTotal,setScreeningTotal]=useState(0);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [reviewingId,setReviewingId]=useState("");
  const [reviewDraftStatus,setReviewDraftStatus]=useState<ReviewOutcome>("under_review");
  const [reviewDraftNotes,setReviewDraftNotes]=useState("");
  const [reviewDraftIdentifiers,setReviewDraftIdentifiers]=useState("");
  const [reviewDraftDueAt,setReviewDraftDueAt]=useState("");
  const {sourceHealth,healthLoading,refresh:loadSourceHealth}=useSourceHealth();
  const [teamMembers,setTeamMembers]=useState<TeamMember[]>([]);
  const [teamCanManage,setTeamCanManage]=useState(false);

  // Workspace bootstrap runs once; subsequent history refreshes have their own effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{void loadWorkspace()},[]);
  useEffect(()=>{const syncTab=()=>{const requested=new URLSearchParams(window.location.search).get("tab");setActiveTab(requested&&["overview","screenings","billing","settings"].includes(requested)?requested as AccountTab:"overview")};window.addEventListener("popstate",syncTab);return()=>window.removeEventListener("popstate",syncTab)},[]);
  useEffect(()=>{
    if(!organisation)return;
    const timer=window.setTimeout(()=>void loadScreenings(organisation.id),screeningSearch.trim()?300:0);
    return()=>window.clearTimeout(timer);
  // The primitive dependencies below intentionally drive the debounced server query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[organisation?.id,activeTab,screeningSearch,screeningStatus,screeningType,screeningSort,reviewStatus,screeningPage]);

  async function loadScreenings(organisationId:string){
    setHistoryLoading(true);
    const filtering=activeTab==="screenings";
    const {data,error:historyError}=await getSupabaseBrowserClient().rpc("search_screenings",{
      p_organisation_id:organisationId,p_search:filtering?screeningSearch.trim()||null:null,
      p_risk_state:filtering&&screeningStatus!=="all"?screeningStatus:null,p_subject_type:filtering&&screeningType!=="all"?screeningType:null,
      p_review_status:filtering&&reviewStatus!=="all"?reviewStatus:null,p_sort:filtering?screeningSort:"newest",
      p_offset:filtering?screeningPage*SCREENINGS_PER_PAGE:0,p_limit:filtering?SCREENINGS_PER_PAGE:5,
    });
    if(historyError){setError(historyError.message);setScreenings([]);setScreeningTotal(0)}
    else{const rows=(data||[]) as Array<SavedScreening&{total_count:number|string}>;setScreenings(rows);setScreeningTotal(rows.length?Number(rows[0].total_count):0)}
    setHistoryLoading(false);
  }

  async function loadWorkspace(){
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    const requested=new URLSearchParams(window.location.search).get("tab");
    if(requested&&["overview","screenings","billing","settings"].includes(requested))setActiveTab(requested as AccountTab);
    const current=session?.user;
    if(!current){window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname+window.location.search)}`);return}
    setUser(current);
    const billingParams=new URLSearchParams(window.location.search);
    if(billingParams.get("billing")==="cancelled"){
      setNotice("Checkout was cancelled. No payment was taken.");
      window.history.replaceState({},"","/account");
    }
    const [{data:profileRow},{data:membership},{data:planRows}]=await Promise.all([
      supabase.from("profiles").select("first_name,last_name,display_name,company,phone").eq("id",current.id).maybeSingle(),
      supabase.from("organisation_members").select("organisation_id,role").eq("user_id",current.id).eq("status","active").limit(1).maybeSingle(),
      supabase.from("plans").select("id,name,billing_mode,price_cents,credits,interval_name,description").order("sort_order"),
    ]);
    setProfile(profileRow as Profile|null);setPlans((planRows||[]) as Plan[]);
    if(membership){
      setRole(membership.role);
      const orgId=membership.organisation_id;
      const [{data:org},ledgerResult,{count:reports},{data:settings}]=await Promise.all([
        supabase.from("organisations").select("id,name,billing_email").eq("id",orgId).single(),
        supabase.from("credit_ledger").select("amount,entry_type,external_reference,created_at,plan_id,amount_paid_cents,currency,payment_status").eq("organisation_id",orgId).order("created_at",{ascending:false}),
        supabase.from("reports").select("id",{count:"exact",head:true}).eq("organisation_id",orgId),
        supabase.from("compliance_settings").select("retention_months,automatic_deletion,legal_hold").eq("organisation_id",orgId).maybeSingle(),
      ]);
      let ledger=ledgerResult.data;
      if(ledgerResult.error&&(ledgerResult.error.code==="42703"||ledgerResult.error.code==="PGRST204")){
        const legacyLedger=await supabase.from("credit_ledger").select("amount,entry_type,external_reference,created_at").eq("organisation_id",orgId).order("created_at",{ascending:false});
        ledger=legacyLedger.data?.map(row=>({...row,plan_id:null,amount_paid_cents:null,currency:null,payment_status:null}))||null;
      }
      const entries=(ledger||[]) as LedgerEntry[];
      setOrganisation(org as Organisation);setCredits(entries.reduce((sum,row)=>sum+Number(row.amount),0));setPurchases(entries.filter(row=>["purchase","bundle","subscription"].includes(row.entry_type)));setReportCount(reports||0);setCompliance(settings as Compliance|null);void loadTeam(session.access_token);
    }
    setLoading(false);
  }

  function selectTab(tab:AccountTab){
    setActiveTab(tab);
    setScreeningPage(0);
    window.history.replaceState({},"",tab==="overview"?"/account":`/account?tab=${tab}`);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function saveAccount(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!user||!organisation)return;setBusy("account");setError("");setNotice("");
    const form=new FormData(event.currentTarget),first=String(form.get("first")||"").trim(),last=String(form.get("last")||"").trim(),orgName=String(form.get("organisation")||"").trim(),phone=String(form.get("phone")||"").trim();
    const supabase=getSupabaseBrowserClient();
    const {error:profileError}=await supabase.from("profiles").update({first_name:first,last_name:last,display_name:`${first} ${last}`.trim(),phone:phone||null}).eq("id",user.id);
    const {error:orgError}=canManageBilling?await supabase.from("organisations").update({name:orgName,billing_email:user.email}).eq("id",organisation.id):{error:null};
    if(profileError||orgError)setError(profileError?.message||orgError?.message||"Settings could not be saved.");else{setNotice("Account settings saved.");await loadWorkspace()}
    setBusy("");
  }

  async function saveRetention(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!organisation)return;setBusy("retention");setError("");setNotice("");
    const form=new FormData(event.currentTarget),months=Number(form.get("months")),automatic=form.get("automatic")==="on";
    const {error:updateError}=await getSupabaseBrowserClient().from("compliance_settings").update({retention_months:months,automatic_deletion:automatic,updated_by:user?.id}).eq("organisation_id",organisation.id);
    if(updateError)setError(updateError.message);else{setNotice("Retention preferences saved. Automatic deletion remains subject to legal hold and administrator review.");setCompliance(value=>value?{...value,retention_months:months,automatic_deletion:automatic}:value)}
    setBusy("");
  }

  async function requestPrivacyAction(requestType:"access"|"correction"|"deletion"){
    const labels={access:"a copy of your account data",correction:"correction of personal data",deletion:"account-data deletion"};
    if(!organisation||!user||!window.confirm(`Submit a formal request for ${labels[requestType]}? Screening records may need to be retained where law requires.`))return;
    setBusy(requestType);setError("");setNotice("");
    const {error:requestError}=await getSupabaseBrowserClient().from("data_deletion_requests").insert({organisation_id:organisation.id,requested_by:user.id,request_type:requestType,reason:"Requested from ClearCheck account settings"});
    if(requestError)setError(requestError.message);else setNotice(`Your ${requestType} request has been recorded for privacy review.`);setBusy("");
  }

  async function download(record:SavedScreening){
    setBusy(record.id);setError("");
    const supabase=getSupabaseBrowserClient();
    const [{data:{session}},{data:fullRecord,error:recordError}]=await Promise.all([supabase.auth.getSession(),supabase.from("screenings").select("*").eq("id",record.id).single()]);
    if(recordError||!fullRecord){setError("The saved screening could not be loaded for the report.");setBusy("");return}
    const response=await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({screeningId:record.id})});
    if(!response.ok)setError("The report audit event could not be recorded.");else{downloadScreeningReport(fullRecord as SavedScreening);setReportCount(count=>count+1)}
    setBusy("");
  }

  async function beginReview(record:SavedScreening){
    setReviewingId(record.id);setReviewDraftStatus(record.review_status&&record.review_status!=="unreviewed"&&record.review_status!=="closed_no_match"?record.review_status:"under_review");setReviewDraftNotes(record.review_notes||"");setReviewDraftIdentifiers(record.review_identifiers||"");setReviewDraftDueAt(record.review_due_at?.slice(0,10)||"");setError("");
  }

  async function saveReview(record:SavedScreening){
    if(reviewDraftIdentifiers.trim().length<3){setError("Add the identifiers checked, or explain why none were available.");return}
    if(reviewDraftNotes.trim().length<20){setError(`Add at least ${20-reviewDraftNotes.trim().length} more character${20-reviewDraftNotes.trim().length===1?"":"s"} to the reviewer notes.`);return}
    setBusy(`review-${record.id}`);setError("");setNotice("");
    try{
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      if(!session?.access_token)throw new Error("Your session has expired. Log in again before saving the review.");
      const response=await fetch("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({screeningId:record.id,reviewStatus:reviewDraftStatus,reviewNotes:reviewDraftNotes,reviewIdentifiers:reviewDraftIdentifiers,reviewDueAt:reviewDraftDueAt?new Date(`${reviewDraftDueAt}T17:00:00`).toISOString():null})});
      const payload=await response.json().catch(()=>({error:"The review service returned an invalid response."}));
      if(!response.ok)throw new Error(payload.error||"The review decision could not be saved.");
      setNotice("Review decision saved and added to the audit trail.");if(organisation)await loadScreenings(organisation.id);await beginReview({...record,...(payload.review||{})});
    }catch(caught){setError(caught instanceof Error?caught.message:"The review decision could not be saved.")}
    finally{setBusy("")}
  }

  async function startCheckout(planId:string){
    setBusy(planId);setError("");
    const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
    const response=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({planId})});
    const payload=await response.json();
    if(!response.ok)setError(payload.error||"Billing could not be opened.");else window.location.assign(payload.url);
    setBusy("");
  }

  async function openBillingPortal(){
    setBusy("portal");setError("");const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
    const response=await fetch("/api/billing/portal",{method:"POST",headers:{Authorization:`Bearer ${session?.access_token||""}`}}),payload=await response.json();
    if(!response.ok)setError(payload.error||"The billing portal could not be opened.");else window.location.assign(payload.url);setBusy("");
  }

  async function loadTeam(token:string){
    const response=await fetch("/api/team",{headers:{Authorization:`Bearer ${token}`}}),payload=await response.json().catch(()=>({members:[],canManage:false}));
    if(response.ok){setTeamMembers(payload.members||[]);setTeamCanManage(Boolean(payload.canManage))}
  }

  async function updateTeamRole(member:TeamMember,nextRole:TeamMember["role"]){
    setBusy(`member-${member.user_id}`);setError("");setNotice("");
    const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
    const response=await fetch("/api/team",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({userId:member.user_id,role:nextRole})}),payload=await response.json().catch(()=>({error:"The team service returned an invalid response."}));
    if(!response.ok)setError(payload.error||"The member role could not be updated.");else{setNotice("Workspace role updated and audit logged.");if(session?.access_token)await loadTeam(session.access_token)}setBusy("");
  }

  function downloadReceipt(purchase:LedgerEntry,plan:Plan|undefined){
    downloadPurchaseReceipt({
      planName:plan?.name||"Credit purchase",
      credits:purchase.amount,
      amountCents:purchase.amount_paid_cents??plan?.price_cents??null,
      currency:purchase.currency||"EUR",
      status:purchase.payment_status||"Paid",
      purchasedAt:purchase.created_at,
      reference:purchase.external_reference,
      organisationName:organisation?.name||"ClearCheck customer",
      billingEmail:organisation?.billing_email||user?.email||"",
    });
  }

  if(loading||!user)return <main className="accountPage"><div className="accountLoading"><span className="brandMark">C</span><p>Opening your ClearCheck workspace…</p></div></main>;
  if(!organisation)return <main className="dashboardPage"><AppHeader variant="authenticated" currentAccount/><section className="workspaceSetupError"><span>WORKSPACE SETUP REQUIRED</span><h1>Your account is signed in, but no active organisation workspace was found.</h1><p>Registration may still be completing, or your membership may have been removed. Try again after confirming your email. If the problem continues, use the support contact provided by your ClearCheck administrator.</p><div><button type="button" onClick={()=>window.location.reload()}>Try again</button><Link href="/">Return home</Link></div></section></main>;
  const name=profile?.display_name||user.user_metadata?.full_name||user.email?.split("@")[0]||"ClearCheck user";
  const canManageBilling=role==="owner"||role==="admin";
  const canReview=canManageBilling||role==="reviewer";
  const purchasePlan=(purchase:LedgerEntry)=>plans.find(plan=>plan.id===purchase.plan_id)||plans.find(plan=>plan.credits===purchase.amount&&((purchase.entry_type==="subscription"&&plan.billing_mode==="monthly")||(purchase.entry_type==="bundle"&&plan.billing_mode==="bundle")||(purchase.entry_type==="purchase"&&plan.billing_mode==="single")));
  const filtersActive=Boolean(screeningSearch.trim())||screeningStatus!=="all"||screeningType!=="all"||screeningSort!=="newest"||reviewStatus!=="all";
  const reviewLabels:Record<NonNullable<SavedScreening["review_status"]>,string>={unreviewed:"Not reviewed",under_review:"Under review",closed_no_match:"Legacy—no match",false_positive:"False positive",confirmed_match:"Confirmed match",more_information_required:"More information required",escalated:"Escalated"};
  function resetScreeningFilters(){setScreeningSearch("");setScreeningStatus("all");setScreeningType("all");setScreeningSort("newest");setReviewStatus("all");setScreeningPage(0)}

  const history=<section className="dashboardPanel historyPanel"><div className="panelHeading"><div><span>SCREENING HISTORY</span><h2>{activeTab==="overview"?"Recent checks":"Review and find previous checks"}</h2></div>{historyLoading&&<span className="tableLoading">Updating…</span>}</div>
    {activeTab==="screenings"&&<div className="screeningTools"><div className="filterPresets" aria-label="Saved filter presets"><button type="button" onClick={()=>{resetScreeningFilters();setReviewStatus("unreviewed")}}>Unreviewed matches</button><button type="button" onClick={()=>{resetScreeningFilters();setScreeningStatus("incomplete")}}>Incomplete screenings</button><button type="button" onClick={()=>{resetScreeningFilters();setReviewStatus("escalated")}}>Escalated</button></div><label className="screeningSearch"><span>Search screenings</span><div><b aria-hidden="true">⌕</b><input type="search" value={screeningSearch} onChange={event=>{setScreeningSearch(event.target.value);setScreeningPage(0)}} placeholder="Search name or case reference…"/></div></label><label><span>Source result</span><select value={screeningStatus} onChange={event=>{setScreeningStatus(event.target.value as ScreeningStatus);setScreeningPage(0)}}><option value="all">All source results</option><option value="review">Review required</option><option value="incomplete">Incomplete</option><option value="clear">Clear</option></select></label><label><span>Review outcome</span><select value={reviewStatus} onChange={event=>{setReviewStatus(event.target.value as ReviewStatus);setScreeningPage(0)}}><option value="all">All review outcomes</option><option value="unreviewed">Not reviewed</option><option value="under_review">Under review</option><option value="more_information_required">More information required</option><option value="false_positive">False positive</option><option value="confirmed_match">Confirmed match</option><option value="escalated">Escalated</option></select></label><label><span>Subject type</span><select value={screeningType} onChange={event=>{setScreeningType(event.target.value as ScreeningType);setScreeningPage(0)}}><option value="all">People &amp; businesses</option><option value="person">People</option><option value="business">Businesses</option></select></label><label><span>Sort by</span><select value={screeningSort} onChange={event=>{setScreeningSort(event.target.value as ScreeningSort);setScreeningPage(0)}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="matches">Most matches</option></select></label><div className="screeningToolSummary"><span><strong>{screeningTotal}</strong> matching screenings</span>{filtersActive&&<button type="button" onClick={resetScreeningFilters}>Clear filters</button>}</div></div>}
    {screenings.length?<div className="historyTable"><div className="historyRow historyLabels"><span>Subject</span><span>Source result</span><span>Review outcome</span><span>Date</span><span>Matches</span><span>Actions</span></div>{screenings.map(record=><div className="historyRecord" key={record.id}>
      <div className="historyRow"><span><b>{record.subject_name}</b><small>{record.subject_type==="person"?"Person":"Business"} · {record.case_reference}</small></span><span><i className={`statusDot ${record.risk_state}`}/>{record.risk_state}</span><span className={`reviewChip ${record.review_status||"unreviewed"}`}>{reviewLabels[record.review_status||"unreviewed"]}</span><span>{new Date(record.checked_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span><span>{record.match_count}</span><span><Link href={`/?screening=${record.id}`}>Reopen</Link>{canReview&&<button onClick={()=>reviewingId===record.id?setReviewingId(""):beginReview(record)}>{reviewingId===record.id?"Cancel":"Review"}</button>}<button disabled={busy===record.id} onClick={()=>download(record)}>{busy===record.id?"Preparing…":"PDF"}</button></span></div>
      {reviewingId===record.id&&<div className="reviewEditor"><div className="reviewEditorHeading"><div><span>HUMAN REVIEW DECISION</span><h3>{record.subject_name}</h3></div>{record.reviewed_at&&<small>Last reviewed by {record.reviewed_by_display_name||"a workspace reviewer"} on {new Date(record.reviewed_at).toLocaleString("en-GB")}</small>}</div><div className="reviewFields"><label>Outcome<select value={reviewDraftStatus} onChange={event=>setReviewDraftStatus(event.target.value as ReviewOutcome)}><option value="under_review">Under review</option><option value="more_information_required">More information required</option><option value="false_positive">False positive</option><option value="confirmed_match">Confirmed match</option><option value="escalated">Escalated</option></select></label><label>Review due date <span>Optional</span><input type="date" value={reviewDraftDueAt} onChange={event=>setReviewDraftDueAt(event.target.value)}/></label><label>Identifiers checked<textarea maxLength={2000} rows={3} required value={reviewDraftIdentifiers} onChange={event=>{setReviewDraftIdentifiers(event.target.value);setError("")}} placeholder="DOB, nationality, ID number, registration number, address—or explain why none were available…"/></label><label>Reviewer notes<textarea maxLength={4000} minLength={20} required rows={4} value={reviewDraftNotes} onChange={event=>{setReviewDraftNotes(event.target.value);setError("")}} placeholder="Record the evidence considered and the reason for this decision…"/></label></div><aside><b>Human judgement required.</b> The automated result never changes. Record the identifiers and evidence that support your human disposition.</aside><div className="reviewActions"><small className={reviewDraftIdentifiers.trim().length>=3&&reviewDraftNotes.trim().length>=20?"reviewReady":"reviewRequired"}>{reviewDraftIdentifiers.trim().length<3?"Add identifiers checked, or explain why none were available.":reviewDraftNotes.trim().length<20?`${20-reviewDraftNotes.trim().length} more note character${20-reviewDraftNotes.trim().length===19?"":"s"} required.`:"Ready to save · Every decision is audit logged."}</small><button disabled={busy===`review-${record.id}`} onClick={()=>saveReview(record)}>{busy===`review-${record.id}`?"Saving…":"Save review decision"}</button></div></div>}
    </div>)}</div>:historyLoading?<div className="emptyHistory"><p>Loading screening history…</p></div>:screeningTotal===0&&filtersActive?<div className="emptyHistory filteredEmpty"><span>⌕</span><h3>No screenings match</h3><p>Try a different name, case reference or filter.</p><button type="button" onClick={resetScreeningFilters}>Clear all filters</button></div>:<div className="emptyHistory"><span>⌕</span><h3>No saved screenings yet</h3><p>Your first completed check will appear here automatically.</p><Link href="/">Run your first screening</Link></div>}
    {activeTab==="screenings"&&screeningTotal>SCREENINGS_PER_PAGE&&<div className="historyPagination"><button disabled={screeningPage===0||historyLoading} onClick={()=>setScreeningPage(page=>Math.max(0,page-1))}>← Previous</button><span>Page {screeningPage+1} of {Math.ceil(screeningTotal/SCREENINGS_PER_PAGE)}</span><button disabled={(screeningPage+1)*SCREENINGS_PER_PAGE>=screeningTotal||historyLoading} onClick={()=>setScreeningPage(page=>page+1)}>Next →</button></div>}
    {activeTab==="overview"&&screeningTotal>5&&<button className="viewAllButton" onClick={()=>selectTab("screenings")}>View all {screeningTotal} screenings</button>}
  </section>;

  const healthNames:Record<string,string>={euConsolidated:"EU consolidated list",euOfficialJournal:"EU Official Journal",unConsolidated:"UN consolidated list",maltaArb:"Malta ARB court orders"};
  const sourceHealthPanel=<section className="dashboardPanel healthPanel"><div className="panelHeading"><div><span>SOURCE HEALTH</span><h2>Official-data availability</h2><p>A screening is never reported as complete when a required official source fails. Missed refresh checks are warnings, not false failures.</p></div><button className="healthRefresh" disabled={healthLoading} onClick={loadSourceHealth}>{healthLoading?"Checking…":"Refresh status"}</button></div><div className="healthGrid">{Object.entries(healthNames).map(([key,label])=>{const source=sourceHealth?.sources?.[key],state=source?.healthy?(source.refreshAttention?"attention":"healthy"):"unavailable";return <article key={key} className={state}><div><i/><span>{state==="healthy"?"LATEST REFRESH CONFIRMED":state==="attention"?"REFRESH CHECK DUE":"UNAVAILABLE"}</span></div><h3>{label}</h3><p>{source?.message||(!sourceHealth?"Checking source status…":"The latest source check did not complete.")}</p><dl><div><dt>Last checked</dt><dd>{source?.checkedAt||sourceHealth?.time?new Date(source?.checkedAt||sourceHealth!.time).toLocaleString("en-GB"):"—"}</dd></div><div><dt>Publisher data</dt><dd>{source?.lastUpdated?new Date(source.lastUpdated).toLocaleString("en-GB"):"Live query"}</dd></div></dl></article>})}</div></section>;

  return <main className="dashboardPage">
    <AppHeader variant="authenticated" currentAccount/>
    <section className="dashboardHero"><div><span className="authEyebrow"><i/> SECURE WORKSPACE</span><h1>Good to see you, {String(name).split(" ")[0]}.</h1><p>{organisation?.name||"Your organisation"} · {role||"member"}</p></div><Link href="/">Run a new screening <span>→</span></Link></section>
    <nav className="accountTabs" aria-label="Account sections">{(["overview","screenings","billing","settings"] as AccountTab[]).map(tab=><button key={tab} className={activeTab===tab?"active":""} aria-current={activeTab===tab?"page":undefined} onClick={()=>selectTab(tab)}>{tab[0].toUpperCase()+tab.slice(1)}</button>)}</nav>
    <section className="dashboardShell">
      {(notice||error)&&<div className={`dashboardNotice ${error?"error":""}`} role={error?"alert":"status"}>{error||notice}</div>}
      {activeTab==="overview"&&<><div className="dashboardStats"><article><small>AVAILABLE CREDITS</small><strong>{credits}</strong><span>1 credit per screening</span></article><article><small>SAVED SCREENINGS</small><strong>{screeningTotal}</strong><span>Organisation history</span></article><article><small>PDF REPORTS</small><strong>{reportCount}</strong><span>Audit events recorded</span></article><article><small>WORKSPACE ROLE</small><strong className="wordStat">{role||"Member"}</strong><span>Organisation access level</span></article></div>{sourceHealthPanel}{history}</>}
      {activeTab==="screenings"&&history}
      {activeTab==="settings"&&<div className="dashboardTwoCol tabSection">
        <section className="dashboardPanel"><div className="panelHeading"><div><span>ACCOUNT SETTINGS</span><h2>Profile & organisation</h2></div><span className="memberBadge">{role}</span></div><form className="settingsForm" onSubmit={saveAccount}><div><label>First name<input name="first" defaultValue={profile?.first_name||""} required/></label><label>Last name<input name="last" defaultValue={profile?.last_name||""} required/></label></div><label>Organisation name<input name="organisation" defaultValue={organisation?.name||""} required readOnly={!canManageBilling}/>{!canManageBilling&&<small>Only owners and admins can rename the organisation.</small>}</label><label>Phone number<input name="phone" defaultValue={profile?.phone||""} placeholder="Optional"/></label><button disabled={busy==="account"}>{busy==="account"?"Saving…":"Save settings"}</button></form></section>
        <section className="dashboardPanel"><div className="panelHeading"><div><span>DATA CONTROL</span><h2>Retention & privacy rights</h2></div></div>{canManageBilling?<form className="settingsForm" onSubmit={saveRetention}><label>Retention period<select name="months" defaultValue={compliance?.retention_months||60}><option value="60">5 years</option><option value="72">6 years</option><option value="84">7 years</option><option value="120">10 years</option></select></label><label className="checkSetting"><input type="checkbox" name="automatic" defaultChecked={compliance?.automatic_deletion||false}/><span><b>Enable scheduled deletion</b><small>Only after the retention period, with legal-hold protection.</small></span></label><button disabled={busy==="retention"}>{busy==="retention"?"Saving…":"Save retention"}</button></form>:<p className="settingsPermission">Retention controls are restricted to workspace owners and admins.</p>}<div className="privacyActions"><button disabled={Boolean(busy)} onClick={()=>requestPrivacyAction("access")}>Request data copy</button><button disabled={Boolean(busy)} onClick={()=>requestPrivacyAction("correction")}>Request correction</button><button className="dangerLink" disabled={Boolean(busy)} onClick={()=>requestPrivacyAction("deletion")}>Request deletion</button></div></section>
        <section className="dashboardPanel teamPanel"><div className="panelHeading"><div><span>TEAM ACCESS</span><h2>Members &amp; roles</h2><p>Role changes are enforced on the server and recorded in the audit trail.</p></div></div><div className="teamList">{teamMembers.map(member=><div className="teamMember" key={member.user_id}><span><b>{member.display_name}</b><small>{member.user_id===user.id?"You · ":""}Active since {new Date(member.joined_at).toLocaleDateString("en-GB")}</small></span>{teamCanManage&&member.role!=="owner"?<select aria-label={`Role for ${member.display_name}`} value={member.role} disabled={busy===`member-${member.user_id}`} onChange={event=>updateTeamRole(member,event.target.value as TeamMember["role"])}><option value="admin">Admin</option><option value="reviewer">Reviewer</option><option value="member">Member</option></select>:<span className="memberBadge">{member.role}</span>}</div>)}</div><p className="teamFootnote">Email invitations remain disabled until the invitation, identity-verification and removal flows pass security testing.</p></section>
      </div>}
      {activeTab==="billing"&&<div className="tabSection">
        <section className="dashboardPanel billingPanel"><div className="panelHeading"><div><span>CREDITS & BILLING</span><h2>Choose how you screen</h2><p>Secure checkout and payment documents are handled by Stripe.</p></div>{canManageBilling?<button className="portalButton" disabled={busy==="portal"} onClick={openBillingPortal}>Manage billing</button>:<span className="billingPermission">Only workspace owners and admins can purchase or manage plans.</span>}</div><div className="billingTerms">Test mode during private beta · One credit is consumed only after a screening audit record is saved · Credits do not currently expire · Subscription cancellation and hosted tax documents are managed in Stripe.</div><div className="planGrid">{plans.filter(plan=>plan.billing_mode!=="beta").map(plan=><article key={plan.id}><span>{plan.billing_mode.toUpperCase()}</span><h3>{plan.name}</h3><strong>€{(plan.price_cents/100).toFixed(0)}{plan.interval_name==="month"?<small>/month</small>:null}</strong><p>{plan.description}</p><button disabled={Boolean(busy)||!canManageBilling} onClick={()=>startCheckout(plan.id)}>{canManageBilling?(busy===plan.id?"Opening checkout…":"Choose plan"):"Owner or admin required"}</button></article>)}</div></section>
        <section className="dashboardPanel purchasePanel"><div className="panelHeading"><div><span>PURCHASE HISTORY</span><h2>Payments &amp; credits</h2><p>Completed purchases for this organisation.</p></div></div>{purchases.length?<div className="purchaseTable"><div className="purchaseRow purchaseLabels"><span>Plan</span><span>Date</span><span>Credits</span><span>Amount</span><span>Status</span><span>Receipt</span></div>{purchases.map(purchase=>{const plan=purchasePlan(purchase),amount=purchase.amount_paid_cents??plan?.price_cents,currency=purchase.currency||"EUR";return <div className="purchaseRow" key={purchase.external_reference||purchase.created_at}><span><b>{plan?.name||"Credit purchase"}</b></span><span>{new Date(purchase.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span><span>+{purchase.amount}</span><span>{amount===undefined?"—":`${currency} ${(amount/100).toFixed(2)}`}</span><span><i className="statusDot"/>{purchase.payment_status||"Paid"}</span><span><button className="invoiceButton" onClick={()=>downloadReceipt(purchase,plan)} aria-label={`Download receipt for ${plan?.name||"credit purchase"}`}>Download receipt <b>↓</b></button></span></div>})}</div>:<div className="emptyPurchases"><h3>No purchases yet</h3><p>Your completed payments will appear here automatically.</p></div>}</section>
      </div>}
    </section>
    <footer className="dashboardFooter"><span>© 2026 ClearCheck <small>Private beta · Operator identity pending launch approval</small></span><div><Link href="/providers">Data sources</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/security">Security</Link></div></footer>
  </main>;
}
