import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateRisk,validateClient,validateItem,validateTemplate,dateValue,uuid} from '../app/lib/clients.ts';
test('onboarding templates validate questions, deadlines and custom answers',()=>{
  const question={key:'custom_funds',label:'Source of funds',type:'textarea',required:true};
  const input={name:'Business onboarding',questions:[question],tasks:[{title:'Request evidence',kind:'request',due_days:7}]};
  assert.equal(validateTemplate(input).questions[0].required,true);
  assert.throws(()=>validateTemplate({...input,questions:[question,question]}));
  assert.throws(()=>validateTemplate({...input,tasks:[{title:'Task',kind:'task',due_days:-1}]}));
  assert.throws(()=>validateTemplate({...input,questions:[{...question,type:'script'}]}));
  assert.equal(validateClient({name:'Example',subject_type:'person',details:{custom_funds:'Savings'}}).details.custom_funds,'Savings');
});
test('client forms validate identity details and reject malformed inputs',()=>{
  const client=validateClient({name:'  Example Limited ',subject_type:'business',details:{purpose:'Supplier onboarding'},country:'Malta'});
  assert.equal(client.name,'Example Limited');assert.equal(client.details.purpose,'Supplier onboarding');
  assert.throws(()=>validateClient({name:'',subject_type:'person'}));
  assert.throws(()=>validateClient({name:'Example',subject_type:'person',email:'not-an-email'}));
  assert.throws(()=>dateValue('2026-02-30'));assert.equal(dateValue('2028-02-29'),'2028-02-29');
  assert.throws(()=>uuid('123'));assert.equal(uuid('12345678-1234-1234-1234-123456789abc'),'12345678-1234-1234-1234-123456789abc');
});
test('risk calculations retain explainable weights and a version without overriding screening',()=>{
  assert.equal(calculateRisk([0,0,0,0],[25,25,25,25]).score,0);
  assert.equal(calculateRisk([5,5,5,5],[25,25,25,25]).level,'high');
  assert.equal(calculateRisk([1,2,3,4],[25,25,25,25]).score,50);
  assert.throws(()=>calculateRisk([6,0,0,0],[25,25,25,25]));
  assert.throws(()=>calculateRisk([0,0,0,0],[10,10,10,10]));
  const item=validateItem({kind:'assessment',title:'Periodic assessment',notes:'Reviewed evidence against our approved internal policy.',policyReference:'Policy v1',scores:[1,2,3,4],weights:[25,25,25,25]});
  assert.equal(item.payload.screeningResultSeparate,true);assert.equal(item.payload.modelVersion,'clearcheck-working-model-v1');
  assert.throws(()=>validateItem({kind:'assessment',title:'Assessment',notes:'short'}));
  assert.throws(()=>validateItem({kind:'relationship',title:'Owner',relationship:'Shareholder',ownership:101}));
});
test('client changes are tenant scoped, version checked and audit logged',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20260904153312_client_lifecycle_workspace.sql',import.meta.url),'utf8');
  for(const table of ['clients','client_items','client_documents','client_screenings'])assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql,/p_version<>c.version/);assert.match(sql,/organisation_id=p_org and user_id=p_actor/);
  assert.match(sql,/assessment_actor=p_actor/);assert.match(sql,/screening\.risk_state='incomplete'/);
  assert.match(sql,/insert into public.audit_events/);
  assert.match(sql,/from public,anon,authenticated/);
});
test('document files remain private and are validated before upload',async()=>{
  const api=await readFile(new URL('../app/api/client-documents/route.ts',import.meta.url),'utf8');
  assert.match(api,/file.size>5242880/);assert.match(api,/file.type!==mime/);
  assert.match(api,/SHA-256/);assert.match(api,/Content-Disposition/);assert.match(api,/application\/octet-stream/);
  assert.match(api,/eq\("organisation_id",context.org\)/);assert.match(api,/if\(auditError\)throw auditError/);
});
