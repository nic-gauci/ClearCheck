create schema if not exists private;
revoke all on schema private from public, anon;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  display_name text not null default '',
  company text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid references auth.users(id) on delete set null,
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','reviewer','member')),
  status text not null default 'active' check (status in ('active','invited','suspended')),
  joined_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create table public.plans (
  id text primary key,
  name text not null,
  billing_mode text not null check (billing_mode in ('single','bundle','monthly','beta')),
  price_cents integer not null check (price_cents >= 0),
  credits integer check (credits is null or credits > 0),
  interval_name text check (interval_name is null or interval_name in ('once','month')),
  description text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.screenings (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  subject_name text not null check (char_length(subject_name) between 2 and 120),
  subject_type text not null check (subject_type in ('person','business')),
  status text not null default 'completed' check (status in ('running','completed','review','closed','failed')),
  risk_state text not null check (risk_state in ('clear','review','incomplete')),
  match_count integer not null default 0 check (match_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  credits_charged integer not null default 1 check (credits_charged >= 0),
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  web_searches jsonb not null default '[]'::jsonb check (jsonb_typeof(web_searches) = 'array'),
  review_notes text,
  checked_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.screenings(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  generated_by uuid references auth.users(id) on delete set null,
  report_type text not null default 'pdf' check (report_type in ('pdf','data_export')),
  checksum text,
  generated_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organisation_id uuid references public.organisations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  amount integer not null check (amount <> 0),
  entry_type text not null check (entry_type in ('beta_grant','purchase','bundle','subscription','screening','refund','adjustment')),
  screening_id uuid references public.screenings(id) on delete restrict,
  external_reference text,
  created_at timestamptz not null default now()
);

create table public.billing_customers (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan_id text references public.plans(id),
  subscription_status text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.compliance_settings (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  retention_months integer not null default 60 check (retention_months between 1 and 120),
  automatic_deletion boolean not null default false,
  legal_hold boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected','completed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index organisation_members_user_idx on public.organisation_members(user_id, status);
create index screenings_org_created_idx on public.screenings(organisation_id, created_at desc);
create index screenings_creator_idx on public.screenings(created_by, created_at desc);
create index screenings_status_idx on public.screenings(organisation_id, status, created_at desc);
create index reports_screening_idx on public.reports(screening_id, generated_at desc);
create index reports_org_idx on public.reports(organisation_id, generated_at desc);
create index audit_events_org_created_idx on public.audit_events(organisation_id, created_at desc);
create index audit_events_actor_idx on public.audit_events(actor_user_id, created_at desc);
create index credit_ledger_org_created_idx on public.credit_ledger(organisation_id, created_at desc);
create index credit_ledger_screening_idx on public.credit_ledger(screening_id);
create index deletion_requests_org_idx on public.data_deletion_requests(organisation_id, requested_at desc);

insert into public.plans (id,name,billing_mode,price_cents,credits,interval_name,description,sort_order)
values
  ('beta','Private beta','beta',0,25,'once','25 complimentary screening credits while ClearCheck is in private beta.',0),
  ('single','Single screening','single',900,1,'once','One AML screening with a saved audit record and PDF report.',10),
  ('bundle_20','20-screen bundle','bundle',12900,20,'once','Twenty prepaid screening credits for occasional compliance work.',20),
  ('monthly_100','Compliance monthly','monthly',24900,100,'month','One hundred screening credits renewed monthly.',30)
on conflict (id) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  credits = excluded.credits,
  interval_name = excluded.interval_name,
  description = excluded.description,
  active = excluded.active,
  sort_order = excluded.sort_order;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger organisations_touch before update on public.organisations for each row execute function private.touch_updated_at();
create trigger screenings_touch before update on public.screenings for each row execute function private.touch_updated_at();
create trigger billing_customers_touch before update on public.billing_customers for each row execute function private.touch_updated_at();
create trigger compliance_settings_touch before update on public.compliance_settings for each row execute function private.touch_updated_at();

create or replace function private.is_org_member(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organisation_members membership
    where membership.organisation_id = target_organisation_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_org_role(target_organisation_id uuid, permitted_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organisation_members membership
    where membership.organisation_id = target_organisation_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(permitted_roles)
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organisation_id uuid;
  supplied_first text := trim(coalesce(new.raw_user_meta_data ->> 'first_name',''));
  supplied_last text := trim(coalesce(new.raw_user_meta_data ->> 'last_name',''));
  supplied_company text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company','')), '');
  supplied_display text := trim(coalesce(new.raw_user_meta_data ->> 'full_name',''));
  organisation_name text;
begin
  if supplied_display = '' then
    supplied_display := nullif(trim(supplied_first || ' ' || supplied_last), '');
  end if;
  supplied_display := coalesce(supplied_display, split_part(coalesce(new.email,'ClearCheck user'),'@',1));
  organisation_name := coalesce(supplied_company, supplied_display || '''s organisation');

  insert into public.profiles (id,first_name,last_name,display_name,company)
  values (new.id,supplied_first,supplied_last,supplied_display,supplied_company);

  insert into public.organisations (name,created_by,billing_email)
  values (left(organisation_name,120),new.id,new.email)
  returning id into organisation_id;

  insert into public.organisation_members (organisation_id,user_id,role,status)
  values (organisation_id,new.id,'owner','active');

  insert into public.compliance_settings (organisation_id,updated_by)
  values (organisation_id,new.id);

  insert into public.credit_ledger (organisation_id,user_id,amount,entry_type,external_reference)
  values (organisation_id,new.id,25,'beta_grant','initial-beta-credit');

  insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (organisation_id,new.id,'account.created','organisation',organisation_id,jsonb_build_object('source','auth-signup'));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke execute on function private.touch_updated_at() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.is_org_member(uuid) from public, anon;
revoke execute on function private.has_org_role(uuid,text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid,text[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.plans enable row level security;
alter table public.screenings enable row level security;
alter table public.reports enable row level security;
alter table public.audit_events enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.billing_customers enable row level security;
alter table public.compliance_settings enable row level security;
alter table public.data_deletion_requests enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy organisations_select_member on public.organisations for select to authenticated
  using ((select private.is_org_member(id)));
create policy organisations_update_admin on public.organisations for update to authenticated
  using ((select private.has_org_role(id,array['owner','admin']::text[])))
  with check ((select private.has_org_role(id,array['owner','admin']::text[])));

create policy organisation_members_select_member on public.organisation_members for select to authenticated
  using ((select private.is_org_member(organisation_id)));
create policy organisation_members_insert_admin on public.organisation_members for insert to authenticated
  with check ((select private.has_org_role(organisation_id,array['owner','admin']::text[])));
create policy organisation_members_update_admin on public.organisation_members for update to authenticated
  using ((select private.has_org_role(organisation_id,array['owner','admin']::text[])))
  with check ((select private.has_org_role(organisation_id,array['owner','admin']::text[])));
create policy organisation_members_delete_admin on public.organisation_members for delete to authenticated
  using ((select private.has_org_role(organisation_id,array['owner','admin']::text[])) and role <> 'owner');

create policy plans_public_read on public.plans for select to anon, authenticated using (active = true);

create policy screenings_select_member on public.screenings for select to authenticated
  using ((select private.is_org_member(organisation_id)));
create policy screenings_update_reviewer on public.screenings for update to authenticated
  using ((select private.has_org_role(organisation_id,array['owner','admin','reviewer']::text[])))
  with check ((select private.has_org_role(organisation_id,array['owner','admin','reviewer']::text[])));

create policy reports_select_member on public.reports for select to authenticated
  using ((select private.is_org_member(organisation_id)));
create policy audit_events_select_member on public.audit_events for select to authenticated
  using ((select private.is_org_member(organisation_id)));
create policy credit_ledger_select_member on public.credit_ledger for select to authenticated
  using ((select private.is_org_member(organisation_id)));

create policy compliance_settings_select_member on public.compliance_settings for select to authenticated
  using ((select private.is_org_member(organisation_id)));
create policy compliance_settings_update_admin on public.compliance_settings for update to authenticated
  using ((select private.has_org_role(organisation_id,array['owner','admin']::text[])))
  with check ((select private.has_org_role(organisation_id,array['owner','admin']::text[])));

create policy deletion_requests_select_own on public.data_deletion_requests for select to authenticated
  using (requested_by = (select auth.uid()));
create policy deletion_requests_insert_own on public.data_deletion_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and (select private.is_org_member(organisation_id)));

revoke all on all tables in schema public from anon, authenticated;
grant select, update(first_name,last_name,display_name,company,phone) on public.profiles to authenticated;
grant select, update(name,billing_email) on public.organisations to authenticated;
grant select, insert, update(role,status), delete on public.organisation_members to authenticated;
grant select on public.plans to anon, authenticated;
grant select, update(status,risk_state,review_notes,completed_at) on public.screenings to authenticated;
grant select on public.reports, public.audit_events, public.credit_ledger to authenticated;
grant select, update(retention_months,automatic_deletion,legal_hold,updated_by) on public.compliance_settings to authenticated;
grant select, insert on public.data_deletion_requests to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create or replace function public.record_screening(
  p_organisation_id uuid,
  p_subject_name text,
  p_subject_type text,
  p_risk_state text,
  p_results jsonb,
  p_sources jsonb,
  p_web_searches jsonb,
  p_checked_at timestamptz
)
returns table (screening_id uuid, case_reference text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_screening_id uuid := gen_random_uuid();
  new_case_reference text;
  available_credits integer;
  calculated_match_count integer;
  calculated_source_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not private.is_org_member(p_organisation_id) then raise exception 'Organisation access denied'; end if;
  if char_length(trim(p_subject_name)) not between 2 and 120 then raise exception 'Invalid subject name'; end if;
  if p_subject_type not in ('person','business') then raise exception 'Invalid subject type'; end if;
  if p_risk_state not in ('clear','review','incomplete') then raise exception 'Invalid risk state'; end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_typeof(p_sources) <> 'array' or jsonb_typeof(p_web_searches) <> 'array' then
    raise exception 'Invalid screening payload';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,0));
  select coalesce(sum(amount),0)::integer into available_credits
  from public.credit_ledger where organisation_id = p_organisation_id;
  if available_credits < 1 then raise exception 'No screening credits available'; end if;

  calculated_match_count := jsonb_array_length(p_results);
  calculated_source_count := jsonb_array_length(p_sources);
  new_case_reference := 'CC-' || to_char(coalesce(p_checked_at,now()),'YYYYMMDD') || '-' || upper(substr(replace(new_screening_id::text,'-',''),1,8));

  insert into public.screenings (
    id,case_reference,organisation_id,created_by,subject_name,subject_type,status,risk_state,
    match_count,source_count,credits_charged,results,sources,web_searches,checked_at,completed_at
  ) values (
    new_screening_id,new_case_reference,p_organisation_id,actor_id,trim(p_subject_name),p_subject_type,'completed',p_risk_state,
    calculated_match_count,calculated_source_count,1,p_results,p_sources,p_web_searches,coalesce(p_checked_at,now()),now()
  );

  insert into public.credit_ledger (organisation_id,user_id,amount,entry_type,screening_id)
  values (p_organisation_id,actor_id,-1,'screening',new_screening_id);

  insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (p_organisation_id,actor_id,'screening.completed','screening',new_screening_id,
    jsonb_build_object('case_reference',new_case_reference,'subject_type',p_subject_type,'risk_state',p_risk_state,'match_count',calculated_match_count));

  return query select new_screening_id,new_case_reference,now();
end;
$$;

create or replace function public.record_report_download(p_screening_id uuid, p_checksum text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_org uuid;
  report_id uuid := gen_random_uuid();
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select organisation_id into target_org from public.screenings where id = p_screening_id;
  if target_org is null or not private.is_org_member(target_org) then raise exception 'Screening access denied'; end if;

  insert into public.reports (id,screening_id,organisation_id,generated_by,report_type,checksum)
  values (report_id,p_screening_id,target_org,actor_id,'pdf',nullif(trim(p_checksum),''));
  insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (target_org,actor_id,'report.downloaded','screening',p_screening_id,jsonb_build_object('report_id',report_id));
  return report_id;
end;
$$;

revoke execute on function public.record_screening(uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) from public, anon;
revoke execute on function public.record_report_download(uuid,text) from public, anon;
grant execute on function public.record_screening(uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) to authenticated;
grant execute on function public.record_report_download(uuid,text) to authenticated;
