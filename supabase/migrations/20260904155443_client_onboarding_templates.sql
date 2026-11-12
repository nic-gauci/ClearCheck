create table public.client_templates (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
 name text not null check(length(trim(name)) between 1 and 120),
 questions jsonb not null default '[]' check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)<=20),
 tasks jsonb not null default '[]' check(jsonb_typeof(tasks)='array' and jsonb_array_length(tasks)<=20),
 version integer not null default 1, updated_at timestamptz not null default now()
);
create index client_templates_org_idx on public.client_templates(organisation_id);
alter table public.client_templates enable row level security;
create policy client_templates_read on public.client_templates for select to authenticated using(private.is_org_member(organisation_id));
revoke all on public.client_templates from public,anon,authenticated;
grant select on public.client_templates to authenticated;
grant all on public.client_templates to service_role;
alter table public.clients add column onboarding_schema jsonb not null default '[]' check(jsonb_typeof(onboarding_schema)='array'),
 add column template_reference jsonb;

create function public.client_template_save(p_actor uuid,p_org uuid,p_id uuid,p_name text,p_questions jsonb,p_tasks jsonb,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.client_templates; entry jsonb;
begin
 if p_actor is null or not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and role in ('owner','admin') and status='active') then raise exception 'Owner or admin access required';end if;
 if jsonb_typeof(p_questions)<>'array' or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_questions)>20 or jsonb_array_length(p_tasks)>20 then raise exception 'Templates support up to 20 questions and tasks';end if;
 for entry in select value from jsonb_array_elements(p_questions) loop
   if (entry->>'key')!~'^custom_[a-z0-9_]{1,40}$' or length(trim(coalesce(entry->>'label','')))=0 or length(entry->>'label')>200 or entry->>'type' not in ('text','date','textarea') then raise exception 'Invalid template question';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_questions))<>(select count(distinct value->>'key') from jsonb_array_elements(p_questions)) then raise exception 'Question references must be unique';end if;
 for entry in select value from jsonb_array_elements(p_tasks) loop
   if length(trim(coalesce(entry->>'title','')))=0 or length(entry->>'title')>200 or entry->>'kind' not in ('task','request') or (entry->>'due_days')::integer not between 0 and 365 then raise exception 'Invalid template task';end if;
 end loop;
 if p_id is null then
   insert into public.client_templates(organisation_id,name,questions,tasks) values(p_org,p_name,p_questions,p_tasks) returning * into result;
 else
   update public.client_templates set name=p_name,questions=p_questions,tasks=p_tasks,version=version+1,updated_at=now()
   where id=p_id and organisation_id=p_org and version=p_version returning * into result;
   if result.id is null then raise exception 'Template changed or access denied. Reload before saving.';end if;
 end if;
 insert into public.audit_events(organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(p_org,p_actor,'client_template.saved','client_template',result.id,jsonb_build_object('version',result.version));
 return to_jsonb(result);
end $$;
revoke all on function public.client_template_save(uuid,uuid,uuid,text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.client_template_save(uuid,uuid,uuid,text,jsonb,jsonb,integer) to service_role;

create function public.client_create_from_template(p_actor uuid,p_org uuid,p_template uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare template public.client_templates; c jsonb; entry jsonb;
begin
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and role in ('owner','admin','reviewer') and status='active') then raise exception 'Client workspace access denied';end if;
 select * into template from public.client_templates where id=p_template and organisation_id=p_org;
 if template.id is null then raise exception 'Template not found';end if;
 c:=public.client_workspace_mutate(p_actor,p_org,null,'create',p_data);
 update public.clients set onboarding_schema=template.questions,template_reference=jsonb_build_object('id',template.id,'name',template.name,'version',template.version) where id=(c->>'id')::uuid;
 for entry in select value from jsonb_array_elements(template.tasks) loop
   c:=public.client_workspace_mutate(p_actor,p_org,(c->>'id')::uuid,'item',jsonb_build_object('kind',entry->>'kind','title',entry->>'title','due_at',(current_date+(entry->>'due_days')::integer)::text,'payload',jsonb_build_object('template_id',template.id,'template_version',template.version)),(c->>'version')::integer);
 end loop;
 insert into public.audit_events(organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(p_org,p_actor,'client.template_applied','client',(c->>'id')::uuid,jsonb_build_object('template_id',template.id,'template_version',template.version));
 select to_jsonb(client) into c from public.clients client where id=(c->>'id')::uuid;
 return c;
end $$;
revoke all on function public.client_create_from_template(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.client_create_from_template(uuid,uuid,uuid,jsonb) to service_role;

create function private.check_client_questionnaire() returns trigger language plpgsql set search_path='' as $$
declare question jsonb;
begin
 if new.subject_type<>old.subject_type and exists(select 1 from public.client_screenings where client_id=new.id) then raise exception 'Client type cannot change after screenings are linked. Create a separate client file.';end if;
 if new.stage='approved' and old.stage<>'approved' then
   for question in select value from jsonb_array_elements(new.onboarding_schema) loop
     if coalesce((question->>'required')::boolean,false) and trim(coalesce(new.details->>(question->>'key'),''))='' then raise exception 'Complete all required onboarding questions before approval';end if;
   end loop;
 end if;
 return new;
end $$;
revoke all on function private.check_client_questionnaire() from public,anon,authenticated;
create trigger client_questionnaire_guard before update on public.clients for each row execute function private.check_client_questionnaire();
