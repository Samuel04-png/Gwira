-- Authenticated human-submitted task results and approval notifications.
-- These records never authorize machine execution. Apply only to an approved environment.
begin;

create table gwira.approval_tasks (
 id uuid primary key,
 organization_id uuid not null,
 created_by uuid not null,
 reviewer_id uuid not null,
 title text not null check (char_length(btrim(title)) between 1 and 200),
 status text not null default 'in_progress' check (status in ('in_progress','in_review','done')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (organization_id,id),
 foreign key (organization_id,created_by) references gwira.organization_memberships(organization_id,user_id),
 foreign key (organization_id,reviewer_id) references gwira.organization_memberships(organization_id,user_id),
 check (created_by <> reviewer_id)
);

create table gwira.task_approval_results (
 id uuid primary key,
 organization_id uuid not null,
 task_id uuid not null,
 submitted_by uuid not null,
 result_text text not null check (char_length(btrim(result_text)) between 1 and 12000),
 status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
 submitted_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid,
 foreign key (organization_id,task_id) references gwira.approval_tasks(organization_id,id) on delete cascade,
 foreign key (organization_id,submitted_by) references gwira.organization_memberships(organization_id,user_id),
 foreign key (organization_id,decided_by) references gwira.organization_memberships(organization_id,user_id),
 check ((status='pending' and decided_at is null and decided_by is null)
     or (status<>'pending' and decided_at is not null and decided_by is not null))
);
create unique index task_approval_one_pending on gwira.task_approval_results(task_id) where status='pending';
create index task_approval_results_task on gwira.task_approval_results(task_id,submitted_at,id);

alter table gwira.approval_tasks enable row level security;
alter table gwira.task_approval_results enable row level security;
create policy approval_task_participant_read on gwira.approval_tasks for select to authenticated
 using (gwira.is_member(organization_id) and (created_by=(select auth.uid()) or reviewer_id=(select auth.uid())));
create policy task_approval_participant_read on gwira.task_approval_results for select to authenticated
 using (exists(select 1 from gwira.approval_tasks t where t.id=task_id));
revoke all on gwira.approval_tasks,gwira.task_approval_results from public,anon,authenticated;
grant select on gwira.approval_tasks,gwira.task_approval_results to authenticated;

create function gwira.create_approval_task(p_org uuid,p_id uuid,p_title text,p_reviewer uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); existing gwira.approval_tasks;
begin
 if not gwira.is_member(p_org) then raise exception 'task_unavailable' using errcode='42501'; end if;
 if p_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 200 or p_reviewer is null or p_reviewer=actor then
  raise exception 'invalid_task' using errcode='22023';
 end if;
 select * into existing from gwira.approval_tasks where id=p_id;
 if existing.id is not null then
  if existing.organization_id is distinct from p_org or existing.created_by is distinct from actor
   or existing.reviewer_id is distinct from p_reviewer or existing.title is distinct from btrim(p_title) then
   raise exception 'task_request_conflict' using errcode='22023';
  end if;
  return p_id;
 end if;
 if not exists(select 1 from gwira.organization_memberships where organization_id=p_org and user_id=p_reviewer and status='active') then
  raise exception 'reviewer_unavailable' using errcode='42501';
 end if;
 insert into gwira.approval_tasks(id,organization_id,created_by,reviewer_id,title)
 values(p_id,p_org,actor,p_reviewer,btrim(p_title)) on conflict(id) do nothing;
 if not found then
  select * into existing from gwira.approval_tasks where id=p_id;
  if existing.organization_id is distinct from p_org or existing.created_by is distinct from actor
   or existing.reviewer_id is distinct from p_reviewer or existing.title is distinct from btrim(p_title) then
   raise exception 'task_request_conflict' using errcode='22023';
  end if;
 end if;
 return p_id;
end $$;

create function gwira.submit_task_approval(p_org uuid,p_task uuid,p_id uuid,p_result text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); task gwira.approval_tasks; existing gwira.task_approval_results;
begin
 if not gwira.is_member(p_org) then raise exception 'task_unavailable' using errcode='42501'; end if;
 if p_id is null or p_result is null or char_length(btrim(p_result)) not between 1 and 12000 then
  raise exception 'invalid_task_result' using errcode='22023';
 end if;
 select * into task from gwira.approval_tasks where id=p_task and organization_id=p_org for update;
 if task.id is null or task.created_by<>actor then raise exception 'task_unavailable' using errcode='42501'; end if;
 select * into existing from gwira.task_approval_results where id=p_id;
 if existing.id is not null then
  if existing.organization_id is distinct from p_org or existing.task_id is distinct from p_task
   or existing.submitted_by is distinct from actor or existing.result_text is distinct from p_result then
   raise exception 'approval_request_conflict' using errcode='22023';
  end if;
  return p_id;
 end if;
 if task.status<>'in_progress' then raise exception 'task_not_in_progress' using errcode='22023'; end if;
 if not exists(select 1 from gwira.organization_memberships where organization_id=p_org and user_id=task.reviewer_id and status='active') then
  raise exception 'reviewer_unavailable' using errcode='42501';
 end if;
 insert into gwira.task_approval_results(id,organization_id,task_id,submitted_by,result_text) values(p_id,p_org,p_task,actor,p_result);
 update gwira.approval_tasks set status='in_review',updated_at=now() where id=p_task;
 insert into gwira.notifications(organization_id,recipient_id,title,body)
 values(p_org,task.reviewer_id,'Task approval requested','A task result is ready for your review.');
 return p_id;
end $$;

create function gwira.decide_task_approval(p_org uuid,p_id uuid,p_decision text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=gwira.verified_actor(); task gwira.approval_tasks; approval gwira.task_approval_results;
begin
 if not gwira.is_member(p_org) then raise exception 'approval_unavailable' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('approved','changes_requested') then raise exception 'invalid_decision' using errcode='22023'; end if;
 select t.* into task from gwira.approval_tasks t join gwira.task_approval_results a on a.task_id=t.id
 where a.id=p_id and t.organization_id=p_org for update of t;
 if task.id is null or task.reviewer_id<>actor then raise exception 'approval_unavailable' using errcode='42501'; end if;
 select * into approval from gwira.task_approval_results where id=p_id and task_id=task.id for update;
 if approval.status<>'pending' then
  if approval.status=p_decision and approval.decided_by=actor then return p_id; end if;
  raise exception 'approval_decided' using errcode='22023';
 end if;
 if task.status<>'in_review' then raise exception 'task_not_in_review' using errcode='22023'; end if;
 update gwira.task_approval_results set status=p_decision,decided_by=actor,decided_at=now() where id=p_id;
 update gwira.approval_tasks set status=case when p_decision='approved' then 'done' else 'in_progress' end,updated_at=now() where id=task.id;
 if exists(select 1 from gwira.organization_memberships where organization_id=p_org and user_id=task.created_by and status='active') then
  insert into gwira.notifications(organization_id,recipient_id,title,body)
  values(p_org,task.created_by,'Task review completed',case when p_decision='approved' then 'Your task result was approved.' else 'Changes were requested on your task result.' end);
 end if;
 return p_id;
end $$;

revoke all on function gwira.create_approval_task(uuid,uuid,text,uuid),gwira.submit_task_approval(uuid,uuid,uuid,text),gwira.decide_task_approval(uuid,uuid,text) from public,anon;
grant execute on function gwira.create_approval_task(uuid,uuid,text,uuid),gwira.submit_task_approval(uuid,uuid,uuid,text),gwira.decide_task_approval(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
