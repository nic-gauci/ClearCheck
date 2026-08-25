import assert from "node:assert/strict";
import test from "node:test";
import { screenUNConsolidatedXml } from "../app/lib/un-sanctions.ts";

const fixture=`<?xml version="1.0"?>
<CONSOLIDATED_LIST dateGenerated="2026-08-24T23:00:00.871Z">
  <INDIVIDUALS><INDIVIDUAL><DATAID>1</DATAID><FIRST_NAME>ALINA</FIRST_NAME><SECOND_NAME>JUC</SECOND_NAME><REFERENCE_NUMBER>XXi.001</REFERENCE_NUMBER><LISTED_ON>2026-06-15</LISTED_ON><UN_LIST_TYPE>TEST</UN_LIST_TYPE><COMMENTS1>Individual record</COMMENTS1><INDIVIDUAL_ALIAS><ALIAS_NAME>Alina Zhuk</ALIAS_NAME></INDIVIDUAL_ALIAS><INDIVIDUAL_DATE_OF_BIRTH><DATE>2000-11-05</DATE></INDIVIDUAL_DATE_OF_BIRTH><NATIONALITY><VALUE>Moldova</VALUE></NATIONALITY><INDIVIDUAL_DOCUMENT><NUMBER>AB123</NUMBER></INDIVIDUAL_DOCUMENT></INDIVIDUAL></INDIVIDUALS>
  <ENTITIES><ENTITY><DATAID>2</DATAID><FIRST_NAME>ALINA JUC HOLDINGS</FIRST_NAME><REFERENCE_NUMBER>XXe.001</REFERENCE_NUMBER><LISTED_ON>2026-06-15</LISTED_ON><UN_LIST_TYPE>TEST</UN_LIST_TYPE><COMMENTS1>Entity record</COMMENTS1><ENTITY_ALIAS><ALIAS_NAME>AJ Holdings</ALIAS_NAME></ENTITY_ALIAS></ENTITY></ENTITIES>
</CONSOLIDATED_LIST>`;

test("UN screening separates individuals and entities",()=>{
  const person=screenUNConsolidatedXml(fixture,"Alina Juc","person");
  const business=screenUNConsolidatedXml(fixture,"Alina Juc Holdings","business");
  assert.equal(person.matches.length,1);
  assert.equal(person.matches[0].type,"Individual");
  assert.equal(business.matches.length,1);
  assert.equal(business.matches[0].type,"Entity");
  assert.equal(screenUNConsolidatedXml(fixture,"AJ Holdings","person").matches.length,0);
});

test("UN screening retains identifiers and feed version",()=>{
  const result=screenUNConsolidatedXml(fixture,"Alina Zhuk","person");
  assert.equal(result.generatedAt,"2026-08-24T23:00:00.871Z");
  assert.equal(result.recordCount,1);
  assert.equal(result.matches[0].dateOfBirth,"2000-11-05");
  assert.deepEqual(result.matches[0].nationalities,["Moldova"]);
  assert.deepEqual(result.matches[0].identificationNumbers,["AB123"]);
});
