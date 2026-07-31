"use client";

import { FormEvent, useState } from "react";

type Result = {
  source: string;
  sourceClass: string;
  name: string;
  type: string;
  confidence: number;
  detail: string;
  meta: string[];
  href: string;
};

const sourceLinks = [
  { key: "EU", name: "European Union", detail: "Financial sanctions", status: "Connected", href: "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions?locale=en" },
  { key: "UN", name: "United Nations", detail: "Security Council list", status: "Connected", href: "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list" },
  { key: "MT", name: "Malta ARB", detail: "Court orders", status: "Connected", href: "https://assetrecovery.mt/court-orders/" },
];

const examples: Record<string, Result[]> = {
  "justin zahra": [{
    source: "MT", sourceClass: "mt", name: "Justin Zahra", type: "Individual", confidence: 100,
    detail: "Name appears in a Malta Asset Recovery Bureau freezing order.",
    meta: ["Freezing order", "ARB/C030/2026", "27 Mar 2026"],
    href: "https://assetrecovery.mt/wp-content/uploads/2026/04/ARB_C030_2026-Freezing-Order-Justin-Zahra.pdf",
  }],
  "thomas gatt": [{
    source: "MT", sourceClass: "mt", name: "Thomas Gatt", type: "Individual", confidence: 100,
    detail: "Name appears in a Malta Asset Recovery Bureau seizing and freezing order.",
    meta: ["Seizing & freezing order", "ARB/C140/2025", "26 Nov 2025"],
    href: "https://assetrecovery.mt/wp-content/uploads/2026/03/ARB_C140_2025-Thomas-Gatt-Freezing-Order.pdf",
  }],
};

export default function Home() {
  const [query, setQuery] = useState("Mario Gauci");
  const [screened, setScreened] = useState("Mario Gauci");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  function screen(e: FormEvent) {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setLoading(true);
    window.setTimeout(() => {
      setScreened(clean);
      setResults(examples[clean.toLowerCase()] ?? []);
      setLoading(false);
    }, 650);
  }

  const initials = screened.split(/\s+/).slice(0, 2).map(n => n[0]).join("").toUpperCase();

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ClearCheck home"><span className="brandMark">C</span><span>ClearCheck</span></a>
        <div className="headerRight"><span className="sourceCount"><i /> 3 official sources mapped</span><button className="avatar" aria-label="Account">NG</button></div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">AML &amp; SANCTIONS SCREENING</div>
        <h1>Screen with clarity.<br/><em>Decide with confidence.</em></h1>
        <p className="intro">Search official EU, UN and Maltese records in one place. Every potential match comes with the source and evidence you need to review it.</p>
        <form className="search" onSubmit={screen}>
          <span className="searchIcon">⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Person or company name" placeholder="Enter a person or company name" />
          <button type="submit" disabled={loading}>{loading ? "Screening…" : "Run screening"}<span>→</span></button>
        </form>
        <div className="searchHints"><span>Search by full legal name for the best result</span><span>Checks all 3 sources at once</span></div>
      </section>

      <section className="workspace">
        <aside>
          <div className="sideTitle"><span>OFFICIAL SOURCES</span><span>{sourceLinks.length}</span></div>
          {sourceLinks.map(s => (
            <a className="source" href={s.href} target="_blank" rel="noreferrer" key={s.key}>
              <span className={`sourceBadge ${s.key.toLowerCase()}`}>{s.key}</span>
              <span className="sourceText"><strong>{s.name}</strong><small>{s.detail}</small></span>
              <span className="tick">✓</span>
            </a>
          ))}
          <div className="updated"><span>↻</span><div><strong>Prototype connectors</strong><small>Live ingestion is the next build phase</small></div></div>
        </aside>

        <div className="results">
          <div className="resultHead">
            <div><span className="overline">SCREENING RESULT</span><h2>{screened}</h2></div>
            <button className="export" onClick={() => window.print()}>↓ &nbsp;Export report</button>
          </div>

          <div className={`decision ${results.length ? "review" : "clear"}`}>
            <div className="decisionIcon">{results.length ? "!" : "✓"}</div>
            <div><strong>{results.length ? "Potential demo match found" : "No demo matches found"}</strong><p>{results.length ? "Review the linked official evidence before making a decision." : "No matching record exists in this prototype’s small demonstration dataset."}</p></div>
            <span className="decisionTag">{results.length ? `${results.length} REVIEW` : "CLEAR"}</span>
          </div>

          <div className="summaryGrid">
            <div className="identity"><span className="initials">{initials}</span><div><small>SCREENED NAME</small><strong>{screened}</strong><span>Person or entity</span></div></div>
            <div className="stat"><small>SOURCES MAPPED</small><strong>3 <span>/ 3</span></strong><i>Prototype</i></div>
            <div className="stat"><small>POTENTIAL MATCHES</small><strong>{results.length}</strong><i>{results.length ? "Needs review" : "None found"}</i></div>
          </div>

          {results.length > 0 ? (
            <div className="matches">
              <div className="sectionLine"><strong>Potential matches</strong><span>Similarity is not proof of identity</span></div>
              {results.map((r, i) => <article className="match" key={i}>
                <div className="matchTop"><span className={`sourceBadge ${r.sourceClass}`}>{r.source}</span><div><h3>{r.name}</h3><span>{r.type}</span></div><div className="confidence"><strong>{r.confidence}%</strong><small>NAME MATCH</small></div></div>
                <p>{r.detail}</p><div className="chips">{r.meta.map(m => <span key={m}>{m}</span>)}</div>
                <a href={r.href} target="_blank" rel="noreferrer">Open official evidence <span>↗</span></a>
              </article>)}
            </div>
          ) : (
            <div className="empty">
              <span className="emptyIcon">⌕</span>
              <div><h3>Nothing flagged for this search</h3><p>Try an alternative spelling or add identifiers such as a date of birth before closing your review.</p></div>
            </div>
          )}

          <div className="notice"><span>i</span><p><strong>Screening is a starting point, not a final decision.</strong> A clear result does not guarantee that a person is not subject to restrictions. Always verify possible matches using dates of birth, nationality, identification numbers and the linked official record.</p></div>
        </div>
      </section>

      <footer><span>ClearCheck</span><p>Independent screening workspace · Data belongs to the respective official publishers</p><div><a href="https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list">UN list</a><a href="https://assetrecovery.mt/court-orders/">Malta ARB</a></div></footer>
    </main>
  );
}
