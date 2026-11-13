create or replace function public.record_screening_v3(
  p_actor_id uuid,p_organisation_id uuid,p_subject_name text,p_subject_type text,
  p_risk_state text,p_results jsonb,p_sources jsonb,p_web_searches jsonb,
  p_checked_at timestamptz
)
returns table (screening_id uuid,case_reference text,created_at timestamptz,credits_charged integer)
language plpgsql security definer set search_path = ''
as $$
declare
  new_screening_id uuid:=gen_random_uuid();new_case_reference text;
  available_credits integer;calculated_match_count integer;calculated_source_count integer;
  required_sources_complete boolean; charge integer; final_risk_state text;
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.organisation_members where organisation_id=p_organisation_id and user_id=p_actor_id and status='active') then raise exception 'Organisation access denied'; end if;
  if char_length(trim(p_subject_name)) not between 2 and 120 then raise exception 'Invalid subject name'; end if;
  if p_subject_type not in ('person','business') then raise exception 'Invalid subject type'; end if;
  if p_risk_state not in ('review','incomplete') then raise exception 'Invalid risk state'; end if;
  if jsonb_typeof(p_results)<>'array' or jsonb_typeof(p_sources)<>'array' or jsonb_typeof(p_web_searches)<>'array' then raise exception 'Invalid screening payload'; end if;
  -- Count only completed official sources. Manual web review never affects the charge.
  select count(distinct source->>'key')=3 into required_sources_complete
    from jsonb_array_elements(p_sources) source
    where source->>'key' in ('EU','UN','MT') and source->>'status'='complete';
  final_risk_state:=case when p_risk_state='incomplete' or not required_sources_complete then 'incomplete' else 'review' end;
  charge:=case when final_risk_state='incomplete' then 0 else 1 end;

  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,0));
  select coalesce(sum(amount),0)::integer into available_credits from public.credit_ledger where organisation_id=p_organisation_id;
  if available_credits<1 then raise exception 'No screening credits available'; end if;
  calculated_match_count:=jsonb_array_length(p_results);calculated_source_count:=jsonb_array_length(p_sources);
  new_case_reference:='CC-'||to_char(coalesce(p_checked_at,now()),'YYYYMMDD')||'-'||upper(substr(replace(new_screening_id::text,'-',''),1,8));
  insert into public.screenings(id,case_reference,organisation_id,created_by,subject_name,subject_type,status,risk_state,match_count,source_count,credits_charged,results,sources,web_searches,checked_at,completed_at)
  values(new_screening_id,new_case_reference,p_organisation_id,p_actor_id,trim(p_subject_name),p_subject_type,'completed',final_risk_state,calculated_match_count,calculated_source_count,charge,p_results,p_sources,p_web_searches,coalesce(p_checked_at,now()),now());
  if charge>0 then
    insert into public.credit_ledger(organisation_id,user_id,amount,entry_type,screening_id) values(p_organisation_id,p_actor_id,-charge,'screening',new_screening_id);
  end if;
  insert into public.audit_events(organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(p_organisation_id,p_actor_id,'screening.completed','screening',new_screening_id,jsonb_build_object('case_reference',new_case_reference,'subject_type',p_subject_type,'risk_state',final_risk_state,'match_count',calculated_match_count,'credits_charged',charge));
  return query select new_screening_id,new_case_reference,now(),charge;
end;
$$;

revoke execute on function public.record_screening_v3(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.record_screening_v3(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) to service_role;
