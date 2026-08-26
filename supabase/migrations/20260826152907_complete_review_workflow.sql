alter table public.screenings drop constraint if exists screenings_review_status_check;
alter table public.screenings
  add column if not exists review_identifiers text,
  add column if not exists customer_reference text,
  add column if not exists screening_purpose text,
  add column if not exists input_identifiers jsonb not null default '{}'::jsonb,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists review_due_at timestamptz,
  add constraint screenings_review_status_check check (
    review_status in (
      'unreviewed','under_review','closed_no_match','false_positive',
      'confirmed_match','more_information_required','escalated'
    )
  );

create index if not exists screenings_org_assignment_due_idx
  on public.screenings (organisation_id, assigned_to, review_due_at)
  where review_status not in ('false_positive','confirmed_match','closed_no_match');

drop function if exists public.search_screenings(uuid,text,text,text,text,text,integer,integer);
create function public.search_screenings(
  p_organisation_id uuid,
  p_search text default null,
  p_risk_state text default null,
  p_subject_type text default null,
  p_review_status text default null,
  p_sort text default 'newest',
  p_offset integer default 0,
  p_limit integer default 20
)
returns table (
  id uuid, case_reference text, subject_name text, subject_type text, status text,
  risk_state text, match_count integer, source_count integer, checked_at timestamptz,
  completed_at timestamptz, created_at timestamptz, review_status text,
  review_notes text, review_identifiers text, reviewed_by uuid,
  reviewed_by_display_name text, reviewed_at timestamptz, assigned_to uuid,
  review_due_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = ''
as $$
  select screening.id, screening.case_reference, screening.subject_name,
    screening.subject_type, screening.status, screening.risk_state,
    screening.match_count, screening.source_count, screening.checked_at,
    screening.completed_at, screening.created_at, screening.review_status,
    screening.review_notes, screening.review_identifiers, screening.reviewed_by,
    screening.reviewed_by_display_name, screening.reviewed_at,
    screening.assigned_to, screening.review_due_at, count(*) over ()
  from public.screenings screening
  where screening.organisation_id = p_organisation_id
    and (nullif(trim(p_search),'') is null
      or screening.subject_name ilike '%' || trim(p_search) || '%'
      or screening.case_reference ilike '%' || trim(p_search) || '%')
    and (p_risk_state is null or screening.risk_state = p_risk_state)
    and (p_subject_type is null or screening.subject_type = p_subject_type)
    and (p_review_status is null or screening.review_status = p_review_status)
  order by
    case when p_sort = 'oldest' then screening.checked_at end asc,
    case when p_sort = 'name' then lower(screening.subject_name) end asc,
    case when p_sort = 'matches' then screening.match_count end desc,
    case when p_sort not in ('oldest','name','matches') then screening.checked_at end desc,
    screening.id desc
  offset greatest(coalesce(p_offset,0),0)
  limit least(greatest(coalesce(p_limit,20),1),100);
$$;

create or replace function public.update_screening_review_v3(
  p_actor_id uuid,
  p_screening_id uuid,
  p_review_status text,
  p_review_notes text,
  p_review_identifiers text,
  p_review_due_at timestamptz default null
)
returns table (
  review_status text, review_notes text, review_identifiers text,
  reviewed_by uuid, reviewed_by_display_name text, reviewed_at timestamptz,
  assigned_to uuid, review_due_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  target_org uuid;
  previous_status text;
  reviewer_name text;
  decision_time timestamptz := now();
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  if p_review_status not in ('under_review','false_positive','confirmed_match','more_information_required','escalated') then
    raise exception 'Invalid review outcome';
  end if;
  if char_length(trim(coalesce(p_review_notes,''))) < 20 then
    raise exception 'Review notes must contain at least 20 characters';
  end if;
  if char_length(coalesce(p_review_notes,'')) > 4000 then raise exception 'Review notes must be 4000 characters or fewer'; end if;
  if char_length(trim(coalesce(p_review_identifiers,''))) < 3 then
    raise exception 'Record the identifiers checked or explain why none were available';
  end if;
  if char_length(coalesce(p_review_identifiers,'')) > 2000 then raise exception 'Identifiers must be 2000 characters or fewer'; end if;

  select screening.organisation_id, screening.review_status
    into target_org, previous_status
  from public.screenings screening where screening.id = p_screening_id for update;

  if target_org is null or not exists (
    select 1 from public.organisation_members membership
    where membership.organisation_id = target_org and membership.user_id = p_actor_id
      and membership.status = 'active' and membership.role in ('owner','admin','reviewer')
  ) then raise exception 'Screening review access denied'; end if;

  select profile.display_name into reviewer_name from public.profiles profile where profile.id = p_actor_id;
  update public.screenings screening
  set review_status = p_review_status,
      review_notes = trim(p_review_notes),
      review_identifiers = trim(p_review_identifiers),
      reviewed_by = p_actor_id,
      reviewed_by_display_name = coalesce(nullif(trim(reviewer_name),''),'Workspace reviewer'),
      reviewed_at = decision_time,
      assigned_to = case when p_review_status in ('false_positive','confirmed_match') then null else p_actor_id end,
      review_due_at = case when p_review_status in ('false_positive','confirmed_match') then null else p_review_due_at end
  where screening.id = p_screening_id;

  insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (target_org,p_actor_id,'screening.review_updated','screening',p_screening_id,
    jsonb_build_object('previous_status',previous_status,'review_status',p_review_status,
      'identifiers_recorded',true,'due_at',p_review_due_at));

  return query select screening.review_status,screening.review_notes,
    screening.review_identifiers,screening.reviewed_by,
    screening.reviewed_by_display_name,screening.reviewed_at,
    screening.assigned_to,screening.review_due_at
  from public.screenings screening where screening.id = p_screening_id;
end;
$$;

revoke execute on function public.search_screenings(uuid,text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.search_screenings(uuid,text,text,text,text,text,integer,integer) to authenticated;
revoke execute on function public.update_screening_review_v3(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.update_screening_review_v3(uuid,uuid,text,text,text,timestamptz) to service_role;
