create index if not exists screenings_reviewed_by_idx on public.screenings(reviewed_by);

create or replace function public.update_screening_review_v2(
  p_actor_id uuid,
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
  target_org uuid;
  previous_status text;
  previous_notes text;
  reviewer_name text;
  decision_time timestamptz := now();
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  if p_review_status not in ('under_review','closed_no_match','escalated') then raise exception 'Invalid review outcome'; end if;
  if char_length(coalesce(p_review_notes,'')) > 4000 then raise exception 'Review notes must be 4000 characters or fewer'; end if;

  select screening.organisation_id, screening.review_status, screening.review_notes
    into target_org, previous_status, previous_notes
  from public.screenings screening where screening.id = p_screening_id for update;

  if target_org is null or not exists (
    select 1 from public.organisation_members membership
    where membership.organisation_id = target_org
      and membership.user_id = p_actor_id
      and membership.status = 'active'
      and membership.role in ('owner','admin','reviewer')
  ) then raise exception 'Screening review access denied'; end if;

  select profile.display_name into reviewer_name from public.profiles profile where profile.id = p_actor_id;
  update public.screenings screening
  set review_status = p_review_status,
      review_notes = nullif(trim(coalesce(p_review_notes,'')),''),
      reviewed_by = p_actor_id,
      reviewed_by_display_name = coalesce(nullif(trim(reviewer_name),''),'Workspace reviewer'),
      reviewed_at = decision_time
  where screening.id = p_screening_id;

  insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (target_org,p_actor_id,'screening.review_updated','screening',p_screening_id,
    jsonb_build_object('previous_status',previous_status,'review_status',p_review_status,
      'notes_changed',coalesce(previous_notes,'') is distinct from coalesce(nullif(trim(coalesce(p_review_notes,'')),''),'')));

  return query select screening.review_status,screening.review_notes,screening.reviewed_by,
    screening.reviewed_by_display_name,screening.reviewed_at
  from public.screenings screening where screening.id = p_screening_id;
end;
$$;

revoke execute on function public.update_screening_review(uuid,text,text) from authenticated;
revoke execute on function public.update_screening_review_v2(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_screening_review_v2(uuid,uuid,text,text) to service_role;
