-- Expose the isolated workspace API. Table RLS and explicit grants remain enforced.
begin;
do $$
declare configured text;
begin
 select substring(value from length('pgrst.db_schemas=')+1) into configured
 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole,
 lateral unnest(s.setconfig) value where r.rolname='authenticator' and value like 'pgrst.db_schemas=%' limit 1;
 configured:=coalesce(configured,'public,graphql_public');
 if not 'gwira'=any(string_to_array(replace(configured,' ',''),',')) then
  execute format('alter role authenticator set pgrst.db_schemas = %L',configured||',gwira');
 end if;
end $$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
