-- Advance only through messages actually loaded by the client.
begin;
create function gwira.advance_channel_read(p_org uuid, p_channel uuid, p_seq bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); channel gwira.channels;
begin
 select * into channel from gwira.channels where id=p_channel and organization_id=p_org for update;
 if channel.id is null or not gwira.is_member(p_org) or not gwira.can_read_channel(p_channel)
  or not exists(select 1 from gwira.channel_members where channel_id=p_channel and user_id=actor) then
  raise exception 'channel_unavailable' using errcode='42501';
 end if;
 if p_seq is null or p_seq<1 or not exists(select 1 from gwira.channel_messages where channel_id=p_channel and seq=p_seq) then
  raise exception 'invalid_channel_cursor' using errcode='22023';
 end if;
 update gwira.channel_members set last_read_seq=greatest(last_read_seq,p_seq)
 where channel_id=p_channel and user_id=actor;
end $$;
revoke all on function gwira.advance_channel_read(uuid,uuid,bigint) from public,anon;
grant execute on function gwira.advance_channel_read(uuid,uuid,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
