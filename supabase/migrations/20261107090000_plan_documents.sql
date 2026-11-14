-- First-run plan documents: versioned, organization-scoped plans and plan-only approvals.
-- Additive. NOT applied to the hosted project; review and back up before approving.
-- Approval records that a human accepted the proposed approach for one exact version. It grants no
-- execution permission: `scope` is constrained to 'plan' so external actions need separate authorization.
begin;

create table gwira.plan_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references gwira.organizations(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 200),
 status text not null default 'draft' check (status in ('draft','approved')),
 current_version integer not null default 1 check (current_version >= 1),
 source text not null default 'onboarding' check (source in ('onboarding')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index plan_documents_one_onboarding_plan on gwira.plan_documents(organization_id) where source = 'onboarding';

create table gwira.plan_versions (
 plan_id uuid not null references gwira.plan_documents(id) on delete cascade,
 version integer not null check (version >= 1),
 content_markdown text not null check (octet_length(content_markdown) <= 65536),
 structured jsonb not null check (jsonb_typeof(structured) = 'object' and octet_length(structured::text) <= 65536),
 change_summary text not null default '' check (char_length(change_summary) <= 500),
 authored_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key (plan_id, version)
);

create table gwira.plan_approvals (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null,
 version integer not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 scope text[] not null default array['plan'] check (scope = array['plan']),
 method text not null check (method in ('chat','button')),
 foreign key (plan_id, version) references gwira.plan_versions(plan_id, version),
 unique (plan_id, version)
);

alter table gwira.plan_documents enable row level security;
alter table gwira.plan_versions enable row level security;
alter table gwira.plan_approvals enable row level security;
create policy plan_documents_member_read on gwira.plan_documents for select to authenticated using (gwira.is_member(organization_id));
create policy plan_versions_member_read on gwira.plan_versions for select to authenticated
 using (exists (select 1 from gwira.plan_documents d where d.id = plan_id and gwira.is_member(d.organization_id)));
create policy plan_approvals_member_read on gwira.plan_approvals for select to authenticated
 using (exists (select 1 from gwira.plan_documents d where d.id = plan_id and gwira.is_member(d.organization_id)));
revoke all on gwira.plan_documents, gwira.plan_versions, gwira.plan_approvals from public, anon, authenticated;
grant select on gwira.plan_documents, gwira.plan_versions, gwira.plan_approvals to authenticated;

-- Creates the organization's onboarding plan (p_plan null) or appends a new draft version.
-- Editing an approved plan produces a new draft; the earlier approval stays on record for its own version.
create function gwira.save_plan_draft(p_org uuid, p_plan uuid, p_title text, p_markdown text, p_structured jsonb, p_expected_version integer, p_summary text default '')
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
 if not found then raise exception 'plan_unavailable' using errcode = '42501'; end if;
 if p_expected_version is distinct from doc.current_version then raise exception 'plan_version_stale' using errcode = '22023'; end if;
 next_version := doc.current_version + 1;
 insert into gwira.plan_versions(plan_id, version, content_markdown, structured, change_summary, authored_by)
  values (doc.id, next_version, p_markdown, p_structured, coalesce(p_summary, ''), actor);
 update gwira.plan_documents d set current_version = next_version, status = 'draft', title = p_title, updated_at = now() where d.id = doc.id;
 return query select doc.id, next_version, 'draft'::text;
end $$;

-- Approval is bound to the exact version the user reviewed and is idempotent per version.
create function gwira.approve_plan(p_org uuid, p_plan uuid, p_version integer, p_method text default 'chat')
returns table(plan_id uuid, version integer, status text, approved_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare actor uuid := gwira.verified_actor(); doc gwira.plan_documents; existing gwira.plan_approvals;
begin
 if not gwira.is_admin(p_org) then raise exception 'plan_approval_denied' using errcode = '42501'; end if;
 if p_method not in ('chat','button') then raise exception 'invalid_approval_method' using errcode = '22023'; end if;
 select * into doc from gwira.plan_documents d where d.id = p_plan and d.organization_id = p_org for update;
 if not found then raise exception 'plan_unavailable' using errcode = '42501'; end if;
 if p_version is distinct from doc.current_version then raise exception 'plan_version_stale' using errcode = '22023'; end if;
 select * into existing from gwira.plan_approvals a where a.plan_id = doc.id and a.version = p_version;
 if found then return query select doc.id, p_version, 'approved'::text, existing.approved_at; return; end if;
 insert into gwira.plan_approvals(plan_id, version, approved_by, method) values (doc.id, p_version, actor, p_method) returning * into existing;
 update gwira.plan_documents d set status = 'approved', updated_at = now() where d.id = doc.id;
 return query select doc.id, p_version, 'approved'::text, existing.approved_at;
end $$;

revoke all on function gwira.save_plan_draft(uuid, uuid, text, text, jsonb, integer, text), gwira.approve_plan(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function gwira.save_plan_draft(uuid, uuid, text, text, jsonb, integer, text), gwira.approve_plan(uuid, uuid, integer, text) to authenticated;
commit;
