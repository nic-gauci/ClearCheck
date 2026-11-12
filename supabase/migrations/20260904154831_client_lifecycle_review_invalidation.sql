create function private.reopen_client_on_screening_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare target public.clients;
begin
 if new.review_status is not distinct from old.review_status and new.risk_state is not distinct from old.risk_state then return new; end if;
 for target in
   update public.clients c set stage='in_review',version=version+1,updated_at=now()
   from public.client_screenings l where l.screening_id=new.id and l.client_id=c.id and l.organisation_id=c.organisation_id and c.stage='approved'
   returning c.*
 loop
   insert into public.audit_events(organisation_id,actor_user_id,event_type,entity_type,entity_id,metadata)
   values(target.organisation_id,new.reviewed_by,'client.screening_changed','client',target.id,jsonb_build_object('screening_id',new.id,'version',target.version));
 end loop;
 return new;
end $$;
revoke all on function private.reopen_client_on_screening_change() from public,anon,authenticated;
create trigger client_screening_review_changed after update of risk_state,review_status on public.screenings
for each row execute function private.reopen_client_on_screening_change();

create function private.guard_client_approval()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.stage='approved' and old.stage<>'approved' then
   if new.next_review is null or new.next_review<=current_date then raise exception 'Choose a future next review date before approval'; end if;
   if exists(select 1 from public.client_screenings l join public.screenings s on s.id=l.screening_id
     where l.client_id=new.id and s.review_status in ('confirmed_match','escalated','more_information_required')) then
     raise exception 'Resolve outstanding findings across all linked screenings before approval';
   end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_client_approval() from public,anon,authenticated;
create trigger client_approval_guard before update of stage on public.clients for each row execute function private.guard_client_approval();
