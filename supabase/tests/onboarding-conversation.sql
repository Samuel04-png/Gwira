\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.reject(sql text) returns void language plpgsql as $$
begin begin execute sql; exception when insufficient_privilege then return; end; raise exception 'Expected access denial'; end $$;
create function pg_temp.reject_invalid(sql text) returns void language plpgsql as $$
begin begin execute sql; exception when invalid_parameter_value then return; end; raise exception 'Expected invalid request'; end $$;
select gen_random_uuid() as a,gen_random_uuid() as b \gset
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (:'a','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'a'||'@example.test',now(),'{}','{}',now(),now()),
 (:'b','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'b'||'@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub',:'a',false);
select gwira.create_organization_once('Existing workspace',gen_random_uuid()) as old_org \gset
select pg_temp.check_true(gwira.restore_onboarding_conversation(:'old_org') is null,'existing workspace without onboarding is supported');
select gwira.create_workspace('Transition A',gen_random_uuid()) as org \gset
select gwira.save_onboarding_progress(:'org','{"act":"clarifying","goal":"A goal","answers":[{"question":"Question?","answer":"Answer"}],"asked":1}'::jsonb);
select gwira.complete_workspace_setup(:'org',true);
select gwira.restore_onboarding_conversation(:'org') as conversation \gset
select pg_temp.check_true(gwira.restore_onboarding_conversation(:'org')=:'conversation','transition retry returns same conversation');
select pg_temp.check_true((select count(*)=3 from gwira.conversation_messages where conversation_id=:'conversation'),'goal and original question/answer preserved');
select pg_temp.check_true((select count(*)=1 from gwira.conversation_messages where conversation_id=:'conversation' and author_type='rules' and content='Question?'),'rules provenance preserved');
select set_config('request.jwt.claim.sub',:'b',false);
select pg_temp.reject(format('select gwira.restore_onboarding_conversation(%L)',:'org'));
select pg_temp.check_true((select count(*)=0 from gwira.conversation_messages where conversation_id=:'conversation'),'other account cannot read transitioned messages');
select set_config('request.jwt.claim.sub',:'a',false);
select gwira.update_conversation(:'conversation','delete',null);
select pg_temp.check_true(gwira.restore_onboarding_conversation(:'org') is null,'deleted transition is not recreated');
select gwira.create_workspace('Direct transition',gen_random_uuid()) as direct_org \gset
select gwira.save_onboarding_progress(:'direct_org','{"act":"clarifying","goal":"Direct goal","answers":[],"asked":1}'::jsonb);
select gen_random_uuid() as direct_conversation,gen_random_uuid() as direct_message,gen_random_uuid() as wrong_message \gset
select gwira.create_conversation(:'direct_org',:'direct_conversation','Direct goal','private');
select gwira.send_conversation_message(:'direct_conversation',:'direct_message','Direct goal');
select pg_temp.reject_invalid(format('select gwira.link_initial_conversation(%L,%L,%L)',:'direct_org',:'direct_conversation',:'wrong_message'));
select gwira.link_initial_conversation(:'direct_org',:'direct_conversation',:'direct_message');
select pg_temp.check_true(gwira.link_initial_conversation(:'direct_org',:'direct_conversation',:'direct_message')=:'direct_conversation','direct link retry is idempotent');
select set_config('request.jwt.claim.sub',:'b',false);
select pg_temp.reject(format('select gwira.link_initial_conversation(%L,%L,%L)',:'direct_org',:'direct_conversation',:'direct_message'));
select pg_temp.check_true((select count(*)=0 from gwira.conversation_messages where conversation_id=:'direct_conversation'),'other account cannot read direct first message');
select set_config('request.jwt.claim.sub',:'a',false);
select gwira.complete_workspace_setup(:'direct_org',true);
select pg_temp.check_true(gwira.restore_onboarding_conversation(:'direct_org')=:'direct_conversation','restore uses directly saved conversation');
select pg_temp.check_true((select count(*)=1 from gwira.conversation_messages where conversation_id=:'direct_conversation'),'direct transition does not duplicate first message');
select 'onboarding conversation transition: PASS';
rollback;
