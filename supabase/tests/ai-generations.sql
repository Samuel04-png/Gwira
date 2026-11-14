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
select gen_random_uuid() as owner_id,gen_random_uuid() as other_id,gen_random_uuid() as c,gen_random_uuid() as m,gen_random_uuid() as r,gen_random_uuid() as m2,gen_random_uuid() as r2 \gset
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (:'owner_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'owner_id'||'@example.test',now(),'{}','{}',now(),now()),
 (:'other_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'other_id'||'@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select gwira.create_workspace('AI ledger test',gen_random_uuid()) as org \gset
select gwira.create_conversation(:'org',:'c','Private','private');
select gwira.send_conversation_message(:'c',:'m','Question');
select gwira.send_conversation_message(:'c',:'m2','Another question');
select pg_temp.reject(format('select gwira.begin_ai_generation(%L,%L,%L,%L,%L,20)',:'owner_id',:'c',:'m',:'r','test-model'),'permission denied');
reset role;
insert into gwira.organization_memberships(organization_id,user_id,role) values (:'org',:'other_id','admin');
set role service_role;
select pg_temp.reject(format('select gwira.begin_ai_generation(%L,%L,%L,%L,%L,20)',:'other_id',:'c',:'m',:'r','test-model'),'generation_access_denied');
select pg_temp.check_true(gwira.begin_ai_generation(:'owner_id',:'c',:'m',:'r','test-model',20)='started','first reservation');
select pg_temp.check_true(gwira.begin_ai_generation(:'owner_id',:'c',:'m',:'r','test-model',20)='generating','retry does not restart');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select pg_temp.check_true((select count(*)=1 from gwira.ai_generations where organization_id=:'org' and conversation_id=:'c' and status='generating'),'owner sees active generation');
select set_config('request.jwt.claim.sub',:'other_id',false);
select pg_temp.check_true((select count(*)=0 from gwira.ai_generations where organization_id=:'org' and conversation_id=:'c' and status='generating'),'other member cannot see private activity');
reset role;
set role service_role;
select pg_temp.reject(format('select gwira.begin_ai_generation(%L,%L,%L,%L,%L,20)',:'owner_id',:'c',:'m2',:'r2','test-model'),'generation_busy');
select pg_temp.reject(format('select gwira.begin_ai_generation(%L,%L,%L,%L,%L,20)',:'owner_id',:'c',:'m',gen_random_uuid(),'test-model'),'generation_request_conflict');
select pg_temp.check_true(gwira.finish_ai_generation(:'r','Real provider response',20,10)='completed','save assistant');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select pg_temp.check_true((select count(*)=0 from gwira.ai_generations where organization_id=:'org' and conversation_id=:'c' and status='generating'),'completed generation is not active');
reset role;
set role service_role;
select pg_temp.check_true(gwira.finish_ai_generation(:'r','duplicate',20,10)='completed','finish idempotent');
select pg_temp.reject(format('select gwira.begin_ai_generation(%L,%L,%L,%L,%L,1)',:'owner_id',:'c',:'m2',:'r2','test-model'),'generation_limit_reached');
select pg_temp.check_true(gwira.begin_ai_generation(:'owner_id',:'c',:'m2',:'r2','test-model',20)='started','second reservation');
reset role;
update gwira.organization_memberships set status='suspended' where organization_id=:'org' and user_id=:'owner_id';
set role service_role;
select pg_temp.check_true(gwira.finish_ai_generation(:'r2','Must not be visible',20,10)='failed','revoked membership blocks late result');
reset role;
update gwira.organization_memberships set status='active' where organization_id=:'org' and user_id=:'owner_id';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select pg_temp.check_true((select count(*)=1 from gwira.conversation_messages where conversation_id=:'c' and author_type='assistant'),'one assistant message');
select pg_temp.check_true((select count(*)=1 from gwira.ai_generations where request_id=:'r' and input_tokens=20 and output_tokens=10),'usage recorded');
select set_config('request.jwt.claim.sub',:'other_id',false);
select pg_temp.check_true((select count(*)=0 from gwira.ai_generations where request_id=:'r'),'same-org admin cannot read private generation');
reset role;
select 'AI generation ledger: PASS';
rollback;
