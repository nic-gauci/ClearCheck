do $$
declare
  existing_user record;
  new_organisation_id uuid;
  supplied_first text;
  supplied_last text;
  supplied_company text;
  supplied_display text;
  organisation_name text;
begin
  for existing_user in
    select auth_user.*
    from auth.users auth_user
    left join public.profiles profile on profile.id = auth_user.id
    where profile.id is null
  loop
    supplied_first := trim(coalesce(existing_user.raw_user_meta_data ->> 'first_name',''));
    supplied_last := trim(coalesce(existing_user.raw_user_meta_data ->> 'last_name',''));
    supplied_company := nullif(trim(coalesce(existing_user.raw_user_meta_data ->> 'company','')), '');
    supplied_display := trim(coalesce(existing_user.raw_user_meta_data ->> 'full_name',''));
    if supplied_display = '' then supplied_display := nullif(trim(supplied_first || ' ' || supplied_last), ''); end if;
    supplied_display := coalesce(supplied_display, split_part(coalesce(existing_user.email,'ClearCheck user'),'@',1), 'ClearCheck user');
    organisation_name := coalesce(supplied_company, supplied_display || '''s organisation');
    if char_length(organisation_name) < 2 then organisation_name := 'ClearCheck organisation'; end if;

    insert into public.profiles (id,first_name,last_name,display_name,company)
    values (existing_user.id,supplied_first,supplied_last,supplied_display,supplied_company);
    insert into public.organisations (name,created_by,billing_email)
    values (left(organisation_name,120),existing_user.id,existing_user.email)
    returning id into new_organisation_id;
    insert into public.organisation_members (organisation_id,user_id,role,status)
    values (new_organisation_id,existing_user.id,'owner','active');
    insert into public.compliance_settings (organisation_id,updated_by)
    values (new_organisation_id,existing_user.id);
    insert into public.credit_ledger (organisation_id,user_id,amount,entry_type,external_reference)
    values (new_organisation_id,existing_user.id,25,'beta_grant','existing-account-backfill');
    insert into public.audit_events (organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
    values (new_organisation_id,existing_user.id,'account.backfilled','organisation',new_organisation_id,jsonb_build_object('source','platform-migration'));
  end loop;
end;
$$;
