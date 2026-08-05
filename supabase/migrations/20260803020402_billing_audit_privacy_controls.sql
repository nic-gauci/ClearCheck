alter table public.credit_ledger
  add column if not exists plan_id text references public.plans(id),
  add column if not exists amount_paid_cents integer check (amount_paid_cents is null or amount_paid_cents >= 0),
  add column if not exists currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  add column if not exists payment_status text check (payment_status is null or payment_status in ('paid','refunded','partially_refunded','disputed'));

create index if not exists credit_ledger_payment_history_idx
on public.credit_ledger (organisation_id, created_at desc)
where entry_type in ('purchase','bundle','subscription','refund');

alter table public.data_deletion_requests
  add column if not exists request_type text not null default 'deletion'
    check (request_type in ('access','correction','deletion','restriction','objection')),
  add column if not exists response_due_at timestamptz not null default (now() + interval '1 month');

revoke insert on public.data_deletion_requests from authenticated;
grant insert (organisation_id,requested_by,reason,request_type) on public.data_deletion_requests to authenticated;

create or replace function public.process_stripe_event_v2(
  p_event_id text,
  p_event_type text,
  p_organisation_id uuid,
  p_plan_id text,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_status text,
  p_current_period_end timestamptz,
  p_grant_credits boolean,
  p_amount_paid_cents integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_event text;
  plan_credits integer;
  plan_mode text;
  normalised_currency text := upper(nullif(trim(p_currency),''));
begin
  if p_event_id is null or char_length(p_event_id) > 255 then raise exception 'Invalid payment event reference'; end if;
  if p_amount_paid_cents is not null and p_amount_paid_cents < 0 then raise exception 'Invalid paid amount'; end if;
  if normalised_currency is not null and normalised_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid payment currency'; end if;

  insert into public.billing_events (stripe_event_id,event_type)
  values (p_event_id,p_event_type)
  on conflict (stripe_event_id) do nothing
  returning stripe_event_id into claimed_event;

  if claimed_event is null then return false; end if;
  if p_organisation_id is null then return true; end if;

  select credits,billing_mode into plan_credits,plan_mode
  from public.plans where id = p_plan_id and active = true;
  if p_plan_id is not null and plan_credits is null then raise exception 'Unknown or inactive billing plan'; end if;

  insert into public.billing_customers (
    organisation_id,stripe_customer_id,stripe_subscription_id,plan_id,
    subscription_status,current_period_end
  ) values (
    p_organisation_id,p_customer_id,p_subscription_id,p_plan_id,
    p_subscription_status,p_current_period_end
  )
  on conflict (organisation_id) do update set
    stripe_customer_id = coalesce(excluded.stripe_customer_id,public.billing_customers.stripe_customer_id),
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id,public.billing_customers.stripe_subscription_id),
    plan_id = coalesce(excluded.plan_id,public.billing_customers.plan_id),
    subscription_status = coalesce(excluded.subscription_status,public.billing_customers.subscription_status),
    current_period_end = coalesce(excluded.current_period_end,public.billing_customers.current_period_end);

  if p_grant_credits then
    if coalesce(plan_credits,0) <= 0 then raise exception 'Plan has no grantable credits'; end if;
    insert into public.credit_ledger (
      organisation_id,amount,entry_type,external_reference,plan_id,
      amount_paid_cents,currency,payment_status
    ) values (
      p_organisation_id,
      plan_credits,
      case when plan_mode = 'monthly' then 'subscription'
           when plan_mode = 'bundle' then 'bundle'
           else 'purchase' end,
      p_event_id,p_plan_id,p_amount_paid_cents,normalised_currency,'paid'
    );
    insert into public.audit_events (organisation_id,event_type,entity_type,metadata)
    values (p_organisation_id,'billing.credits_granted','organisation',
      jsonb_build_object('stripe_event_id',p_event_id,'plan_id',p_plan_id,'credits',plan_credits,'amount_paid_cents',p_amount_paid_cents,'currency',normalised_currency));
  end if;

  return true;
end;
$$;

revoke execute on function public.process_stripe_event_v2(text,text,uuid,text,text,text,text,timestamptz,boolean,integer,text)
from public, anon, authenticated;
grant execute on function public.process_stripe_event_v2(text,text,uuid,text,text,text,text,timestamptz,boolean,integer,text)
to service_role;

create policy source_snapshots_no_client_access
on public.source_snapshots for all to authenticated
using (false) with check (false);

create or replace function public.record_screening_v2(
  p_actor_id uuid,
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
  new_screening_id uuid := gen_random_uuid();
  new_case_reference text;
  available_credits integer;
  calculated_match_count integer;
  calculated_source_count integer;
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.organisation_members
    where organisation_id=p_organisation_id and user_id=p_actor_id and status='active'
  ) then raise exception 'Organisation access denied'; end if;
  if char_length(trim(p_subject_name)) not between 2 and 120 then raise exception 'Invalid subject name'; end if;
  if p_subject_type not in ('person','business') then raise exception 'Invalid subject type'; end if;
  if p_risk_state not in ('review','incomplete') then raise exception 'Invalid risk state'; end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_typeof(p_sources) <> 'array' or jsonb_typeof(p_web_searches) <> 'array' then raise exception 'Invalid screening payload'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,0));
  select coalesce(sum(amount),0)::integer into available_credits from public.credit_ledger where organisation_id=p_organisation_id;
  if available_credits < 1 then raise exception 'No screening credits available'; end if;

  calculated_match_count:=jsonb_array_length(p_results);calculated_source_count:=jsonb_array_length(p_sources);
  new_case_reference:='CC-'||to_char(coalesce(p_checked_at,now()),'YYYYMMDD')||'-'||upper(substr(replace(new_screening_id::text,'-',''),1,8));
  insert into public.screenings (id,case_reference,organisation_id,created_by,subject_name,subject_type,status,risk_state,match_count,source_count,credits_charged,results,sources,web_searches,checked_at,completed_at)
  values (new_screening_id,new_case_reference,p_organisation_id,p_actor_id,trim(p_subject_name),p_subject_type,'completed',p_risk_state,calculated_match_count,calculated_source_count,1,p_results,p_sources,p_web_searches,coalesce(p_checked_at,now()),now());
  insert into public.credit_ledger (organisation_id,user_id,amount,entry_type,screening_id) values (p_organisation_id,p_actor_id,-1,'screening',new_screening_id);
  insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (p_organisation_id,p_actor_id,'screening.completed','screening',new_screening_id,jsonb_build_object('case_reference',new_case_reference,'subject_type',p_subject_type,'risk_state',p_risk_state,'match_count',calculated_match_count));
  return query select new_screening_id,new_case_reference,now();
end;
$$;

create or replace function public.record_report_download_v2(p_actor_id uuid,p_screening_id uuid,p_checksum text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target_org uuid; report_id uuid:=gen_random_uuid();
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  select organisation_id into target_org from public.screenings where id=p_screening_id;
  if target_org is null or not exists (
    select 1 from public.organisation_members where organisation_id=target_org and user_id=p_actor_id and status='active'
  ) then raise exception 'Screening access denied'; end if;
  insert into public.reports (id,screening_id,organisation_id,generated_by,report_type,checksum) values (report_id,p_screening_id,target_org,p_actor_id,'pdf',nullif(trim(p_checksum),''));
  insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata) values (target_org,p_actor_id,'report.downloaded','screening',p_screening_id,jsonb_build_object('report_id',report_id));
  return report_id;
end;
$$;

revoke execute on function public.record_screening(uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) from authenticated;
revoke execute on function public.record_report_download(uuid,text) from authenticated;
revoke execute on function public.record_screening_v2(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated;
revoke execute on function public.record_report_download_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_screening_v2(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.record_report_download_v2(uuid,uuid,text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname='clearcheck-daily-eu-sanctions-sync';
select cron.schedule(
  'clearcheck-daily-eu-sanctions-sync','15 2 * * *',
  $schedule$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='clearcheck_project_url' limit 1)||'/functions/v1/sync-eu-sanctions',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='clearcheck_anon_key' limit 1),
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='clearcheck_anon_key' limit 1),
        'X-ClearCheck-Sync-Secret',(select decrypted_secret from vault.decrypted_secrets where name='clearcheck_source_sync_secret' limit 1)
      ),
      body := jsonb_build_object('scheduled_at',now()),timeout_milliseconds:=120000
    ) as request_id;
  $schedule$
);
