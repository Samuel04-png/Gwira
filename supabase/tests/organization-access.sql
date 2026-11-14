\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$begin
 begin execute sql; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'Wrong failure: %, expected %',sqlerrm,expected;end if;raise notice 'PASS rejected: %',expected;return;end;
 raise exception 'FAIL: query succeeded, expected %',expected;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select gwira.create_organization('Organization A') as org_a \gset
select pg_temp.check_true((select count(*)=1 from gwira.organization_memberships where organization_id=:'org_a' and role='owner'),'atomic organization owner');
select pg_temp.reject($q$select gwira.create_organization(' ')$q$,'invalid_organization_name');
select pg_temp.reject(format('select gwira.change_member_role(%L,%L,%L)',:'org_a','11111111-1111-4111-8111-111111111111','member'),'final_owner_required');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select gwira.create_organization('Organization B') as org_b \gset
select pg_temp.check_true((select count(*)=1 from gwira.organizations),'RLS isolates organizations');
select pg_temp.check_true((select count(*)=0 from gwira.organization_memberships where organization_id=:'org_a'),'RLS isolates memberships');
select pg_temp.reject(format('insert into gwira.organization_memberships(organization_id,user_id,role) values(%L,%L,%L)',:'org_a','33333333-3333-4333-8333-333333333333','owner'),'permission denied');
reset role;
insert into gwira.teams(organization_id,name) values(:'org_a','A team') returning id as team_a \gset
insert into gwira.teams(organization_id,name) values(:'org_b','B team') returning id as team_b \gset
insert into gwira.employees(organization_id,name) values(:'org_a','Unlinked employee');
set role service_role;
select pg_temp.reject(format('select gwira.create_invitation(%L,%L,%L,%L,%L)', '33333333-3333-4333-8333-333333333333',:'org_a','existing@example.test','member',repeat('a',64)),'invitation_not_permitted');
select pg_temp.reject(format('select gwira.create_invitation(%L,%L,%L,%L,%L,ARRAY[%L]::uuid[])','11111111-1111-4111-8111-111111111111',:'org_a','existing@example.test','member',repeat('a',64),:'team_b'),'invalid_team_assignment');
select (gwira.create_invitation('11111111-1111-4111-8111-111111111111',:'org_a',' EXISTING@example.test ','member',repeat('a',64),array[:'team_a']::uuid[])).id as invite_a \gset
select pg_temp.reject(format('select gwira.create_invitation(%L,%L,%L,%L,%L)','11111111-1111-4111-8111-111111111111',:'org_a','existing@example.test','member',repeat('b',64)),'invitation_already_pending');
select pg_temp.reject(format('select gwira.create_invitation(%L,%L,%L,%L,%L)','11111111-1111-4111-8111-111111111111',:'org_a','elevate@example.test','owner',repeat('c',64)),'invitation_not_permitted');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select pg_temp.check_true((select expires_at-created_at=interval '7 days' from gwira.organization_invitations where id=:'invite_a'),'server-side seven day expiry');
select pg_temp.reject('select token_hash from gwira.organization_invitations','permission denied');
select pg_temp.reject(format('select gwira.create_invitation(%L,%L,%L,%L,%L)','11111111-1111-4111-8111-111111111111',:'org_a','e@example.test','member',repeat('d',64)),'permission denied');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('a',64)),'invitation_email_mismatch');
select pg_temp.check_true((select count(*)=0 from gwira.organization_invitations),'invitation RLS hides another tenant');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select gwira.accept_invitation(repeat('a',64));
select pg_temp.check_true((select count(*)=1 from gwira.team_memberships where team_id=:'team_a'),'acceptance applies team membership atomically');
select pg_temp.check_true((select count(*)=1 from gwira.employees where organization_id=:'org_a' and user_id is null),'employee remains distinct from account');
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('a',64)),'invitation_unavailable');
select pg_temp.reject(format('select gwira.change_member_role(%L,%L,%L)',:'org_a','22222222-2222-4222-8222-222222222222','owner'),'owner_required');
select pg_temp.check_true((select count(*)=0 from gwira.organization_invitations),'ordinary members cannot list invitations');
select pg_temp.check_true((select count(*)=0 from gwira.teams where organization_id=:'org_b'),'cross-organization teams hidden');
set role service_role;
select (gwira.create_invitation('33333333-3333-4333-8333-333333333333',:'org_b','existing@example.test','member',repeat('b',64))).id;
set role authenticated;
select gwira.accept_invitation(repeat('b',64));
select pg_temp.check_true((select count(*)=2 from gwira.organizations),'one user belongs to two organizations');
set role service_role;
select pg_temp.reject(format('select gwira.create_invitation(%L,%L,%L,%L,%L)','11111111-1111-4111-8111-111111111111',:'org_a','existing@example.test','member',repeat('c',64)),'recipient_already_member');
select (gwira.create_invitation('11111111-1111-4111-8111-111111111111',:'org_a','new@example.test','member',repeat('c',64))).id as invite_new \gset
set role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('c',64)),'verified_account_required');
reset role;
update auth.users set email_confirmed_at=now() where id='44444444-4444-4444-8444-444444444444';
update gwira.organization_invitations set last_sent_at=now()-interval '2 minutes' where id=:'invite_new';
set role service_role;
select gwira.resend_invitation('11111111-1111-4111-8111-111111111111',:'invite_new',repeat('d',64));
select gwira.record_delivery(:'invite_new',1,true);
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select pg_temp.check_true((select generation=2 and delivery_status='queued' from gwira.organization_invitations where id=:'invite_new'),'stale delivery receipt cannot change new generation');
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('c',64)),'invitation_unavailable');
select gwira.accept_invitation(repeat('d',64));
set role service_role;
select (gwira.create_invitation('11111111-1111-4111-8111-111111111111',:'org_a','wrong@example.test','member',repeat('e',64))).id as invite_revoke \gset
select pg_temp.reject(format('select gwira.resend_invitation(%L,%L,%L)','11111111-1111-4111-8111-111111111111',:'invite_revoke',repeat('f',64)),'invitation_rate_limited');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select gwira.revoke_invitation(:'invite_revoke');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('e',64)),'invitation_unavailable');
set role service_role;
select (gwira.create_invitation('11111111-1111-4111-8111-111111111111',:'org_a','wrong@example.test','member',repeat('f',64))).id as invite_expire \gset
reset role;
update gwira.organization_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where id=:'invite_expire';
set role authenticated;
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('f',64)),'invitation_unavailable');
set role service_role;
select (gwira.create_invitation('11111111-1111-4111-8111-111111111111',:'org_a','admin@example.test','admin',repeat('1',64))).id;
set role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',false);
select gwira.accept_invitation(repeat('1',64));
set role service_role;
select pg_temp.reject(format('select gwira.create_invitation(%L,%L,%L,%L,%L)','66666666-6666-4666-8666-666666666666',:'org_a','escalate@example.test','admin',repeat('2',64)),'invitation_not_permitted');
select (gwira.create_invitation('66666666-6666-4666-8666-666666666666',:'org_a','wrong@example.test','member',repeat('2',64))).id;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select gwira.change_member_role(:'org_a','66666666-6666-4666-8666-666666666666','member');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('2',64)),'inviter_no_longer_authorized');
select pg_temp.reject(format('select gwira.accept_invitation(%L)',repeat('9',64)),'invitation_unavailable');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select gwira.change_member_role(:'org_a','22222222-2222-4222-8222-222222222222','owner');
select gwira.change_member_role(:'org_a','11111111-1111-4111-8111-111111111111','member');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select pg_temp.reject(format('select gwira.change_member_role(%L,%L,%L)',:'org_a','22222222-2222-4222-8222-222222222222','member'),'final_owner_required');
select set_config('test.org',:'org_a',false);
set role service_role;
do $$declare limited boolean:=false; i integer;begin
 for i in 1..22 loop
  begin perform gwira.create_invitation('22222222-2222-4222-8222-222222222222',current_setting('test.org')::uuid,'limit'||i||'@example.test','member',md5(i::text)||md5(i::text));
  exception when others then if sqlerrm='invitation_rate_limited' then limited:=true;exit;else raise;end if;end;
 end loop;
 if not limited then raise exception 'FAIL: hourly creation limit';end if;
 raise notice 'PASS: database hourly creation limit';
end$$;
set role anon;
select pg_temp.reject('select * from gwira.organizations','permission denied');
reset role;
-- No tests commit fixture organizations, accounts, or invitations.
rollback;
