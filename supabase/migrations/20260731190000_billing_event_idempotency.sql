create table public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;
create policy billing_events_no_client_access
on public.billing_events for all to authenticated
using (false) with check (false);
revoke all on public.billing_events from anon, authenticated;
