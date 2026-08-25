import { matchNames } from "./name-matching.ts";

export type UNSanctionsMatch={
  name:string;type:"Individual"|"Entity";confidence:number;detail:string;meta:string[];aliases:string[];
  dateOfBirth?:string;nationalities?:string[];identificationNumbers?:string[];matchReason:string;
};

function decodeXml(value:string){
  return value.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();
}

function tag(block:string,name:string){
  const match=block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,"i"));
  return decodeXml(match?.[1]?.replace(/<[^>]+>/g," ").replace(/\s+/g," ")||"");
}

function nestedValues(block:string,container:string,valueTag:string){
  return [...block.matchAll(new RegExp(`<${container}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${container}>`,"gi"))].map(match=>tag(match[1],valueTag)).filter(Boolean);
}

function unique(values:Array<string|undefined>){return [...new Set(values.filter((value):value is string=>typeof value==="string").map(value=>value.trim()).filter(Boolean))]}

export function screenUNConsolidatedXml(xml:string,query:string,subjectType:"person"|"business"){
  const kind=subjectType==="person"?"INDIVIDUAL":"ENTITY";
  const records=xml.match(new RegExp(`<${kind}>[\\s\\S]*?<\\/${kind}>`,"gi"))||[];
  const matches:UNSanctionsMatch[]=[],seen=new Set<string>();
  for(const block of records){
    const primary=kind==="INDIVIDUAL"?[tag(block,"FIRST_NAME"),tag(block,"SECOND_NAME"),tag(block,"THIRD_NAME"),tag(block,"FOURTH_NAME")].filter(Boolean).join(" "):tag(block,"FIRST_NAME")||tag(block,"NAME");
    const aliases=unique([primary,...nestedValues(block,`${kind}_ALIAS`,"ALIAS_NAME")]);
    const nameMatch=matchNames(aliases,query);if(!nameMatch.matched)continue;
    const reference=tag(block,"REFERENCE_NUMBER")||tag(block,"DATAID"),dedupeKey=reference||nameMatch.matchedName||primary;
    if(seen.has(dedupeKey))continue;seen.add(dedupeKey);
    const dates=kind==="INDIVIDUAL"?unique([...nestedValues(block,"INDIVIDUAL_DATE_OF_BIRTH","DATE"),...nestedValues(block,"INDIVIDUAL_DATE_OF_BIRTH","YEAR")]):[];
    const nationalities=kind==="INDIVIDUAL"?unique(nestedValues(block,"NATIONALITY","VALUE")):[];
    const identificationNumbers=kind==="INDIVIDUAL"?unique(nestedValues(block,"INDIVIDUAL_DOCUMENT","NUMBER")):[];
    const meta=unique([reference,tag(block,"LISTED_ON"),tag(block,"UN_LIST_TYPE"),dates[0],...nationalities,identificationNumbers.length?`ID: ${identificationNumbers.join(", ")}`:""]);
    matches.push({name:primary||nameMatch.matchedName||query,type:kind==="INDIVIDUAL"?"Individual":"Entity",confidence:nameMatch.confidence,detail:tag(block,"COMMENTS1")||"Name appears in the UN Security Council Consolidated List.",meta,aliases,dateOfBirth:dates[0],nationalities,identificationNumbers,matchReason:nameMatch.reason});
    if(matches.length>=25)break;
  }
  const generatedAt=xml.match(/dateGenerated=["']([^"']+)/i)?.[1];
  return{matches,generatedAt,recordCount:records.length};
}
