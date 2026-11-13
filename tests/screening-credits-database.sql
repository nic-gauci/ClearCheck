-- Run only against a disposable test database. All fixture changes roll back.
begin;
do $$
declare
  actor uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid();
  org uuid:=gen_random_uuid();
  result record;
  complete_sources jsonb:='[{"key":"EU","status":"complete"},{"key":"UN","status":"complete"},{"key":"MT","status":"complete"},{"key":"WEB","status":"review"}]';
  partial_sources jsonb:='[{"key":"EU","status":"unavailable"},{"key":"UN","status":"complete"},{"key":"MT","status":"complete"}]';
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (actor,actor::text||'@example.invalid','{}'),(outsider,outsider::text||'@example.invalid','{}');
  insert into public.organisations(id,name) values(org,'Synthetic credit workspace');
  insert into public.organisation_members(organisation_id,user_id,role) values(org,actor,'owner');
  insert into public.credit_ledger(organisation_id,user_id,amount,entry_type) values(org,actor,1,'beta_grant');

  -- Repeated incomplete checks leave the original balance intact and are auditable.
  for attempt in 1..2 loop
    select * into result from public.record_screening_v3(actor,org,'Synthetic Subject','person','review','[]',partial_sources,'[]',now());
    if result.credits_charged<>0 then raise exception 'Incomplete screening used a credit'; end if;
    if not exists(select 1 from public.screenings where id=result.screening_id and risk_state='incomplete' and credits_charged=0) then
      raise exception 'Incomplete screening not recorded correctly';
    end if;
    if not exists(select 1 from public.audit_events where entity_id=result.screening_id and metadata->>'credits_charged'='0') then
      raise exception 'Incomplete screening missing charge audit';
    end if;
  end loop;
  if (select sum(amount) from public.credit_ledger where organisation_id=org)<>1 then
    raise exception 'Incomplete screenings changed the available balance';
  end if;

  select * into result from public.record_screening_v3(actor,org,'Synthetic Subject','person','review','[]',complete_sources,'[]',now());
  if result.credits_charged<>1 or not exists(select 1 from public.credit_ledger where screening_id=result.screening_id and amount=-1) then
    raise exception 'Complete screening did not charge one credit';
  end if;

  begin
    perform public.record_screening_v3(actor,org,'Synthetic Subject','person','review','[]',complete_sources,'[]',now());
    raise exception 'A complete screening exceeded the available balance';
  exception when raise_exception then
    if sqlerrm<>'No screening credits available' then raise; end if;
  end;

  begin
    perform public.record_screening_v3(outsider,org,'Synthetic Subject','person','review','[]',partial_sources,'[]',now());
    raise exception 'Cross-organisation screening was permitted';
  exception when raise_exception then
    if sqlerrm<>'Organisation access denied' then raise; end if;
  end;
end
$$;
rollback;
