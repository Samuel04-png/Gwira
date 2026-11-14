-- Preserve the visibility of existing plans. New plans are private by default.
begin;

alter table gwira.plan_documents
 add column visibility text not null default 'organization'
 check (visibility in ('private','organization'));
alter table gwira.plan_documents alter column visibility set default 'private';

create function gwira.can_read_plan(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from gwira.plan_documents d
  where d.id=p_id and gwira.is_member(d.organization_id)
   and (d.visibility='organization' or d.created_by=auth.uid())
 )
$$;
revoke all on function gwira.can_read_plan(uuid) from public,anon;
grant execute on function gwira.can_read_plan(uuid) to authenticated;

drop policy plan_documents_member_read on gwira.plan_documents;
drop policy plan_versions_member_read on gwira.plan_versions;
drop policy plan_approvals_member_read on gwira.plan_approvals;
create policy plan_documents_read on gwira.plan_documents for select to authenticated
 using (gwira.is_member(organization_id) and (visibility='organization' or created_by=(select auth.uid())));
create policy plan_versions_read on gwira.plan_versions for select to authenticated
 using (gwira.can_read_plan(plan_id));
create policy plan_approvals_read on gwira.plan_approvals for select to authenticated
 using (gwira.can_read_plan(plan_id));

drop policy conversation_plan_link_read on gwira.conversation_plan_links;
create policy conversation_plan_link_read on gwira.conversation_plan_links for select to authenticated
 using (gwira.can_read_conversation(conversation_id) and gwira.can_read_plan(plan_id));

create or replace function gwira.save_plan_draft(p_org uuid, p_plan uuid, p_title text, p_markdown text, p_structured jsonb, p_expected_version integer, p_summary text default '')
returns table(plan_id uuid, version integer, status text) language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); doc gwira.plan_documents; next_version integer;
begin
 if not gwira.is_member(p_org) then raise exception 'plan_access_denied' using errcode = '42501'; end if;
 if p_plan is null then
  insert into gwira.plan_documents(organization_id, title, created_by) values (p_org, p_title, actor) returning * into doc;
  insert into gwira.plan_versions(plan_id, version, content_markdown, structured, change_summary, authored_by)
   values (doc.id, 1, p_markdown, p_structured, coalesce(p_summary, ''), actor);
  return query select doc.id, 1, 'draft'::text;
  return;
 end if;
 select * into doc from gwira.plan_documents d where d.id = p_plan and d.organization_id = p_org for update;
 if not found or not gwira.can_read_plan(p_plan) then raise exception 'plan_unavailable' using errcode = '42501'; end if;
 if p_expected_version is distinct from doc.current_version then raise exception 'plan_version_stale' using errcode = '22023'; end if;
 next_version := doc.current_version + 1;
 insert into gwira.plan_versions(plan_id, version, content_markdown, structured, change_summary, authored_by)
  values (doc.id, next_version, p_markdown, p_structured, coalesce(p_summary, ''), actor);
 update gwira.plan_documents d set current_version = next_version, status = 'draft', title = p_title, updated_at = now() where d.id = doc.id;
 return query select doc.id, next_version, 'draft'::text;
end $$;

create or replace function gwira.approve_plan(p_org uuid, p_plan uuid, p_version integer, p_method text default 'chat')
returns table(plan_id uuid, version integer, status text, approved_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); doc gwira.plan_documents; existing gwira.plan_approvals;
begin
 if not gwira.is_admin(p_org) then raise exception 'plan_approval_denied' using errcode = '42501'; end if;
 if p_method not in ('chat','button') then raise exception 'invalid_approval_method' using errcode = '22023'; end if;
 select * into doc from gwira.plan_documents d where d.id = p_plan and d.organization_id = p_org for update;
 if not found or not gwira.can_read_plan(p_plan) then raise exception 'plan_unavailable' using errcode = '42501'; end if;
 if p_version is distinct from doc.current_version then raise exception 'plan_version_stale' using errcode = '22023'; end if;
 select * into existing from gwira.plan_approvals a where a.plan_id = doc.id and a.version = p_version;
 if found then return query select doc.id, p_version, 'approved'::text, existing.approved_at; return; end if;
 insert into gwira.plan_approvals(plan_id, version, approved_by, method) values (doc.id, p_version, actor, p_method) returning * into existing;
 update gwira.plan_documents d set status = 'approved', updated_at = now() where d.id = doc.id;
 return query select doc.id, p_version, 'approved'::text, existing.approved_at;
end $$;

create or replace function gwira.link_conversation_plan(p_id uuid,p_plan uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); conversation gwira.conversations;
begin
 select * into conversation from gwira.conversations where id=p_id for update;
 if not found or conversation.created_by<>actor or not gwira.is_member(conversation.organization_id)
  or not gwira.can_read_plan(p_plan)
  or not exists(select 1 from gwira.plan_documents d where d.id=p_plan and d.organization_id=conversation.organization_id) then
  raise exception 'conversation_plan_unavailable' using errcode='42501';
 end if;
 insert into gwira.conversation_plan_links(conversation_id,plan_id,linked_by) values(p_id,p_plan,actor) on conflict do nothing;
end $$;

commit;
