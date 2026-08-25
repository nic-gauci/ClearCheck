export type EULegalDesignation={
  id:string;type:"person"|"business";name:string;aliases:string[];dateOfBirth?:string;
  nationalities:string[];identificationNumbers:string[];detail:string;legalBasis:string;
  legalUrl:string;listedOn?:string;actDate:string;
};

export type CellarAct={celex:string;date:string;title:string;eli:string;expression:string;itemUrl?:string};

const SPARQL_ENDPOINT="https://publications.europa.eu/webapi/rdf/sparql";

function decode(value:string){
  return value.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&#(x?[0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code.replace(/^x/i,""),/^x/i.test(code)?16:10))).replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/\s+/g," ").trim();
}
function text(value:string){return decode(value.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]+>/g," "))}
function lines(value:string){const paragraphs=[...value.matchAll(/<(?:p|div|li)\b[^>]*>([\s\S]*?)<\/(?:p|div|li)>/gi)].map(match=>text(match[1])).filter(Boolean);return paragraphs.length?paragraphs:text(value).split(/\n+/).map(part=>part.trim()).filter(Boolean)}
function unique(values:Array<string|undefined>){return [...new Set(values.filter((value):value is string=>Boolean(value?.trim())).map(value=>value.trim()))]}
function labelledValues(source:string[],label:RegExp){
  return unique(source.map(value=>value.match(label)?.[1]?.replace(/^[\s:;-]+|[\s;]+$/g,"").trim()).filter(Boolean));
}

export function buildCellarActsQuery(since:string){return `PREFIX cdm:<http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?work ?expression ?celex ?date ?title ?eli WHERE {
  ?work cdm:resource_legal_id_celex ?celex ; cdm:work_date_document ?date ;
    cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/REG_IMPL> ; cdm:resource_legal_eli ?eli .
  ?expression cdm:expression_belongs_to_work ?work ;
    cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> ; cdm:expression_title ?title .
  FILTER(?date >= "${since}"^^<http://www.w3.org/2001/XMLSchema#date>)
  FILTER(CONTAINS(LCASE(STR(?title)), "restrictive measures"))
} ORDER BY DESC(?date) LIMIT 500`}

export function buildCellarItemsQuery(expressions:string[]){
  const values=expressions.map(value=>`<${value}>`).join(" ");
  return `PREFIX cdm:<http://publications.europa.eu/ontology/cdm#>
PREFIX xsd:<http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?expression ?item WHERE {
  VALUES ?expression { ${values} }
  ?manifestation cdm:manifestation_manifests_expression ?expression ; cdm:manifestation_type "xhtml"^^xsd:string .
  ?item cdm:item_belongs_to_manifestation ?manifestation .
}`;
}

export async function fetchCellarBindings(query:string){
  const response=await fetch(SPARQL_ENDPOINT,{method:"POST",headers:{Accept:"application/sparql-results+json","Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","User-Agent":"ClearCheck/1.0 EU-legal-designation-sync"},body:new URLSearchParams({query,format:"application/sparql-results+json"}),signal:AbortSignal.timeout(60_000)});
  if(!response.ok)throw new Error(`EU Cellar returned ${response.status}`);
  const payload=await response.json() as {results?:{bindings?:Array<Record<string,{value?:string}>>}};
  if(!Array.isArray(payload.results?.bindings))throw new Error("EU Cellar returned an invalid response");
  return payload.results.bindings;
}

export function parseOfficialJournalXhtml(xhtml:string,act:CellarAct){
  const tables=[...xhtml.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)],results:EULegalDesignation[]=[];
  for(const tableMatch of tables){
    const table=tableMatch[0],rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match=>match[1]);
    if(rows.length<2)continue;
    const parsed=rows.map(row=>[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match=>match[1]));
    const headerIndex=parsed.findIndex(cells=>cells.some(cell=>/^name$/i.test(text(cell)))&&cells.some(cell=>/identif|statement of reasons|grounds/i.test(text(cell))));
    if(headerIndex<0)continue;
    const headers=parsed[headerIndex].map(cell=>text(cell).toLowerCase()),nameIndex=headers.findIndex(value=>/^name$/.test(value)),infoIndex=headers.findIndex(value=>/identif/.test(value)),reasonIndex=headers.findIndex(value=>/statement of reasons|grounds/.test(value)),dateIndex=headers.findIndex(value=>/date of listing/.test(value));
    if(nameIndex<0||reasonIndex<0)continue;
    const context=text(xhtml.slice(Math.max(0,(tableMatch.index||0)-1800),tableMatch.index||0)).toLowerCase();
    if(/entries? (?:shall be |are )?(?:deleted|removed)|delete the entr(?:y|ies)|repealed/.test(context.slice(-700)))continue;
    const nearby=context.slice(-900),personMarker=Math.max(nearby.lastIndexOf("natural persons"),nearby.lastIndexOf("individuals")),businessMarker=Math.max(nearby.lastIndexOf("legal persons"),nearby.lastIndexOf("entities"),nearby.lastIndexOf("bodies"));
    const subjectType=personMarker<0&&businessMarker<0?undefined:personMarker>businessMarker?"person":"business";
    if(!subjectType)continue;
    for(const cells of parsed.slice(headerIndex+1)){
      if(cells.length<=nameIndex)continue;
      const nameLines=unique(lines(cells[nameIndex]).map(value=>value.replace(/^[‘'"“]?\d+[a-z]?\.\s*/i,"").replace(/^[‘'"“]|[’'"”]$/g,"").trim()));
      const name=nameLines.find(value=>value.length>=2&&!/^[-–—]$/.test(value));if(!name)continue;
      const aliases=unique(nameLines.flatMap(value=>value.split(/\b(?:a\.?k\.?a\.?|also known as)\b/i).map(part=>part.replace(/^[.:;,\s]+|[.:;,\s]+$/g,"").trim())));
      const infoLines=infoIndex>=0?lines(cells[infoIndex]||""):[],detail=reasonIndex>=0?text(cells[reasonIndex]||""):"";
      const dob=labelledValues(infoLines,/^(?:DOB|Date of birth)\s*:?\s*(.+)$/i)[0];
      const nationalities=labelledValues(infoLines,/^Nationalit(?:y|ies)\s*:?\s*(.+)$/i);
      const ids=labelledValues(infoLines,/^(?:Passport(?: number| no\.?)?|Identity card(?: number| no\.?)?|National identification(?: number| no\.?)?|Identification(?: number| no\.?)?|ID(?: no\.?)?|Individual Taxpayer Number|INN)\s*:?\s*(.+)$/i);
      const listedOn=dateIndex>=0?text(cells[dateIndex]||""):undefined;
      results.push({id:`${act.celex}:${results.length+1}`,type:subjectType,name,aliases:aliases.length?aliases:[name],dateOfBirth:dob,nationalities,identificationNumbers:ids,detail:detail||`Designation published in ${act.title}.`,legalBasis:act.title,legalUrl:act.eli.replace(/^http:/,"https:")+"/eng",listedOn,actDate:act.date});
    }
  }
  return results;
}

function bindingValue(binding:Record<string,{value?:string}>,name:string){return binding[name]?.value||""}

export async function collectEUOfficialJournalDataset(now=new Date()){
  const sinceDate=new Date(now.getTime()-400*24*60*60*1000),since=sinceDate.toISOString().slice(0,10);
  const actBindings=await fetchCellarBindings(buildCellarActsQuery(since));
  const acts:CellarAct[]=actBindings.map(binding=>({celex:bindingValue(binding,"celex"),date:bindingValue(binding,"date"),title:bindingValue(binding,"title"),eli:bindingValue(binding,"eli"),expression:bindingValue(binding,"expression")})).filter(act=>act.celex&&act.date&&act.title&&act.eli&&act.expression);
  if(acts.length<20)throw new Error("EU Cellar returned too few restrictive-measures acts");
  const itemBindings=await fetchCellarBindings(buildCellarItemsQuery(acts.map(act=>act.expression)));
  const itemByExpression=new Map(itemBindings.map(binding=>[bindingValue(binding,"expression"),bindingValue(binding,"item")]));
  acts.forEach(act=>{act.itemUrl=itemByExpression.get(act.expression)?.replace(/^http:/,"https:")});
  const available=acts.filter(act=>act.itemUrl);if(available.length<Math.floor(acts.length*.9))throw new Error("EU Cellar XHTML coverage failed validation");
  const entries:EULegalDesignation[]=[];
  for(let index=0;index<available.length;index+=6){
    const batch=available.slice(index,index+6);
    const documents=await Promise.all(batch.map(async act=>{
      const response=await fetch(act.itemUrl!,{headers:{Accept:"application/xhtml+xml,text/html","User-Agent":"ClearCheck/1.0 EU-legal-designation-sync"},signal:AbortSignal.timeout(45_000)});
      if(!response.ok)throw new Error(`EU Cellar document returned ${response.status}`);
      return{act,xhtml:await response.text()};
    }));
    for(const document of documents)entries.push(...parseOfficialJournalXhtml(document.xhtml,document.act));
  }
  const deduped=[...new Map(entries.map(entry=>[`${entry.type}:${entry.name.toLowerCase()}:${entry.legalBasis}`,entry])).values()];
  if(deduped.length<10)throw new Error("EU legal-designation extraction returned too few entries");
  const generatedAt=now.toISOString(),payload={generatedAt,since,acts:available.length,entries:deduped,version:""};
  const encoded=new TextEncoder().encode(JSON.stringify({...payload,version:undefined})),digest=await crypto.subtle.digest("SHA-256",encoded),version=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
  return{...payload,version};
}
