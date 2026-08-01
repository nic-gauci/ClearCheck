create unique index if not exists credit_ledger_org_external_reference_idx
on public.credit_ledger (organisation_id, external_reference)
where external_reference is not null;

create or replace function public.process_stripe_event(
  p_event_id text,
  p_event_type text,
  p_organisation_id uuid,
  p_plan_id text,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_status text,
  p_current_period_end timestamptz,
  p_grant_credits boolean
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
begin
  insert into public.billing_events (stripe_event_id,event_type)
  values (p_event_id,p_event_type)
  on conflict (stripe_event_id) do nothing
  returning stripe_event_id into claimed_event;

  if claimed_event is null then return false; end if;
  if p_organisation_id is null then return true; end if;

  select credits,billing_mode into plan_credits,plan_mode
  from public.plans where id = p_plan_id and active = true;
  if p_plan_id is not null and plan_credits is null then
    raise exception 'Unknown or inactive billing plan';
  end if;

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
    insert into public.credit_ledger (organisation_id,amount,entry_type,external_reference)
    values (
      p_organisation_id,
      plan_credits,
      case when plan_mode = 'monthly' then 'subscription'
           when plan_mode = 'bundle' then 'bundle'
           else 'purchase' end,
      p_event_id
    );
    insert into public.audit_events (organisation_id,event_type,entity_type,metadata)
    values (p_organisation_id,'billing.credits_granted','organisation',
      jsonb_build_object('stripe_event_id',p_event_id,'plan_id',p_plan_id,'credits',plan_credits));
  end if;

  return true;
end;
$$;

revoke execute on function public.process_stripe_event(text,text,uuid,text,text,text,text,timestamptz,boolean)
from public, anon, authenticated;
grant execute on function public.process_stripe_event(text,text,uuid,text,text,text,text,timestamptz,boolean)
to service_role;
