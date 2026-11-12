-- Client lifecycle foundation. Existing screenings and audit history are preserved.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  subject_type text not null check (subject_type in ('person','business')),
  reference text not null default '', country text not null default '', email text not null default '',
  stage text not null default 'onboarding' check (stage in ('onboarding','in_review','approved','rejected','archived')),
  next_review date, details jsonb not null default '{}' check (jsonb_typeof(details)='object'),
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,organisation_id)
);
create index clients_org_updated_idx on public.clients(organisation_id,updated_at desc);
create index clients_org_review_idx on public.clients(organisation_id,next_review);
create table public.client_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null, organisation_id uuid not null,
  kind text not null check (kind in ('task','request','note','relationship','assessment')),
  title text not null check (length(trim(title)) between 1 and 200),
  status text not null default 'open' check (status in ('open','complete')),
  due_at date, assigned_to uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload)='object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (client_id,organisation_id) references public.clients(id,organisation_id) on delete restrict
);
create index client_items_org_client_idx on public.client_items(organisation_id,client_id,created_at desc);
create index client_items_assigned_idx on public.client_items(assigned_to,due_at);
create index client_items_creator_idx on public.client_items(created_by);
create table public.client_documents (
  id uuid primary key default gen_random_uuid(), client_id uuid not null, organisation_id uuid not null,
  name text not null, path text not null unique, category text not null, mime_type text not null,
  size integer not null check(size between 1 and 5242880), sha256 text not null, expires_at date,
  created_at timestamptz not null default now(),
  foreign key (client_id,organisation_id) references public.clients(id,organisation_id) on delete restrict
);
create index client_documents_org_client_idx on public.client_documents(organisation_id,client_id);
create table public.client_screenings (
  screening_id uuid primary key references public.screenings(id) on delete restrict,
  client_id uuid not null, organisation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (client_id,organisation_id) references public.clients(id,organisation_id) on delete restrict
);
create index client_screenings_org_client_idx on public.client_screenings(organisation_id,client_id);
alter table public.clients enable row level security;
alter table public.client_items enable row level security;
alter table public.client_documents enable row level security;
alter table public.client_screenings enable row level security;
create policy clients_member_read on public.clients for select to authenticated using (private.is_org_member(organisation_id));
create policy client_items_member_read on public.client_items for select to authenticated using (private.is_org_member(organisation_id));
create policy client_documents_member_read on public.client_documents for select to authenticated using (private.is_org_member(organisation_id));
create policy client_screenings_member_read on public.client_screenings for select to authenticated using (private.is_org_member(organisation_id));
revoke all on public.clients,public.client_items,public.client_documents,public.client_screenings from anon,authenticated;
grant select on public.clients,public.client_items,public.client_documents,public.client_screenings to authenticated;
grant all on public.clients,public.client_items,public.client_documents,public.client_screenings to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('client-documents','client-documents',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
-- No client storage policies: uploads/downloads are authorised and audited by the server.
create or replace function public.client_workspace_mutate(
 p_actor uuid,p_org uuid,p_client uuid,p_action text,p_data jsonb default '{}',p_version integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.clients; member_role text; item_id uuid; assessment_actor uuid; screening public.screenings; result jsonb;
begin
 select role into member_role from public.organisation_members where organisation_id=p_org and user_id=p_actor and status='active';
 if p_actor is null or member_role is null or member_role not in ('owner','admin','reviewer') then raise exception 'Client workspace access denied'; end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>30000 then raise exception 'Invalid payload'; end if;
 if p_action='create' then
   insert into public.clients(organisation_id,name,subject_type,reference,country,email,next_review,details)
   values(p_org,p_data->>'name',p_data->>'subject_type',coalesce(p_data->>'reference',''),coalesce(p_data->>'country',''),coalesce(p_data->>'email',''),nullif(p_data->>'next_review','')::date,coalesce(p_data->'details','{}')) returning * into c;
 else
   select * into c from public.clients where id=p_client and organisation_id=p_org for update;
   if c.id is null then raise exception 'Client workspace access denied'; end if;
   if p_version is null or p_version<>c.version then raise exception 'This client changed. Reload before saving.'; end if;
   if p_action='update' then
     update public.clients set name=p_data->>'name',subject_type=p_data->>'subject_type',reference=coalesce(p_data->>'reference',''),country=coalesce(p_data->>'country',''),email=coalesce(p_data->>'email',''),next_review=nullif(p_data->>'next_review','')::date,details=coalesce(p_data->'details','{}'),stage=case when stage='approved' then 'in_review' else stage end where id=c.id;
   elsif p_action='stage' then
     if length(trim(coalesce(p_data->>'notes','')))<20 then raise exception 'Explain the decision in at least 20 characters'; end if;
     if p_data->>'stage' not in ('onboarding','in_review','approved','rejected','archived') then raise exception 'Invalid stage'; end if;
     if p_data->>'stage' in ('approved','rejected','archived') and member_role not in ('owner','admin') then raise exception 'Owner or admin approval required'; end if;
     if p_data->>'stage'='approved' then
       if c.country='' or coalesce(c.details->>'purpose','')='' or c.next_review is null then raise exception 'Complete country, relationship purpose and next review date before approval'; end if;
       if exists(select 1 from public.client_items where client_id=c.id and kind in ('task','request') and status='open') then raise exception 'Complete all open tasks and document requests before approval'; end if;
       if not exists(select 1 from public.client_documents where client_id=c.id and (expires_at is null or expires_at>=current_date)) then raise exception 'Add current supporting documentation before approval'; end if;
       select created_by into assessment_actor from public.client_items where client_id=c.id and kind='assessment' order by created_at desc,id desc limit 1;
       if assessment_actor is null then raise exception 'Record a risk assessment before approval'; end if;
       if assessment_actor=p_actor then raise exception 'A different owner or admin must approve the assessor''s decision'; end if;
       select s.* into screening from public.screenings s join public.client_screenings l on l.screening_id=s.id where l.client_id=c.id order by s.checked_at desc limit 1;
       if screening.id is null or screening.risk_state='incomplete' or screening.review_status not in ('false_positive','closed_no_match') then raise exception 'Link a complete screening with a resolved human review before approval'; end if;
     end if;
     update public.clients set stage=p_data->>'stage' where id=c.id;
     insert into public.client_items(client_id,organisation_id,kind,title,status,payload,created_by) values(c.id,p_org,'note','Lifecycle decision: '||(p_data->>'stage'),'complete',jsonb_build_object('notes',p_data->>'notes','previous_stage',c.stage),p_actor);
   elsif p_action='item' then
     if p_data->>'assigned_to' is not null and not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=(p_data->>'assigned_to')::uuid and status='active') then raise exception 'Assignee must belong to this workspace'; end if;
     insert into public.client_items(client_id,organisation_id,kind,title,due_at,assigned_to,payload,created_by,status)
     values(c.id,p_org,p_data->>'kind',p_data->>'title',nullif(p_data->>'due_at','')::date,(p_data->>'assigned_to')::uuid,coalesce(p_data->'payload','{}'),p_actor,case when p_data->>'kind' in ('task','request') then 'open' else 'complete' end) returning id into item_id;
     if c.stage='approved' then update public.clients set stage='in_review' where id=c.id; end if;
   elsif p_action='item_status' then
     if p_data->>'status' not in ('open','complete') then raise exception 'Invalid task status'; end if;
     update public.client_items set status=p_data->>'status' where id=(p_data->>'item_id')::uuid and client_id=c.id and kind in ('task','request') returning id into item_id;
     if item_id is null then raise exception 'Task not found'; end if;
     if p_data->>'status'='open' and c.stage='approved' then update public.clients set stage='in_review' where id=c.id; end if;
   elsif p_action='link' then
     select * into screening from public.screenings where id=(p_data->>'screening_id')::uuid and organisation_id=p_org;
     if screening.id is null or screening.subject_type<>c.subject_type then raise exception 'Select a screening for this workspace and client type'; end if;
     insert into public.client_screenings(screening_id,client_id,organisation_id) values(screening.id,c.id,p_org);
     if c.stage='approved' then update public.clients set stage='in_review' where id=c.id; end if;
   elsif p_action='document' then
     insert into public.client_documents(client_id,organisation_id,name,path,category,mime_type,size,sha256,expires_at)
     values(c.id,p_org,p_data->>'name',p_data->>'path',p_data->>'category',p_data->>'mime_type',(p_data->>'size')::integer,p_data->>'sha256',nullif(p_data->>'expires_at','')::date) returning id into item_id;
     if c.stage='approved' then update public.clients set stage='in_review' where id=c.id; end if;
   else raise exception 'Invalid client action'; end if;
   update public.clients set version=version+1,updated_at=now() where id=c.id returning * into c;
 end if;
 insert into public.audit_events(organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
 values(p_org,p_actor,'client.'||p_action,'client',c.id,jsonb_build_object('version',c.version,'item_id',item_id,'stage',c.stage));
 return to_jsonb(c);
end $$;
revoke all on function public.client_workspace_mutate(uuid,uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.client_workspace_mutate(uuid,uuid,uuid,text,jsonb,integer) to service_role;
