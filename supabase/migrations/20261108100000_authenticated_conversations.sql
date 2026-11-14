-- Authenticated conversations. Additive; review before deploying to a hosted project.
begin;

create table gwira.conversations (
 id uuid primary key,
 organization_id uuid not null references gwira.organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 title text not null check (char_length(btrim(title)) between 1 and 200),
 visibility text not null default 'private' check (visibility in ('private','shared')),
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index conversations_organization_recent on gwira.conversations(organization_id, updated_at desc);

create table gwira.conversation_messages (
 id uuid primary key,
 conversation_id uuid not null references gwira.conversations(id) on delete cascade,
 author_type text not null check (author_type in ('user','rules')),
 author_id uuid references auth.users(id),
 content text not null check (char_length(btrim(content)) between 1 and 10000),
 status text not null default 'saved' check (status = 'saved'),
 created_at timestamptz not null default now(),
 check ((author_type = 'user' and author_id is not null) or (author_type = 'rules' and author_id is null))
);
create index conversation_messages_order on gwira.conversation_messages(conversation_id, created_at, id);

create table gwira.conversation_pins (
 conversation_id uuid not null references gwira.conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (conversation_id,user_id)
);

create table gwira.conversation_plan_links (
 conversation_id uuid not null references gwira.conversations(id) on delete cascade,
 plan_id uuid not null references gwira.plan_documents(id) on delete cascade,
 linked_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key (conversation_id,plan_id)
);

create function gwira.can_read_conversation(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from gwira.conversations c
  where c.id=p_id and gwira.is_member(c.organization_id)
    and (c.visibility='shared' or c.created_by=auth.uid()))
$$;
revoke all on function gwira.can_read_conversation(uuid) from public,anon;
grant execute on function gwira.can_read_conversation(uuid) to authenticated;

alter table gwira.conversations enable row level security;
alter table gwira.conversation_messages enable row level security;
alter table gwira.conversation_pins enable row level security;
alter table gwira.conversation_plan_links enable row level security;
create policy conversation_read on gwira.conversations for select to authenticated
 using (gwira.is_member(organization_id) and (visibility='shared' or created_by=(select auth.uid())));
create policy conversation_message_read on gwira.conversation_messages for select to authenticated
 using (gwira.can_read_conversation(conversation_id));
create policy conversation_pin_read on gwira.conversation_pins for select to authenticated
 using (user_id=(select auth.uid()) and gwira.can_read_conversation(conversation_id));
create policy conversation_plan_link_read on gwira.conversation_plan_links for select to authenticated
 using (gwira.can_read_conversation(conversation_id)
  and exists(select 1 from gwira.plan_documents d where d.id=plan_id and gwira.is_member(d.organization_id)));
revoke all on gwira.conversations,gwira.conversation_messages,gwira.conversation_pins,gwira.conversation_plan_links from public,anon,authenticated;
grant select on gwira.conversations,gwira.conversation_messages,gwira.conversation_pins,gwira.conversation_plan_links to authenticated;

-- Client-generated IDs make retries idempotent; mismatched reuse is rejected.
create function gwira.create_conversation(p_org uuid,p_id uuid,p_title text,p_visibility text default 'private')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); existing gwira.conversations;
begin
 if not gwira.is_member(p_org) then raise exception 'conversation_unavailable' using errcode='42501'; end if;
 if p_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 200 or p_visibility not in ('private','shared') then
  raise exception 'invalid_conversation' using errcode='22023';
 end if;
 insert into gwira.conversations(id,organization_id,created_by,title,visibility)
 values(p_id,p_org,actor,btrim(p_title),p_visibility) on conflict(id) do nothing;
 select * into existing from gwira.conversations where id=p_id;
 if existing.organization_id is distinct from p_org or existing.created_by is distinct from actor
  or existing.title is distinct from btrim(p_title) or existing.visibility is distinct from p_visibility then
  raise exception 'conversation_request_conflict' using errcode='22023';
 end if;
 return p_id;
end $$;

create function gwira.send_conversation_message(p_id uuid,p_message uuid,p_content text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); existing gwira.conversation_messages; conversation gwira.conversations;
begin
 select * into conversation from gwira.conversations where id=p_id for update;
 if not found or not gwira.is_member(conversation.organization_id)
  or (conversation.visibility='private' and conversation.created_by<>actor) then
  raise exception 'conversation_unavailable' using errcode='42501';
 end if;
 if conversation.archived_at is not null then raise exception 'conversation_archived' using errcode='22023'; end if;
 if p_message is null or p_content is null or char_length(btrim(p_content)) not between 1 and 10000 then
  raise exception 'invalid_message' using errcode='22023';
 end if;
 insert into gwira.conversation_messages(id,conversation_id,author_type,author_id,content)
 values(p_message,p_id,'user',actor,p_content) on conflict(id) do nothing;
 if found then
  update gwira.conversations set updated_at=now() where id=p_id;
 else
  select * into existing from gwira.conversation_messages where id=p_message;
  if existing.conversation_id is distinct from p_id or existing.author_id is distinct from actor
   or existing.author_type is distinct from 'user' or existing.content is distinct from p_content then
   raise exception 'message_request_conflict' using errcode='22023';
  end if;
 end if;
 return p_message;
end $$;

create function gwira.update_conversation(p_id uuid,p_action text,p_value text default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); conversation gwira.conversations;
begin
 select * into conversation from gwira.conversations where id=p_id for update;
 if not found or conversation.created_by<>actor or not gwira.is_member(conversation.organization_id) then
  raise exception 'conversation_unavailable' using errcode='42501';
 end if;
 if p_action='rename' then
  if p_value is null or char_length(btrim(p_value)) not between 1 and 200 then raise exception 'invalid_title' using errcode='22023'; end if;
  update gwira.conversations set title=btrim(p_value),updated_at=now() where id=p_id;
 elsif p_action='archive' then
  update gwira.conversations set archived_at=coalesce(archived_at,now()),updated_at=now() where id=p_id;
 elsif p_action='unarchive' then
  update gwira.conversations set archived_at=null,updated_at=now() where id=p_id;
 elsif p_action='delete' then
  delete from gwira.conversations where id=p_id;
 else raise exception 'invalid_action' using errcode='22023';
 end if;
end $$;

create function gwira.pin_conversation(p_id uuid,p_pinned boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor();
begin
 if not gwira.can_read_conversation(p_id) then raise exception 'conversation_unavailable' using errcode='42501'; end if;
 if p_pinned is null then raise exception 'invalid_pin' using errcode='22023'; end if;
 if p_pinned then insert into gwira.conversation_pins(conversation_id,user_id) values(p_id,actor) on conflict do nothing;
 else delete from gwira.conversation_pins where conversation_id=p_id and user_id=actor; end if;
end $$;

create function gwira.link_conversation_plan(p_id uuid,p_plan uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); conversation gwira.conversations;
begin
 select * into conversation from gwira.conversations where id=p_id for update;
 if not found or conversation.created_by<>actor or not gwira.is_member(conversation.organization_id)
  or not exists(select 1 from gwira.plan_documents d where d.id=p_plan and d.organization_id=conversation.organization_id) then
  raise exception 'conversation_plan_unavailable' using errcode='42501';
 end if;
 insert into gwira.conversation_plan_links(conversation_id,plan_id,linked_by) values(p_id,p_plan,actor) on conflict do nothing;
end $$;

revoke all on function gwira.create_conversation(uuid,uuid,text,text),gwira.send_conversation_message(uuid,uuid,text),
 gwira.update_conversation(uuid,text,text),gwira.pin_conversation(uuid,boolean),gwira.link_conversation_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function gwira.create_conversation(uuid,uuid,text,text),gwira.send_conversation_message(uuid,uuid,text),
 gwira.update_conversation(uuid,text,text),gwira.pin_conversation(uuid,boolean),gwira.link_conversation_plan(uuid,uuid) to authenticated;
commit;
