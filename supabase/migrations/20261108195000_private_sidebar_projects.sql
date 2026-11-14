-- Personal organization-scoped project organization. Removing a project never deletes conversations.
begin;

create table gwira.sidebar_projects (
 id uuid primary key,
 organization_id uuid not null references gwira.organizations(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 160),
 pinned boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index sidebar_projects_owner on gwira.sidebar_projects(organization_id,owner_id,updated_at desc,id);

create table gwira.sidebar_project_sections (
 id uuid primary key,
 project_id uuid not null references gwira.sidebar_projects(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 160),
 created_at timestamptz not null default now(),
 unique(id,project_id)
);

create table gwira.sidebar_project_conversations (
 project_id uuid not null references gwira.sidebar_projects(id) on delete cascade,
 conversation_id uuid not null references gwira.conversations(id) on delete cascade,
 section_id uuid,
 primary key(project_id,conversation_id),
 foreign key(section_id,project_id) references gwira.sidebar_project_sections(id,project_id)
);

create function gwira.can_read_sidebar_project(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from gwira.sidebar_projects p where p.id=p_id
  and p.owner_id=auth.uid() and gwira.is_member(p.organization_id))
$$;
revoke all on function gwira.can_read_sidebar_project(uuid) from public,anon;
grant execute on function gwira.can_read_sidebar_project(uuid) to authenticated;

alter table gwira.sidebar_projects enable row level security;
alter table gwira.sidebar_project_sections enable row level security;
alter table gwira.sidebar_project_conversations enable row level security;
create policy sidebar_project_read on gwira.sidebar_projects for select to authenticated
 using (owner_id=(select auth.uid()) and gwira.is_member(organization_id));
create policy sidebar_section_read on gwira.sidebar_project_sections for select to authenticated
 using (gwira.can_read_sidebar_project(project_id));
create policy sidebar_project_conversation_read on gwira.sidebar_project_conversations for select to authenticated
 using (gwira.can_read_sidebar_project(project_id) and gwira.can_read_conversation(conversation_id));
revoke all on gwira.sidebar_projects,gwira.sidebar_project_sections,gwira.sidebar_project_conversations from public,anon,authenticated;
grant select on gwira.sidebar_projects,gwira.sidebar_project_sections,gwira.sidebar_project_conversations to authenticated;

create function gwira.mutate_sidebar_project(p_org uuid,p_project uuid,p_action text,p_value text default null,
 p_section uuid default null,p_conversation uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); project gwira.sidebar_projects; conversation gwira.conversations;
begin
 if p_org is null or p_project is null or not gwira.is_member(p_org) then
  raise exception 'project_unavailable' using errcode='42501';
 end if;
 if p_action='create' then
  if p_value is null or char_length(btrim(p_value)) not between 1 and 160 then raise exception 'invalid_project' using errcode='22023'; end if;
  insert into gwira.sidebar_projects(id,organization_id,owner_id,name) values(p_project,p_org,actor,btrim(p_value))
   on conflict(id) do nothing;
  select * into project from gwira.sidebar_projects where id=p_project;
  if project.organization_id is distinct from p_org or project.owner_id is distinct from actor or project.name is distinct from btrim(p_value) then
   raise exception 'project_request_conflict' using errcode='22023';
  end if;
  return;
 end if;
 select * into project from gwira.sidebar_projects where id=p_project for update;
 if not found or project.owner_id<>actor or project.organization_id<>p_org then
  raise exception 'project_unavailable' using errcode='42501';
 end if;
 if p_action='rename' then
  if p_value is null or char_length(btrim(p_value)) not between 1 and 160 then raise exception 'invalid_project' using errcode='22023'; end if;
  update gwira.sidebar_projects set name=btrim(p_value),updated_at=now() where id=p_project;
 elsif p_action='pin' then
  if p_value not in ('true','false') or p_value is null then raise exception 'invalid_project' using errcode='22023'; end if;
  update gwira.sidebar_projects set pinned=p_value::boolean,updated_at=now() where id=p_project;
 elsif p_action='remove' then
  delete from gwira.sidebar_projects where id=p_project;
 elsif p_action='section' then
  if p_section is null or p_value is null or char_length(btrim(p_value)) not between 1 and 160 then raise exception 'invalid_section' using errcode='22023'; end if;
  insert into gwira.sidebar_project_sections(id,project_id,name) values(p_section,p_project,btrim(p_value)) on conflict(id) do nothing;
  if not exists(select 1 from gwira.sidebar_project_sections where id=p_section and project_id=p_project and name=btrim(p_value)) then
   raise exception 'section_request_conflict' using errcode='22023';
  end if;
  update gwira.sidebar_projects set updated_at=now() where id=p_project;
 elsif p_action='move' then
  select * into conversation from gwira.conversations where id=p_conversation;
  if not found or conversation.organization_id<>p_org or not gwira.can_read_conversation(p_conversation) then
   raise exception 'conversation_unavailable' using errcode='42501';
  end if;
  if p_section is not null and not exists(select 1 from gwira.sidebar_project_sections where id=p_section and project_id=p_project) then
   raise exception 'section_unavailable' using errcode='42501';
  end if;
  insert into gwira.sidebar_project_conversations(project_id,conversation_id,section_id)
   values(p_project,p_conversation,p_section)
   on conflict(project_id,conversation_id) do update set section_id=excluded.section_id;
  update gwira.sidebar_projects set updated_at=now() where id=p_project;
 elsif p_action='unlink' then
  delete from gwira.sidebar_project_conversations where project_id=p_project and conversation_id=p_conversation;
 elsif p_action='archive_chats' then
  update gwira.conversations c set archived_at=coalesce(c.archived_at,now()),updated_at=now()
   where c.organization_id=p_org and c.created_by=actor and c.archived_at is null
    and exists(select 1 from gwira.sidebar_project_conversations l where l.project_id=p_project and l.conversation_id=c.id);
 else raise exception 'invalid_project_action' using errcode='22023';
 end if;
end $$;
revoke all on function gwira.mutate_sidebar_project(uuid,uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function gwira.mutate_sidebar_project(uuid,uuid,text,text,uuid,uuid) to authenticated;
commit;
