-- Link a directly saved first conversation to setup without copying its messages.
begin;
create function gwira.link_initial_conversation(p_org uuid,p_conversation uuid,p_message uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); setup gwira.workspace_setup; existing uuid;
begin
 select * into setup from gwira.workspace_setup where organization_id=p_org for update;
 if not found or not gwira.is_member(p_org) or setup.creator_user_id<>actor then
  raise exception 'workspace_setup_unavailable' using errcode='42501';
 end if;
 select conversation_id into existing from gwira.onboarding_conversation_links where organization_id=p_org;
 if found then
  if existing is distinct from p_conversation then raise exception 'onboarding_conversation_conflict' using errcode='22023'; end if;
  return existing;
 end if;
 if setup.completed_at is not null or not exists(
  select 1 from gwira.conversations c
  join gwira.conversation_messages m on m.conversation_id=c.id
  where c.id=p_conversation and c.organization_id=p_org and c.created_by=actor
   and c.visibility='private' and c.archived_at is null
   and m.id=p_message and m.author_type='user' and m.author_id=actor
   and m.content=setup.onboarding->>'goal'
 ) then raise exception 'onboarding_conversation_invalid' using errcode='22023'; end if;
 insert into gwira.onboarding_conversation_links(organization_id,conversation_id,user_id)
 values(p_org,p_conversation,actor);
 return p_conversation;
end $$;
revoke all on function gwira.link_initial_conversation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function gwira.link_initial_conversation(uuid,uuid,uuid) to authenticated;
commit;
