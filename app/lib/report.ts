import { jsPDF } from "jspdf";
import { describeScreeningCoverage } from "./screening-coverage.js";
import type { SavedScreening, ScreeningMatch, ScreeningSource } from "./screening";

type RGB=[number,number,number];

const COLOURS={
  ink:[27,42,46] as RGB,
  green:[19,91,70] as RGB,
  greenSoft:[239,246,243] as RGB,
  orange:[151,70,39] as RGB,
  orangeSoft:[252,246,242] as RGB,
  muted:[91,106,108] as RGB,
  pale:[248,249,247] as RGB,
  line:[210,218,216] as RGB,
  navy:[28,49,55] as RGB,
  white:[255,255,255] as RGB,
};

function clean(value:unknown){
  return String(value??"").replace(/[\u2010-\u2015\u2212]/g,"-").replace(/\s+/g," ").trim();
}

function dateTime(value:string|undefined|null){
  if(!value)return "Not recorded";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?clean(value):date.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

function reviewLabel(status:SavedScreening["review_status"]){
  return status==="under_review"?"Under review":status==="false_positive"?"False positive":status==="confirmed_match"?"Confirmed match":status==="more_information_required"?"More information required":status==="closed_no_match"?"Legacy - no match":status==="escalated"?"Escalated":"Not reviewed";
}

function displayVersion(value:string){
  const version=clean(value);
  if(/^\d{4}-\d{2}-\d{2}T/.test(version))return version;
  const parts=version.split(";").map(part=>{
    const separator=part.indexOf(":");
    if(separator<1)return part.length>48?`${part.slice(0,18)}...${part.slice(-10)}`:part;
    const label=part.slice(0,separator).replace(/-/g," ").replace(/\b\w/g,letter=>letter.toUpperCase()),identifier=part.slice(separator+1);
    return `${label} ${identifier.length>32?`${identifier.slice(0,14)}...${identifier.slice(-10)}`:identifier}`;
  });
  return parts.join("; ");
}

export function buildScreeningReport(screening:SavedScreening){
  const pdf=new jsPDF({unit:"mm",format:"a4",compress:true});
  const pageW=210,pageH=297,margin=18,contentW=pageW-margin*2,bottom=276;
  let y=0;
  const {completed,total,incomplete,noMatches,missingSources}=describeScreeningCoverage(screening.sources,screening.risk_state==="incomplete");
  const officialSources=screening.sources.filter(source=>source.key!=="WEB");

  const setText=(size:number,color:RGB=COLOURS.ink,style:"normal"|"bold"="normal")=>{
    pdf.setFont("helvetica",style);pdf.setFontSize(size);pdf.setTextColor(...color);
  };
  const linesFor=(text:unknown,width:number)=>pdf.splitTextToSize(clean(text),width) as string[];
  const textHeight=(lines:string[],lineHeight:number)=>Math.max(lineHeight,lines.length*lineHeight);

  const drawHeader=(continuation=false)=>{
    pdf.setFillColor(...COLOURS.navy);pdf.rect(0,0,pageW,continuation?18:38,"F");
    if(continuation){
      pdf.setFillColor(...COLOURS.green);pdf.rect(0,0,3,18,"F");setText(11,COLOURS.white,"bold");pdf.text("ClearCheck",margin,11.5);
      setText(6.5,[184,202,199],"bold");pdf.text(`CONFIDENTIAL  |  ${clean(screening.case_reference)}  |  CONTINUED`,pageW-margin,11.5,{align:"right"});
      y=27;return;
    }
    pdf.setFillColor(...COLOURS.green);pdf.rect(0,0,3,38,"F");
    setText(20,COLOURS.white,"bold");pdf.text("ClearCheck",margin,16);
    setText(7,[181,203,196],"bold");pdf.text("AML AND SANCTIONS NAME-SCREENING REPORT",margin,26);
    setText(6.5,[181,203,196],"bold");pdf.text("CONFIDENTIAL - FOR AUTHORISED REVIEW ONLY",margin,32);
    setText(7,COLOURS.white,"bold");pdf.text("REPORT REFERENCE",pageW-margin,12,{align:"right"});
    setText(8,[209,222,218],"bold");pdf.text(clean(screening.case_reference),pageW-margin,19,{align:"right"});
    setText(6.5,[181,203,196]);pdf.text(`Screened ${dateTime(screening.checked_at)}`,pageW-margin,27,{align:"right"});
    y=48;
  };
  const newPage=()=>{pdf.addPage();drawHeader(true)};
  const ensure=(height:number)=>{if(y+height>bottom)newPage()};
  const drawLines=(lines:string[],x:number,width:number,size=8,color:RGB=COLOURS.muted,lineHeight=3.8,style:"normal"|"bold"="normal")=>{
    setText(size,color,style);pdf.text(lines,x,y,{lineHeightFactor:lineHeight/(size*0.3528)});y+=textHeight(lines,lineHeight);
  };
  const paragraph=(text:unknown,options?:{size?:number;color?:RGB;width?:number;gap?:number;lineHeight?:number;style?:"normal"|"bold"})=>{
    const size=options?.size??8.5,width=options?.width??contentW,lineHeight=options?.lineHeight??4.2,lines=linesFor(text,width);
    ensure(textHeight(lines,lineHeight));drawLines(lines,margin,width,size,options?.color??COLOURS.muted,lineHeight,options?.style);y+=options?.gap??3;return lines.length;
  };
  const section=(eyebrow:string,title:string,minFollowing=14)=>{
    ensure(15+minFollowing);pdf.setDrawColor(...COLOURS.green);pdf.setLineWidth(.6);pdf.line(margin,y-1,margin+9,y-1);
    setText(6.5,COLOURS.green,"bold");pdf.text(clean(eyebrow).toUpperCase(),margin+12,y);y+=5;
    setText(14,COLOURS.ink,"bold");const titleLines=linesFor(title,contentW);pdf.text(titleLines,margin,y,{lineHeightFactor:1.08});y+=titleLines.length*6+5;
  };

  const sourceDetail=(source:ScreeningSource)=>{
    if(source.status!=="complete")return source.message||"The source check did not complete.";
    const parts=[`${source.count} potential name similarit${source.count===1?"y":"ies"}`,`Checked ${dateTime(source.checkedAt)}`];
    if(source.lastUpdated)parts.push(`Source updated ${dateTime(source.lastUpdated)}`);
    if(source.version)parts.push(`Dataset version ${displayVersion(source.version)}`);
    return parts.join(" | ");
  };
  const sourceCard=(source:ScreeningSource)=>{
    const detailLines=linesFor(sourceDetail(source),contentW-8),height=18+textHeight(detailLines,3.5);
    ensure(height+3);const top=y;
    pdf.setDrawColor(...(source.status==="unavailable"?[219,183,166] as RGB:COLOURS.line));pdf.setLineWidth(.25);pdf.setFillColor(...COLOURS.white);pdf.rect(margin,top,contentW,height,"FD");
    pdf.setFillColor(...(source.status==="complete"?COLOURS.greenSoft:COLOURS.orangeSoft));pdf.rect(margin+4,top+4,11,7,"F");setText(6.5,source.status==="complete"?COLOURS.green:COLOURS.orange,"bold");pdf.text(clean(source.key).slice(0,4),margin+9.5,top+8.7,{align:"center"});
    setText(9,COLOURS.ink,"bold");pdf.text(clean(source.name),margin+19,top+8.5);
    const sourceStatus=source.status==="complete"?"COMPLETED":source.status==="review"?"MANUAL REVIEW":"UNAVAILABLE";
    setText(6.5,source.status==="complete"?COLOURS.green:COLOURS.orange,"bold");pdf.text(sourceStatus,pageW-margin-4,top+8.5,{align:"right"});
    y=top+15;drawLines(detailLines,margin+4,contentW-8,7.4,COLOURS.muted,3.5);y=top+height+3;
  };
  const matchCard=(result:ScreeningMatch,index:number)=>{
    setText(10,COLOURS.ink,"bold");const titleLines=linesFor(clean(result.name),contentW-52);
    const metadata=[result.source,result.type,...(result.meta||[])].filter(Boolean).join(" | "),metaLines=linesFor(metadata,contentW-8);
    const detailLines=linesFor(result.detail,contentW-8),legalLines=result.legalBasis?linesFor(`Legal basis: ${result.legalBasis}`,contentW-8):[];
    const bodyHeight=titleLines.length*4.6+metaLines.length*3.5+detailLines.length*3.8+legalLines.length*3.5;
    const height=Math.max(35,20+bodyHeight+8);ensure(height+4);const top=y;
    pdf.setDrawColor(...COLOURS.line);pdf.setLineWidth(.25);pdf.setFillColor(...COLOURS.white);pdf.rect(margin,top,contentW,height,"FD");pdf.setFillColor(...COLOURS.orange);pdf.rect(margin,top,1.3,height,"F");
    setText(6.2,COLOURS.orange,"bold");pdf.text(`POTENTIAL NAME SIMILARITY ${String(index+1).padStart(2,"0")}`,margin+4,top+5);
    y=top+11;drawLines(titleLines,margin+4,contentW-52,10,COLOURS.ink,4.6,"bold");
    setText(7.5,COLOURS.orange,"bold");pdf.text(`${Math.round(result.confidence)}% NAME SCORE`,pageW-margin-4,top+11,{align:"right"});
    y+=2;drawLines(metaLines,margin+4,contentW-8,7.2,COLOURS.muted,3.5);
    y+=2;drawLines(detailLines,margin+4,contentW-8,7.6,COLOURS.ink,3.8);
    if(legalLines.length){y+=1;drawLines(legalLines,margin+4,contentW-8,7.2,COLOURS.muted,3.5,"bold")}
    y=Math.max(y+3,top+height-6);setText(7.5,[35,78,103],"bold");
    if(/^https?:\/\//i.test(result.href))pdf.textWithLink("Open referenced official evidence",margin+4,y,{url:result.href});else pdf.text("Official evidence reference unavailable",margin+4,y);
    y=top+height+4;
  };

  drawHeader();
  setText(6.5,COLOURS.green,"bold");pdf.text("SCREENING SUBJECT",margin,y);y+=7;
  setText(20,COLOURS.ink,"bold");const subjectLines=linesFor(screening.subject_name,contentW-8);pdf.text(subjectLines,margin,y,{lineHeightFactor:1.05});y+=subjectLines.length*7.8+5;
  const detailsTop=y,detailsH=18;pdf.setDrawColor(...COLOURS.line);pdf.setLineWidth(.25);pdf.setFillColor(...COLOURS.pale);pdf.rect(margin,detailsTop,contentW,detailsH,"FD");
  const detailColumns=[
    {label:"CASE REFERENCE",value:screening.case_reference,x:margin+4},
    {label:"SUBJECT TYPE",value:screening.subject_type.toUpperCase(),x:margin+64},
    {label:"REPORT GENERATED",value:dateTime(new Date().toISOString()),x:margin+108},
  ];
  detailColumns.forEach(item=>{setText(6,COLOURS.muted,"bold");pdf.text(item.label,item.x,detailsTop+6);setText(7.5,COLOURS.ink,"bold");pdf.text(clean(item.value),item.x,detailsTop+12)});y=detailsTop+detailsH+7;
  if(screening.customer_reference||screening.screening_purpose||screening.input_identifiers&&Object.values(screening.input_identifiers).some(Boolean)){
    section("SCREENING CONTEXT","Customer-provided audit context",12);
    if(screening.customer_reference)paragraph(`Customer reference: ${screening.customer_reference}`,{size:8,color:COLOURS.ink,gap:1});
    if(screening.screening_purpose)paragraph(`Purpose: ${screening.screening_purpose}`,{size:8,color:COLOURS.ink,gap:1});
    const identifiers=Object.entries(screening.input_identifiers||{}).filter(([,value])=>value).map(([key,value])=>`${key.replace(/([A-Z])/g," $1")}: ${value}`).join(" | ");
    if(identifiers)paragraph(`Identifiers supplied for human comparison: ${identifiers}`,{size:8,color:COLOURS.ink,gap:3});
  }

  const reportStatus=incomplete?"SCREENING INCOMPLETE - OFFICIAL SOURCE UNAVAILABLE":screening.results.length?"POTENTIAL NAME SIMILARITY - MANUAL REVIEW REQUIRED":"NO OFFICIAL-LIST NAME SIMILARITY IDENTIFIED";
  const outcomeNote=incomplete?`${missingSources ? missingSources+" " : ""}Do not treat this screening as complete until every required official source has been checked.`:screening.results.length?"A name score is not an identity determination. Compare identifiers and current official evidence.":"Official-list screening completed. Adverse-media review and professional judgement remain required.";
  ensure(29);const outcomeTop=y;pdf.setDrawColor(...(incomplete||screening.results.length?[218,177,158] as RGB:[181,208,198] as RGB));pdf.setLineWidth(.25);pdf.setFillColor(...(incomplete||screening.results.length?COLOURS.orangeSoft:COLOURS.greenSoft));pdf.rect(margin,outcomeTop,contentW,24,"FD");pdf.setFillColor(...(incomplete||screening.results.length?COLOURS.orange:COLOURS.green));pdf.rect(margin,outcomeTop,1.5,24,"F");
  setText(6.2,incomplete||screening.results.length?COLOURS.orange:COLOURS.green,"bold");pdf.text("SCREENING OUTCOME",margin+5,outcomeTop+6);
  setText(9.5,COLOURS.ink,"bold");pdf.text(reportStatus,margin+5,outcomeTop+12);
  setText(7,COLOURS.muted);pdf.text(linesFor(outcomeNote,contentW-55).slice(0,2),margin+5,outcomeTop+17,{lineHeightFactor:1.25});
  setText(6,COLOURS.muted,"bold");pdf.text("OFFICIAL SOURCES",pageW-margin-5,outcomeTop+6,{align:"right"});setText(10,COLOURS.ink,"bold");pdf.text(`${completed}/${total}`,pageW-margin-5,outcomeTop+12,{align:"right"});
  setText(6,COLOURS.muted,"bold");pdf.text("POTENTIAL RESULTS",pageW-margin-5,outcomeTop+17,{align:"right"});setText(9,COLOURS.ink,"bold");pdf.text(String(screening.results.length),pageW-margin-5,outcomeTop+22,{align:"right"});y=outcomeTop+31;

  section("01  |  SOURCE COVERAGE","Official sources checked",20);screening.sources.forEach(sourceCard);y+=3;
  section("02  |  OFFICIAL-LIST RESULTS",screening.results.length?`${screening.results.length} potential name similarit${screening.results.length===1?"y":"ies"}`:noMatches,screening.results.length?59:22);
  if(!screening.results.length)paragraph(incomplete?(missingSources||"Official source coverage is incomplete."):"Continue with manual review and verify relevant identifiers.",{size:8.2,color:COLOURS.ink});
  screening.results.forEach(matchCard);

  if(screening.review_status||screening.review_notes){
    const status=reviewLabel(screening.review_status),notes=[screening.review_identifiers?`Identifiers checked: ${screening.review_identifiers}`:"Identifiers checked: not recorded",screening.review_notes||"No reviewer notes were recorded."].join("\n"),noteLines=linesFor(notes,contentW-8);
    const estimatedHeight=21+textHeight(noteLines,3.8);section("03  |  HUMAN REVIEW","Recorded review decision",Math.min(estimatedHeight,60));
    const reviewMeta=screening.reviewed_at?`${screening.reviewed_by_display_name||"Workspace reviewer"} | ${dateTime(screening.reviewed_at)}`:"No reviewer or review date recorded";
    const remaining=[...noteLines];let firstReviewCard=true;
    while(remaining.length){
      if(bottom-y<34)newPage();
      const maxLines=Math.max(1,Math.floor((bottom-y-23)/3.8)),chunk=remaining.splice(0,maxLines),reviewHeight=21+textHeight(chunk,3.8),top=y;
      pdf.setDrawColor(...COLOURS.line);pdf.setLineWidth(.25);pdf.setFillColor(...COLOURS.pale);pdf.rect(margin,top,contentW,reviewHeight,"FD");pdf.setFillColor(...COLOURS.green);pdf.rect(margin,top,1.2,reviewHeight,"F");
      setText(6.5,COLOURS.green,"bold");pdf.text(firstReviewCard?"REVIEW DISPOSITION":"REVIEW NOTES - CONTINUED",margin+4,top+6);setText(9,COLOURS.ink,"bold");pdf.text(status,margin+4,top+11);
      setText(7,COLOURS.muted);pdf.text(clean(reviewMeta),pageW-margin-4,top+10,{align:"right",maxWidth:90});
      y=top+17;drawLines(chunk,margin+4,contentW-8,7.5,COLOURS.ink,3.8);y=top+reviewHeight+4;firstReviewCard=false;
      if(remaining.length)newPage();
    }
  }

  section(screening.review_status||screening.review_notes?"04  |  ADVERSE-MEDIA REVIEW":"03  |  ADVERSE-MEDIA REVIEW","Structured review searches",30);
  paragraph("The searches below are prepared for manual adverse-media review. Dynamic search results are not reproduced in this report. Retain relevant evidence separately in accordance with the organisation's review and retention procedures.",{size:8.2,color:COLOURS.ink,gap:4});
  screening.web_searches.forEach((search,index)=>{
    const queryLines=linesFor(search.query,contentW-50),height=Math.max(8,textHeight(queryLines,3.7)+4);ensure(height+2);
    pdf.setDrawColor(...COLOURS.line);pdf.line(margin,y+height,pageW-margin,y+height);setText(8,COLOURS.ink,"bold");pdf.text(`${index+1}. ${clean(search.label)}`,margin,y+4.5);
    const rowTop=y;y+=4.5;drawLines(queryLines,margin+50,contentW-50,7.8,COLOURS.muted,3.7);y=Math.max(rowTop+height+2,y+2);
  });y+=4;

  ensure(30);setText(6.5,COLOURS.orange,"bold");pdf.text("LIMITATIONS AND REQUIRED HUMAN REVIEW",margin,y);y+=5;
  const notice="This report records an automated name-screening process and is intended solely to support qualified human review. It is not a legal determination, proof of wrongdoing, confirmation of identity, or legal advice. Similar names may relate to different persons or organisations. Reviewers must verify potential results against independent identifiers, current official evidence, and applicable legal obligations before making or documenting a decision.";
  const noticeLines=linesFor(notice,contentW-12),noticeHeight=textHeight(noticeLines,4.1)+10;
  ensure(noticeHeight);pdf.setFillColor(...COLOURS.orangeSoft);pdf.setDrawColor(224,194,180);pdf.setLineWidth(.25);pdf.rect(margin,y,contentW,noticeHeight,"FD");pdf.setFillColor(...COLOURS.orange);pdf.rect(margin,y,1.5,noticeHeight,"F");y+=5;drawLines(noticeLines,margin+6,contentW-12,8,COLOURS.ink,4.1);y+=5;

  const totalPages=pdf.getNumberOfPages();
  for(let page=1;page<=totalPages;page++){
    pdf.setPage(page);pdf.setDrawColor(...COLOURS.line);pdf.setLineWidth(.25);pdf.line(margin,pageH-15,pageW-margin,pageH-15);setText(6.5,COLOURS.muted);
    pdf.text("CONFIDENTIAL - ClearCheck screening record",margin,pageH-9);pdf.text(`${clean(screening.case_reference)}  |  Page ${page} of ${totalPages}`,pageW-margin,pageH-9,{align:"right"});
  }
  pdf.setProperties({title:`ClearCheck screening report - ${clean(screening.subject_name)}`,subject:"Confidential AML and sanctions name-screening record",author:"ClearCheck",keywords:"AML, sanctions, screening, compliance, human review"});
  return pdf;
}

export function downloadScreeningReport(screening:SavedScreening){
  buildScreeningReport(screening).save(`ClearCheck-${clean(screening.case_reference)}.pdf`);
}
