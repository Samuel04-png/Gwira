-- Serialize quota checks across all of a user's organizations.
begin;
create or replace function gwira.begin_ai_generation(p_actor uuid,p_conversation uuid,p_message uuid,p_request uuid,p_model text,p_daily_limit integer)
returns text language plpgsql security definer set search_path='' as $$
declare c gwira.conversations; m gwira.conversation_messages; g gwira.ai_generations;
begin
 if p_actor is null or p_request is null or p_model is null or char_length(p_model) not between 1 and 100
  or p_daily_limit is null or p_daily_limit not between 1 and 100 then raise exception 'invalid_generation' using errcode='22023'; end if;
 select * into c from gwira.conversations where id=p_conversation for update;
 if not found or c.archived_at is not null or not exists(select 1 from gwira.organization_memberships
  where organization_id=c.organization_id and user_id=p_actor and status='active')
  or (c.visibility='private' and c.created_by<>p_actor) then
  raise exception 'generation_access_denied' using errcode='42501';
 end if;
 select * into m from gwira.conversation_messages where id=p_message and conversation_id=p_conversation;
 if not found or m.author_type<>'user' or m.author_id<>p_actor then raise exception 'generation_access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,1));
 perform pg_advisory_xact_lock(hashtextextended(c.organization_id::text,0));
 select * into g from gwira.ai_generations where request_id=p_request or user_message_id=p_message;
 if found then
  if g.request_id<>p_request or g.user_id<>p_actor or g.conversation_id<>p_conversation or g.model<>p_model then
   raise exception 'generation_request_conflict' using errcode='22023';
  end if;
  return g.status;
 end if;
 if (select count(*) from gwira.ai_generations where user_id=p_actor and created_at>now()-interval '24 hours')>=p_daily_limit then
  raise exception 'generation_limit_reached' using errcode='P0001';
 end if;
 if exists(select 1 from gwira.ai_generations where organization_id=c.organization_id and status='generating') then
  raise exception 'generation_busy' using errcode='P0001';
 end if;
 insert into gwira.ai_generations(request_id,organization_id,conversation_id,user_id,user_message_id,status,model)
 values(p_request,c.organization_id,p_conversation,p_actor,p_message,'generating',p_model);
 return 'started';
end $$;
commit;
