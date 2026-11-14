-- Existing workspaces without a first-run record have no onboarding to import.
begin;
alter function gwira.restore_onboarding_conversation(uuid) rename to restore_existing_onboarding_conversation;
revoke all on function gwira.restore_existing_onboarding_conversation(uuid) from public,anon,authenticated;
create function gwira.restore_onboarding_conversation(p_org uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform gwira.verified_actor();
 if not gwira.is_member(p_org) then raise exception 'workspace_setup_unavailable' using errcode='42501'; end if;
 if not exists(select 1 from gwira.workspace_setup where organization_id=p_org) then return null; end if;
 return gwira.restore_existing_onboarding_conversation(p_org);
end $$;
revoke all on function gwira.restore_onboarding_conversation(uuid) from public,anon,authenticated;
grant execute on function gwira.restore_onboarding_conversation(uuid) to authenticated;
commit;
