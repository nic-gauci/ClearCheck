import { matchNames } from "./name-matching.ts";

export type EUSanctionsMatch={
  id:string;name:string;type:"Individual"|"Entity";confidence:number;matchReason:string;aliases:string[];
  dateOfBirth?:string;nationalities:string[];identificationNumbers:string[];detail:string;legalBasis:string;legalUrl:string;programme?:string;euReference?:string;
};

function parseDelimited(text:string,delimiter=";"){
  const rows:string[][]=[],row:string[]=[],source=text.replace(/^\uFEFF/,"");
  let field="",quoted=false;
  for(let index=0;index<source.length;index++){
    const character=source[index];
    if(quoted){
      if(character==='"'&&source[index+1]==='"'){field+='"';index++}
      else if(character==='"')quoted=false;
      else field+=character;
    }else if(character==='"')quoted=true;
    else if(character===delimiter){row.push(field.trim());field=""}
    else if(character==='\n'){row.push(field.trim());rows.push([...row]);row.length=0;field=""}
    else if(character!=='\r')field+=character;
  }
  if(field||row.length){row.push(field.trim());rows.push(row)}
  return rows;
}

function unique(values:string[]){return [...new Set(values.map(value=>value.trim()).filter(Boolean))]}
function safeLegalUrl(value:string,legalBasis:string){
  try{const url=new URL(value);if(url.protocol==="https:"&&(url.hostname==="eur-lex.europa.eu"||url.hostname.endsWith(".eur-lex.europa.eu")))return url.toString()}catch{}
  return `https://eur-lex.europa.eu/search.html?scope=EURLEX&text=${encodeURIComponent(legalBasis)}`;
}

export function screenEUConsolidatedCsv(csv:string,query:string,subjectType:"person"|"business"){
  const rows=parseDelimited(csv);
  if(rows.length<2)throw new Error("EU consolidated sanctions file is empty");
  const headers=rows[0],column=(name:string)=>headers.indexOf(name),read=(row:string[],name:string)=>{const index=column(name);return index>=0?row[index]||"":""};
  for(const required of["Entity_LogicalId","Entity_SubjectType","NameAlias_WholeName"]){if(column(required)<0)throw new Error(`EU consolidated sanctions file is missing ${required}`)}
  const entities=new Map<string,{rows:string[][];names:string[]}>();
  for(const row of rows.slice(1)){
    const id=read(row,"Entity_LogicalId");if(!id)continue;
    const names=[read(row,"NameAlias_WholeName"),[read(row,"NameAlias_FirstName"),read(row,"NameAlias_MiddleName"),read(row,"NameAlias_LastName")].filter(Boolean).join(" ")];
    const current=entities.get(id)||{rows:[],names:[]};current.rows.push(row);current.names.push(...names);entities.set(id,current);
  }
  const results:EUSanctionsMatch[]=[];
  for(const [id,entity] of entities){
    const first=entity.rows[0],classification=read(first,"Entity_SubjectType_ClassificationCode"),kind=read(first,"Entity_SubjectType"),isPerson=/^(p|person)$/i.test(classification||kind)||/person/i.test(kind);
    if((subjectType==="person")!==isPerson)continue;
    const aliases=unique(entity.names),nameMatch=matchNames(aliases,query);if(!nameMatch.matched)continue;
    const legalBasis=read(first,"Entity_Regulation_NumberTitle")||read(first,"NameAlias_Regulation_NumberTitle")||"EU restrictive measure";
    const legalUrl=safeLegalUrl(read(first,"Entity_Regulation_PublicationUrl")||read(first,"NameAlias_Regulation_PublicationUrl"),legalBasis);
    const dates=unique(entity.rows.flatMap(row=>[read(row,"BirthDate_BirthDate"),[read(row,"BirthDate_Day"),read(row,"BirthDate_Month"),read(row,"BirthDate_Year")].filter(Boolean).join("/")]));
    const nationalities=unique(entity.rows.flatMap(row=>[read(row,"Citizenship_CountryDescription"),read(row,"Citizenship_CountryIso2Code")]));
    const identificationNumbers=unique(entity.rows.map(row=>read(row,"Identification_Number")));
    const detail=read(first,"Entity_DesignationDetails")||read(first,"Entity_Remark")||read(first,"NameAlias_Remark")||"Listed in the European Commission Consolidated Financial Sanctions List.";
    results.push({id,name:aliases[0]||nameMatch.matchedName||query,type:isPerson?"Individual":"Entity",confidence:nameMatch.confidence,matchReason:nameMatch.reason,aliases,dateOfBirth:dates[0],nationalities,identificationNumbers,detail,legalBasis,legalUrl,programme:read(first,"Entity_Regulation_Programme"),euReference:read(first,"Entity_EU_ReferenceNumber")});
    if(results.length>=25)break;
  }
  return{matches:results,generationDate:read(rows[1],"fileGenerationDate")||undefined,rowCount:rows.length-1};
}
