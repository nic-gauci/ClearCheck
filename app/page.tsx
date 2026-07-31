"use client";

import { FormEvent, useState } from "react";
import { jsPDF } from "jspdf";
import AuthNav from "./AuthNav";

type Result = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string };
type SourceStatus = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string };
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

  async function screen(e:FormEvent){
    e.preventDefault();
    const clean=query.trim();
    if(!clean)return;
    setLoading(true);setError("");
    try{
      const response=await fetch(`/api/screen?q=${encodeURIComponent(clean)}`);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Screening could not be completed.");
      const stamp=data.checkedAt||new Date().toISOString();
      const dateCode=stamp.slice(0,10).replaceAll("-","");
      const randomCode=crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0,6).toUpperCase().padStart(6,"0");
      setScreened(clean);setScreenedType(subjectType);setResults(data.matches||[]);setSources(data.sources||[]);setWebSearches(data.webSearches||[]);setActiveWeb(0);setWebExpanded(false);setCheckedAt(stamp);setCaseRef(`CC-${dateCode}-${randomCode}`);setSearched(true);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(err){setError(err instanceof Error?err.message:"Screening could not be completed.")}
    finally{setLoading(false)}
  }

  function goHome(){setSearched(false);setQuery("");setError("");window.scrollTo({top:0,behavior:"smooth"})}

  const initials=screened.split(/\s+/).slice(0,2).map(n=>n[0]).join("").toUpperCase();
  const incomplete=sources.some(s=>s.status==="unavailable");
  const webReview=sources.some(s=>s.status==="review");
  const completed=sources.filter(s=>s.status==="complete").length;

  function exportReport(){
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
    ensure(24);pdf.setFillColor(...(incomplete||results.length?orange:green));pdf.roundedRect(margin,y,contentW,19,2,2,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(11);pdf.text(reportStatus,margin+6,y+8);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.text(`${completed}/3 live lists completed | ${results.length} potential list match${results.length===1?"":"es"}`,margin+6,y+14);y+=28;
    label("Source checks");heading("Screening coverage",15);
    sources.forEach(source=>{ensure(15);pdf.setDrawColor(220,227,223);pdf.setFillColor(249,249,246);pdf.roundedRect(margin,y,contentW,13,1,1,"FD");pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.setTextColor(...ink);pdf.text(`${source.key}  ${source.name}`,margin+4,y+5.5);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.setTextColor(...muted);const detail=source.status==="complete"?`${source.count} match${source.count===1?"":"es"} - completed ${new Date(source.checkedAt).toLocaleString("en-GB")}`:source.message||source.status;pdf.text(detail,margin+4,y+10);pdf.setFont("helvetica","bold");pdf.setTextColor(...(source.status==="complete"?green:orange));pdf.text(source.status.toUpperCase(),pageW-margin-4,y+7.5,{align:"right"});y+=16});y+=4;
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
      <Header onHome={goHome} showNav/>
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
              <button type="submit" disabled={loading}>{loading?"Checking every source…":"Run screening"}<span>→</span></button>
            </form>
            <div className="screenCardMeta"><span><b>PRIVATE BETA</b> No charge during testing</span><span>Usually 20–40 seconds</span></div>
            {loading&&<div className="screenProgress"><i/><span>Checking EU, UN, Malta and web-intelligence sources…</span></div>}
            {error&&<div className="searchError">{error}</div>}
          </div>
        </div>
      </section>
      <section className="metricBand"><div><strong>3</strong><span>official source groups checked</span></div><div><strong>4</strong><span>focused adverse-media searches</span></div><div><strong>1</strong><span>timestamped PDF audit report</span></div><div><strong>Live</strong><span>EU Official Journal coverage</span></div></section>
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
      <section className="coverageSection" id="coverage"><div className="coverageCopy"><span className="sectionKicker">CURRENT COVERAGE</span><h2>The right sources,<br/>checked together.</h2><p>Every search runs against the same defined coverage, so reviewers can see what was checked and what still needs human judgement.</p><a href="#screen">Start a screening <span>→</span></a></div><div className="coverageList"><div><span className="sourceBadge eu">EU</span><div><strong>European Union sanctions</strong><p>Consolidated financial sanctions, the EU Sanctions Tracker and new Official Journal designations.</p></div><b>LIVE</b></div><div><span className="sourceBadge un">UN</span><div><strong>United Nations sanctions</strong><p>The UN Security Council Consolidated List, including names and aliases.</p></div><b>LIVE</b></div><div><span className="sourceBadge mt">MT</span><div><strong>Malta court orders</strong><p>Freezing, seizure and related orders published by the Asset Recovery Bureau.</p></div><b>LIVE</b></div><div><span className="sourceBadge web">WEB</span><div><strong>Web intelligence</strong><p>Four structured Google reviews for relevant adverse-media indicators.</p></div><b>REVIEW</b></div></div></section>
      <section className="workflowSection"><div className="sectionIntro centered"><span className="sectionKicker">HOW IT WORKS</span><h2>A defensible check in three steps.</h2></div><div className="workflowGrid"><article><span>01</span><h3>Enter the legal name</h3><p>Choose a person or business and use the fullest known legal name.</p></article><article><span>02</span><h3>Review possible matches</h3><p>Compare aliases, birth details, programmes and official evidence.</p></article><article><span>03</span><h3>Save the audit record</h3><p>Download the timestamped PDF and retain your review evidence.</p></article></div></section>
      <section className="industrySection" id="industries"><div className="sectionIntro"><span className="sectionKicker">BUILT FOR OBLIGED ENTITIES</span><h2>AML screening for teams<br/>that need clarity.</h2></div><div className="industryGrid"><article><span>₿</span><h3>Financial services</h3><p>Support onboarding and periodic customer reviews.</p></article><article><span>§</span><h3>Legal &amp; notarial</h3><p>Document checks on clients and transaction parties.</p></article><article><span>⌂</span><h3>Real estate</h3><p>Screen buyers, sellers and connected parties.</p></article><article><span>♢</span><h3>Gaming &amp; payments</h3><p>Identify potential sanctions exposure for escalation.</p></article></div></section>
      <section className="pricingSection" id="pricing"><div><span className="sectionKicker">PRIVATE BETA</span><h2>Use ClearCheck free<br/>while we finish licensing.</h2><p>Searches are currently free for private testing. Paid single checks, bundles, accounts, saved history and monitoring will launch only after the required commercial data licences and payment controls are in place.</p></div><div className="betaCard"><span>EARLY ACCESS</span><strong>€0</strong><small>during private beta</small><ul><li>Live multi-source name screening</li><li>EU Official Journal supplement</li><li>Web-intelligence review</li><li>Downloadable PDF report</li></ul><a href="#screen">Run a free check <span>→</span></a></div></section>
      <section className="finalCta"><span>START WITH A NAME</span><h2>Make the next compliance check<br/>your clearest one yet.</h2><a href="#screen">Run an AML screening <span>→</span></a></section>
      <Footer/>
    </main>
  }

  return <main className="reportPage">
    <Header onHome={goHome}/>
    <section className="resultSearchBar">
      <form className="search compactSearch" onSubmit={screen}><span className="searchIcon">⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Person or company name"/><button type="submit" disabled={loading}>{loading?"Checking…":"New screening"}<span>→</span></button></form>
      {error&&<div className="searchError">{error}</div>}
    </section>
    <section className="workspace reportWorkspace">
      <div className="results">
        <div className="resultHead"><div><span className="overline">SCREENING RESULT</span><h2>{screened}</h2><small className="caseRef">{caseRef} · {new Date(checkedAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"})}</small></div><div className="resultActions"><button className="backHome" onClick={goHome}>← Home</button><button className="export" onClick={exportReport}>↓ &nbsp;Download PDF</button></div></div>
        <div className={`decision ${results.length||incomplete||webReview?"review":"clear"}`}><div className="decisionIcon">{results.length||incomplete||webReview?"!":"✓"}</div><div><strong>{incomplete?"Screening incomplete":results.length?"Potential match found":"Web review required"}</strong><p>{incomplete?"At least one source could not be checked. Do not treat this result as clear.":results.length?"Review the official matches and web searches below.":"No list matches found. Review the web-intelligence searches below before closing the case."}</p></div><span className="decisionTag">{incomplete?"INCOMPLETE":results.length?`${results.length} MATCHES`:"WEB REVIEW"}</span></div>
        <div className="summaryGrid"><div className="identity"><span className="initials">{initials}</span><div><small>SCREENED NAME</small><strong>{screened}</strong><span>{screenedType==="person"?"Person":"Business or organisation"}</span></div></div><div className="stat"><small>LIVE LISTS CHECKED</small><strong>{completed} <span>/ 3</span></strong><i>{completed===3?"Complete":"Not complete"}</i></div><div className="stat"><small>LIST MATCHES</small><strong>{results.length}</strong><i>{results.length?"Needs review":"None found"}</i></div></div>
        <div className="sourceReport">{sources.map(s=><div className={s.status} key={s.key}><span className={`sourceBadge ${s.key.toLowerCase()}`}>{s.key}</span><div><strong>{s.name}</strong><small>{s.status==="complete"?`${s.count} match${s.count===1?"":"es"} · checked ${new Date(s.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:s.message||"Could not be checked"}</small></div><b>{s.status==="complete"?"✓":s.status==="review"?"↗":"!"}</b></div>)}</div>
        {results.length>0?<div className="matches"><div className="sectionLine"><strong>Potential official-list matches</strong><span>Similarity is not proof of identity</span></div>{results.map((r,i)=><article className="match" key={`${r.source}-${i}`}><div className="matchTop"><span className={`sourceBadge ${r.sourceClass}`}>{r.source}</span><div><h3>{r.name}</h3><span>{r.type}</span></div><div className="confidence"><strong>{r.confidence}%</strong><small>NAME MATCH</small></div></div><p>{r.detail}</p><div className="chips">{r.meta.map((m,j)=><span key={`${m}-${j}`}>{m}</span>)}</div><a href={r.href} target="_blank" rel="noreferrer">Open official evidence <span>↗</span></a></article>)}</div>:<div className="empty"><span className="emptyIcon">⌕</span><div><h3>No official-list matches found</h3><p>Continue with the web-intelligence review below. Try alternative spellings where appropriate.</p></div></div>}
        {webSearches.length>0&&<div className={`webChecks ${webExpanded?"expanded":""}`}><button type="button" className="webToggle" aria-expanded={webExpanded} aria-controls="web-intelligence-panel" onClick={()=>setWebExpanded(open=>!open)}><span><strong>Web intelligence</strong><small>Four focused searches for adverse-media review</small></span><b>{webExpanded?"Hide web intelligence":"Show web intelligence"}<i aria-hidden="true">⌄</i></b></button>{webExpanded&&<div className="webPanel" id="web-intelligence-panel"><div className="webTabs" role="tablist" aria-label="Web screening searches">{webSearches.map((w,i)=><button type="button" role="tab" aria-selected={activeWeb===i} className={activeWeb===i?"active":""} onClick={()=>setActiveWeb(i)} key={w.term}><span>G</span><div><strong>{w.label}</strong><small>{w.query}</small></div></button>)}</div><div className="googleFrames">{webSearches.map((w,i)=><iframe className={activeWeb===i?"active":""} src={w.href} title={`Google results for ${w.query}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" key={w.term}/>)}</div><p className="webNote">Live search results may concern another person with the same name and are not proof of wrongdoing. Robot checks are controlled by Google and cannot be bypassed by ClearCheck.</p></div>}</div>}
        <div className="notice"><span>i</span><p><strong>Screening is a starting point, not a final decision.</strong> A clear list result does not guarantee that a person is not subject to restrictions. Verify possible matches using dates of birth, nationality, identification numbers and official evidence.</p></div>
      </div>
    </section>
    <Footer/>
  </main>
}

function Header({onHome,showNav=false}:{onHome:()=>void;showNav?:boolean}){return <header className="topbar"><button className="brand brandButton" onClick={onHome} aria-label="ClearCheck home"><span className="brandMark">C</span><span>ClearCheck</span></button>{showNav&&<nav aria-label="Main navigation"><a href="#platform">Platform</a><a href="#coverage">Coverage</a><a href="#industries">Industries</a><a href="#pricing">Pricing</a></nav>}<div className="headerRight">{!showNav&&<><span className="sourceCount"><i/> Sources online</span><span className="privateLabel">PRIVATE BETA</span></>}{showNav&&<AuthNav/>}</div></header>}
function Footer(){return <footer className="siteFooter"><div className="footerBrand"><span className="brandMark">C</span><div><strong>ClearCheck</strong><p>AML screening, made clear.</p></div></div><div className="footerLinks"><div><strong>Platform</strong><a href="#platform">Screening</a><a href="#coverage">Coverage</a><a href="#pricing">Pricing</a></div><div><strong>Use cases</strong><a href="#industries">Financial services</a><a href="#industries">Legal teams</a><a href="#industries">Real estate</a></div><div><strong>Important</strong><span>Private beta</span><span>Human review required</span><span>Not a legal determination</span></div></div><div className="footerBottom"><span>© 2026 ClearCheck</span><span>Independent screening workspace · Source data belongs to its respective publishers</span></div></footer>}
