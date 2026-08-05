"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { downloadScreeningReport } from "../lib/report";
import { downloadPurchaseInvoice } from "../lib/invoice";
import type { SavedScreening } from "../lib/screening";
import AppHeader from "../AppHeader";

type Profile={first_name:string;last_name:string;display_name:string;company:string|null;phone:string|null};
type Organisation={id:string;name:string;billing_email:string|null};
type Plan={id:string;name:string;billing_mode:string;price_cents:number;credits:number|null;interval_name:string|null;description:string};
type Compliance={retention_months:number;automatic_deletion:boolean;legal_hold:boolean};
type LedgerEntry={amount:number;entry_type:string;external_reference:string|null;created_at:string;plan_id:string|null;amount_paid_cents:number|null;currency:string|null;payment_status:string|null};
type AccountTab="overview"|"screenings"|"billing"|"settings";

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

  useEffect(()=>{void loadWorkspace()},[]);

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
      const [{data:org},{data:history},ledgerResult,{count:reports},{data:settings}]=await Promise.all([
        supabase.from("organisations").select("id,name,billing_email").eq("id",orgId).single(),
        supabase.from("screenings").select("*").eq("organisation_id",orgId).order("created_at",{ascending:false}).limit(100),
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
      setOrganisation(org as Organisation);setScreenings((history||[]) as SavedScreening[]);setCredits(entries.reduce((sum,row)=>sum+Number(row.amount),0));setPurchases(entries.filter(row=>["purchase","bundle","subscription"].includes(row.entry_type)));setReportCount(reports||0);setCompliance(settings as Compliance|null);
    }
    setLoading(false);
  }

  function selectTab(tab:AccountTab){
    setActiveTab(tab);
    window.history.replaceState({},"",tab==="overview"?"/account":`/account?tab=${tab}`);
    window.scrollTo({top:0,behavior:"smooth"});
  }

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

  async function requestPrivacyAction(requestType:"access"|"correction"|"deletion"){
    const labels={access:"a copy of your account data",correction:"correction of personal data",deletion:"account-data deletion"};
    if(!organisation||!user||!window.confirm(`Submit a formal request for ${labels[requestType]}? Screening records may need to be retained where law requires.`))return;
    setBusy(requestType);setError("");setNotice("");
    const {error:requestError}=await getSupabaseBrowserClient().from("data_deletion_requests").insert({organisation_id:organisation.id,requested_by:user.id,request_type:requestType,reason:"Requested from ClearCheck account settings"});
    if(requestError)setError(requestError.message);else setNotice(`Your ${requestType} request has been recorded for privacy review.`);setBusy("");
  }

  async function download(record:SavedScreening){
    setBusy(record.id);setError("");
    const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
    const response=await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({screeningId:record.id})});
    if(!response.ok)setError("The report audit event could not be recorded.");else{downloadScreeningReport(record);setReportCount(count=>count+1)}
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

  function printInvoice(purchase:LedgerEntry,plan:Plan|undefined){
    downloadPurchaseInvoice({
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
  const name=profile?.display_name||user.user_metadata?.full_name||user.email?.split("@")[0]||"ClearCheck user";
  const canManageBilling=role==="owner"||role==="admin";
  const purchasePlan=(purchase:LedgerEntry)=>plans.find(plan=>plan.id===purchase.plan_id)||plans.find(plan=>plan.credits===purchase.amount&&((purchase.entry_type==="subscription"&&plan.billing_mode==="monthly")||(purchase.entry_type==="bundle"&&plan.billing_mode==="bundle")||(purchase.entry_type==="purchase"&&plan.billing_mode==="single")));

  const history=<section className="dashboardPanel historyPanel"><div className="panelHeading"><div><span>SCREENING HISTORY</span><h2>{activeTab==="overview"?"Recent checks":"All previous checks"}</h2></div></div>
    {screenings.length?<div className="historyTable"><div className="historyRow historyLabels"><span>Subject</span><span>Status</span><span>Date</span><span>Matches</span><span>Actions</span></div>{(activeTab==="overview"?screenings.slice(0,5):screenings).map(record=><div className="historyRow" key={record.id}><span><b>{record.subject_name}</b><small>{record.case_reference}</small></span><span><i className={`statusDot ${record.risk_state}`}/>{record.risk_state}</span><span>{new Date(record.checked_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span><span>{record.match_count}</span><span><Link href={`/?screening=${record.id}`}>Reopen</Link><button disabled={busy===record.id} onClick={()=>download(record)}>{busy===record.id?"Preparing…":"PDF"}</button></span></div>)}</div>:<div className="emptyHistory"><span>⌕</span><h3>No saved screenings yet</h3><p>Your first completed check will appear here automatically.</p><Link href="/">Run your first screening</Link></div>}
    {activeTab==="overview"&&screenings.length>5&&<button className="viewAllButton" onClick={()=>selectTab("screenings")}>View all screenings</button>}
  </section>;

  return <main className="dashboardPage">
    <AppHeader variant="authenticated" currentAccount/>
    <section className="dashboardHero"><div><span className="authEyebrow"><i/> SECURE WORKSPACE</span><h1>Good to see you, {String(name).split(" ")[0]}.</h1><p>{organisation?.name||"Your organisation"} · {role||"member"}</p></div><Link href="/">Run a new screening <span>→</span></Link></section>
    <nav className="accountTabs" aria-label="Account sections">{(["overview","screenings","billing","settings"] as AccountTab[]).map(tab=><button key={tab} className={activeTab===tab?"active":""} aria-current={activeTab===tab?"page":undefined} onClick={()=>selectTab(tab)}>{tab[0].toUpperCase()+tab.slice(1)}</button>)}</nav>
    <section className="dashboardShell">
      {(notice||error)&&<div className={`dashboardNotice ${error?"error":""}`} role={error?"alert":"status"}>{error||notice}</div>}
      {activeTab==="overview"&&<><div className="dashboardStats"><article><small>AVAILABLE CREDITS</small><strong>{credits}</strong><span>1 credit per screening</span></article><article><small>SAVED SCREENINGS</small><strong>{screenings.length}</strong><span>Organisation history</span></article><article><small>PDF REPORTS</small><strong>{reportCount}</strong><span>Audit events recorded</span></article><article><small>WORKSPACE ROLE</small><strong className="wordStat">{role||"Member"}</strong><span>Organisation access level</span></article></div>{history}</>}
      {activeTab==="screenings"&&history}
      {activeTab==="settings"&&<div className="dashboardTwoCol tabSection">
        <section className="dashboardPanel"><div className="panelHeading"><div><span>ACCOUNT SETTINGS</span><h2>Profile & organisation</h2></div><span className="memberBadge">{role}</span></div><form className="settingsForm" onSubmit={saveAccount}><div><label>First name<input name="first" defaultValue={profile?.first_name||""} required/></label><label>Last name<input name="last" defaultValue={profile?.last_name||""} required/></label></div><label>Organisation name<input name="organisation" defaultValue={organisation?.name||""} required/></label><label>Phone number<input name="phone" defaultValue={profile?.phone||""} placeholder="Optional"/></label><button disabled={busy==="account"}>{busy==="account"?"Saving…":"Save settings"}</button></form></section>
        <section className="dashboardPanel"><div className="panelHeading"><div><span>DATA CONTROL</span><h2>Retention & privacy rights</h2></div></div><form className="settingsForm" onSubmit={saveRetention}><label>Retention period<select name="months" defaultValue={compliance?.retention_months||60}><option value="60">5 years</option><option value="72">6 years</option><option value="84">7 years</option><option value="120">10 years</option></select></label><label className="checkSetting"><input type="checkbox" name="automatic" defaultChecked={compliance?.automatic_deletion||false}/><span><b>Enable scheduled deletion</b><small>Only after the retention period, with legal-hold protection.</small></span></label><button disabled={busy==="retention"}>{busy==="retention"?"Saving…":"Save retention"}</button></form><div className="privacyActions"><button disabled={Boolean(busy)} onClick={()=>requestPrivacyAction("access")}>Request data copy</button><button disabled={Boolean(busy)} onClick={()=>requestPrivacyAction("correction")}>Request correction</button><button className="dangerLink" disabled={Boolean(busy)} onClick={()=>requestPrivacyAction("deletion")}>Request deletion</button></div></section>
      </div>}
      {activeTab==="billing"&&<div className="tabSection">
        <section className="dashboardPanel billingPanel"><div className="panelHeading"><div><span>CREDITS & BILLING</span><h2>Choose how you screen</h2><p>Secure checkout and invoices are handled by Stripe.</p></div>{canManageBilling?<button className="portalButton" disabled={busy==="portal"} onClick={openBillingPortal}>Manage billing</button>:<span className="billingPermission">Only workspace owners and admins can purchase or manage plans.</span>}</div><div className="planGrid">{plans.filter(plan=>plan.billing_mode!=="beta").map(plan=><article key={plan.id}><span>{plan.billing_mode.toUpperCase()}</span><h3>{plan.name}</h3><strong>€{(plan.price_cents/100).toFixed(0)}{plan.interval_name==="month"?<small>/month</small>:null}</strong><p>{plan.description}</p><button disabled={Boolean(busy)||!canManageBilling} onClick={()=>startCheckout(plan.id)}>{canManageBilling?(busy===plan.id?"Opening checkout…":"Choose plan"):"Owner or admin required"}</button></article>)}</div></section>
        <section className="dashboardPanel purchasePanel"><div className="panelHeading"><div><span>PURCHASE HISTORY</span><h2>Payments &amp; credits</h2><p>Completed purchases for this organisation.</p></div></div>{purchases.length?<div className="purchaseTable"><div className="purchaseRow purchaseLabels"><span>Plan</span><span>Date</span><span>Credits</span><span>Amount</span><span>Status</span><span>Invoice</span></div>{purchases.map(purchase=>{const plan=purchasePlan(purchase),amount=purchase.amount_paid_cents??plan?.price_cents,currency=purchase.currency||"EUR";return <div className="purchaseRow" key={purchase.external_reference||purchase.created_at}><span><b>{plan?.name||"Credit purchase"}</b></span><span>{new Date(purchase.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span><span>+{purchase.amount}</span><span>{amount===undefined?"—":`${currency} ${(amount/100).toFixed(2)}`}</span><span><i className="statusDot"/>{purchase.payment_status||"Paid"}</span><span><button className="invoiceButton" onClick={()=>printInvoice(purchase,plan)} aria-label={`Download invoice for ${plan?.name||"credit purchase"}`}>Print invoice <b>↓</b></button></span></div>})}</div>:<div className="emptyPurchases"><h3>No purchases yet</h3><p>Your completed payments will appear here automatically.</p></div>}</section>
      </div>}
    </section>
    <footer className="dashboardFooter"><span>© 2026 ClearCheck</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/security">Security</Link></div></footer>
  </main>;
}
