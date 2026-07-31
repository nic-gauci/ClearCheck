create index billing_customers_plan_idx on public.billing_customers(plan_id);
create index compliance_settings_updated_by_idx on public.compliance_settings(updated_by);
create index credit_ledger_user_idx on public.credit_ledger(user_id, created_at desc);
create index deletion_requests_requester_idx on public.data_deletion_requests(requested_by, requested_at desc);
create index organisations_created_by_idx on public.organisations(created_by);
create index reports_generator_idx on public.reports(generated_by, generated_at desc);

create policy billing_customers_no_client_access
on public.billing_customers
for all
to authenticated
using (false)
with check (false);
