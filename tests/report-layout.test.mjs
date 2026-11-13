import assert from "node:assert/strict";
import test from "node:test";
import { sampleScreening } from "../app/lib/sample-screening.ts";
import { buildScreeningReport } from "../app/lib/report.ts";

const source=(key,name,version)=>({key,name,status:"complete",count:0,checkedAt:"2026-08-25T00:46:00Z",lastUpdated:"2026-08-25T00:30:00Z",version});

test("screening reports wrap long audit data and paginate without invalid drawing commands",()=>{
  const longText="Long official-source content that must remain readable without colliding with another field or leaving the printable page. ".repeat(10);
  const screening={
    id:"00000000-0000-4000-8000-000000000001",case_reference:"CC-REPORT-LAYOUT",subject_name:"A deliberately long international organisation name used for report layout verification",subject_type:"business",status:"completed",risk_state:"review",match_count:4,source_count:4,checked_at:"2026-08-25T00:46:00Z",completed_at:"2026-08-25T00:47:00Z",created_at:"2026-08-25T00:46:00Z",
    review_status:"under_review",review_notes:longText,reviewed_by:null,reviewed_by_display_name:"Layout reviewer",reviewed_at:"2026-08-26T01:00:00Z",
    sources:[source("EU","European Union",`consolidated:${"a".repeat(64)};official-journal:${"b".repeat(64)}`),source("UN","United Nations","2026-08-25T00:00:00Z"),source("MT","Malta ARB","live query"),{key:"WEB",name:"Web review",status:"review",count:4,checkedAt:"2026-08-25T00:46:00Z",message:"Manual review required"}],
    results:Array.from({length:4},(_,index)=>({source:"EU",sourceClass:"eu",name:`Entity ${index+1} with a long registered legal name`,type:"Entity",confidence:96,detail:longText,meta:[longText],href:"https://eur-lex.europa.eu/",legalBasis:"Council regulation and implementing legal act"})),
    web_searches:[{term:"fraud",label:"Fraud",query:'"example entity" "fraud"',href:"https://www.google.com/"}],
  };
  const pdf=buildScreeningReport(screening),pages=pdf.getNumberOfPages();
  assert.ok(pages>=3,"stress report should paginate");
  assert.ok(pdf.output("arraybuffer").byteLength>5_000,"report should contain rendered content");
  for(let page=1;page<=pages;page++){
    const commands=(pdf.internal.pages[page]||[]).join("\n");
    assert.doesNotMatch(commands,/\b(?:NaN|undefined)\b/);
  }
});

test("both public samples generate readable PDFs and label incomplete coverage",()=>{
  for(const incomplete of [false,true]){
    const pdf=buildScreeningReport(sampleScreening(incomplete));
    const commands=pdf.internal.pages.slice(1).flat().join("\n");
    assert.match(commands,/Example Harbour Trading Ltd/);
    assert.match(commands,incomplete?/SCREENING INCOMPLETE/:/POTENTIAL NAME SIMILARITY/);
    if(incomplete){
      assert.match(commands,/Sources not checked: European Union/);
      assert.match(commands,/No matches on the 2 official sources checked/);
    }
    assert.ok(pdf.output("arraybuffer").byteLength>3000);
  }
});
