-- Run in a transaction: all synthetic users, workspaces, credits and audit events roll back.
begin;
do $$
declare actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); approver uuid:=gen_random_uuid();
 org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); c jsonb; item uuid; screening uuid:=gen_random_uuid(); denied boolean; template jsonb; templated jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (actor,actor::text||'@example.invalid','{"first_name":"Synthetic","last_name":"QA"}'),
 (outsider,outsider::text||'@example.invalid','{"first_name":"Synthetic","last_name":"Outsider"}'),
 (approver,approver::text||'@example.invalid','{"first_name":"Synthetic","last_name":"Approver"}');
 insert into public.organisations(id,name) values(org,'Synthetic QA workspace'),(other_org,'Synthetic other workspace');
 insert into public.organisation_members(organisation_id,user_id,role) values(org,actor,'owner'),(other_org,outsider,'reviewer'),(org,approver,'admin');
 c:=public.client_workspace_mutate(actor,org,null,'create','{"name":"Synthetic client without review date","subject_type":"person","next_review":null}');
 if exists(select 1 from public.clients where id=(c->>'id')::uuid and next_review is not null) then
   raise exception 'Blank review date was populated';
 end if;
 template:=public.client_template_save(actor,org,null,'Synthetic template','[{"key":"custom_funds","label":"Source of funds","type":"textarea","required":true}]','[{"title":"Request evidence","kind":"request","due_days":7}]');
 templated:=public.client_create_from_template(actor,org,(template->>'id')::uuid,'{"name":"Synthetic templated client","subject_type":"person"}');
 if templated->'template_reference'->>'version'<>'1' or jsonb_array_length(templated->'onboarding_schema')<>1 then raise exception 'Template snapshot missing';end if;
 if not exists(select 1 from public.client_items where client_id=(templated->>'id')::uuid and kind='request' and due_at=current_date+7) then raise exception 'Template task missing';end if;
 template:=public.client_template_save(actor,org,(template->>'id')::uuid,'Changed template','[]','[]',1);
 if not exists(select 1 from public.clients where id=(templated->>'id')::uuid and jsonb_array_length(onboarding_schema)=1 and template_reference->>'version'='1') then raise exception 'Template edit changed existing client';end if;
 denied:=false;begin perform public.client_template_save(actor,org,(template->>'id')::uuid,'Stale edit','[]','[]',1);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Stale template update permitted';end if;
 denied:=false;begin perform public.client_create_from_template(outsider,other_org,(template->>'id')::uuid,'{"name":"Unauthorized","subject_type":"person"}');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Cross-tenant template use permitted';end if;
 c:=public.client_workspace_mutate(actor,org,null,'create','{"name":"Synthetic client","subject_type":"person","country":"Malta","next_review":"2027-09-01","details":{"purpose":"Synthetic test only"}}');
 perform set_config('clearcheck.qa.client',c->>'id',true);perform set_config('clearcheck.qa.actor',actor::text,true);perform set_config('clearcheck.qa.outsider',outsider::text,true);
 denied:=false;begin perform public.client_workspace_mutate(outsider,org,(c->>'id')::uuid,'update','{}',1);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Cross-tenant mutation was permitted';end if;
 c:=public.client_workspace_mutate(actor,org,(c->>'id')::uuid,'item','{"kind":"task","title":"Check documents","payload":{}}',(c->>'version')::integer);
 select id into item from public.client_items where client_id=(c->>'id')::uuid and kind='task';
 denied:=false;begin perform public.client_workspace_mutate(actor,org,(c->>'id')::uuid,'item_status',jsonb_build_object('item_id',item,'status','complete'),1);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Stale update was permitted';end if;
 c:=public.client_workspace_mutate(actor,org,(c->>'id')::uuid,'item_status',jsonb_build_object('item_id',item,'status','complete'),(c->>'version')::integer);
 denied:=false;begin perform public.client_workspace_mutate(approver,org,(c->>'id')::uuid,'stage','{"stage":"approved","notes":"Synthetic approval without evidence must fail."}',(c->>'version')::integer);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Approval without evidence was permitted';end if;
 c:=public.client_workspace_mutate(actor,org,(c->>'id')::uuid,'document',jsonb_build_object('name','synthetic.pdf','path','synthetic/'||gen_random_uuid(),'category','Test','mime_type','application/pdf','size',100,'sha256',repeat('a',64)),(c->>'version')::integer);
 c:=public.client_workspace_mutate(actor,org,(c->>'id')::uuid,'item','{"kind":"assessment","title":"Synthetic assessment","payload":{"score":50,"notes":"Synthetic test assessment","policyReference":"QA only"}}',(c->>'version')::integer);
 insert into public.screenings(id,case_reference,organisation_id,subject_name,subject_type,risk_state,checked_at,review_status,reviewed_at) values(screening,'QA-'||screening,org,'Synthetic client','person','clear',now(),'false_positive',now());
 c:=public.client_workspace_mutate(actor,org,(c->>'id')::uuid,'link',jsonb_build_object('screening_id',screening),(c->>'version')::integer);
 denied:=false;begin perform public.client_workspace_mutate(actor,org,(c->>'id')::uuid,'stage','{"stage":"approved","notes":"Synthetic self approval must be rejected."}',(c->>'version')::integer);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Self approval was permitted';end if;
 c:=public.client_workspace_mutate(approver,org,(c->>'id')::uuid,'stage','{"stage":"approved","notes":"Synthetic independent approval after evidence review."}',(c->>'version')::integer);
 if c->>'stage'<>'approved' then raise exception 'Valid independent approval failed';end if;
 if not exists(select 1 from public.audit_events where entity_id=(c->>'id')::uuid and event_type='client.stage') then raise exception 'Audit trail missing';end if;
 update public.screenings set review_status='confirmed_match' where id=screening;
 if not exists(select 1 from public.clients where id=(c->>'id')::uuid and stage='in_review') then raise exception 'Changed screening did not reopen the client review';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('clearcheck.qa.outsider'),true);
do $$begin if exists(select 1 from public.clients where id=current_setting('clearcheck.qa.client')::uuid) then raise exception 'RLS leaked another workspace client';end if;end $$;
select set_config('request.jwt.claim.sub',current_setting('clearcheck.qa.actor'),true);
do $$begin if not exists(select 1 from public.clients where id=current_setting('clearcheck.qa.client')::uuid) then raise exception 'RLS blocked own workspace';end if;
 if has_function_privilege('authenticated','public.client_workspace_mutate(uuid,uuid,uuid,text,jsonb,integer)','execute') then raise exception 'Privileged RPC exposed to browser';end if;
end $$;
reset role;
rollback;
select 'PASS: tenant isolation, optimistic locking, evidence gate, independent approval, screening invalidation and audit trail; fixtures rolled back' as result;
