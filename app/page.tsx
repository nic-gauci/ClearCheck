"use client";

import { FormEvent, useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import type { User } from "@supabase/supabase-js";
import AppHeader from "./AppHeader";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { SavedScreening } from "./lib/screening";

type Result = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string; aliases?:string[];dateOfBirth?:string;nationalities?:string[];identificationNumbers?:string[];matchReason?:string;legalBasis?:string };
type SourceStatus = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string;sourceUrl?:string;version?:string;lastUpdated?:string;licence?:string };
type WebSearch = { term:string; label:string; query:string; href:string };

export default function Home(){
  const [subjectType,setSubjectType]=useState<"person"|"business">("person");
  const [screenedType,setScreenedType]=useState<"person"|"business">("person");
  const [query,setQuery]=useState("");
  const [screened,setScreened]=useState("");
  const [results,setResults]=useState<Result[]>([]);
  const [sources,setSources]=useState<SourceStatus[]>([]);
  const [webSearches,setWebSearches]=useState<WebSearch[]>([]);
  const [activeWeb,setActiveWeb]=useState(0);
  const [webExpanded,setWebExpanded]=useState(false);
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);
  const [error,setError]=useState("");
  const [caseRef,setCaseRef]=useState("");
  const [checkedAt,setCheckedAt]=useState("");
  const [screeningId,setScreeningId]=useState("");
  const [user,setUser]=useState<User|null>(null);
  const [authReady,setAuthReady]=useState(false);

  function openSaved(record:SavedScreening){
    setScreeningId(record.id);setScreened(record.subject_name);setQuery(record.subject_name);setScreenedType(record.subject_type);setResults(record.results||[]);setSources(record.sources||[]);setWebSearches(record.web_searches||[]);setActiveWeb(0);setWebExpanded(false);setCheckedAt(record.checked_at);setCaseRef(record.case_reference);setSearched(true);
  }

  useEffect(()=>{
    const supabase=getSupabaseBrowserClient();
    let active=true;
    supabase.auth.getUser().then(async({data})=>{
      if(!active)return;
      setUser(data.user);setAuthReady(true);
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
      const response=await fetch(`/api/screen?q=${encodeURIComponent(clean)}&type=${subjectType}`,{headers:{Authorization:`Bearer ${session.access_token}`}});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Screening could not be completed.");
      const stamp=data.checkedAt||new Date().toISOString();
      setScreeningId(data.screeningId);setScreened(clean);setScreenedType(subjectType);setResults(data.matches||[]);setSources(data.sources||[]);setWebSearches(data.webSearches||[]);setActiveWeb(0);setWebExpanded(false);setCheckedAt(stamp);setCaseRef(data.caseReference);setSearched(true);
      window.history.replaceState({},"",`/?screening=${encodeURIComponent(data.screeningId)}`);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(err){setError(err instanceof Error?err.message:"Screening could not be completed.")}
    finally{setLoading(false)}
  }

  function goHome(){setSearched(false);setQuery("");setError("");window.history.replaceState({},"","/");window.scrollTo({top:0,behavior:"smooth"})}

  const incomplete=sources.some(s=>s.status==="unavailable");
  const completed=sources.filter(s=>s.status==="complete").length;
  const officialSourceTotal=sources.filter(s=>s.key!=="WEB").length;
  const resultState=incomplete?"incomplete":results.length?"potential":"review";
  const resultTitle=incomplete?"Screening incomplete":results.length?"Potential match":"No official-list matches";

  async function exportReport(){
    if(screeningId){
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      const response=await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({screeningId})});
      if(!response.ok){setError("The report audit event could not be saved. Please try again.");return}
    }
    const pdf=new jsPDF({unit:"mm",format:"a4"});
    const pageW=210,pageH=297,margin=18,contentW=pageW-margin*2;
    const ink:[number,number,number]=[20,45,44],green:[number,number,number]=[20,103,79],orange:[number,number,number]=[190,88,43],muted:[number,number,number]=[94,113,108];
    let y=18,page=1;
    const footer=()=>{pdf.setDrawColor(218,226,222);pdf.line(margin,pageH-15,pageW-margin,pageH-15);pdf.setFont("helvetica","normal");pdf.setFontSize(7);pdf.setTextColor(...muted);pdf.text("ClearCheck - Independent AML screening report",margin,pageH-9);pdf.text(`Page ${page}`,pageW-margin,pageH-9,{align:"right"})};
    const newPage=()=>{footer();pdf.addPage();page++;y=18};
    const ensure=(height:number)=>{if(y+height>pageH-22)newPage()};
    const label=(text:string)=>{pdf.setFont("helvetica","bold");pdf.setFontSize(7);pdf.setTextColor(...green);pdf.text(text.toUpperCase(),margin,y);y+=5};
    const heading=(text:string,size=16)=>{ensure(size/2+8);pdf.setFont("helvetica","bold");pdf.setFontSize(size);pdf.setTextColor(...ink);pdf.text(text,margin,y);y+=size*.48+4};
    const paragraph=(text:string,size=9,color=muted)=>{pdf.setFont("helvetica","normal");pdf.setFontSize(size);pdf.setTextColor(...color);const lines=pdf.splitTextToSize(text,contentW);ensure(lines.length*4.3);pdf.text(lines,margin,y);y+=lines.length*4.3+3};
    pdf.setFillColor(...ink);pdf.rect(0,0,pageW,48,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(22);pdf.text("ClearCheck",margin,20);pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(179,207,197);pdf.text("AML & SANCTIONS SCREENING REPORT",margin,29);pdf.setFontSize(8);pdf.text(caseRef,pageW-margin,20,{align:"right"});pdf.text(new Date(checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}),pageW-margin,27,{align:"right"});y=61;
    label("Screened subject");heading(screened,21);paragraph(`Case reference: ${caseRef}   |   Search type: Name-only screening   |   Generated: ${new Date().toLocaleString("en-GB")}`,8);
    const reportStatus=incomplete?"INCOMPLETE - SOURCE UNAVAILABLE":results.length?"POTENTIAL MATCHES - REVIEW REQUIRED":"NO LIST MATCHES - WEB REVIEW REQUIRED";
    ensure(24);pdf.setFillColor(...(incomplete||results.length?orange:green));pdf.roundedRect(margin,y,contentW,19,2,2,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(11);pdf.text(reportStatus,margin+6,y+8);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.text(`${completed}/${officialSourceTotal} live lists completed | ${results.length} potential list match${results.length===1?"":"es"}`,margin+6,y+14);y+=28;
    label("Source checks");heading("Screening coverage",15);
    sources.forEach(source=>{ensure(15);pdf.setDrawColor(220,227,223);pdf.setFillColor(249,249,246);pdf.roundedRect(margin,y,contentW,13,1,1,"FD");pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.setTextColor(...ink);pdf.text(`${source.key}  ${source.name}`,margin+4,y+5.5);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.setTextColor(...muted);const detail=source.status==="complete"?`${source.count} match${source.count===1?"":"es"} - checked ${new Date(source.checkedAt).toLocaleString("en-GB")}${source.lastUpdated?` - source update ${source.lastUpdated}`:""}${source.version?` - version ${source.version.slice(0,12)}`:""}`:source.message||source.status;pdf.text(pdf.splitTextToSize(detail,contentW-42).slice(0,1),margin+4,y+10);pdf.setFont("helvetica","bold");pdf.setTextColor(...(source.status==="complete"?green:orange));pdf.text(source.status.toUpperCase(),pageW-margin-4,y+7.5,{align:"right"});y+=16});y+=4;
    label("Official-list findings");heading(results.length?`${results.length} potential match${results.length===1?"":"es"}`:"No potential matches",15);
    if(!results.length)paragraph("No matching names were identified in the EU consolidated sanctions file, UN Security Council Consolidated List or Malta Asset Recovery Bureau court-order results at the time of this search.");
    results.forEach((result,index)=>{ensure(32);pdf.setDrawColor(227,216,205);pdf.setFillColor(255,250,246);pdf.roundedRect(margin,y,contentW,27,1,1,"FD");pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.setTextColor(...ink);pdf.text(`${index+1}. ${result.name}`,margin+4,y+6);pdf.setTextColor(...orange);pdf.text(`${result.confidence}% name match`,pageW-margin-4,y+6,{align:"right"});pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.setTextColor(...muted);pdf.text(`${result.source} | ${result.type}${result.meta.length?` | ${result.meta.join(" | ")}`:""}`,margin+4,y+12);const detail=pdf.splitTextToSize(result.detail,contentW-8).slice(0,2);pdf.text(detail,margin+4,y+17);pdf.setTextColor(32,91,127);pdf.textWithLink("Open official evidence",margin+4,y+24,{url:result.href});y+=31});y+=4;
    ensure(85);label("Web intelligence");heading("Focused review searches",15);paragraph("The following searches were prepared for adverse-media review. Google results are dynamic and were not copied into this PDF. Review relevant pages in ClearCheck and retain supporting evidence separately.");
    webSearches.forEach((search,index)=>{ensure(11);pdf.setFont("helvetica","bold");pdf.setFontSize(8.5);pdf.setTextColor(...ink);pdf.text(`${index+1}. ${search.label}`,margin,y);pdf.setFont("helvetica","normal");pdf.setTextColor(...muted);pdf.text(search.query,margin+38,y);y+=7});y+=5;
    label("Important notice");paragraph("This report records an automated name-only screening and is not a legal determination or proof of wrongdoing. Similar names may refer to different people. Verify potential matches using date of birth, nationality, identification numbers, addresses and the linked official evidence. A result can change when source data is updated.",8.5,ink);
    footer();
    pdf.setProperties({title:`ClearCheck report - ${screened}`,subject:"AML and sanctions name-screening report",author:"ClearCheck",keywords:"AML, sanctions, screening"});
    pdf.save(`ClearCheck-${caseRef}.pdf`);
  }

  if(!searched){
    return <main className="homePage">
      <AppHeader variant="public" onHome={goHome}/>
      <section className="kycHero" id="top">
        <div className="heroGlow heroGlowOne"/><div className="heroGlow heroGlowTwo"/>
        <div className="kycHeroInner">
          <div className="heroCopy">
            <span className="heroPill"><i/> LIVE AML SCREENING FOR MALTA &amp; THE EU</span>
            <h1>Compliance checks<br/>without the <em>complexity.</em></h1>
            <p>Screen people and businesses across official sanctions, Maltese court orders and focused web intelligence—in one clear, evidence-linked report.</p>
            <div className="heroBenefits"><span><b>✓</b> Live source checks</span><span><b>✓</b> Official evidence links</span><span><b>✓</b> Downloadable PDF report</span></div>
            <div className="heroProof"><span>Built for</span><strong>Financial services</strong><strong>Legal teams</strong><strong>Real estate</strong><strong>Gaming</strong></div>
          </div>
          <div className="screenCard" id="screen">
            <div className="screenCardHead"><div><span>INSTANT SCREENING</span><h2>Run an AML check</h2></div><span className="liveBadge"><i/> Sources live</span></div>
            <div className="typeTabs" role="tablist" aria-label="Subject type"><button type="button" className={subjectType==="person"?"active":""} onClick={()=>setSubjectType("person")}><span>●</span> Person</button><button type="button" className={subjectType==="business"?"active":""} onClick={()=>setSubjectType("business")}><span>◆</span> Business</button></div>
            <form className="kycSearch" onSubmit={screen}>
              <label>{subjectType==="person"?"Full legal name":"Registered business name"}<div><span>⌕</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} aria-label={subjectType==="person"?"Full legal name":"Registered business name"} placeholder={subjectType==="person"?"e.g. Alina Juc":"e.g. Example Holdings Ltd"}/></div></label>
              <button type="submit" disabled={loading||!authReady}>{loading?"Checking every source…":user?"Run screening":"Log in to run screening"}<span>→</span></button>
            </form>
            <div className="screenCardMeta"><span><b>PRIVATE BETA</b> New accounts include 25 credits</span><span>Usually 20–40 seconds</span></div>
            {loading&&<div className="screenProgress"><i/><span>Checking EU, UN, Malta and web-intelligence sources…</span></div>}
            {error&&<div className="searchError">{error}</div>}
          </div>
        </div>
      </section>
      <section className="platformSection" id="platform">
        <div className="sectionIntro"><span className="sectionKicker">THE CLEARCHECK PLATFORM</span><h2>From a name to a documented<br/><em>compliance decision.</em></h2><p>ClearCheck brings fragmented public sources into a focused review workflow, helping small compliance teams move quickly without losing the evidence trail.</p></div>
        <div className="platformGrid">
          <article className="featurePrimary"><span className="featureIcon">◎</span><small>SCREENING</small><h3>One search across multiple risk sources</h3><p>Check a person or business against EU and UN sanctions, Malta Asset Recovery Bureau court orders and the latest EU Official Journal designations.</p><div className="miniResult"><span className="miniAvatar">AJ</span><div><small>POTENTIAL MATCH</small><strong>Alina JUC</strong><span>EU restrictive measures · 100% name match</span></div><b>Review →</b></div></article>
          <article><span className="featureIcon">⌁</span><small>EVIDENCE</small><h3>Official links beside every match</h3><p>Move directly from a result to EUR-Lex, the UN list or the Maltese court-order record.</p></article>
          <article><span className="featureIcon">↓</span><small>REPORTING</small><h3>Audit-ready PDF reports</h3><p>Save the case reference, time checked, source status, matches and review guidance.</p></article>
          <article><span className="featureIcon">⌕</span><small>WEB INTELLIGENCE</small><h3>Focused adverse-media review</h3><p>Review searches for fraud, eCourts, money laundering and financial crime without visiting each source manually.</p></article>
          <article><span className="featureIcon">◫</span><small>TRACEABILITY</small><h3>Source-by-source status</h3><p>See when a source completed, returned matches or was unavailable—never mistake an incomplete check for a clear result.</p></article>
        </div>
      </section>
      <section className="coverageSection" id="coverage"><div className="coverageCopy"><span className="sectionKicker">CURRENT COVERAGE</span><h2>The right sources,<br/>checked together.</h2><p>Every search runs against the same defined coverage, so reviewers can see what was checked and what still needs human judgement.</p><ol className="coverageSteps"><li><b>1</b><span>Enter the fullest legal name</span></li><li><b>2</b><span>Review identifiers and evidence</span></li><li><b>3</b><span>Save the audit report</span></li></ol></div><div className="coverageList"><div><span className="sourceBadge eu">EU</span><div><strong>European Union sanctions</strong><p>Consolidated financial sanctions, the EU Sanctions Tracker and new Official Journal designations.</p></div><b>LIVE</b></div><div><span className="sourceBadge un">UN</span><div><strong>United Nations sanctions</strong><p>The UN Security Council Consolidated List, including names and aliases.</p></div><b>LIVE</b></div><div><span className="sourceBadge mt">MT</span><div><strong>Malta court orders</strong><p>Freezing, seizure and related orders published by the Asset Recovery Bureau.</p></div><b>LIVE</b></div><div><span className="sourceBadge web">WEB</span><div><strong>Web intelligence</strong><p>Four structured Google reviews for relevant adverse-media indicators.</p></div><b>REVIEW</b></div></div></section>
      <section className="industrySection" id="industries"><div className="sectionIntro"><span className="sectionKicker">BUILT FOR OBLIGED ENTITIES</span><h2>AML screening for teams<br/>that need clarity.</h2></div><div className="industryGrid"><article><span>₿</span><h3>Financial services</h3><p>Support onboarding and periodic customer reviews.</p></article><article><span>§</span><h3>Legal &amp; notarial</h3><p>Document checks on clients and transaction parties.</p></article><article><span>⌂</span><h3>Real estate</h3><p>Screen buyers, sellers and connected parties.</p></article><article><span>♢</span><h3>Gaming &amp; payments</h3><p>Identify potential sanctions exposure for escalation.</p></article></div></section>
      <section className="pricingSection" id="pricing"><div><span className="sectionKicker">FLEXIBLE SCREENING</span><h2>Start with 25<br/>screening credits.</h2><p>Create a secure organisation workspace, save every result, reopen screening history and regenerate audit reports. Choose individual checks, credit bundles or monthly plans from your account whenever you are ready.</p></div><div className="betaCard"><span>EARLY ACCESS</span><strong>25</strong><small>complimentary credits per new workspace</small><ul><li>Organisation-scoped screening history</li><li>Official evidence links</li><li>Web-intelligence review</li><li>Repeatable PDF audit reports</li></ul><a href="/register">Create your workspace <span>→</span></a></div></section>
      <section className="finalCta"><span>START WITH A NAME</span><h2>Make the next compliance check<br/>your clearest one yet.</h2><a href="#screen">Run an AML screening <span>→</span></a></section>
      <Footer/>
    </main>
  }

  return <main className="reportPage">
    <AppHeader variant="authenticated" onHome={goHome}/>
    <section className={`resultHero ${resultState}`}>
      <div className="resultHeroInner">
        <div className="resultIdentity"><div className="resultStateLine"><span className="resultEyebrow">SCREENING RESULT</span><span className="resultStateBadge"><i/>{resultTitle}</span></div><h1>{screened}</h1><div className="resultMeta"><span>{caseRef}</span><span>{screenedType==="person"?"Person":"Business or organisation"}</span><span>Checked {new Date(checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"})}</span></div></div>
        <div className="resultActions"><button className="anotherScreening" onClick={goHome}>Run another screening</button><button className="export" onClick={exportReport}>Download PDF <span>↓</span></button></div>
        <div className="resultMetrics"><article><small>OFFICIAL SOURCES</small><strong>{completed}<span>/{officialSourceTotal}</span></strong><p>{completed===officialSourceTotal?"All available sources checked":"Coverage is incomplete"}</p></article><article><small>POTENTIAL MATCHES</small><strong>{results.length}</strong><p>{results.length?"Manual comparison required":"No official-list names found"}</p></article><article><small>NEXT STEP</small><strong className="wordMetric">{incomplete?"Retry":results.length?"Review":"Web review"}</strong><p>{incomplete?"Complete every official source":results.length?"Compare identity details":"Complete adverse-media checks"}</p></article></div>
      </div>
    </section>
    <section className="resultCanvas"><div className="resultContent">
      {error&&<div className="searchError">{error}</div>}
      <section className={`decisionPanel ${resultState}`}><div className="decisionIcon">{incomplete?"!":results.length?"!":"✓"}</div><div><span className="panelKicker">ASSESSMENT</span><h2>{incomplete?"Do not treat this result as clear":results.length?"Potential match — manual review required":"Official lists checked — continue review"}</h2><p>{incomplete?"At least one official source could not be checked. Retry the screening before making a compliance decision.":results.length?"A similar name was found. Compare dates of birth, nationality, identification details and the linked legal evidence before deciding whether it is the same subject.":"No matching names were found on the available official lists. Complete the web-intelligence review before closing the case."}</p></div><span className="decisionTag">{incomplete?"INCOMPLETE":results.length?`${results.length} TO REVIEW`:"WEB REVIEW"}</span></section>

      <section className="resultSection sourceSection"><div className="resultSectionHead"><div><span className="panelKicker">SOURCE COVERAGE</span><h2>What was checked</h2></div><p>Each source keeps its own status, checked time and dataset information.</p></div><div className="sourceReport">{sources.map(s=><article className={s.status} key={s.key}><div className="sourceCardTop"><span className={`sourceBadge ${s.key.toLowerCase()}`}>{s.key}</span><span className="sourceStatus"><i/>{s.status==="complete"?"Checked":s.status==="review"?"Manual review":"Unavailable"}</span></div><h3>{s.name}</h3><p>{s.status==="complete"?`${s.count} potential match${s.count===1?"":"es"}`:s.message||"Could not be checked"}</p><dl><div><dt>Checked</dt><dd>{new Date(s.checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"})}</dd></div>{s.lastUpdated&&<div><dt>Source updated</dt><dd>{new Date(s.lastUpdated).toLocaleDateString("en-GB")}</dd></div>}{s.version&&<div><dt>Dataset version</dt><dd>{s.version.slice(0,12)}</dd></div>}</dl></article>)}</div></section>

      <section className="resultSection findingsSection"><div className="resultSectionHead"><div><span className="panelKicker">OFFICIAL-LIST FINDINGS</span><h2>{results.length?`${results.length} potential match${results.length===1?"":"es"}`:"No potential matches"}</h2></div><p>{results.length?"Similarity is not proof of identity.":"Alternative spellings may still require review."}</p></div>{results.length>0?<div className="matches">{results.map((r,i)=><article className="match" key={`${r.source}-${i}`}><div className="matchTop"><span className={`sourceBadge ${r.sourceClass}`}>{r.source}</span><div><span className="matchNumber">POTENTIAL MATCH {String(i+1).padStart(2,"0")}</span><h3>{r.name}</h3><p>{r.type}{r.matchReason?` · ${r.matchReason} name match`:""}</p></div><div className="confidence"><strong>{r.confidence}%</strong><small>NAME SIMILARITY</small></div></div><p className="matchDetail">{r.detail}</p>{(r.aliases?.length||r.dateOfBirth||r.nationalities?.length||r.identificationNumbers?.length)&&<div className="identifierGrid">{r.aliases?.length&&<div><small>ALIASES</small><strong>{r.aliases.join(", ")}</strong></div>}{r.dateOfBirth&&<div><small>DATE OF BIRTH</small><strong>{r.dateOfBirth}</strong></div>}{r.nationalities?.length&&<div><small>NATIONALITY</small><strong>{r.nationalities.join(", ")}</strong></div>}{r.identificationNumbers?.length&&<div><small>IDENTIFICATION</small><strong>{r.identificationNumbers.join(", ")}</strong></div>}</div>}<div className="chips">{r.meta.map((m,j)=><span key={`${m}-${j}`}>{m}</span>)}</div><div className="matchFooter"><span>{r.legalBasis||"Official publisher evidence"}</span><a href={r.href} target="_blank" rel="noreferrer">Open official evidence <span>↗</span></a></div></article>)}</div>:<div className="emptyResult"><span className="emptyResultIcon">✓</span><div><h3>No official-list names matched</h3><p>Continue with the web-intelligence review and consider alternative spellings where appropriate.</p></div></div>}</section>

      {webSearches.length>0&&<section className="resultSection webSection"><div className={`webChecks ${webExpanded?"expanded":""}`}><button type="button" className="webToggle" aria-expanded={webExpanded} aria-controls="web-intelligence-panel" onClick={()=>setWebExpanded(open=>!open)}><span><small className="panelKicker">MANUAL REVIEW</small><strong>Web intelligence</strong><em>Four focused searches for adverse-media indicators</em></span><b>{webExpanded?"Hide searches":"Review searches"}<i aria-hidden="true">⌄</i></b></button>{webExpanded&&<div className="webPanel" id="web-intelligence-panel"><div className="webTabs" role="tablist" aria-label="Web screening searches">{webSearches.map((w,i)=><button type="button" role="tab" aria-selected={activeWeb===i} className={activeWeb===i?"active":""} onClick={()=>setActiveWeb(i)} key={w.term}><span>G</span><div><strong>{w.label}</strong><small>{w.query}</small></div></button>)}</div><div className="googleFrames">{webSearches.map((w,i)=><iframe className={activeWeb===i?"active":""} src={w.href} title={`Google results for ${w.query}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" key={w.term}/>)}</div><p className="webNote">Live results may concern another person with the same name and are not proof of wrongdoing. Google controls its own robot checks.</p></div>}</div></section>}
      <div className="resultNotice"><span>i</span><p><strong>ClearCheck supports human review; it does not make a legal determination.</strong> Verify potential matches using official evidence and reliable identifiers before taking action.</p></div>
    </div>
    </section>
    <Footer/>
  </main>
}

function Footer(){return <footer className="dashboardFooter"><span>© 2026 ClearCheck</span><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security">Security</a></div></footer>}
