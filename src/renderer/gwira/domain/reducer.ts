import { MAX_COMMENTS_PER_TASK, MAX_PERSISTED_ACTIVITY } from './types.js';
import { canTransitionTask } from './lifecycle.js';
import type { ActivityEvent, AgentRun, Approval, Assignee, BusinessProject, DoatRecord, GwiraLocalState, Person, Task, TaskComment, TaskPriority, TaskStatus, Agent } from './types.js';
import type { OrganizationStructure } from '../organization/domain/organizationTypes.js';
import { validateOrganizationStructure } from '../organization/domain/model.js';
import type { LocalOnboardingState } from '../onboarding/onboardingModel.js';

export type GwiraCommand =
  | { type: 'RENAME_WORKSPACE'; name: string; at: string; activityId: string }
  | { type: 'ADD_PERSON'; person: Person }
  | { type: 'ADD_AGENT'; agent: Agent }
  | { type: 'ADD_DOAT'; doat: DoatRecord; activityId: string; at: string }
  | { type: 'UPDATE_DOAT'; doat: DoatRecord; activityId: string; at: string }
  | { type: 'SET_ORGANIZATION_STRUCTURE'; structure: OrganizationStructure; activityId: string; at: string }
  | { type: 'SET_ONBOARDING'; onboarding: LocalOnboardingState }
  | { type: 'ADD_PROJECT'; project: BusinessProject; activityId: string }
  | { type: 'CREATE_TASK'; task: Task; activityId: string }
  | { type: 'UPDATE_TASK'; taskId: string; title?: string; description?: string; priority?: TaskPriority; dueDate?: string | null; assignee?: Assignee | null; at: string; activityId: string }
  | { type: 'SET_TASK_DEPENDENCIES'; taskId: string; dependsOnTaskIds: string[]; at: string; activityId: string }
  | { type: 'TRANSITION_TASK'; taskId: string; status: TaskStatus; at: string; activityId: string; actor?: Assignee }
  | { type: 'ADD_COMMENT'; comment: TaskComment; activityId: string }
  | { type: 'SET_AGENT_RUN'; taskId: string; agentRun: AgentRun; at: string; activityId: string }
  | { type: 'REQUEST_APPROVAL'; approval: Approval; activityId: string }
  | { type: 'DECIDE_APPROVAL'; approvalId: string; status: 'approved' | 'changes_requested'; actor: Assignee; at: string; activityId: string };

function actorExists(state: GwiraLocalState, actor: Assignee): boolean {
  return actor.kind === 'person' ? state.people.some((person) => person.id === actor.id) : state.agents.some((agent) => agent.id === actor.id);
}

function appendActivity(state: GwiraLocalState, event: ActivityEvent): GwiraLocalState {
  return { ...state, activity: [...state.activity, event].slice(-MAX_PERSISTED_ACTIVITY) };
}

function event(state: GwiraLocalState, id: string, kind: ActivityEvent['kind'], occurredAt: string, summary: string, extras: Partial<ActivityEvent> = {}): GwiraLocalState {
  return appendActivity(state, { id, kind, occurredAt, summary, workspaceId: state.workspace.id, ...extras });
}

function validTaskReferences(state: GwiraLocalState, task: Task): boolean {
  return task.workspaceId === state.workspace.id
    && (!task.projectId || state.projects.some((project) => project.id === task.projectId))
    && (!task.assignee || actorExists(state, task.assignee));
}

/** Pure reducer. Invalid commands are ignored so corrupt UI data cannot damage stored state. */
export function reduceGwira(state: GwiraLocalState, command: GwiraCommand): GwiraLocalState {
  switch (command.type) {
    case 'RENAME_WORKSPACE': {
      const name = command.name.trim();
      if (!name) return state;
      return event({ ...state, workspace: { ...state.workspace, name } }, command.activityId, 'workspace_renamed', command.at, `Renamed workspace to ${name}`);
    }
    case 'ADD_PERSON':
      return command.person.workspaceId === state.workspace.id && !state.people.some((item) => item.id === command.person.id)
        ? { ...state, people: [...state.people, command.person] } : state;
    case 'ADD_AGENT':
      return command.agent.workspaceId === state.workspace.id && command.agent.type === 'coding' && !state.agents.some((item) => item.id === command.agent.id)
        ? { ...state, agents: [...state.agents, command.agent] } : state;
    case 'ADD_DOAT':
      if (command.doat.workspaceId !== state.workspace.id || state.doats.some((item) => item.id === command.doat.id)) return state;
      return event({ ...state, doats: [...state.doats, command.doat] }, command.activityId, 'doat_created', command.at, 'Created a Doat');
    case 'UPDATE_DOAT':
      if (command.doat.workspaceId !== state.workspace.id || !state.doats.some((item) => item.id === command.doat.id)) return state;
      return event({ ...state, doats: state.doats.map((item) => item.id === command.doat.id ? command.doat : item) }, command.activityId, 'doat_updated', command.at, 'Updated a Doat');
    case 'SET_ORGANIZATION_STRUCTURE':
      if (command.structure.organizationId !== state.organization.id || validateOrganizationStructure(command.structure).length > 0 || !organizationReferencesExist(state, command.structure)) return state;
      return event({ ...state, organizationStructure: command.structure }, command.activityId, 'organization_updated', command.at, 'Updated organization structure');
    case 'SET_ONBOARDING':
      return command.onboarding.version === 1 ? { ...state, onboarding: command.onboarding } : state;
    case 'ADD_PROJECT':
      if (command.project.workspaceId !== state.workspace.id || state.projects.some((item) => item.id === command.project.id)) return state;
      return event({ ...state, projects: [...state.projects, command.project] }, command.activityId, 'project_created', command.project.createdAt, `Created project ${command.project.name}`, { projectId: command.project.id });
    case 'CREATE_TASK':
      if (!validTaskReferences(state, command.task) || state.tasks.some((item) => item.id === command.task.id)) return state;
      return event({ ...state, tasks: [...state.tasks, command.task] }, command.activityId, 'task_created', command.task.createdAt, `Created task ${command.task.title}`, { taskId: command.task.id, projectId: command.task.projectId, actor: command.task.assignee });
    case 'UPDATE_TASK': {
      const task = state.tasks.find((item) => item.id === command.taskId);
      if (!task || (command.assignee && !actorExists(state, command.assignee))) return state;
      const title = command.title === undefined ? task.title : command.title.trim();
      if (!title) return state;
      const updated = { ...task, title, description: command.description === undefined ? task.description : command.description || undefined, priority: command.priority ?? task.priority, dueDate: command.dueDate === undefined ? task.dueDate : command.dueDate || undefined, assignee: command.assignee === undefined ? task.assignee : command.assignee || undefined, updatedAt: command.at };
      return event({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? updated : item) }, command.activityId, 'task_updated', command.at, `Updated task ${updated.title}`, { taskId: task.id });
    }
    case 'SET_TASK_DEPENDENCIES': {
      const task = state.tasks.find((item) => item.id === command.taskId);
      const unique = [...new Set(command.dependsOnTaskIds)].filter((id) => id !== task?.id && state.tasks.some((candidate) => candidate.id === id));
      if (!task) return state;
      const updated = { ...task, dependsOnTaskIds: unique.length ? unique : undefined, updatedAt: command.at };
      return event({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? updated : item) }, command.activityId, 'task_updated', command.at, `Updated handoffs for ${task.title}`, { taskId: task.id });
    }
    case 'TRANSITION_TASK': {
      const task = state.tasks.find((item) => item.id === command.taskId);
      const hasPendingApproval = state.approvals.some((approval) => approval.taskId === command.taskId && approval.status === 'pending');
      if (!task || !canTransitionTask(task.status, command.status) || (command.status === 'done' && hasPendingApproval) || (command.actor && !actorExists(state, command.actor))) return state;
      const updated = { ...task, status: command.status, updatedAt: command.at };
      return event({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? updated : item) }, command.activityId, 'task_status_changed', command.at, `Moved task ${task.title} to ${command.status}`, { taskId: task.id, actor: command.actor });
    }
    case 'ADD_COMMENT': {
      if (!state.tasks.some((task) => task.id === command.comment.taskId) || !actorExists(state, command.comment.author) || !command.comment.body.trim() || state.comments.some((comment) => comment.id === command.comment.id)) return state;
      const other = state.comments.filter((comment) => comment.taskId !== command.comment.taskId);
      const forTask = [...state.comments.filter((comment) => comment.taskId === command.comment.taskId), { ...command.comment, body: command.comment.body.trim() }].slice(-MAX_COMMENTS_PER_TASK);
      return event({ ...state, comments: [...other, ...forTask] }, command.activityId, 'comment_added', command.comment.createdAt, 'Added a task comment', { taskId: command.comment.taskId, actor: command.comment.author });
    }
    case 'SET_AGENT_RUN': {
      const task = state.tasks.find((item) => item.id === command.taskId);
      if (!task || task.assignee?.kind !== 'agent' || !state.agents.some((agent) => agent.id === task.assignee?.id && agent.type === 'coding')) return state;
      const updated = { ...task, agentRun: command.agentRun, updatedAt: command.at };
      return event({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? updated : item) }, command.activityId, 'agent_run_updated', command.at, `Coding agent run ${command.agentRun.status}`, { taskId: task.id, actor: task.assignee });
    }
    case 'REQUEST_APPROVAL': {
      const task = state.tasks.find((item) => item.id === command.approval.taskId);
      if (!task || task.status !== 'in_review' || !command.approval.resultId || !actorExists(state, command.approval.requestedBy) || state.approvals.some((item) => item.id === command.approval.id)) return state;
      return event({ ...state, approvals: [...state.approvals, command.approval] }, command.activityId, 'approval_requested', command.approval.createdAt, `Requested approval for ${task.title}`, { taskId: task.id, approvalId: command.approval.id, actor: command.approval.requestedBy });
    }
    case 'DECIDE_APPROVAL': {
      const approval = state.approvals.find((item) => item.id === command.approvalId);
      const task = approval && state.tasks.find((item) => item.id === approval.taskId);
      if (!approval || !task || approval.status !== 'pending' || task.status !== 'in_review' || !actorExists(state, command.actor)) return state;
      const status: TaskStatus = command.status === 'approved' ? 'done' : 'in_progress';
      const updatedApproval = { ...approval, status: command.status, decidedAt: command.at, decidedBy: command.actor };
      const updatedTask = { ...task, status, updatedAt: command.at };
      return event({ ...state, approvals: state.approvals.map((item) => item.id === approval.id ? updatedApproval : item), tasks: state.tasks.map((item) => item.id === task.id ? updatedTask : item) }, command.activityId, command.status === 'approved' ? 'approval_approved' : 'approval_changes_requested', command.at, command.status === 'approved' ? `Approved ${task.title}` : `Requested changes to ${task.title}`, { taskId: task.id, approvalId: approval.id, actor: command.actor });
    }
  }
}

function organizationReferencesExist(state: GwiraLocalState, structure: OrganizationStructure): boolean {
  const exists = (worker: { kind: string; id: string } | undefined) => !worker || (worker.kind === 'person' ? state.people.some((person) => person.id === worker.id) : worker.kind === 'doat' && state.doats.some((doat) => doat.id === worker.id));
  return structure.divisions.every((division) => exists(division.manager))
    && structure.departments.every((department) => department.humanMemberIds.every((id) => state.people.some((person) => person.id === id)) && department.doatMemberIds.every((id) => state.doats.some((doat) => doat.id === id)) && exists(department.manager))
    && structure.teams.every((team) => team.members.every(exists) && exists(team.manager))
    && structure.reportingRelationships.every((relationship) => exists(relationship.worker) && exists(relationship.supervisor));
}
