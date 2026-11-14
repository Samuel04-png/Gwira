\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
begin
 begin execute sql; exception when others then
  if sqlstate=expected then return; end if;
  raise;
 end;
 raise exception 'Expected SQLSTATE %', expected;
end $$;
select gen_random_uuid() as a,gen_random_uuid() as b,gen_random_uuid() as member,
 gen_random_uuid() as private_id,gen_random_uuid() as shared_id,gen_random_uuid() as msg \gset
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (:'a','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'a'||'@example.test',now(),'{}','{}',now(),now()),
 (:'b','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'b'||'@example.test',now(),'{}','{}',now(),now()),
 (:'member','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'member'||'@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub',:'a',false);
select gwira.create_workspace('Conversation A',gen_random_uuid()) as org_a \gset
select gwira.create_conversation(:'org_a',:'private_id','Private A','private');
select gwira.create_conversation(:'org_a',:'shared_id','Shared A','shared');
select plan_id as plan_a from gwira.save_plan_draft(:'org_a',null,'Plan A','private plan','{}',null,'') \gset
select gwira.link_conversation_plan(:'private_id',:'plan_a');
select gwira.link_conversation_plan(:'private_id',:'plan_a');
select pg_temp.check_true((select count(*)=1 from gwira.conversation_plan_links where conversation_id=:'private_id'),'plan link is idempotent');
select gwira.send_conversation_message(:'private_id',:'msg','Private text');
select gwira.send_conversation_message(:'private_id',:'msg','Private text');
select pg_temp.check_true((select count(*)=1 from gwira.conversation_messages where conversation_id=:'private_id'),'retry saves one message');
select pg_temp.reject(format('insert into gwira.conversation_messages(id,conversation_id,author_type,author_id,content) values(%L,%L,%L,%L,%L)',gen_random_uuid(),:'private_id','rules',null,'fake response'), '42501');
select pg_temp.reject(format('select gwira.send_conversation_message(%L,%L,%L)',:'private_id',:'msg','different'), '22023');
select gwira.pin_conversation(:'private_id',true);
reset role;
insert into gwira.organization_memberships(organization_id,user_id,role) values(:'org_a',:'member','member');
set role authenticated;
select set_config('request.jwt.claim.sub',:'member',false);
select pg_temp.check_true((select count(*)=0 from gwira.conversations where id=:'private_id'),'member cannot read private conversation');
select pg_temp.check_true((select count(*)=0 from gwira.conversation_messages where conversation_id=:'private_id'),'member cannot read private message');
select pg_temp.check_true((select count(*)=0 from gwira.conversation_pins),'member cannot read owner pins');
select pg_temp.check_true((select count(*)=0 from gwira.conversation_plan_links where conversation_id=:'private_id'),'member cannot read private plan link');
select pg_temp.check_true((select count(*)=1 from gwira.conversations where id=:'shared_id'),'member can read shared conversation');
select pg_temp.reject(format('select gwira.send_conversation_message(%L,%L,%L)',:'private_id',gen_random_uuid(),'forged'), '42501');
select pg_temp.reject(format('select gwira.update_conversation(%L,%L,%L)',:'shared_id','delete',null), '42501');
select gwira.send_conversation_message(:'shared_id',gen_random_uuid(),'Shared member message');
select gwira.pin_conversation(:'shared_id',true);
select set_config('request.jwt.claim.sub',:'b',false);
select gwira.create_workspace('Conversation B',gen_random_uuid()) as org_b \gset
select gwira.create_conversation(:'org_b',gen_random_uuid(),'B conversation','private') as b_conversation \gset
select pg_temp.check_true((select count(*)=0 from gwira.conversations where organization_id=:'org_a'),'B cannot read A conversations');
select pg_temp.check_true((select count(*)=0 from gwira.conversation_messages where conversation_id in (:'private_id',:'shared_id')),'B cannot read A messages');
select pg_temp.reject(format('select gwira.create_conversation(%L,%L,%L,%L)',:'org_a',gen_random_uuid(),'forged','private'), '42501');
select pg_temp.reject(format('select gwira.pin_conversation(%L,true)',:'shared_id'), '42501');
select pg_temp.reject(format('select gwira.link_conversation_plan(%L,%L)',:'b_conversation',:'plan_a'), '42501');
select pg_temp.reject(format('select gwira.link_conversation_plan(%L,%L)',:'private_id',:'plan_a'), '42501');
select pg_temp.reject(format('select gwira.send_conversation_message(%L,%L,%L)',:'shared_id',gen_random_uuid(),'forged'), '42501');
select set_config('request.jwt.claim.sub',:'a',false);
select gwira.update_conversation(:'private_id','rename','Renamed');
select gwira.update_conversation(:'private_id','archive',null);
select pg_temp.reject(format('select gwira.send_conversation_message(%L,%L,%L)',:'private_id',gen_random_uuid(),'archived'), '22023');
select gwira.update_conversation(:'private_id','unarchive',null);
select gwira.update_conversation(:'private_id','delete',null);
select pg_temp.check_true((select count(*)=0 from gwira.conversation_messages where conversation_id=:'private_id'),'delete cascades messages');
reset role;
delete from gwira.organization_memberships where organization_id=:'org_a' and user_id=:'member';
set role authenticated;
select set_config('request.jwt.claim.sub',:'member',false);
select pg_temp.check_true((select count(*)=0 from gwira.conversations where id=:'shared_id'),'revoked member cannot read');
select pg_temp.reject(format('select gwira.send_conversation_message(%L,%L,%L)',:'shared_id',gen_random_uuid(),'revoked'), '42501');
select 'authenticated conversation authorization: PASS';
rollback;
