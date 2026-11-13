"use client";

import { useEffect, useState } from "react";
import AppHeader from "./AppHeader";
import { getSupabaseBrowserClient } from "./lib/supabase";
import { useSourceHealth } from "./lib/use-source-health";

type PublicPlan={id:string;name:string;billing_mode:string;price_cents:number;credits:number|null;interval_name:string|null;description:string};

export default function Home(){
  const [publicPlans,setPublicPlans]=useState<PublicPlan[]>([]);
  const {sourceHealth:health}=useSourceHealth();
  const sourceHealth=!health?"checking":health.status==="ok"?"available":health.status==="attention"?"attention":"degraded";

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.has("screening")||params.has("client")){
      window.location.replace(`/screening?${params}`);
      return;
    }
    let active=true;
    try{
      const supabase=getSupabaseBrowserClient();
      void supabase.auth.getUser().then(({data})=>{
        if(active&&data.user)window.location.replace("/account");
      });
      void supabase.from("plans").select("id,name,billing_mode,price_cents,credits,interval_name,description").neq("billing_mode","beta").order("sort_order").then(({data})=>{
        if(active)setPublicPlans((data||[]) as PublicPlan[]);
      });
    }catch{
      // Keep the public site available when account services are unavailable.
    }
    return()=>{active=false};
  },[]);

  return <main className="homePage">
    <AppHeader variant="public"/>
      <section className="kycHero" id="top">
        <div className="heroGlow heroGlowOne"/><div className="heroGlow heroGlowTwo"/>
        <div className="kycHeroInner">
          <div className="heroCopy">
            <h1>Sanctions screening<br/><em>across EU, UN and Malta sources.</em></h1>
            <p>Check a person or business against EU and UN sanctions lists and Malta court orders in one search. See which sources completed, open the official evidence and record your review.</p>
            <div className="heroBenefits"><a className="headerCta" href="/sample">View a sample screening</a></div>
            <div className="heroProof"><span>Built for</span><strong>Financial services</strong><strong>Legal teams</strong><strong>Real estate</strong><strong>Gaming</strong></div>
          </div>
          <div className="publicHeroActions">
            <span className={`liveBadge ${sourceHealth}`}><i/> {sourceHealth==="checking"?"Checking sources":sourceHealth==="available"?"Official sources available":sourceHealth==="attention"?"Refresh check due":"Source issue detected"}</span>
            <h2>Try ClearCheck with 25 beta credits</h2>
            <p>Set up a workspace for your organisation to run screenings and save your review decisions.</p>
            <a className="headerCta" href="/register">Create an account</a>
            <a className="headerLogin" href="/login">Log in</a>
          </div>
        </div>
      </section>
      <section className="platformSection" id="platform">
        <div className="sectionIntro"><h2>See what a screening returns</h2><p>Review potential matches and keep the evidence behind your decision in one place.</p></div>
        <div className="platformGrid">
          <article className="featurePrimary"><small>EXAMPLE RESULT</small><h3>A potential match to review</h3><p>Compare the available identifiers and read the official record before deciding if the match is your client.</p><div className="miniResult"><span className="miniAvatar">AJ</span><div><small>POTENTIAL MATCH</small><strong>Alina JUC</strong><span>EU restrictive measures · 100% name similarity</span></div><b>Manual review</b></div></article>
          <article><small>EVIDENCE</small><h3>Official links beside every match</h3><p>Move directly from a result to EUR-Lex, the UN list or the Maltese court-order record.</p></article>
          <article><small>REPORTING</small><h3>Download a case report</h3><p>Save the case reference, time checked, source status, matches and review guidance.</p></article>
          <article><small>WEB INTELLIGENCE</small><h3>Focused adverse-media review</h3><p>Open structured external searches for fraud, eCourts, money laundering and financial crime.</p></article>
          <article><small>TRACEABILITY</small><h3>Source-by-source status</h3><p>See which sources completed and which were unavailable. ClearCheck flags incomplete checks for follow-up.</p></article>
        </div>
      </section>
      <section className="coverageSection" id="coverage"><div className="coverageCopy"><span className="sectionKicker">CURRENT COVERAGE</span><h2>Which sources does ClearCheck check?</h2><p>Every search records what completed, what requires review and the dataset reference used. Current availability is confirmed again when a screening runs.</p><ol className="coverageSteps"><li><b>1</b><span>Enter the fullest legal name and available identifiers</span></li><li><b>2</b><span>Review identifiers and official evidence</span></li><li><b>3</b><span>Record a human disposition</span></li></ol></div><div className="coverageList"><div><span className="sourceBadge eu">EU</span><div><strong>European Union sanctions</strong><p>Consolidated financial sanctions and Official Journal designations.</p></div><b>MONITORED</b></div><div><span className="sourceBadge un">UN</span><div><strong>United Nations sanctions</strong><p>The UN Security Council Consolidated List, including names and aliases.</p></div><b>MONITORED</b></div><div><span className="sourceBadge mt">MT</span><div><strong>Malta court orders</strong><p>Freezing, seizure and related orders published by the Asset Recovery Bureau.</p></div><b>MONITORED</b></div><div><span className="sourceBadge web">WEB</span><div><strong>Web intelligence</strong><p>Focused external searches prepared for a reviewer; results are not embedded or treated as official data.</p></div><b>REVIEW</b></div></div></section>
      <section className="industrySection" id="industries"><div className="sectionIntro"><span className="sectionKicker">BUILT FOR OBLIGED ENTITIES</span><h2>Sanctions and public-record screening<br/>for teams that need clarity.</h2><p>ClearCheck does not currently provide politically exposed person (PEP) database coverage or a complete AML risk assessment.</p></div><div className="industryGrid"><article><span>FS</span><h3>Financial services</h3><p>Support onboarding and periodic customer reviews.</p></article><article><span>LN</span><h3>Legal &amp; notarial</h3><p>Document checks on clients and transaction parties.</p></article><article><span>RE</span><h3>Real estate</h3><p>Screen buyers, sellers and connected parties.</p></article><article><span>GP</span><h3>Gaming &amp; payments</h3><p>Identify potential sanctions exposure for escalation.</p></article></div></section>
      <section className="pricingSection" id="pricing"><div><span className="sectionKicker">FLEXIBLE SCREENING</span><h2>Beta credits and<br/>plan previews.</h2><p>New private-beta workspaces receive 25 complimentary credits. Prices below are previews. Beta checkout is for testing and does not take live payments.</p></div><div className="publicPricing">{publicPlans.length?publicPlans.map(plan=><article key={plan.id}><span>{plan.billing_mode.toUpperCase()}</span><h3>{plan.name}</h3><strong>€{(plan.price_cents/100).toFixed(2)}{plan.interval_name==="month"?<small>/month</small>:null}</strong><p>{plan.credits?`${plan.credits} screening credit${plan.credits===1?"":"s"}. `:""}{plan.description}</p></article>):<div className="betaCard"><span>EARLY ACCESS</span><strong>25</strong><small>complimentary credits per new workspace</small><a href="/register">Create your workspace <span>→</span></a></div>}</div></section>
      <section className="finalCta"><h2>Ready to screen a client?</h2><a href="/login?returnTo=/screening">Log in to run screening <span>→</span></a></section>
      <Footer/>
  </main>;
}

function Footer(){return <footer className="dashboardFooter"><span>© 2026 ClearCheck <small>Private beta · Operator identity pending launch approval</small></span><div><a href="/providers">Data sources</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a><a href="/terms#refunds">Refunds</a><a href="/terms">Terms</a><a href="/security">Security</a></div></footer>}
