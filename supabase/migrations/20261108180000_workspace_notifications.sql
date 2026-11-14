-- Recipient-scoped notifications; apply only to an approved environment.
begin;

create table gwira.notifications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references gwira.organizations(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 200),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 foreign key (organization_id, recipient_id)
   references gwira.organization_memberships(organization_id, user_id) on delete cascade
);
create index notifications_recipient_recent on gwira.notifications(recipient_id, organization_id, created_at desc, id desc);
alter table gwira.notifications enable row level security;
create policy notification_recipient_read on gwira.notifications for select to authenticated
 using (recipient_id = (select auth.uid()) and gwira.is_member(organization_id));
revoke all on gwira.notifications from public, anon, authenticated;
grant select on gwira.notifications to authenticated;
grant select, insert, update, delete on gwira.notifications to service_role;

create function gwira.mark_notification_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 update gwira.notifications
 set read_at = coalesce(read_at, now())
 where id = p_id and recipient_id = auth.uid() and gwira.is_member(organization_id);
 if not found then
  raise exception 'notification_unavailable' using errcode = '42501';
 end if;
end $$;
revoke all on function gwira.mark_notification_read(uuid) from public, anon;
grant execute on function gwira.mark_notification_read(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
