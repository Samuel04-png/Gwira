-- Recover a committed channel request even if an invited member later loses access.
-- Apply only to an approved environment.
begin;

create or replace function gwira.create_channel(p_org uuid, p_id uuid, p_name text, p_topic text, p_visibility text, p_members uuid[])
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
 select * into existing from gwira.channels where id=p_id;
 if existing.id is null then
  if exists(select 1 from unnest(members) member where not exists(
   select 1 from gwira.organization_memberships m where m.organization_id = p_org and m.user_id = member and m.status = 'active'
  )) then raise exception 'channel_member_unavailable' using errcode = '42501'; end if;
  insert into gwira.channels(id,organization_id,created_by,name,topic,visibility,initial_members)
  values(p_id,p_org,actor,btrim(p_name),p_topic,p_visibility,members) on conflict(id) do nothing;
  if found then
   insert into gwira.channel_members(organization_id,channel_id,user_id)
    select p_org,p_id,member from (select distinct unnest(members || array[actor]) member) items;
   return p_id;
  end if;
  select * into existing from gwira.channels where id=p_id;
 end if;
 if existing.organization_id is distinct from p_org or existing.created_by is distinct from actor
  or existing.name is distinct from btrim(p_name) or existing.topic is distinct from p_topic
  or existing.visibility is distinct from p_visibility or existing.initial_members is distinct from members then
  raise exception 'channel_request_conflict' using errcode = '22023';
 end if;
 if not gwira.can_read_channel(p_id) then raise exception 'channel_unavailable' using errcode = '42501'; end if;
 return p_id;
end $$;

commit;
