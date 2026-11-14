-- Explicit, idempotent transition from saved onboarding to a private conversation.
begin;
create table gwira.onboarding_conversation_links (
 organization_id uuid primary key references gwira.workspace_setup(organization_id) on delete cascade,
 conversation_id uuid unique references gwira.conversations(id) on delete set null,
 user_id uuid not null references auth.users(id)
);
alter table gwira.onboarding_conversation_links enable row level security;
revoke all on gwira.onboarding_conversation_links from public,anon,authenticated;

create function gwira.restore_onboarding_conversation(p_org uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); setup gwira.workspace_setup; existing uuid; item jsonb; goal text; question text; answer text; plan uuid; position integer:=0; origin timestamptz;
begin
 select * into setup from gwira.workspace_setup where organization_id=p_org for update;
 if not found or not gwira.is_member(p_org) then
  raise exception 'workspace_setup_unavailable' using errcode='42501';
 end if;
 if setup.creator_user_id<>actor then return null; end if;
 select conversation_id into existing from gwira.onboarding_conversation_links where organization_id=p_org;
 if found then return existing; end if;
 if setup.completed_at is null then raise exception 'onboarding_incomplete' using errcode='22023'; end if;
 goal:=setup.onboarding->>'goal';
 if goal is null or btrim(goal)='' then return null; end if;
 if char_length(goal)>2000 or jsonb_typeof(setup.onboarding->'answers')<>'array' or jsonb_array_length(setup.onboarding->'answers')>10 then
  raise exception 'invalid_onboarding_state' using errcode='22023';
 end if;
 existing:=gen_random_uuid(); origin:=coalesce(setup.completed_at,now());
 insert into gwira.conversations(id,organization_id,created_by,title,visibility)
 values(existing,p_org,actor,left(btrim(goal),200),'private');
 insert into gwira.conversation_messages(id,conversation_id,author_type,author_id,content,created_at)
 values(gen_random_uuid(),existing,'user',actor,goal,origin);
 for item in select value from jsonb_array_elements(setup.onboarding->'answers') loop
  question:=item->>'question';answer:=item->>'answer';
  if question is null or answer is null or btrim(question)='' or btrim(answer)='' or char_length(question)>2000 or char_length(answer)>2000 then
   raise exception 'invalid_onboarding_state' using errcode='22023';
  end if;
  position:=position+1;
  insert into gwira.conversation_messages(id,conversation_id,author_type,author_id,content,created_at)
  values(gen_random_uuid(),existing,'rules',null,question,origin+position*interval '1 millisecond');
  position:=position+1;
  insert into gwira.conversation_messages(id,conversation_id,author_type,author_id,content,created_at)
  values(gen_random_uuid(),existing,'user',actor,answer,origin+position*interval '1 millisecond');
 end loop;
 insert into gwira.onboarding_conversation_links(organization_id,conversation_id,user_id) values(p_org,existing,actor);
 select id into plan from gwira.plan_documents where organization_id=p_org and source='onboarding';
 if plan is not null then insert into gwira.conversation_plan_links(conversation_id,plan_id,linked_by) values(existing,plan,actor); end if;
 return existing;
end $$;
revoke all on function gwira.restore_onboarding_conversation(uuid) from public,anon,authenticated;
grant execute on function gwira.restore_onboarding_conversation(uuid) to authenticated;
commit;
