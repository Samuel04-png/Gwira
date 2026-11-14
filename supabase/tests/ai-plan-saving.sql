\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin
 begin execute sql; exception when others then
  if sqlerrm not like '%'||expected||'%' then raise exception 'Wrong failure: %, expected %',sqlerrm,expected; end if; return;
 end;
 raise exception 'FAIL: expected %',expected;
end $$;
select gen_random_uuid() as owner_id,gen_random_uuid() as other_id,gen_random_uuid() as c,gen_random_uuid() as m \gset
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (:'owner_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'owner_id'||'@example.test',now(),'{}','{}',now(),now()),
 (:'other_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'other_id'||'@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select gwira.create_workspace('AI plan test',gen_random_uuid()) as org \gset
select gwira.create_conversation(:'org',:'c','Plan request','private');
select gwira.send_conversation_message(:'c',:'m','Make a plan');
select pg_temp.reject(format('select * from gwira.save_ai_plan(%L,%L,null)',:'c',:'m'),'plan_unavailable');
reset role;
insert into gwira.organization_memberships(organization_id,user_id,role) values (:'org',:'other_id','admin');
set role service_role;
select gwira.begin_ai_generation(:'owner_id',:'c',:'m',:'m','test-model',20);
select gwira.finish_ai_generation(:'m','# Plan\n- Review',10,5);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select id as assistant_id from gwira.conversation_messages where conversation_id=:'c' and author_type='assistant' \gset
select plan_id as plan,version as initial_version from gwira.save_ai_plan(:'c',:'assistant_id',null) \gset
select pg_temp.check_true(:'initial_version'::integer=1,'created version one');
select pg_temp.check_true((select visibility='private' and source='conversation' from gwira.plan_documents where id=:'plan'),'new AI plan is private');
select pg_temp.check_true((select count(*)=1 from gwira.plan_versions where plan_id=:'plan' and content_markdown='# Plan\n- Review'),'confirmed content stored');
select pg_temp.check_true((select plan_id=:'plan' and version=1 from gwira.save_ai_plan(:'c',:'assistant_id',null)),'retry idempotent');
select set_config('request.jwt.claim.sub',:'other_id',false);
select pg_temp.check_true((select count(*)=0 from gwira.plan_documents where id=:'plan'),'same-org admin cannot read AI plan');
select pg_temp.reject(format('select * from gwira.save_ai_plan(%L,%L,null)',:'c',:'assistant_id'),'plan_unavailable');
reset role;
select 'AI plan saving: PASS';
rollback;
