\set ON_ERROR_STOP on
-- Runs against the isolated LOCAL Supabase database inside one rolled-back transaction:
--   docker exec -i supabase_db_gwira-local-dev psql -U postgres < supabase/tests/plan-documents.sql
begin;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$begin
 begin execute sql; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'Wrong failure: %, expected %',sqlerrm,expected; end if; return; end;
 raise exception 'FAIL: query succeeded, expected %',expected;
end$$;
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('a1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plan-owner@example.test',now(),'{}','{}',now(),now()),
 ('a2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plan-member@example.test',now(),'{}','{}',now(),now()),
 ('a3333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plan-other@example.test',now(),'{}','{}',now(),now());
grant usage on schema gwira to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',false);
select gwira.create_workspace('Plan Org A',gen_random_uuid()) as org_a \gset
select set_config('request.jwt.claim.sub','a3333333-3333-4333-8333-333333333333',false);
select gwira.create_workspace('Plan Org B',gen_random_uuid()) as org_b \gset
reset role;
insert into gwira.organization_memberships(organization_id,user_id,role) values (:'org_a','a2222222-2222-4222-8222-222222222222','member');

set role authenticated;
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',false);
select plan_id as plan from gwira.save_plan_draft(:'org_a',null,'Follow-up plan','# v1','{"steps":[]}'::jsonb,null,'') \gset
select pg_temp.check_true((select current_version=1 and status='draft' from gwira.plan_documents where id=:'plan'),'draft v1 created');
select pg_temp.reject(format('select * from gwira.save_plan_draft(%L,null,%L,%L,%L::jsonb,null,%L)',:'org_a','Second','x','{}','') ,'plan_documents_one_onboarding_plan');

-- Editing requires the current version and produces a new version.
select pg_temp.reject(format('select * from gwira.save_plan_draft(%L,%L,%L,%L,%L::jsonb,7,%L)',:'org_a',:'plan','T','x','{}',''),'plan_version_stale');
select version from gwira.save_plan_draft(:'org_a',:'plan','Follow-up plan','# v2','{"steps":[1]}'::jsonb,1,'Changed step two') \gset
select pg_temp.check_true((select count(*)=2 from gwira.plan_versions where plan_id=:'plan'),'both versions kept');

-- Stale approval is refused; exact current version is approved; scope is plan-only; repeat is idempotent.
select pg_temp.reject(format('select * from gwira.approve_plan(%L,%L,1,%L)',:'org_a',:'plan','chat'),'plan_version_stale');
select pg_temp.check_true((select status='approved' from gwira.approve_plan(:'org_a',:'plan',2,'chat')),'current version approved');
select pg_temp.check_true((select status='approved' from gwira.approve_plan(:'org_a',:'plan',2,'button')),'approval idempotent');
select pg_temp.check_true((select count(*)=1 and bool_and(scope=array['plan']) from gwira.plan_approvals where plan_id=:'plan'),'one plan-only approval');
select pg_temp.reject(format('insert into gwira.plan_approvals(plan_id,version,approved_by,method,scope) values(%L,2,%L,%L,%L)',:'plan','a1111111-1111-4111-8111-111111111111','chat','{plan}'),'permission denied');

-- Editing after approval returns to draft and keeps the earlier approval on record.
select pg_temp.check_true((select status='draft' and version=3 from gwira.save_plan_draft(:'org_a',:'plan','Follow-up plan','# v3','{}'::jsonb,2,'Edit after approval')),'edit after approval creates a draft');
select pg_temp.check_true((select count(*)=1 from gwira.plan_approvals where plan_id=:'plan' and version=2),'earlier approval preserved');

-- New plans are private; a plain member cannot read or approve another user's plan.
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',false);
select pg_temp.check_true((select count(*)=0 from gwira.plan_documents),'member cannot read private plan');
select pg_temp.reject(format('select * from gwira.save_plan_draft(%L,%L,%L,%L,%L::jsonb,3,%L)',:'org_a',:'plan','T','x','{}',''),'plan_unavailable');
select pg_temp.reject(format('select * from gwira.approve_plan(%L,%L,3,%L)',:'org_a',:'plan','chat'),'plan_approval_denied');

-- Another organization sees and changes nothing.
select set_config('request.jwt.claim.sub','a3333333-3333-4333-8333-333333333333',false);
select pg_temp.check_true((select count(*)=0 from gwira.plan_documents),'RLS isolates plans');
select pg_temp.check_true((select count(*)=0 from gwira.plan_versions),'RLS isolates plan versions');
select pg_temp.reject(format('select * from gwira.save_plan_draft(%L,%L,%L,%L,%L::jsonb,3,%L)',:'org_a',:'plan','T','x','{}',''),'plan_access_denied');
select pg_temp.reject(format('select * from gwira.approve_plan(%L,%L,3,%L)',:'org_a',:'plan','chat'),'plan_approval_denied');
select pg_temp.reject(format('select * from gwira.approve_plan(%L,%L,3,%L)',:'org_b',:'plan','chat'),'plan_unavailable');
select pg_temp.reject(format('update gwira.plan_documents set status=%L',''),'permission denied');

-- Anonymous callers cannot use the functions.
reset role;
set role anon;
select pg_temp.reject(format('select * from gwira.approve_plan(%L,%L,3,%L)',:'org_a',:'plan','chat'),'permission denied');
reset role;
select 'plan-documents authorization: PASS' as result;
rollback;
