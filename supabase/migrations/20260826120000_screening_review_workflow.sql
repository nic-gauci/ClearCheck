alter table public.screenings
  add column if not exists review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed','under_review','closed_no_match','escalated')),
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by_display_name text,
  add column if not exists reviewed_at timestamptz;

create index if not exists screenings_org_review_checked_idx
  on public.screenings (organisation_id, review_status, checked_at desc);

create or replace function public.search_screenings(
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
  id uuid,
  case_reference text,
  subject_name text,
  subject_type text,
  status text,
  risk_state text,
  match_count integer,
  source_count integer,
  checked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  review_status text,
  review_notes text,
  reviewed_by uuid,
  reviewed_by_display_name text,
  reviewed_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    screening.id,
    screening.case_reference,
    screening.subject_name,
    screening.subject_type,
    screening.status,
    screening.risk_state,
    screening.match_count,
    screening.source_count,
    screening.checked_at,
    screening.completed_at,
    screening.created_at,
    screening.review_status,
    screening.review_notes,
    screening.reviewed_by,
    screening.reviewed_by_display_name,
    screening.reviewed_at,
    count(*) over () as total_count
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

create or replace function public.update_screening_review(
  p_screening_id uuid,
  p_review_status text,
  p_review_notes text default null
)
returns table (
  review_status text,
  review_notes text,
  reviewed_by uuid,
  reviewed_by_display_name text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_org uuid;
  previous_status text;
  previous_notes text;
  reviewer_name text;
  decision_time timestamptz := now();
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_review_status not in ('under_review','closed_no_match','escalated') then
    raise exception 'Invalid review outcome';
  end if;
  if char_length(coalesce(p_review_notes,'')) > 4000 then
    raise exception 'Review notes must be 4000 characters or fewer';
  end if;

  select screening.organisation_id, screening.review_status, screening.review_notes
    into target_org, previous_status, previous_notes
  from public.screenings screening
  where screening.id = p_screening_id
  for update;

  if target_org is null or not private.has_org_role(target_org,array['owner','admin','reviewer']::text[]) then
    raise exception 'Screening review access denied';
  end if;

  select profile.display_name into reviewer_name
  from public.profiles profile where profile.id = actor_id;

  update public.screenings screening
  set review_status = p_review_status,
      review_notes = nullif(trim(coalesce(p_review_notes,'')),''),
      reviewed_by = actor_id,
      reviewed_by_display_name = coalesce(nullif(trim(reviewer_name),''),'Workspace reviewer'),
      reviewed_at = decision_time
  where screening.id = p_screening_id;

  insert into public.audit_events (
    organisation_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    target_org, actor_id, 'screening.review_updated', 'screening', p_screening_id,
    jsonb_build_object(
      'previous_status', previous_status,
      'review_status', p_review_status,
      'notes_changed', coalesce(previous_notes,'') is distinct from coalesce(nullif(trim(coalesce(p_review_notes,'')),''),'')
    )
  );

  return query
    select screening.review_status, screening.review_notes, screening.reviewed_by,
      screening.reviewed_by_display_name, screening.reviewed_at
    from public.screenings screening where screening.id = p_screening_id;
end;
$$;

revoke execute on function public.search_screenings(uuid,text,text,text,text,text,integer,integer) from public, anon;
revoke execute on function public.update_screening_review(uuid,text,text) from public, anon;
grant execute on function public.search_screenings(uuid,text,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.update_screening_review(uuid,text,text) to authenticated;
