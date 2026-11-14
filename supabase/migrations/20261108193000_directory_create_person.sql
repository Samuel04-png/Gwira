-- Directory records do not create accounts, memberships, or invitations.
-- Apply only to an approved environment.
begin;

create function gwira.create_directory_person(p_org uuid, p_id uuid, p_name text, p_job_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare existing gwira.employees;
begin
 perform gwira.verified_actor();
 if not gwira.is_admin(p_org) then raise exception 'directory_access_denied' using errcode='42501'; end if;
 if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 200
  or p_job_title is null or char_length(btrim(p_job_title)) not between 1 and 200 then
  raise exception 'invalid_directory_person' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 921739));
 select * into existing from gwira.employees where id=p_id;
 if found then
  if existing.organization_id is distinct from p_org or existing.user_id is not null
   or existing.name is distinct from btrim(p_name) or existing.job_title is distinct from btrim(p_job_title) then
   raise exception 'directory_request_conflict' using errcode='22023';
  end if;
  return p_id;
 end if;
 if exists(select 1 from gwira.employees where organization_id=p_org
   and lower(btrim(name))=lower(btrim(p_name)) and lower(btrim(job_title))=lower(btrim(p_job_title))) then
  raise exception 'directory_person_exists' using errcode='23505';
 end if;
 insert into gwira.employees(id,organization_id,name,job_title)
 values(p_id,p_org,btrim(p_name),btrim(p_job_title));
 return p_id;
end $$;
revoke all on function gwira.create_directory_person(uuid,uuid,text,text) from public,anon;
grant execute on function gwira.create_directory_person(uuid,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
