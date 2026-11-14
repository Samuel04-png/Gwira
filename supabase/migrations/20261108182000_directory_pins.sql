-- Per-user pins on authorized organization directory entries.
begin;
create table gwira.directory_pins (
 organization_id uuid not null,
 employee_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (employee_id, user_id),
 foreign key (organization_id, employee_id) references gwira.employees(organization_id, id) on delete cascade,
 foreign key (organization_id, user_id) references gwira.organization_memberships(organization_id, user_id) on delete cascade
);
alter table gwira.directory_pins enable row level security;
create policy directory_pin_read on gwira.directory_pins for select to authenticated
 using (user_id = (select auth.uid()) and gwira.is_member(organization_id));
revoke all on gwira.directory_pins from public, anon, authenticated;
grant select on gwira.directory_pins to authenticated;

create function gwira.pin_directory_employee(p_org uuid, p_employee uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
 if actor is null or not gwira.is_member(p_org) or p_pinned is null or
   not exists(select 1 from gwira.employees where id=p_employee and organization_id=p_org) then
  raise exception 'directory_entry_unavailable' using errcode = '42501';
 end if;
 if p_pinned then
  insert into gwira.directory_pins(organization_id,employee_id,user_id) values(p_org,p_employee,actor) on conflict do nothing;
 else
  delete from gwira.directory_pins where organization_id=p_org and employee_id=p_employee and user_id=actor;
 end if;
end $$;
revoke all on function gwira.pin_directory_employee(uuid,uuid,boolean) from public,anon;
grant execute on function gwira.pin_directory_employee(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
