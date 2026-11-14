-- Emit a recipient-scoped notification for an actual workspace role change.
-- Apply only to an approved environment.
begin;

create function gwira.notify_membership_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if old.role is distinct from new.role and new.status = 'active' then
  insert into gwira.notifications(organization_id, recipient_id, title, body)
  values (new.organization_id, new.user_id, 'Workspace role changed',
          'Your role in this workspace is now ' || new.role || '.');
 end if;
 return new;
end $$;
revoke all on function gwira.notify_membership_role_change() from public, anon, authenticated;

create trigger membership_role_notification
after update of role on gwira.organization_memberships
for each row execute function gwira.notify_membership_role_change();

commit;
