import assert from "node:assert/strict";
import test from "node:test";
import { screenEUConsolidatedCsv } from "../app/lib/eu-sanctions.ts";
import { matchNames } from "../app/lib/name-matching.ts";
import { screenEUOfficialJournalDataset } from "../app/lib/eu-official-journal.ts";
import { parseOfficialJournalXhtml } from "../supabase/functions/_shared/eu-legal-designations.ts";

const headers=["fileGenerationDate","Entity_LogicalId","Entity_EU_ReferenceNumber","Entity_DesignationDetails","Entity_Remark","Entity_SubjectType","Entity_SubjectType_ClassificationCode","Entity_Regulation_NumberTitle","Entity_Regulation_Programme","Entity_Regulation_PublicationUrl","NameAlias_LastName","NameAlias_FirstName","NameAlias_MiddleName","NameAlias_WholeName","NameAlias_Remark","BirthDate_BirthDate","Identification_Number","Citizenship_CountryDescription"];
const row=(values)=>headers.map(header=>String(values[header]||"").replaceAll('"','""')).map(value=>`"${value}"`).join(";");
const fixture=[headers.join(";"),row({fileGenerationDate:"2026-08-01",Entity_LogicalId:"8967",Entity_EU_ReferenceNumber:"EU.8967",Entity_DesignationDetails:"Listed under restrictive measures concerning Moldova.",Entity_SubjectType:"person",Entity_SubjectType_ClassificationCode:"P",Entity_Regulation_NumberTitle:"Council Implementing Regulation (EU) 2026/1358",Entity_Regulation_Programme:"MDA",Entity_Regulation_PublicationUrl:"https://eur-lex.europa.eu/eli/reg_impl/2026/1358/oj",NameAlias_LastName:"JUC",NameAlias_FirstName:"Alina",NameAlias_WholeName:"Alina JUC",BirthDate_BirthDate:"2000-11-05",Identification_Number:"AB123",Citizenship_CountryDescription:"Moldova"}),row({fileGenerationDate:"2026-08-01",Entity_LogicalId:"8967",Entity_SubjectType:"person",Entity_SubjectType_ClassificationCode:"P",Entity_Regulation_NumberTitle:"Council Implementing Regulation (EU) 2026/1358",Entity_Regulation_PublicationUrl:"https://eur-lex.europa.eu/eli/reg_impl/2026/1358/oj",NameAlias_WholeName:"Алина Жук"}),row({fileGenerationDate:"2026-08-01",Entity_LogicalId:"200",Entity_SubjectType:"enterprise",Entity_SubjectType_ClassificationCode:"E",Entity_Regulation_NumberTitle:"Council Regulation (EU) 2026/100",Entity_Regulation_PublicationUrl:"https://eur-lex.europa.eu/eli/reg/2026/100/oj",NameAlias_WholeName:"Example Holdings Ltd"})].join("\n");

test("EU consolidated parser preserves identifiers and EUR-Lex evidence from a source row",()=>{
  const result=screenEUConsolidatedCsv(fixture,"Alina Juc","person");
  assert.equal(result.matches.length,1);
  assert.equal(result.matches[0].name,"Alina JUC");
  assert.equal(result.matches[0].confidence,100);
  assert.equal(result.matches[0].dateOfBirth,"2000-11-05");
  assert.deepEqual(result.matches[0].nationalities,["Moldova"]);
  assert.deepEqual(result.matches[0].identificationNumbers,["AB123"]);
  assert.match(result.matches[0].legalUrl,/eur-lex\.europa\.eu/);
});

const act={celex:"32026R1358",date:"2026-07-16",title:"Council Implementing Regulation (EU) 2026/1358",eli:"http://data.europa.eu/eli/reg_impl/2026/1358/oj",expression:"https://example.test/expression"};
const officialJournalHtml=`<html><body>
<h2>Natural persons</h2><table><tr><th>Name</th><th>Identifying information</th><th>Statement of reasons</th><th>Date of listing</th></tr>
<tr><td><p>1. Alina JUC</p><p>a.k.a. Alina ZHUK</p></td><td><p>Date of birth: 5.11.2000</p><p>Place of birth: Rîbnița</p><p>Nationality: Moldovan</p><p>Passport number: AB123</p><p>Individual Taxpayer Number: 2000000000000</p></td><td>Example legal grounds.</td><td>16.7.2026</td></tr>
<tr><td><p>2. Ivan PETROV</p></td><td><p>Date of birth: 10.2.1975</p><p>Nationality: Russian</p><p>ID no.: RU-987</p></td><td>Different legal grounds.</td><td>16.7.2026</td></tr></table>
<h2>Legal persons, entities and bodies</h2><table><tr><th>Name</th><th>Identifying information</th><th>Grounds</th><th>Date of listing</th></tr>
<tr><td>1. Example Holdings Ltd</td><td><p>Registration number: 12345</p></td><td>Entity grounds.</td><td>16.7.2026</td></tr></table>
<h2>The following entries are deleted</h2><table><tr><th>Name</th><th>Identifying information</th><th>Grounds</th></tr><tr><td>Removed Person</td><td>-</td><td>Removed.</td></tr></table>
</body></html>`;

test("Official Journal extraction works dataset-wide for people and entities",()=>{
  const entries=parseOfficialJournalXhtml(officialJournalHtml,act);
  assert.deepEqual(entries.map(entry=>entry.name),["Alina JUC","Ivan PETROV","Example Holdings Ltd"]);
  assert.deepEqual(entries[0].aliases,["Alina JUC","Alina ZHUK"]);
  assert.equal(entries[0].dateOfBirth,"5.11.2000");
  assert.deepEqual(entries[0].nationalities,["Moldovan"]);
  assert.deepEqual(entries[0].identificationNumbers,["AB123","2000000000000"]);
  assert.equal(entries.some(entry=>entry.name==="Removed Person"),false);
  const dataset={generatedAt:"2026-08-25T00:00:00Z",since:"2025-07-21",acts:113,entries,version:"fixture"};
  assert.equal(screenEUOfficialJournalDataset(dataset,"Alina Zhuk","person").length,1);
  assert.equal(screenEUOfficialJournalDataset(dataset,"Ivan Petrov","person").length,1);
  assert.equal(screenEUOfficialJournalDataset(dataset,"Example Holdings Ltd","business").length,1);
  assert.equal(screenEUOfficialJournalDataset(dataset,"Example Holdings Ltd","person").length,0);
  assert.equal(screenEUOfficialJournalDataset(dataset,"Definitely Not Listed","person").length,0);
});

test("person and business searches remain separated",()=>{
  assert.equal(screenEUConsolidatedCsv(fixture,"Example Holdings Ltd","person").matches.length,0);
  assert.equal(screenEUConsolidatedCsv(fixture,"Example Holdings Ltd","business").matches.length,1);
  assert.equal(screenEUConsolidatedCsv(fixture,"Definitely Not Listed","person").matches.length,0);
});

test("matching handles aliases, transliteration, and conservative spelling variation",()=>{
  assert.equal(matchNames(["Алина Жук"],"Alina Zhuk").matched,true);
  assert.equal(matchNames(["Aleksandr Petrov"],"Alexander Petrov").matched,true);
  assert.equal(matchNames(["John Smith"],"Completely Different").matched,false);
});
