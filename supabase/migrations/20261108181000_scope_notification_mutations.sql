-- Bind mark-read operations to the active workspace.
begin;
drop function gwira.mark_notification_read(uuid);
create function gwira.mark_notification_read(p_id uuid, p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 update gwira.notifications
 set read_at = coalesce(read_at, now())
 where id = p_id and organization_id = p_org and recipient_id = auth.uid() and gwira.is_member(organization_id);
 if not found then
  raise exception 'notification_unavailable' using errcode = '42501';
 end if;
end $$;
revoke all on function gwira.mark_notification_read(uuid, uuid) from public, anon;
grant execute on function gwira.mark_notification_read(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
