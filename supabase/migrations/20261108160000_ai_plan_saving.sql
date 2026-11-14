-- Explicit, versioned saving of a confirmed AI response; never executes a plan.
begin;
alter table gwira.plan_documents drop constraint plan_documents_source_check;
alter table gwira.plan_documents add constraint plan_documents_source_check check (source in ('onboarding','conversation'));
create table gwira.ai_plan_saves (
 message_id uuid primary key references gwira.conversation_messages(id) on delete cascade,
 plan_id uuid not null references gwira.plan_documents(id) on delete cascade,
 version integer not null,
 created_by uuid not null references auth.users(id),
 foreign key(plan_id,version) references gwira.plan_versions(plan_id,version)
);
alter table gwira.ai_plan_saves enable row level security;
revoke all on gwira.ai_plan_saves from public,anon,authenticated;

create function gwira.save_ai_plan(p_conversation uuid,p_message uuid,p_expected_version integer)
returns table(plan_id uuid,version integer) language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); c gwira.conversations; m gwira.conversation_messages;
 doc gwira.plan_documents; saved gwira.ai_plan_saves; linked uuid; n integer;
begin
 select * into c from gwira.conversations where id=p_conversation for update;
 if not found or c.created_by<>actor or c.archived_at is not null or not gwira.is_member(c.organization_id) then
  raise exception 'plan_unavailable' using errcode='42501';
 end if;
 select * into m from gwira.conversation_messages where id=p_message and conversation_id=p_conversation and author_type='assistant';
 if not found or not exists(select 1 from gwira.ai_generations where assistant_message_id=p_message and status='completed') then
  raise exception 'plan_unavailable' using errcode='42501';
 end if;
 select * into saved from gwira.ai_plan_saves where message_id=p_message;
 if found then
  if saved.created_by<>actor or not gwira.can_read_plan(saved.plan_id) then raise exception 'plan_unavailable' using errcode='42501'; end if;
  return query select saved.plan_id,saved.version;
  return;
 end if;
 select count(*),min(l.plan_id::text)::uuid into n,linked from gwira.conversation_plan_links l where l.conversation_id=p_conversation;
 if n>1 then raise exception 'plan_unavailable' using errcode='42501'; end if;
 if n=0 then
  if p_expected_version is not null then raise exception 'plan_version_stale' using errcode='22023'; end if;
  insert into gwira.plan_documents(organization_id,title,source,created_by,visibility)
   values(c.organization_id,left(c.title,200),'conversation',actor,'private') returning * into doc;
  n:=1;
  insert into gwira.conversation_plan_links(conversation_id,plan_id,linked_by) values(c.id,doc.id,actor);
 else
  select * into doc from gwira.plan_documents where id=linked and organization_id=c.organization_id for update;
  if not found or doc.visibility<>'private' or doc.created_by<>actor or not gwira.can_read_plan(doc.id) then
   raise exception 'plan_unavailable' using errcode='42501';
  end if;
  if p_expected_version is distinct from doc.current_version then raise exception 'plan_version_stale' using errcode='22023'; end if;
  n:=doc.current_version+1;
  update gwira.plan_documents set current_version=n,status='draft',updated_at=now() where id=doc.id;
 end if;
 insert into gwira.plan_versions(plan_id,version,content_markdown,structured,change_summary,authored_by)
 values(doc.id,n,m.content,jsonb_build_object('schema_version',1,'kind','ai_conversation_plan','assistant_message_id',m.id),
  'Saved from an AI response',actor);
 insert into gwira.ai_plan_saves(message_id,plan_id,version,created_by) values(m.id,doc.id,n,actor);
 return query select doc.id,n;
end $$;
revoke all on function gwira.save_ai_plan(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function gwira.save_ai_plan(uuid,uuid,integer) to authenticated;
commit;
