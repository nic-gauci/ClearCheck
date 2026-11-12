create index client_items_client_fk_idx on public.client_items(client_id,organisation_id);
create index client_documents_client_fk_idx on public.client_documents(client_id,organisation_id);
create index client_screenings_client_fk_idx on public.client_screenings(client_id,organisation_id);
create index client_documents_expiry_idx on public.client_documents(organisation_id,expires_at) where expires_at is not null;
create index client_items_open_due_idx on public.client_items(organisation_id,due_at) where status='open' and kind in ('task','request');
