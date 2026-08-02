"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { downloadScreeningReport } from "../lib/report";
import type { SavedScreening } from "../lib/screening";

type Profile={first_name:string;last_name:string;display_name:string;company:string|null;phone:string|null};
type Organisation={id:string;name:string;billing_email:string|null};
type Plan={id:string;name:string;billing_mode:string;price_cents:number;credits:number|null;interval_name:string|null;description:string};
type Compliance={retention_months:number;automatic_deletion:boolean;legal_hold:boolean};
type LedgerEntry={amount:number;entry_type:string;external_reference:string|null;created_at:string};
type ConfirmedPurchase={planName:string;credits:number;amount:number;currency:string};

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
  const [confirmedPurchase,setConfirmedPurchase]=useState<ConfirmedPurchase|null>(null);
  const [reportCount,setReportCount]=useState(0);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");

  useEffect(()=>{void loadWorkspace()},[]);

  async function loadWorkspace(){
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    const current=session?.user;
    if(!current){window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname+window.location.search)}`);return}
    setUser(current);
    const billingParams=new URLSearchParams(window.location.search);
    if(billingParams.get("billing")==="success"&&billingParams.get("session_id")){
      const response=await fetch("/api/billing/confirm",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({sessionId:billingParams.get("session_id")})});
      const payload=await response.json();
      if(response.ok)setConfirmedPurchase(payload.purchase as ConfirmedPurchase);
      else setError(payload.error||"Your payment was received, but the credits could not be confirmed yet.");
      window.history.replaceState({},"","/account");
    }else if(billingParams.get("billing")==="cancelled"){
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
      const [{data:org},{data:history},{data:ledger},{count:reports},{data:settings}]=await Promise.all([
        supabase.from("organisations").select("id,name,billing_email").eq("id",orgId).single(),
        supabase.from("screenings").select("*").eq("organisation_id",orgId).order("created_at",{ascending:false}).limit(100),
        supabase.from("credit_ledger").select("amount,entry_type,external_reference,created_at").eq("organisation_id",orgId).order("created_at",{ascending:false}),
        supabase.from("reports").select("id",{count:"exact",head:true}).eq("organisation_id",orgId),
        supabase.from("compliance_settings").select("retention_months,automatic_deletion,legal_hold").eq("organisation_id",orgId).maybeSingle(),
      ]);
      const entries=(ledger||[]) as LedgerEntry[];
      setOrganisation(org as Organisation);setScreenings((history||[]) as SavedScreening[]);setCredits(entries.reduce((sum,row)=>sum+Number(row.amount),0));setPurchases(entries.filter(row=>["purchase","bundle","subscription"].includes(row.entry_type)));setReportCount(reports||0);setCompliance(settings as Compliance|null);
    }
    setLoading(false);
  }

  async function signOut(){await getSupabaseBrowserClient().auth.signOut();window.location.replace("/")}

  async function saveAccount(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!user||!organisation)return;setBusy("account");setError("");setNotice("");
    const form=new FormData(event.currentTarget),first=String(form.get("first")||"").trim(),last=String(form.get("last")||"").trim(),orgName=String(form.get("organisation")||"").trim(),phone=String(form.get("phone")||"").trim();
    const supabase=getSupabaseBrowserClient();
    const [{error:profileError},{error:orgError}]=await Promise.all([
      supabase.from("profiles").update({first_name:first,last_name:last,display_name:`${first} ${last}`.trim(),phone:phone||null}).eq("id",user.id),
      supabase.from("organisations").update({name:orgName,billing_email:user.email}).eq("id",organisation.id),
    ]);
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

  async function requestDeletion(){
    if(!organisation||!user||!window.confirm("Submit a formal account-data deletion request for review? AML records may need to be retained where law requires."))return;
    setBusy("delete");setError("");setNotice("");
    const {error:requestError}=await getSupabaseBrowserClient().from("data_deletion_requests").insert({organisation_id:organisation.id,requested_by:user.id,reason:"Requested from ClearCheck account settings"});
    if(requestError)setError(requestError.message);else setNotice("Your deletion request has been recorded for privacy and legal review.");setBusy("");
  }

  async function download(record:SavedScreening){
    setBusy(record.id);setError("");
    const {error:reportError}=await getSupabaseBrowserClient().rpc("record_report_download",{p_screening_id:record.id,p_checksum:null});
    if(reportError)setError("The report audit event could not be recorded.");else{downloadScreeningReport(record);setReportCount(count=>count+1)}
    setBusy("");
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

  if(loading||!user)return <main className="accountPage"><div className="accountLoading"><span className="brandMark">C</span><p>Opening your ClearCheck workspace…</p></div></main>;
  const name=profile?.display_name||user.user_metadata?.full_name||user.email?.split("@")[0]||"ClearCheck user";
  const canManageBilling=role==="owner"||role==="admin";
  const purchasePlan=(purchase:LedgerEntry)=>plans.find(plan=>plan.credits===purchase.amount&&((purchase.entry_type==="subscription"&&plan.billing_mode==="monthly")||(purchase.entry_type==="bundle"&&plan.billing_mode==="bundle")||(purchase.entry_type==="purchase"&&plan.billing_mode==="single")));

  return <main className="dashboardPage">
    <header className="accountHeader"><Link className="brand" href="/"><span className="brandMark">C</span><span>ClearCheck</span></Link><nav className="accountShortcuts" aria-label="Main navigation"><Link href="/#platform">Platform</Link><Link href="/#coverage">Coverage</Link><Link href="/#industries">Industries</Link><Link href="/#pricing">Pricing</Link></nav><div><Link href="/">New screening</Link><button onClick={signOut}>Log out</button></div></header>
    <section className="dashboardHero"><div><span className="authEyebrow"><i/> SECURE WORKSPACE</span><h1>Good to see you, {String(name).split(" ")[0]}.</h1><p>{organisation?.name||"Your organisation"} · {role||"member"}</p></div><Link href="/">Run a new screening <span>→</span></Link></section>
    <section className="dashboardShell">
      {confirmedPurchase&&<section className="checkoutAccountSuccess"><span className="successIcon">✓</span><div><small>PAYMENT RECEIVED</small><h2>Purchase successful</h2><p><b>+{confirmedPurchase.credits} screening {confirmedPurchase.credits===1?"credit":"credits"}</b> added from {confirmedPurchase.planName} · {confirmedPurchase.currency} {(confirmedPurchase.amount/100).toFixed(2)}</p></div><Link href="/">Start a screening <span>→</span></Link></section>}
      {(notice||error)&&<div className={`dashboardNotice ${error?"error":""}`}>{error||notice}</div>}
      <div className="dashboardStats"><article><small>AVAILABLE CREDITS</small><strong>{credits}</strong><span>1 credit per screening</span></article><article><small>SAVED SCREENINGS</small><strong>{screenings.length}</strong><span>Organisation history</span></article><article><small>PDF REPORTS</small><strong>{reportCount}</strong><span>Audit events recorded</span></article><article><small>WORKSPACE ROLE</small><strong className="wordStat">{role||"Member"}</strong><span>Row-level access enforced</span></article></div>

      <section className="dashboardPanel historyPanel"><div className="panelHeading"><div><span>SCREENING HISTORY</span><h2>Previous checks</h2></div><Link href="/">New screening +</Link></div>
        {screenings.length?<div className="historyTable"><div className="historyRow historyLabels"><span>Subject</span><span>Status</span><span>Date</span><span>Matches</span><span>Actions</span></div>{screenings.map(record=><div className="historyRow" key={record.id}><span><b>{record.subject_name}</b><small>{record.case_reference}</small></span><span><i className={`statusDot ${record.risk_state}`}/>{record.risk_state}</span><span>{new Date(record.checked_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span><span>{record.match_count}</span><span><Link href={`/?screening=${record.id}`}>Reopen</Link><button disabled={busy===record.id} onClick={()=>download(record)}>{busy===record.id?"Preparing…":"PDF"}</button></span></div>)}</div>:<div className="emptyHistory"><span>⌕</span><h3>No saved screenings yet</h3><p>Your first completed check will appear here automatically.</p><Link href="/">Run your first screening</Link></div>}
      </section>

      <div className="dashboardTwoCol">
        <section className="dashboardPanel"><div className="panelHeading"><div><span>ACCOUNT SETTINGS</span><h2>Profile & organisation</h2></div><span className="memberBadge">{role}</span></div><form className="settingsForm" onSubmit={saveAccount}><div><label>First name<input name="first" defaultValue={profile?.first_name||""} required/></label><label>Last name<input name="last" defaultValue={profile?.last_name||""} required/></label></div><label>Organisation name<input name="organisation" defaultValue={organisation?.name||""} required/></label><label>Phone number<input name="phone" defaultValue={profile?.phone||""} placeholder="Optional"/></label><button disabled={busy==="account"}>{busy==="account"?"Saving…":"Save settings"}</button></form></section>
        <section className="dashboardPanel"><div className="panelHeading"><div><span>DATA CONTROL</span><h2>Retention & deletion</h2></div></div><form className="settingsForm" onSubmit={saveRetention}><label>Retention period<select name="months" defaultValue={compliance?.retention_months||60}><option value="60">5 years</option><option value="72">6 years</option><option value="84">7 years</option><option value="120">10 years</option></select></label><label className="checkSetting"><input type="checkbox" name="automatic" defaultChecked={compliance?.automatic_deletion||false}/><span><b>Enable scheduled deletion</b><small>Only after the retention period, with legal-hold protection.</small></span></label><button disabled={busy==="retention"}>{busy==="retention"?"Saving…":"Save retention"}</button></form><button className="dangerLink" disabled={busy==="delete"} onClick={requestDeletion}>Request account-data deletion</button></section>
      </div>

      <section className="dashboardPanel billingPanel"><div className="panelHeading"><div><span>CREDITS & BILLING</span><h2>Choose how you screen</h2><p>Secure checkout and invoices are handled by Stripe.</p></div>{canManageBilling?<button className="portalButton" disabled={busy==="portal"} onClick={openBillingPortal}>Manage billing</button>:null}</div><div className="planGrid">{plans.filter(plan=>plan.billing_mode!=="beta").map(plan=><article key={plan.id}><span>{plan.billing_mode.toUpperCase()}</span><h3>{plan.name}</h3><strong>€{(plan.price_cents/100).toFixed(0)}{plan.interval_name==="month"?<small>/month</small>:null}</strong><p>{plan.description}</p><button disabled={Boolean(busy)||!canManageBilling} onClick={()=>startCheckout(plan.id)}>{canManageBilling?(busy===plan.id?"Opening checkout…":"Choose plan"):"Admin access required"}</button></article>)}</div><p className="billingFootnote">Live charges stay disabled until Stripe test or live credentials and product price IDs are connected.</p></section>

      <section className="dashboardPanel purchasePanel"><div className="panelHeading"><div><span>PURCHASE HISTORY</span><h2>Payments &amp; credits</h2><p>Completed Stripe purchases for this organisation.</p></div></div>
        {purchases.length?<div className="purchaseTable"><div className="purchaseRow purchaseLabels"><span>Plan</span><span>Date</span><span>Credits</span><span>Amount</span><span>Status</span></div>{purchases.map(purchase=>{const plan=purchasePlan(purchase);return <div className="purchaseRow" key={purchase.external_reference||purchase.created_at}><span><b>{plan?.name||"Credit purchase"}</b><small>Stripe checkout</small></span><span>{new Date(purchase.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span><span>+{purchase.amount}</span><span>{plan?`€${(plan.price_cents/100).toFixed(0)}`:"—"}</span><span><i className="statusDot"/>Paid</span></div>})}</div>:<div className="emptyPurchases"><h3>No purchases yet</h3><p>Your completed Stripe payments will appear here automatically.</p></div>}
      </section>
    </section>
    <footer className="dashboardFooter"><span>© 2026 ClearCheck</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/security">Security</Link></div></footer>
  </main>;
}
