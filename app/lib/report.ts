import { jsPDF } from "jspdf";
import type { SavedScreening } from "./screening";

export function downloadScreeningReport(screening:SavedScreening){
  const pdf=new jsPDF({unit:"mm",format:"a4"});
  const pageW=210,pageH=297,margin=18,contentW=pageW-margin*2;
  const ink:[number,number,number]=[20,45,44],green:[number,number,number]=[20,103,79],orange:[number,number,number]=[190,88,43],muted:[number,number,number]=[94,113,108];
  let y=18,page=1;
  const incomplete=screening.sources.some(source=>source.status==="unavailable");
  const completed=screening.sources.filter(source=>source.status==="complete").length;
  const footer=()=>{pdf.setDrawColor(218,226,222);pdf.line(margin,pageH-15,pageW-margin,pageH-15);pdf.setFont("helvetica","normal");pdf.setFontSize(7);pdf.setTextColor(...muted);pdf.text("ClearCheck - Independent AML screening report",margin,pageH-9);pdf.text(`Page ${page}`,pageW-margin,pageH-9,{align:"right"})};
  const newPage=()=>{footer();pdf.addPage();page++;y=18};
  const ensure=(height:number)=>{if(y+height>pageH-22)newPage()};
  const label=(text:string)=>{pdf.setFont("helvetica","bold");pdf.setFontSize(7);pdf.setTextColor(...green);pdf.text(text.toUpperCase(),margin,y);y+=5};
  const heading=(text:string,size=16)=>{ensure(size/2+8);pdf.setFont("helvetica","bold");pdf.setFontSize(size);pdf.setTextColor(...ink);pdf.text(text,margin,y);y+=size*.48+4};
  const paragraph=(text:string,size=9,color=muted)=>{pdf.setFont("helvetica","normal");pdf.setFontSize(size);pdf.setTextColor(...color);const lines=pdf.splitTextToSize(text,contentW);ensure(lines.length*4.3);pdf.text(lines,margin,y);y+=lines.length*4.3+3};
  pdf.setFillColor(...ink);pdf.rect(0,0,pageW,48,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(22);pdf.text("ClearCheck",margin,20);pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(179,207,197);pdf.text("AML & SANCTIONS SCREENING REPORT",margin,29);pdf.setFontSize(8);pdf.text(screening.case_reference,pageW-margin,20,{align:"right"});pdf.text(new Date(screening.checked_at).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}),pageW-margin,27,{align:"right"});y=61;
  label("Screened subject");heading(screening.subject_name,21);paragraph(`Case reference: ${screening.case_reference}   |   Subject type: ${screening.subject_type}   |   Generated: ${new Date().toLocaleString("en-GB")}`,8);
  const reportStatus=incomplete?"INCOMPLETE - SOURCE UNAVAILABLE":screening.results.length?"POTENTIAL MATCHES - REVIEW REQUIRED":"NO LIST MATCHES - WEB REVIEW REQUIRED";
  ensure(24);pdf.setFillColor(...(incomplete||screening.results.length?orange:green));pdf.roundedRect(margin,y,contentW,19,2,2,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(11);pdf.text(reportStatus,margin+6,y+8);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.text(`${completed} live lists completed | ${screening.results.length} potential list match${screening.results.length===1?"":"es"}`,margin+6,y+14);y+=28;
  label("Source checks");heading("Screening coverage",15);
  screening.sources.forEach(source=>{ensure(15);pdf.setDrawColor(220,227,223);pdf.setFillColor(249,249,246);pdf.roundedRect(margin,y,contentW,13,1,1,"FD");pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.setTextColor(...ink);pdf.text(`${source.key}  ${source.name}`,margin+4,y+5.5);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.setTextColor(...muted);pdf.text(source.status==="complete"?`${source.count} match${source.count===1?"":"es"} - completed ${new Date(source.checkedAt).toLocaleString("en-GB")}`:source.message||source.status,margin+4,y+10);pdf.setFont("helvetica","bold");pdf.setTextColor(...(source.status==="complete"?green:orange));pdf.text(source.status.toUpperCase(),pageW-margin-4,y+7.5,{align:"right"});y+=16});y+=4;
  label("Official-list findings");heading(screening.results.length?`${screening.results.length} potential match${screening.results.length===1?"":"es"}`:"No potential matches",15);
  if(!screening.results.length)paragraph("No matching names were identified in the official sanctions and Malta court-order sources completed at the recorded time.");
  screening.results.forEach((result,index)=>{ensure(32);pdf.setDrawColor(227,216,205);pdf.setFillColor(255,250,246);pdf.roundedRect(margin,y,contentW,27,1,1,"FD");pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.setTextColor(...ink);pdf.text(`${index+1}. ${result.name}`,margin+4,y+6);pdf.setTextColor(...orange);pdf.text(`${result.confidence}% name match`,pageW-margin-4,y+6,{align:"right"});pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.setTextColor(...muted);pdf.text(`${result.source} | ${result.type}${result.meta.length?` | ${result.meta.join(" | ")}`:""}`,margin+4,y+12);pdf.text(pdf.splitTextToSize(result.detail,contentW-8).slice(0,2),margin+4,y+17);pdf.setTextColor(32,91,127);pdf.textWithLink("Open official evidence",margin+4,y+24,{url:result.href});y+=31});y+=4;
  label("Web intelligence");heading("Focused review searches",15);paragraph("The structured web searches listed in this report require human review. Dynamic results are not copied into the report; retain any relevant supporting evidence separately.");
  screening.web_searches.forEach((search,index)=>{ensure(11);pdf.setFont("helvetica","bold");pdf.setFontSize(8.5);pdf.setTextColor(...ink);pdf.text(`${index+1}. ${search.label}`,margin,y);pdf.setFont("helvetica","normal");pdf.setTextColor(...muted);pdf.text(search.query,margin+38,y);y+=7});y+=5;
  label("Important notice");paragraph("This report records an automated name-only screening and is not a legal determination or proof of wrongdoing. Similar names may refer to different people. Verify potential matches using independent identifiers and the linked official evidence.",8.5,ink);
  footer();
  pdf.setProperties({title:`ClearCheck report - ${screening.subject_name}`,subject:"AML and sanctions name-screening report",author:"ClearCheck",keywords:"AML, sanctions, screening"});
  pdf.save(`ClearCheck-${screening.case_reference}.pdf`);
}
