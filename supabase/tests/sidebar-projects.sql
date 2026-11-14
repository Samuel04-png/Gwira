\set ON_ERROR_STOP on
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
select gen_random_uuid() as owner_id,gen_random_uuid() as member_id,gen_random_uuid() as other_id,
 gen_random_uuid() as project,gen_random_uuid() as section,gen_random_uuid() as conversation,gen_random_uuid() as foreign_conversation,gen_random_uuid() as shared_conversation \gset
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (:'owner_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'owner_id'||'@example.test',now(),'{}','{}',now(),now()),
 (:'member_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'member_id'||'@example.test',now(),'{}','{}',now(),now()),
 (:'other_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',:'other_id'||'@example.test',now(),'{}','{}',now(),now());
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select gwira.create_workspace('Project owner',gen_random_uuid()) as org \gset
select gwira.create_conversation(:'org',:'conversation','Private conversation','private');
select gwira.mutate_sidebar_project(:'org',:'project','create','Project',null,null);
select gwira.mutate_sidebar_project(:'org',:'project','create','Project',null,null);
select gwira.mutate_sidebar_project(:'org',:'project','section','Section',:'section',null);
select gwira.mutate_sidebar_project(:'org',:'project','move',null,:'section',:'conversation');
select pg_temp.check_true((select count(*)=1 from gwira.sidebar_project_conversations where project_id=:'project' and section_id=:'section'),'association visible to owner');
reset role;
insert into gwira.organization_memberships(organization_id,user_id,role) values(:'org',:'member_id','member');
set role authenticated;
select set_config('request.jwt.claim.sub',:'member_id',false);
select gwira.create_conversation(:'org',:'shared_conversation','Member shared','shared');
select pg_temp.check_true((select count(*)=0 from gwira.sidebar_projects where id=:'project'),'member cannot read private project');
select pg_temp.check_true((select count(*)=0 from gwira.sidebar_project_conversations where project_id=:'project'),'member cannot read private association');
select pg_temp.reject(format('select gwira.mutate_sidebar_project(%L,%L,%L,%L,null,null)',:'org',:'project','rename','forged'),'42501');
select set_config('request.jwt.claim.sub',:'other_id',false);
select gwira.create_workspace('Other workspace',gen_random_uuid()) as other_org \gset
select gwira.create_conversation(:'other_org',:'foreign_conversation','Foreign','private');
select pg_temp.reject(format('select gwira.mutate_sidebar_project(%L,%L,%L,%L,null,null)',:'org',:'project','rename','forged'),'42501');
select set_config('request.jwt.claim.sub',:'owner_id',false);
select pg_temp.reject(format('select gwira.mutate_sidebar_project(%L,%L,%L,null,null,%L)',:'org',:'project','move',:'foreign_conversation'),'42501');
select gwira.mutate_sidebar_project(:'org',:'project','move',null,null,:'shared_conversation');
select gwira.mutate_sidebar_project(:'org',:'project','rename','Renamed',null,null);
select gwira.mutate_sidebar_project(:'org',:'project','pin','true',null,null);
select pg_temp.check_true((select name='Renamed' and pinned from gwira.sidebar_projects where id=:'project'),'changes persisted');
select gwira.mutate_sidebar_project(:'org',:'project','archive_chats',null,null,null);
select pg_temp.check_true((select archived_at is not null from gwira.conversations where id=:'conversation'),'project archive marks owner conversation');
select pg_temp.check_true((select archived_at is null from gwira.conversations where id=:'shared_conversation'),'project archive preserves other member conversation');
select gwira.update_conversation(:'conversation','unarchive',null);
reset role;
update gwira.organization_memberships set status='suspended' where organization_id=:'org' and user_id=:'owner_id';
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',false);
select pg_temp.check_true((select count(*)=0 from gwira.sidebar_projects where id=:'project'),'revoked member cannot read project');
select pg_temp.reject(format('select gwira.mutate_sidebar_project(%L,%L,%L,%L,null,null)',:'org',:'project','rename','revoked'),'42501');
reset role;
update gwira.organization_memberships set status='active' where organization_id=:'org' and user_id=:'owner_id';
set role authenticated;
select gwira.mutate_sidebar_project(:'org',:'project','remove',null,null,null);
select pg_temp.check_true((select count(*)=1 from gwira.conversations where id=:'conversation'),'remove preserves conversation');
select pg_temp.check_true((select count(*)=0 from gwira.sidebar_project_sections where id=:'section'),'remove cascades sections');
select 'sidebar project authorization: PASS';
