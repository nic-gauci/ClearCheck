create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create table public.source_snapshots (
  source_key text primary key,
  source_url text not null,
  storage_bucket text not null,
  storage_path text not null,
  checksum_sha256 text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  row_count integer check (row_count is null or row_count > 0),
  source_last_modified timestamptz,
  refreshed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.source_snapshots enable row level security;
revoke all on table public.source_snapshots from anon, authenticated;

create trigger source_snapshots_touch
before update on public.source_snapshots
for each row execute function private.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screening-source-data',
  'screening-source-data',
  false,
  50000000,
  array['text/csv','text/csv; charset=utf-8','application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

select cron.unschedule(jobid)
from cron.job
where jobname = 'clearcheck-daily-eu-sanctions-sync';

select cron.schedule(
  'clearcheck-daily-eu-sanctions-sync',
  '15 2 * * *',
  $schedule$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'clearcheck_project_url' limit 1) || '/functions/v1/sync-eu-sanctions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clearcheck_anon_key' limit 1),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'clearcheck_anon_key' limit 1)
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $schedule$
);
