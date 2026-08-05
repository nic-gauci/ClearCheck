import { matchNames } from "./name-matching.ts";

export const EU_OFFICIAL_JOURNAL_SUPPLEMENT_REVIEWED_AT="2026-08-03T00:00:00.000Z";
export const EU_OFFICIAL_JOURNAL_SUPPLEMENT_MAX_AGE_MS=7*24*60*60*1000;

const entries=[{
  id:"CELEX:32026R1358:24",type:"person" as const,names:["Alina JUC"],dateOfBirth:"2000-11-05",nationalities:["Republic of Moldova"],identificationNumbers:[],
  legalBasis:"Council Implementing Regulation (EU) 2026/1358",legalUrl:"https://eur-lex.europa.eu/eli/reg_impl/2026/1358/oj/eng/pdf",programme:"Moldova (Regulation (EU) 2023/888)",listedOn:"2026-06-15",
  detail:"Official Journal entry: coordinator in Ilan Shor’s disinformation network; born in Rîbnița, Republic of Moldova. Review the EUR-Lex act for the full statement of reasons.",
}];

export function officialJournalSupplementIsCurrent(now=Date.now()){
  const reviewedAt=new Date(EU_OFFICIAL_JOURNAL_SUPPLEMENT_REVIEWED_AT).getTime();
  return Number.isFinite(reviewedAt)&&now-reviewedAt<=EU_OFFICIAL_JOURNAL_SUPPLEMENT_MAX_AGE_MS;
}

export function screenEUOfficialJournalSupplements(query:string,subjectType:"person"|"business"){
  return entries.flatMap(entry=>{
    if(entry.type!==subjectType)return[];
    const nameMatch=matchNames(entry.names,query);if(!nameMatch.matched)return[];
    return[{...entry,name:entry.names[0],confidence:nameMatch.confidence,matchReason:nameMatch.reason,aliases:entry.names}];
  });
}
