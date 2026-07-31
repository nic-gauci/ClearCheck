"use client";

import { FormEvent, useState } from "react";
import { jsPDF } from "jspdf";

type Result = { source:string; sourceClass:string; name:string; type:string; confidence:number; detail:string; meta:string[]; href:string };
type SourceStatus = { key:string; name:string; status:"complete"|"unavailable"|"review"; count:number; checkedAt:string; message?:string; dataDate?:string };
type WebSearch = { term:string; label:string; query:string; href:string };

export default function Home(){
  const [query,setQuery]=useState("");
  const [screened,setScreened]=useState("");
  const [results,setResults]=useState<Result[]>([]);
  const [sources,setSources]=useState<SourceStatus[]>([]);
  const [webSearches,setWebSearches]=useState<WebSearch[]>([]);
  const [activeWeb,setActiveWeb]=useState(0);
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
      setScreened(clean);setResults(data.matches||[]);setSources(data.sources||[]);setWebSearches(data.webSearches||[]);setActiveWeb(0);setCheckedAt(stamp);setCaseRef(`CC-${dateCode}-${randomCode}`);setSearched(true);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(err){setError(err instanceof Error?err.message:"Screening could not be completed.")}
    finally{setLoading(false)}
  }

  function goHome(){setSearched(false);setQuery("");setError("");window.scrollTo({top:0,behavior:"smooth"})}

  const initials=screened.split(/\s+/).slice(0,2).map(n=>n[0]).join("").toUpperCase();
  const incomplete=sources.some(s=>s.status==="unavailable");
  const officialReview=sources.some(s=>s.key!=="WEB"&&s.status==="review");
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
    const reportStatus=incomplete?"INCOMPLETE - SOURCE UNAVAILABLE":results.length?"POTENTIAL MATCHES - REVIEW REQUIRED":officialReview?"SOURCE UPDATE REVIEW REQUIRED":"NO LIST MATCHES - WEB REVIEW REQUIRED";
    ensure(24);pdf.setFillColor(...(incomplete||results.length||officialReview?orange:green));pdf.roundedRect(margin,y,contentW,19,2,2,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(11);pdf.text(reportStatus,margin+6,y+8);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.text(`${completed}/3 live lists completed | ${results.length} potential list match${results.length===1?"":"es"}`,margin+6,y+14);y+=28;
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
      <Header onHome={goHome}/>
      <section className="homeHero" id="top">
        <div className="homeHeroInner">
          <div className="eyebrow">ONE SEARCH · MULTIPLE AML SOURCES</div>
          <h1>Know who you’re<br/><em>doing business with.</em></h1>
          <p>Screen a person or company against EU and UN sanctions, Maltese court orders, and focused web-intelligence searches—all from one place.</p>
          <form className="search homeSearch" onSubmit={screen}>
            <span className="searchIcon">⌕</span>
            <input autoFocus value={query} onChange={e=>setQuery(e.target.value)} aria-label="Person or company name" placeholder="Enter a full name or company name"/>
            <button type="submit" disabled={loading}>{loading?"Screening all sources…":"Screen this name"}<span>→</span></button>
          </form>
          <div className="homeHints"><span>Use the full legal name for the most accurate result</span><span>Results usually take 20–40 seconds</span></div>
          {loading&&<div className="screenProgress"><i/><span>Checking EU sanctions, UN sanctions, Malta court orders and web intelligence…</span></div>}
          {error&&<div className="searchError">{error}</div>}
        </div>
      </section>
      <section className="homeInfo">
        <div className="infoIntro"><span className="overline">WHAT CLEARCHECK DOES</span><h2>One search. A clearer risk picture.</h2><p>ClearCheck brings fragmented public screening sources into one structured review. It helps you find potential matches quickly while keeping the official evidence close at hand.</p></div>
        <div className="infoCards">
          <article><span>01</span><h3>Official sanctions</h3><p>Checks current EU and United Nations consolidated sanctions data for matching names and aliases.</p></article>
          <article><span>02</span><h3>Malta court orders</h3><p>Searches the Asset Recovery Bureau register for freezing, seizing and related court orders.</p></article>
          <article><span>03</span><h3>Web intelligence</h3><p>Loads focused searches for fraud, eCourts, money laundering and financial crime mentions.</p></article>
        </div>
        <div className="trustStrip"><div><strong>Built for careful review</strong><span>Every potential match links back to its original source.</span></div><div><strong>No automatic accusations</strong><span>A similar name is a lead to verify, never proof of wrongdoing.</span></div><div><strong>Source-by-source status</strong><span>You can see if any source was unavailable during a search.</span></div></div>
      </section>
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
        <div className={`decision ${results.length||incomplete||webReview?"review":"clear"}`}><div className="decisionIcon">{results.length||incomplete||webReview?"!":"✓"}</div><div><strong>{incomplete?"Screening incomplete":results.length?"Potential match found":officialReview?"Official source update review required":"Web review required"}</strong><p>{incomplete?"At least one source could not be checked. Do not treat this result as clear.":results.length?"Review the official matches and web searches below.":officialReview?"The latest EU file is older than 72 hours. Check newer Official Journal listings before clearing this case.":"No list matches found. Review the web-intelligence searches below before closing the case."}</p></div><span className="decisionTag">{incomplete?"INCOMPLETE":results.length?`${results.length} MATCHES`:officialReview?"SOURCE REVIEW":"WEB REVIEW"}</span></div>
        <div className="summaryGrid"><div className="identity"><span className="initials">{initials}</span><div><small>SCREENED NAME</small><strong>{screened}</strong><span>Person or entity</span></div></div><div className="stat"><small>LIVE LISTS CHECKED</small><strong>{completed} <span>/ 3</span></strong><i>{completed===3?"Complete":"Not complete"}</i></div><div className="stat"><small>LIST MATCHES</small><strong>{results.length}</strong><i>{results.length?"Needs review":"None found"}</i></div></div>
        <div className="sourceReport">{sources.map(s=><div className={s.status} key={s.key}><span className={`sourceBadge ${s.key.toLowerCase()}`}>{s.key}</span><div><strong>{s.name}</strong><small>{s.status==="complete"?`${s.count} match${s.count===1?"":"es"} · checked ${new Date(s.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:s.message||"Could not be checked"}</small></div><b>{s.status==="complete"?"✓":s.status==="review"?"↗":"!"}</b></div>)}</div>
        {results.length>0?<div className="matches"><div className="sectionLine"><strong>Potential official-list matches</strong><span>Similarity is not proof of identity</span></div>{results.map((r,i)=><article className="match" key={`${r.source}-${i}`}><div className="matchTop"><span className={`sourceBadge ${r.sourceClass}`}>{r.source}</span><div><h3>{r.name}</h3><span>{r.type}</span></div><div className="confidence"><strong>{r.confidence}%</strong><small>NAME MATCH</small></div></div><p>{r.detail}</p><div className="chips">{r.meta.map((m,j)=><span key={`${m}-${j}`}>{m}</span>)}</div><a href={r.href} target="_blank" rel="noreferrer">Open official evidence <span>↗</span></a></article>)}</div>:<div className="empty"><span className="emptyIcon">⌕</span><div><h3>No official-list matches found</h3><p>Continue with the web-intelligence review below. Try alternative spellings where appropriate.</p></div></div>}
        {webSearches.length>0&&<div className="webChecks"><div className="sectionLine"><strong>Web intelligence</strong><span>Four focused searches loaded in this report</span></div><div className="webTabs" role="tablist" aria-label="Web screening searches">{webSearches.map((w,i)=><button type="button" role="tab" aria-selected={activeWeb===i} className={activeWeb===i?"active":""} onClick={()=>setActiveWeb(i)} key={w.term}><span>G</span><div><strong>{w.label}</strong><small>{w.query}</small></div></button>)}</div><div className="googleFrames">{webSearches.map((w,i)=><iframe className={activeWeb===i?"active":""} src={w.href} title={`Google results for ${w.query}`} loading="eager" referrerPolicy="no-referrer-when-downgrade" key={w.term}/>)}</div><p className="webNote">Live search results may concern another person with the same name and are not proof of wrongdoing. Robot checks are controlled by Google and cannot be bypassed by ClearCheck.</p></div>}
        <div className="notice"><span>i</span><p><strong>Screening is a starting point, not a final decision.</strong> A clear list result does not guarantee that a person is not subject to restrictions. Verify possible matches using dates of birth, nationality, identification numbers and official evidence.</p></div>
      </div>
    </section>
    <Footer/>
  </main>
}

function Header({onHome}:{onHome:()=>void}){return <header className="topbar"><button className="brand brandButton" onClick={onHome} aria-label="ClearCheck home"><span className="brandMark">C</span><span>ClearCheck</span></button><div className="headerRight"><span className="sourceCount"><i/> AML screening workspace</span><span className="privateLabel">PRIVATE BETA</span></div></header>}
function Footer(){return <footer><span>ClearCheck</span><p>Independent screening workspace · Data belongs to the respective official publishers</p><div><span>AML screening</span><span>Private beta</span></div></footer>}
