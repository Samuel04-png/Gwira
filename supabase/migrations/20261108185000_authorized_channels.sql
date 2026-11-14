-- Authenticated channels are separate from Home's AI conversations and local messaging.
-- Apply only to an approved environment.
begin;

create table gwira.channels (
 id uuid primary key,
 organization_id uuid not null references gwira.organizations(id) on delete cascade,
 created_by uuid not null,
 name text not null check (char_length(btrim(name)) between 1 and 80),
 topic text not null default '' check (char_length(topic) <= 200),
 visibility text not null check (visibility in ('org', 'private')),
 initial_members uuid[] not null,
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (organization_id, id),
 foreign key (organization_id, created_by)
  references gwira.organization_memberships(organization_id, user_id)
);

create table gwira.channel_members (
 organization_id uuid not null,
 channel_id uuid not null,
 user_id uuid not null,
 muted boolean not null default false,
 last_read_seq bigint not null default 0 check (last_read_seq >= 0),
 joined_at timestamptz not null default now(),
 primary key (channel_id, user_id),
 foreign key (organization_id, channel_id)
  references gwira.channels(organization_id, id) on delete cascade,
 foreign key (organization_id, user_id)
  references gwira.organization_memberships(organization_id, user_id) on delete cascade
);

create table gwira.channel_messages (
 id uuid primary key,
 organization_id uuid not null,
 channel_id uuid not null,
 seq bigint generated always as identity unique,
 author_id uuid not null,
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 foreign key (organization_id, channel_id)
  references gwira.channels(organization_id, id) on delete cascade,
 foreign key (organization_id, author_id)
  references gwira.organization_memberships(organization_id, user_id)
);
create index channel_messages_order on gwira.channel_messages(channel_id, seq);

create function gwira.can_read_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from gwira.channels c
  where c.id = p_channel and gwira.is_member(c.organization_id)
   and (c.visibility = 'org' or exists (
    select 1 from gwira.channel_members m
    where m.channel_id = c.id and m.user_id = auth.uid()
   ))
 )
$$;
revoke all on function gwira.can_read_channel(uuid) from public, anon;
grant execute on function gwira.can_read_channel(uuid) to authenticated;

alter table gwira.channels enable row level security;
alter table gwira.channel_members enable row level security;
alter table gwira.channel_messages enable row level security;
create policy channel_read on gwira.channels for select to authenticated
 using (gwira.can_read_channel(id));
create policy channel_member_read on gwira.channel_members for select to authenticated
 using (user_id = (select auth.uid()) and gwira.can_read_channel(channel_id));
create policy channel_message_read on gwira.channel_messages for select to authenticated
 using (gwira.can_read_channel(channel_id));
revoke all on gwira.channels, gwira.channel_members, gwira.channel_messages from public, anon, authenticated;
grant select on gwira.channels, gwira.channel_members, gwira.channel_messages to authenticated;

create function gwira.create_channel(p_org uuid, p_id uuid, p_name text, p_topic text, p_visibility text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); members uuid[]; existing gwira.channels;
begin
 if not gwira.is_member(p_org) then raise exception 'channel_unavailable' using errcode = '42501'; end if;
 if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 80
  or p_topic is null or char_length(p_topic) > 200 or p_visibility is null or p_visibility not in ('org','private')
  or p_members is null or cardinality(p_members) > 100 or array_position(p_members, null) is not null then
  raise exception 'invalid_channel' using errcode = '22023';
 end if;
 select coalesce(array_agg(distinct member order by member), '{}'::uuid[]) into members from unnest(p_members) member;
 if exists(select 1 from unnest(members) member where not exists(
  select 1 from gwira.organization_memberships m where m.organization_id = p_org and m.user_id = member and m.status = 'active'
 )) then raise exception 'channel_member_unavailable' using errcode = '42501'; end if;
 insert into gwira.channels(id,organization_id,created_by,name,topic,visibility,initial_members)
 values(p_id,p_org,actor,btrim(p_name),p_topic,p_visibility,members) on conflict(id) do nothing;
 if found then
  insert into gwira.channel_members(organization_id,channel_id,user_id)
   select p_org,p_id,member from (select distinct unnest(members || array[actor]) member) items;
 else
  select * into existing from gwira.channels where id=p_id;
  if existing.organization_id is distinct from p_org or existing.created_by is distinct from actor
   or existing.name is distinct from btrim(p_name) or existing.topic is distinct from p_topic
   or existing.visibility is distinct from p_visibility or existing.initial_members is distinct from members then
   raise exception 'channel_request_conflict' using errcode = '22023';
  end if;
 end if;
 return p_id;
end $$;

create function gwira.join_channel(p_org uuid, p_channel uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); channel gwira.channels;
begin
 select * into channel from gwira.channels where id=p_channel and organization_id=p_org for update;
 if channel.id is null or channel.visibility <> 'org' or channel.archived_at is not null or not gwira.is_member(p_org) then
  raise exception 'channel_unavailable' using errcode='42501';
 end if;
 insert into gwira.channel_members(organization_id,channel_id,user_id)
 values(p_org,p_channel,actor) on conflict(channel_id,user_id) do nothing;
end $$;

create function gwira.send_channel_message(p_org uuid, p_channel uuid, p_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); channel gwira.channels; existing gwira.channel_messages;
begin
 select * into channel from gwira.channels where id=p_channel and organization_id=p_org for update;
 if channel.id is null or channel.archived_at is not null or not gwira.is_member(p_org)
  or not exists(select 1 from gwira.channel_members where channel_id=p_channel and user_id=actor) then
  raise exception 'channel_unavailable' using errcode='42501';
 end if;
 if p_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
  raise exception 'invalid_channel_message' using errcode='22023';
 end if;
 insert into gwira.channel_messages(id,organization_id,channel_id,author_id,body)
 values(p_id,p_org,p_channel,actor,p_body) on conflict(id) do nothing;
 if found then
  update gwira.channels set updated_at=now() where id=p_channel;
 else
  select * into existing from gwira.channel_messages where id=p_id;
  if existing.organization_id is distinct from p_org or existing.channel_id is distinct from p_channel
   or existing.author_id is distinct from actor or existing.body is distinct from p_body then
   raise exception 'channel_message_conflict' using errcode='22023';
  end if;
 end if;
 return p_id;
end $$;

create function gwira.update_channel_preference(p_org uuid, p_channel uuid, p_muted boolean default null, p_mark_read boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); channel gwira.channels; latest bigint;
begin
 select * into channel from gwira.channels where id=p_channel and organization_id=p_org for update;
 if channel.id is null or not gwira.is_member(p_org) or not gwira.can_read_channel(p_channel)
  or not exists(select 1 from gwira.channel_members where channel_id=p_channel and user_id=actor) then
  raise exception 'channel_unavailable' using errcode='42501';
 end if;
 if p_mark_read is null or (p_muted is null and not p_mark_read) then raise exception 'invalid_channel_preference' using errcode='22023'; end if;
 if p_mark_read then select coalesce(max(seq),0) into latest from gwira.channel_messages where channel_id=p_channel; end if;
 update gwira.channel_members set muted=coalesce(p_muted,muted),
  last_read_seq=case when p_mark_read then greatest(last_read_seq,latest) else last_read_seq end
 where channel_id=p_channel and user_id=actor;
end $$;

revoke all on function gwira.create_channel(uuid,uuid,text,text,text,uuid[]),
 gwira.join_channel(uuid,uuid),gwira.send_channel_message(uuid,uuid,uuid,text),
 gwira.update_channel_preference(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function gwira.create_channel(uuid,uuid,text,text,text,uuid[]),
 gwira.join_channel(uuid,uuid),gwira.send_channel_message(uuid,uuid,uuid,text),
 gwira.update_channel_preference(uuid,uuid,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
