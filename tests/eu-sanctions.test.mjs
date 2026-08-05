import assert from "node:assert/strict";
import test from "node:test";
import { screenEUConsolidatedCsv } from "../app/lib/eu-sanctions.ts";
import { matchNames } from "../app/lib/name-matching.ts";
import { screenEUOfficialJournalSupplements } from "../app/lib/eu-official-journal.ts";

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

test("the reviewed EUR-Lex supplement detects the real Alina JUC upstream omission",()=>{
  const matches=screenEUOfficialJournalSupplements("Alina Juc","person");
  assert.equal(matches.length,1);
  assert.equal(matches[0].dateOfBirth,"2000-11-05");
  assert.match(matches[0].legalUrl,/eur-lex\.europa\.eu\/eli\/reg_impl\/2026\/1358/);
  assert.equal(screenEUOfficialJournalSupplements("Alina Juc","business").length,0);
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
