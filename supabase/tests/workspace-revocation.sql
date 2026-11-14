\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.reject(sql text) returns void language plpgsql as $$
begin
 begin execute sql; exception when insufficient_privilege then return; end;
 raise exception 'Expected access denial';
end $$;
select gen_random_uuid() as owner_id, gen_random_uuid() as member_id \gset
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 (:'owner_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'owner_id'||'@example.test',now(),'{}','{}',now(),now()),
 (:'member_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'member_id'||'@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select gwira.create_workspace('Revocation test',gen_random_uuid()) as organization_id \gset
select plan_id as plan_id from gwira.save_plan_draft(:'organization_id',null,'Plan','text','{}',null,'') \gset
reset role;
-- Preserve the revocation test for a previously organization-visible plan.
update gwira.plan_documents set visibility='organization' where id=:'plan_id';
insert into gwira.organization_memberships(organization_id,user_id,role) values (:'organization_id',:'member_id','member');
set role authenticated;
select set_config('request.jwt.claim.sub',:'member_id',false);
select pg_temp.check_true((select count(*)=1 from gwira.plan_documents where id=:'plan_id'),'member can read plan');
reset role;
delete from gwira.organization_memberships where organization_id=:'organization_id' and user_id=:'member_id';
set role authenticated;
select pg_temp.check_true((select count(*)=0 from gwira.plan_documents where id=:'plan_id'),'revoked member cannot read plan');
select pg_temp.reject(format('select * from gwira.save_plan_draft(%L,%L,%L,%L,%L::jsonb,1,%L)',:'organization_id',:'plan_id','Plan','text','{}',''));
select 'workspace revocation authorization: PASS';
rollback;
