-- Additive follow-up to the existing organization-access migration. NOT deployed.
begin;
create table gwira.organization_creation_requests (
 user_id uuid not null references auth.users on delete cascade,
 request_id uuid not null,
 organization_id uuid not null references gwira.organizations on delete cascade,
 name text not null,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table gwira.organization_creation_requests enable row level security;
revoke all on gwira.organization_creation_requests from public,anon,authenticated;
create function gwira.create_organization_once(p_name text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); existing gwira.organization_creation_requests; org uuid;
begin
 if p_request_id is null or p_name is null or length(btrim(p_name)) not between 1 and 200 then raise exception 'invalid_organization_request'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select * into existing from gwira.organization_creation_requests where user_id=actor and request_id=p_request_id;
 if found then
  if existing.name<>btrim(p_name) then raise exception 'organization_request_conflict'; end if;
  if not gwira.is_member(existing.organization_id) then raise exception 'organization_access_revoked' using errcode='42501'; end if;
  return existing.organization_id;
 end if;
 org:=gwira.create_organization(p_name);
 insert into gwira.organization_creation_requests(user_id,request_id,organization_id,name) values(actor,p_request_id,org,btrim(p_name));
 return org;
end $$;
revoke all on function gwira.create_organization_once(text,uuid) from public,anon;
grant execute on function gwira.create_organization_once(text,uuid) to authenticated;
commit;
