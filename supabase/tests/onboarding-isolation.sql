\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.reject(sql text) returns void language plpgsql as $$
begin begin execute sql; exception when insufficient_privilege then return; end; raise exception 'Expected access denial'; end $$;
select gen_random_uuid() as a, gen_random_uuid() as b \gset
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (:'a','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'a'||'@example.test',now(),'{}','{}',now(),now()),
       (:'b','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'b'||'@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub',:'a',false);
select gwira.create_workspace('Isolation A',gen_random_uuid()) as org_a \gset
select gwira.save_onboarding_progress(:'org_a','{"act":"clarifying","goal":"private A","answers":[],"asked":1}'::jsonb);
select set_config('request.jwt.claim.sub',:'b',false);
select gwira.create_workspace('Isolation B',gen_random_uuid()) as org_b \gset
select pg_temp.check_true((select count(*)=0 from gwira.workspace_setup where organization_id=:'org_a'),'B cannot read A onboarding');
select pg_temp.reject(format('select gwira.save_onboarding_progress(%L,%L::jsonb)',:'org_a','{"act":"opening","goal":"","answers":[],"asked":0}'));
select gwira.save_onboarding_progress(:'org_b','{"act":"clarifying","goal":"private B","answers":[],"asked":1}'::jsonb);
select set_config('request.jwt.claim.sub',:'a',false);
select pg_temp.check_true((select onboarding->>'goal'='private A' from gwira.workspace_setup where organization_id=:'org_a'),'A progress persists');
select pg_temp.check_true((select count(*)=0 from gwira.workspace_setup where organization_id=:'org_b'),'A cannot read B onboarding');
select pg_temp.reject(format('select gwira.save_onboarding_progress(%L,%L::jsonb)',:'org_b','{"act":"opening","goal":"","answers":[],"asked":0}'));
select 'onboarding isolation: PASS';
rollback;
