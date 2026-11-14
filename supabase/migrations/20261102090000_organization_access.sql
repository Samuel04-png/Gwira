-- Isolated cloud foundation. Never imports or associates local workspace data.
-- Apply only to an explicitly approved environment after inspecting its schema.
begin;
create schema if not exists gwira;
create table gwira.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 200),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table gwira.organization_memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references gwira.organizations on delete cascade,
 user_id uuid not null references auth.users on delete restrict,
 role text not null check(role in ('owner','admin','member')), status text not null default 'active' check(status in ('active','suspended')),
 joined_at timestamptz not null default now(), unique(organization_id,user_id), unique(organization_id,id)
);
create index memberships_user on gwira.organization_memberships(user_id,organization_id) where status='active';
create table gwira.employees (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references gwira.organizations on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 200), job_title text not null default '', user_id uuid,
 created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,user_id),
 foreign key(organization_id,user_id) references gwira.organization_memberships(organization_id,user_id) on delete restrict
);
create table gwira.teams (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references gwira.organizations on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 200), description text not null default '',
 created_at timestamptz not null default now(), unique(organization_id,id)
);
create table gwira.team_memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references gwira.organizations on delete cascade,
 team_id uuid not null, membership_id uuid, employee_id uuid,
 check(num_nonnulls(membership_id,employee_id)=1),
 foreign key(organization_id,team_id) references gwira.teams(organization_id,id) on delete cascade,
 foreign key(organization_id,membership_id) references gwira.organization_memberships(organization_id,id) on delete cascade,
 foreign key(organization_id,employee_id) references gwira.employees(organization_id,id) on delete cascade,
 unique(team_id,membership_id), unique(team_id,employee_id)
);
create table gwira.organization_invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references gwira.organizations on delete cascade,
 email text not null check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 assigned_role text not null check(assigned_role in ('admin','member')), invited_by uuid not null references auth.users,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 status text not null default 'pending' check(status in ('pending','accepted','expired','revoked')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, revoked_at timestamptz, last_sent_at timestamptz not null default now(),
 delivery_status text not null default 'queued' check(delivery_status in ('queued','sent','failed')),
 generation integer not null default 1 check(generation>0), check(expires_at>created_at)
);
create unique index invitations_pending_recipient on gwira.organization_invitations(organization_id,email) where status='pending';
create index invitations_org_created on gwira.organization_invitations(organization_id,created_at desc);
create table gwira.invitation_teams (
 organization_id uuid not null, invitation_id uuid not null references gwira.organization_invitations on delete cascade,
 team_id uuid not null, primary key(invitation_id,team_id),
 foreign key(organization_id,team_id) references gwira.teams(organization_id,id) on delete cascade
);
-- Prevent assigning an invitation's team edge to a different tenant.
alter table gwira.organization_invitations add unique(organization_id,id);
alter table gwira.invitation_teams add foreign key(organization_id,invitation_id) references gwira.organization_invitations(organization_id,id) on delete cascade;
create table gwira.access_audit (
 id bigint generated always as identity primary key, organization_id uuid not null references gwira.organizations on delete cascade,
 actor_id uuid not null references auth.users, action text not null check(action in ('organization_created','invitation_created','invitation_resent','invitation_revoked','invitation_accepted','membership_created','role_changed','delivery_sent','delivery_failed')),
 subject_id uuid not null, created_at timestamptz not null default now()
);
create index audit_org_created on gwira.access_audit(organization_id,created_at desc);

create function gwira.is_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from gwira.organization_memberships where organization_id=org and user_id=(select auth.uid()) and status='active')
$$;
create function gwira.is_admin(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from gwira.organization_memberships where organization_id=org and user_id=(select auth.uid()) and status='active' and role in ('owner','admin'))
$$;
create function gwira.verified_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null and email is not null) then raise exception 'verified_account_required' using errcode='42501'; end if;
 return actor;
end $$;
create function gwira.can_invite(org uuid, actor uuid, assigned text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from gwira.organization_memberships where organization_id=org and user_id=actor and status='active' and (role='owner' or (role='admin' and assigned='member')))
$$;

create function gwira.create_organization(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor(); org uuid; member uuid;
begin
 if p_name is null or length(btrim(p_name)) not between 1 and 200 then raise exception 'invalid_organization_name'; end if;
 insert into gwira.organizations(name) values(btrim(p_name)) returning id into org;
 insert into gwira.organization_memberships(organization_id,user_id,role) values(org,actor,'owner') returning id into member;
 insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(org,actor,'organization_created',org),(org,actor,'membership_created',member);
 return org;
end $$;

create function gwira.create_invitation(p_actor uuid,p_org uuid,p_email text,p_role text,p_hash text,p_teams uuid[] default '{}') returns gwira.organization_invitations language plpgsql security definer set search_path='' as $$
declare actor uuid := p_actor; recipient text := lower(btrim(p_email)); invitation gwira.organization_invitations;
begin
 if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'verified_account_required' using errcode='42501'; end if;
 -- Serialize tenant invite creation/resend/role changes to enforce limits under concurrency.
 perform 1 from gwira.organizations where id=p_org for update;
 if not gwira.can_invite(p_org,actor,p_role) or p_role not in ('admin','member') then raise exception 'invitation_not_permitted' using errcode='42501'; end if;
 if exists(select 1 from gwira.organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=p_org and lower(u.email)=recipient) then raise exception 'recipient_already_member'; end if;
 if (select count(*) from gwira.access_audit where organization_id=p_org and action in ('invitation_created','invitation_resent') and created_at>now()-interval '1 hour')>=20 then raise exception 'invitation_rate_limited'; end if;
 if p_teams is null or cardinality(p_teams)>20 or exists(select 1 from unnest(p_teams) t where t is null or not exists(select 1 from gwira.teams where organization_id=p_org and id=t)) then raise exception 'invalid_team_assignment'; end if;
 update gwira.organization_invitations set status='expired' where organization_id=p_org and email=recipient and status='pending' and expires_at<=now();
 if exists(select 1 from gwira.organization_invitations where organization_id=p_org and email=recipient and status='pending') then raise exception 'invitation_already_pending'; end if;
 insert into gwira.organization_invitations(organization_id,email,assigned_role,invited_by,token_hash) values(p_org,recipient,p_role,actor,p_hash) returning * into invitation;
 insert into gwira.invitation_teams select p_org,invitation.id,t from (select distinct unnest(p_teams) t) teams;
 insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(p_org,actor,'invitation_created',invitation.id);
 return invitation;
end $$;

create function gwira.resend_invitation(p_actor uuid,p_id uuid,p_hash text) returns gwira.organization_invitations language plpgsql security definer set search_path='' as $$
declare actor uuid := p_actor; invitation gwira.organization_invitations; org uuid;
begin
 if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'verified_account_required' using errcode='42501'; end if;
 select organization_id into org from gwira.organization_invitations where id=p_id;
 perform 1 from gwira.organizations where id=org for update;
 select * into invitation from gwira.organization_invitations where id=p_id for update;
 if invitation.id is null or not gwira.can_invite(org,actor,invitation.assigned_role) then raise exception 'invitation_not_permitted' using errcode='42501'; end if;
 if invitation.status not in ('pending','expired') then raise exception 'invitation_not_resendable'; end if;
 if invitation.last_sent_at>now()-interval '1 minute' or (select count(*) from gwira.access_audit where organization_id=org and action in ('invitation_created','invitation_resent') and created_at>now()-interval '1 hour')>=20 then raise exception 'invitation_rate_limited'; end if;
 if exists(select 1 from gwira.organization_invitations where organization_id=org and email=invitation.email and status='pending' and id<>p_id) then raise exception 'invitation_already_pending'; end if;
 update gwira.organization_invitations set token_hash=p_hash,status='pending',expires_at=now()+interval '7 days',last_sent_at=now(),delivery_status='queued',generation=generation+1,invited_by=actor where id=p_id returning * into invitation;
 insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(org,actor,'invitation_resent',p_id);
 return invitation;
end $$;
create function gwira.revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor(); invitation gwira.organization_invitations; org uuid;
begin
 select organization_id into org from gwira.organization_invitations where id=p_id;
 perform 1 from gwira.organizations where id=org for update;
 select * into invitation from gwira.organization_invitations where id=p_id for update;
 if invitation.id is null or not gwira.is_admin(org) then raise exception 'invitation_not_permitted' using errcode='42501'; end if;
 if invitation.status in ('accepted','revoked') then raise exception 'invitation_not_revocable'; end if;
 update gwira.organization_invitations set status='revoked',revoked_at=now() where id=p_id;
 insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(org,actor,'invitation_revoked',p_id);
end $$;
create function gwira.accept_invitation(p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor(); invitation gwira.organization_invitations; member uuid; recipient text; org uuid;
begin
 select organization_id into org from gwira.organization_invitations where token_hash=p_hash;
 perform 1 from gwira.organizations where id=org for update;
 select * into invitation from gwira.organization_invitations where token_hash=p_hash for update;
 if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'invitation_unavailable'; end if;
 select lower(email) into recipient from auth.users where id=actor;
 if recipient<>invitation.email then raise exception 'invitation_email_mismatch' using errcode='42501'; end if;
 if not gwira.can_invite(org,invitation.invited_by,invitation.assigned_role) then raise exception 'inviter_no_longer_authorized' using errcode='42501'; end if;
 -- Never downgrade or elevate an existing membership through an invitation.
 if exists(select 1 from gwira.organization_memberships where organization_id=org and user_id=actor) then raise exception 'recipient_already_member'; end if;
 insert into gwira.organization_memberships(organization_id,user_id,role) values(org,actor,invitation.assigned_role) returning id into member;
 insert into gwira.team_memberships(organization_id,team_id,membership_id) select org,team_id,member from gwira.invitation_teams where invitation_id=invitation.id;
 update gwira.organization_invitations set status='accepted',accepted_at=now() where id=invitation.id;
 insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(org,actor,'invitation_accepted',invitation.id),(org,actor,'membership_created',member);
 return org;
end $$;

create function gwira.change_member_role(p_org uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor(); member uuid;
begin
 perform 1 from gwira.organizations where id=p_org for update;
 if not exists(select 1 from gwira.organization_memberships where organization_id=p_org and user_id=actor and role='owner' and status='active') then raise exception 'owner_required' using errcode='42501'; end if;
 if p_role is null or p_role not in ('owner','admin','member') then raise exception 'invalid_role'; end if;
 select id into member from gwira.organization_memberships where organization_id=p_org and user_id=p_user and status='active';
 if member is null then raise exception 'member_unavailable'; end if;
 if p_role<>'owner' and exists(select 1 from gwira.organization_memberships where id=member and role='owner') and (select count(*) from gwira.organization_memberships where organization_id=p_org and role='owner' and status='active')<=1 then raise exception 'final_owner_required'; end if;
 update gwira.organization_memberships set role=p_role where id=member;
 insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(p_org,actor,'role_changed',member);
end $$;

-- Preview and delivery updates are trusted backend-only functions, never client RPCs.
create function gwira.preview_invitation(p_hash text) returns table(organization_name text,assigned_role text,status text,expires_at timestamptz) language sql stable security definer set search_path='' as $$
 select o.name,i.assigned_role,case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,i.expires_at from gwira.organization_invitations i join gwira.organizations o on o.id=i.organization_id where i.token_hash=p_hash
$$;
create function gwira.record_delivery(p_id uuid,p_generation integer,p_sent boolean) returns void language plpgsql security definer set search_path='' as $$
declare invitation gwira.organization_invitations;
begin
 update gwira.organization_invitations set delivery_status=case when p_sent then 'sent' else 'failed' end where id=p_id and generation=p_generation and status='pending' returning * into invitation;
 if invitation.id is not null then insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(invitation.organization_id,invitation.invited_by,case when p_sent then 'delivery_sent' else 'delivery_failed' end,p_id); end if;
end $$;

alter table gwira.organizations enable row level security;
alter table gwira.organization_memberships enable row level security;
alter table gwira.employees enable row level security;
alter table gwira.teams enable row level security;
alter table gwira.team_memberships enable row level security;
alter table gwira.organization_invitations enable row level security;
alter table gwira.invitation_teams enable row level security;
alter table gwira.access_audit enable row level security;
create policy member_read on gwira.organizations for select to authenticated using(gwira.is_member(id));
create policy member_read on gwira.organization_memberships for select to authenticated using(gwira.is_member(organization_id));
create policy member_read on gwira.employees for select to authenticated using(gwira.is_member(organization_id));
create policy member_read on gwira.teams for select to authenticated using(gwira.is_member(organization_id));
create policy member_read on gwira.team_memberships for select to authenticated using(gwira.is_member(organization_id));
create policy admin_read on gwira.organization_invitations for select to authenticated using(gwira.is_admin(organization_id));
create policy admin_read on gwira.invitation_teams for select to authenticated using(gwira.is_admin(organization_id));
create policy admin_read on gwira.access_audit for select to authenticated using(gwira.is_admin(organization_id));
revoke all on schema gwira from public,anon;
grant usage on schema gwira to authenticated,service_role;
revoke all on all tables in schema gwira from public,anon,authenticated;
grant select on gwira.organizations,gwira.organization_memberships,gwira.employees,gwira.teams,gwira.team_memberships,gwira.invitation_teams,gwira.access_audit to authenticated;
-- token_hash is deliberately omitted, including for organization owners/admins.
grant select(id,organization_id,email,assigned_role,invited_by,status,created_at,expires_at,accepted_at,revoked_at,last_sent_at,delivery_status,generation) on gwira.organization_invitations to authenticated;
revoke all on all functions in schema gwira from public,anon,authenticated;
grant execute on function gwira.is_member(uuid),gwira.is_admin(uuid),gwira.create_organization(text),gwira.accept_invitation(text),gwira.revoke_invitation(uuid),gwira.change_member_role(uuid,uuid,text) to authenticated;
-- Creation/resend return internal rows with digests. Only the trusted service may call them.
grant execute on function gwira.create_invitation(uuid,uuid,text,text,text,uuid[]),gwira.resend_invitation(uuid,uuid,text),gwira.preview_invitation(text),gwira.record_delivery(uuid,integer,boolean) to service_role;
-- The service obtains p_actor from Auth getUser after verifying the bearer token.
-- Never accept p_actor from an HTTP request body or expose service_role credentials.
commit;
