-- Server-only generation ledger. No provider credentials or privileged writes are exposed to clients.
begin;

alter table gwira.conversation_messages drop constraint conversation_messages_author_type_check;
alter table gwira.conversation_messages add constraint conversation_messages_author_type_check
 check (author_type in ('user','rules','assistant'));
alter table gwira.conversation_messages drop constraint conversation_messages_check;
alter table gwira.conversation_messages add constraint conversation_messages_author_identity_check
 check ((author_type='user' and author_id is not null) or (author_type in ('rules','assistant') and author_id is null));

create table gwira.ai_generations (
 request_id uuid primary key,
 organization_id uuid not null references gwira.organizations(id) on delete cascade,
 conversation_id uuid not null references gwira.conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 user_message_id uuid not null references gwira.conversation_messages(id) on delete cascade,
 assistant_message_id uuid unique,
 status text not null check (status in ('generating','completed','failed')),
 model text not null check (char_length(model) between 1 and 100),
 input_tokens integer check (input_tokens between 0 and 1000000),
 output_tokens integer check (output_tokens between 0 and 1000000),
 failure_code text check (failure_code is null or failure_code in ('provider_error','access_revoked','invalid_response')),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 unique (user_message_id)
);
create index ai_generations_user_recent on gwira.ai_generations(user_id,created_at desc);
create unique index ai_generations_one_running_per_org on gwira.ai_generations(organization_id) where status='generating';
alter table gwira.ai_generations enable row level security;
revoke all on gwira.ai_generations from public,anon,authenticated;
create policy ai_generation_read on gwira.ai_generations for select to authenticated
 using (gwira.can_read_conversation(conversation_id));
grant select on gwira.ai_generations to authenticated;

-- The gateway authenticates the bearer using Supabase Auth before supplying p_actor.
-- The database independently checks membership, ownership, the exact message and quota.
create function gwira.begin_ai_generation(p_actor uuid,p_conversation uuid,p_message uuid,p_request uuid,p_model text,p_daily_limit integer)
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

create function gwira.finish_ai_generation(p_request uuid,p_content text,p_input_tokens integer,p_output_tokens integer)
returns text language plpgsql security definer set search_path='' as $$
declare g gwira.ai_generations; c gwira.conversations; message_id uuid;
begin
 select * into g from gwira.ai_generations where request_id=p_request for update;
 if not found then raise exception 'generation_unavailable' using errcode='42501'; end if;
 if g.status<>'generating' then return g.status; end if;
 select * into c from gwira.conversations where id=g.conversation_id for update;
 if not found or c.archived_at is not null or c.organization_id<>g.organization_id
  or not exists(select 1 from gwira.organization_memberships where organization_id=g.organization_id and user_id=g.user_id and status='active')
  or (c.visibility='private' and c.created_by<>g.user_id) then
  update gwira.ai_generations set status='failed',failure_code='access_revoked',finished_at=now() where request_id=p_request;
  return 'failed';
 end if;
 if p_content is null or char_length(btrim(p_content)) not between 1 and 10000
  or p_input_tokens is null or p_input_tokens not between 0 and 1000000
  or p_output_tokens is null or p_output_tokens not between 0 and 1000000 then
  raise exception 'invalid_generation_result' using errcode='22023';
 end if;
 message_id:=gen_random_uuid();
 insert into gwira.conversation_messages(id,conversation_id,author_type,author_id,content)
 values(message_id,g.conversation_id,'assistant',null,p_content);
 update gwira.ai_generations set status='completed',assistant_message_id=message_id,input_tokens=p_input_tokens,
  output_tokens=p_output_tokens,finished_at=now() where request_id=p_request;
 update gwira.conversations set updated_at=now() where id=g.conversation_id;
 return 'completed';
end $$;

create function gwira.fail_ai_generation(p_request uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_code not in ('provider_error','invalid_response') then raise exception 'invalid_failure' using errcode='22023'; end if;
 update gwira.ai_generations set status='failed',failure_code=p_code,finished_at=now()
 where request_id=p_request and status='generating';
 if not found then raise exception 'generation_unavailable' using errcode='42501'; end if;
end $$;

revoke all on function gwira.begin_ai_generation(uuid,uuid,uuid,uuid,text,integer),
 gwira.finish_ai_generation(uuid,text,integer,integer),gwira.fail_ai_generation(uuid,text) from public,anon,authenticated;
grant execute on function gwira.begin_ai_generation(uuid,uuid,uuid,uuid,text,integer),
 gwira.finish_ai_generation(uuid,text,integer,integer),gwira.fail_ai_generation(uuid,text) to service_role;
commit;
