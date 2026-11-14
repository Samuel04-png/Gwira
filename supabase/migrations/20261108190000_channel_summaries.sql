-- Summaries expose only the current member's preferences, not other members' cursors.
begin;
create function gwira.list_channels(p_org uuid)
returns table(
 id uuid, organization_id uuid, created_by uuid, name text, topic text, visibility text,
 created_at timestamptz, updated_at timestamptz, is_member boolean, muted boolean,
 unread bigint, member_count bigint
) language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor();
begin
 if not gwira.is_member(p_org) then raise exception 'channel_unavailable' using errcode='42501'; end if;
 return query
 select c.id,c.organization_id,c.created_by,c.name,c.topic,c.visibility,c.created_at,c.updated_at,
  m.user_id is not null,coalesce(m.muted,false),
  case when m.user_id is null then 0::bigint else
   (select count(*) from gwira.channel_messages msg
    where msg.channel_id=c.id and msg.seq>m.last_read_seq and msg.author_id<>actor) end,
  (select count(*) from gwira.channel_members cm
   join gwira.organization_memberships om on om.organization_id=cm.organization_id and om.user_id=cm.user_id
   where cm.channel_id=c.id and om.status='active')
 from gwira.channels c
 left join gwira.channel_members m on m.channel_id=c.id and m.user_id=actor
 where c.organization_id=p_org and c.archived_at is null and gwira.can_read_channel(c.id)
 order by c.updated_at desc,c.id;
end $$;
revoke all on function gwira.list_channels(uuid) from public,anon;
grant execute on function gwira.list_channels(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
