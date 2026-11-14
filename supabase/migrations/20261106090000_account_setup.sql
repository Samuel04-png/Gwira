-- Account profile and workspace-setup contracts read by the Stage B1 router.
-- Additive. NOT applied to the hosted project; review and back up before approving.
begin;

-- A project that auto-confirms email (isolated development only) cannot prove that a user owns
-- their mailbox. Mailbox-bound actions are refused there. Production keeps the default (false).
create table gwira.environment_settings (
 singleton boolean primary key default true check(singleton),
 email_autoconfirm boolean not null default false
);
insert into gwira.environment_settings default values;
alter table gwira.environment_settings enable row level security;
revoke all on gwira.environment_settings from public,anon,authenticated;
create function gwira.require_mailbox_verified() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from gwira.environment_settings where email_autoconfirm) then
  raise exception 'mailbox_verification_required' using errcode='42501';
 end if;
end $$;
revoke all on function gwira.require_mailbox_verified() from public,anon,authenticated;

create or replace function gwira.accept_invitation(p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor(); invitation gwira.organization_invitations; member uuid; recipient text; org uuid;
begin
 perform gwira.require_mailbox_verified();
 select organization_id into org from gwira.organization_invitations where token_hash=p_hash;
 perform 1 from gwira.organizations where id=org for update;
 select * into invitation from gwira.organization_invitations where token_hash=p_hash for update;
 if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'invitation_unavailable'; end if;
 select lower(email) into recipient from auth.users where id=actor;
 if recipient<>invitation.email then raise exception 'invitation_email_mismatch' using errcode='42501'; end if;
 if not gwira.can_invite(org,invitation.invited_by,invitation.assigned_role) then raise exception 'inviter_no_longer_authorized' using errcode='42501'; end if;
 if exists(select 1 from gwira.organization_memberships where organization_id=org and user_id=actor) then raise exception 'recipient_already_member'; end if;
 insert into gwira.organization_memberships(organization_id,user_id,role) values(org,actor,invitation.assigned_role) returning id into member;
 insert into gwira.team_memberships(organization_id,team_id,membership_id) select org,team_id,member from gwira.invitation_teams where invitation_id=invitation.id;
 update gwira.organization_invitations set status='accepted',accepted_at=now() where id=invitation.id;
 insert into gwira.access_audit(organization_id,actor_id,action,subject_id) values(org,actor,'invitation_accepted',invitation.id),(org,actor,'membership_created',member);
 return org;
end $$;

create table gwira.account_profiles (
 user_id uuid primary key references auth.users on delete cascade,
 preferred_name text not null check(length(btrim(preferred_name)) between 1 and 100),
 completed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table gwira.account_profiles enable row level security;
create policy account_profiles_own on gwira.account_profiles for select to authenticated using (user_id=(select auth.uid()));
revoke all on gwira.account_profiles from public,anon,authenticated;
grant select on gwira.account_profiles to authenticated;

create function gwira.save_account_profile(p_name text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor();
begin
 if p_name is null or length(btrim(p_name)) not between 1 and 100 then raise exception 'invalid_profile_name'; end if;
 insert into gwira.account_profiles(user_id,preferred_name,completed_at) values(actor,btrim(p_name),now())
 on conflict(user_id) do update set preferred_name=excluded.preferred_name,completed_at=coalesce(gwira.account_profiles.completed_at,now());
end $$;

create table gwira.workspace_setup (
 organization_id uuid primary key references gwira.organizations on delete cascade,
 creator_user_id uuid not null references auth.users on delete cascade,
 current_step text not null default 'meet_gwira' check(current_step in ('invite_team','meet_gwira','complete')),
 completed_at timestamptz,
 -- Self-attested Meet Gwira progress (rule-based preview, no model output); one row per workspace.
 onboarding jsonb not null default '{}'::jsonb check(octet_length(onboarding::text)<=16384),
 deferred_at timestamptz,
 created_at timestamptz not null default now()
);
alter table gwira.workspace_setup enable row level security;
create policy workspace_setup_creator on gwira.workspace_setup for select to authenticated
 using (creator_user_id=(select auth.uid()) and gwira.is_member(organization_id));
revoke all on gwira.workspace_setup from public,anon,authenticated;
grant select on gwira.workspace_setup to authenticated;

-- Atomic, idempotent creation: organization, owner membership and the creator's setup progress.
create function gwira.create_workspace(p_name text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor(); org uuid;
begin
 org:=gwira.create_organization_once(p_name,p_request_id);
 insert into gwira.workspace_setup(organization_id,creator_user_id) values(org,actor) on conflict do nothing;
 return org;
end $$;

create function gwira.save_onboarding_progress(p_org uuid,p_state jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor();
begin
 if jsonb_typeof(p_state)<>'object' or p_state->>'act' not in ('opening','clarifying','proposal','review','result')
  or jsonb_typeof(p_state->'answers')<>'array' or jsonb_array_length(p_state->'answers')>10
  or octet_length(p_state::text)>16384 then raise exception 'invalid_onboarding_state' using errcode='22023'; end if;
 update gwira.workspace_setup set onboarding=p_state
 where organization_id=p_org and creator_user_id=actor and completed_at is null and gwira.is_member(p_org);
 if not found then raise exception 'workspace_setup_unavailable' using errcode='42501'; end if;
end $$;

-- Completion requires the finished brief step, or an explicit deferral that is recorded.
create function gwira.complete_workspace_setup(p_org uuid,p_deferred boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor(); setup gwira.workspace_setup;
begin
 select * into setup from gwira.workspace_setup where organization_id=p_org and creator_user_id=actor and gwira.is_member(p_org) for update;
 if not found then raise exception 'workspace_setup_unavailable' using errcode='42501'; end if;
 if setup.completed_at is not null then return; end if;
 if not p_deferred and setup.onboarding->>'act' is distinct from 'result' then raise exception 'onboarding_incomplete' using errcode='22023'; end if;
 update gwira.workspace_setup set current_step='complete',completed_at=now(),deferred_at=case when p_deferred then now() end
 where organization_id=p_org;
end $$;

create function gwira.list_my_pending_invitations() returns table(id uuid,organization_id uuid,organization_name text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := gwira.verified_actor();
begin
 -- Unverified-mailbox environments never reveal invitations.
 if exists(select 1 from gwira.environment_settings where email_autoconfirm) then return; end if;
 return query select i.id,i.organization_id,o.name from gwira.organization_invitations i
  join gwira.organizations o on o.id=i.organization_id join auth.users u on u.id=actor
  where i.status='pending' and i.expires_at>now() and i.email=lower(u.email) order by i.created_at;
end $$;

revoke all on function gwira.save_account_profile(text),gwira.create_workspace(text,uuid),gwira.save_onboarding_progress(uuid,jsonb),gwira.complete_workspace_setup(uuid,boolean),gwira.list_my_pending_invitations() from public,anon;
grant execute on function gwira.save_account_profile(text),gwira.create_workspace(text,uuid),gwira.save_onboarding_progress(uuid,jsonb),gwira.complete_workspace_setup(uuid,boolean),gwira.list_my_pending_invitations() to authenticated;
commit;
