-- A notification describes the historical change, not the current role.
begin;
create or replace function gwira.notify_membership_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if old.role is distinct from new.role and new.status = 'active' then
  insert into gwira.notifications(organization_id, recipient_id, title, body)
  values (new.organization_id, new.user_id, 'Workspace role changed',
          'Your role in this workspace was changed to ' || new.role || '.');
 end if;
 return new;
end $$;
commit;
