\set ON_ERROR_STOP on
-- Isolated local database only; every fixture is rolled back.
begin;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin
 begin execute sql; exception when others then
  if sqlerrm not like '%'||expected||'%' then raise exception 'Wrong failure: %, expected %',sqlerrm,expected; end if;
  return;
 end;
 raise exception 'FAIL: query succeeded, expected %',expected;
end $$;
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('b1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-owner@example.test',now(),'{}','{}',now(),now()),
 ('b2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-admin@example.test',now(),'{}','{}',now(),now()),
 ('b3333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-outsider@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub','b1111111-1111-4111-8111-111111111111',false);
select gwira.create_workspace('Private plans',gen_random_uuid()) as private_org \gset
select gwira.create_workspace('Existing organization plans',gen_random_uuid()) as legacy_org \gset
select plan_id as private_plan from gwira.save_plan_draft(:'private_org',null,'Private','# Private','{}',null,'') \gset
select plan_id as legacy_plan from gwira.save_plan_draft(:'legacy_org',null,'Existing','# Existing','{}',null,'') \gset
select gwira.create_conversation(:'private_org','b4444444-4444-4444-8444-444444444444','Private conversation','private');
select gwira.link_conversation_plan('b4444444-4444-4444-8444-444444444444',:'private_plan');
select gwira.create_conversation(:'private_org','b5555555-5555-4555-8555-555555555555','Shared conversation','shared');
select gwira.link_conversation_plan('b5555555-5555-4555-8555-555555555555',:'private_plan');
select gwira.approve_plan(:'private_org',:'private_plan',1,'button');
select pg_temp.check_true((select visibility='private' from gwira.plan_documents where id=:'private_plan'),'new plan is private');
select pg_temp.check_true((select count(*)=1 from gwira.plan_versions where plan_id=:'private_plan'),'owner reads version');
reset role;
-- This represents a plan created before the migration, whose visibility must be retained.
update gwira.plan_documents set visibility='organization' where id=:'legacy_plan';
insert into gwira.organization_memberships(organization_id,user_id,role) values
 (:'private_org','b2222222-2222-4222-8222-222222222222','admin'),
 (:'legacy_org','b2222222-2222-4222-8222-222222222222','member');
set role authenticated;
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',false);
select pg_temp.check_true((select count(*)=0 from gwira.plan_documents where id=:'private_plan'),'same-org admin cannot read private document');
select pg_temp.check_true((select count(*)=0 from gwira.plan_versions where plan_id=:'private_plan'),'same-org admin cannot read private versions');
select pg_temp.check_true((select count(*)=0 from gwira.plan_approvals where plan_id=:'private_plan'),'same-org admin cannot read private approvals');
select pg_temp.check_true((select count(*)=0 from gwira.conversation_plan_links where plan_id=:'private_plan'),'same-org admin cannot see private link');
select pg_temp.check_true((select count(*)=1 from gwira.conversations where id='b5555555-5555-4555-8555-555555555555'),'member can read shared conversation without private plan');
select gwira.create_conversation(:'private_org','b6666666-6666-4666-8666-666666666666','Admin conversation','private');
select pg_temp.reject(format('select gwira.link_conversation_plan(%L,%L)','b6666666-6666-4666-8666-666666666666',:'private_plan'),'conversation_plan_unavailable');
select pg_temp.reject(format('select * from gwira.save_plan_draft(%L,%L,%L,%L,%L::jsonb,1,%L)',:'private_org',:'private_plan','T','x','{}',''),'plan_unavailable');
select pg_temp.reject(format('select * from gwira.approve_plan(%L,%L,1,%L)',:'private_org',:'private_plan','button'),'plan_unavailable');
select pg_temp.check_true((select count(*)=1 from gwira.plan_documents where id=:'legacy_plan' and visibility='organization'),'existing organization plan remains readable');
select pg_temp.check_true((select count(*)=1 from gwira.plan_versions where plan_id=:'legacy_plan'),'existing plan content remains readable');
select set_config('request.jwt.claim.sub','b3333333-3333-4333-8333-333333333333',false);
select pg_temp.check_true((select count(*)=0 from gwira.plan_documents where id in (:'private_plan',:'legacy_plan')),'outsider cannot read either plan');
reset role;
update gwira.organization_memberships set status='suspended' where organization_id=:'private_org' and user_id='b1111111-1111-4111-8111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub','b1111111-1111-4111-8111-111111111111',false);
select pg_temp.check_true((select count(*)=0 from gwira.plan_documents where id=:'private_plan'),'revoked creator cannot read');
select pg_temp.reject(format('select * from gwira.save_plan_draft(%L,%L,%L,%L,%L::jsonb,1,%L)',:'private_org',:'private_plan','T','x','{}',''),'plan_access_denied');
reset role;
select 'plan privacy: PASS' as result;
rollback;
