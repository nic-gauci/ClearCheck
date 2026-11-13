"use client";

import { useState } from "react";
import Link from "next/link";
import AppHeader from "../AppHeader";
import { sampleScreening } from "../lib/sample-screening";

export default function SampleScreening(){
  const [incomplete,setIncomplete]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [error,setError]=useState("");
  const sample=sampleScreening(incomplete);

  async function download(){
    setExporting(true);setError("");
    try{
      const {downloadScreeningReport}=await import("../lib/report");
      downloadScreeningReport(sample);
    }catch{
      setError("The sample could not be downloaded. Please try again.");
    }finally{setExporting(false)}
  }

  return <main className="legalPage">
    <AppHeader variant="legal"/>
    <section className="sampleScreening">
      <h1>Sample screening result</h1>
      <p>These are fictional records. No screening was run and no credit is used.</p>
      <div className="sampleModes" aria-label="Sample scenarios">
        <button type="button" aria-pressed={!incomplete} onClick={()=>setIncomplete(false)}>Potential match</button>
        <button type="button" aria-pressed={incomplete} onClick={()=>setIncomplete(true)}>Incomplete check</button>
      </div>
      <article className="dashboardPanel">
        <h2>{sample.subject_name}</h2>
        <p>{incomplete?"No matches on the 2 official sources checked. European Union data was unavailable.":"One similar name was found. A reviewer must compare identifiers before making a decision."}</p>
        <ul>{sample.sources.map(source=><li key={source.key}>{source.name} · {source.status==="complete"?"Checked":"Unavailable"}</li>)}</ul>
        {!incomplete&&<p><strong>{sample.results[0].name}</strong> · 93% name similarity</p>}
        <button type="button" disabled={exporting} className="headerCta" onClick={download}>{exporting?"Preparing…":"Download sample PDF"}</button>
        {error&&<p role="alert">{error}</p>}
      </article>
      <Link href="/">Back to ClearCheck</Link>
    </section>
  </main>;
}
