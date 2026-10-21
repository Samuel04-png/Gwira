import { doatToUiRecord } from '../doats/doatViewModel.js';
import type { DoatAvatarSpec } from '../doats/ui/types.js';
import type { ActivityEvent, GwiraLocalState, Person, Task } from '../domain/types.js';

export type WorkerKind = 'person' | 'doat';
export type WorkerGroup = 'working' | 'attention' | 'others';
export interface WorkflowWorker { id: string; kind: WorkerKind; name: string; role: string; task?: Task; status: string; updatedAt: string; flowNodeId?: string; avatar?: DoatAvatarSpec; }

const attentionStatuses = new Set(['blocked', 'failed', 'needs approval', 'needs review', 'unavailable']);
const currentTaskStatuses = new Set(['in_progress', 'in_review', 'blocked']);
function taskRank(task: Task, pendingApprovalTaskIds: ReadonlySet<string>): number {
  if (pendingApprovalTaskIds.has(task.id)) return 0;
  if (task.agentRun?.status === 'error' || task.status === 'blocked' || task.status === 'in_review') return 0;
  if (task.agentRun?.status === 'running' || currentTaskStatuses.has(task.status)) return 1;
  if (task.status === 'todo' || task.status === 'backlog') return 2;
  return 3;
}
function newestFirst(left: Task, right: Task): number { return right.updatedAt.localeCompare(left.updatedAt); }
function statusForTask(task: Task, pendingApprovalTaskIds: ReadonlySet<string>): string {
  if (task.agentRun?.status === 'error') return 'Failed';
  if (task.agentRun?.status === 'stopped') return 'Blocked';
  if (pendingApprovalTaskIds.has(task.id)) return 'Needs approval';
  if (task.agentRun?.status === 'running' || task.status === 'in_progress') return 'Working';
  if (task.status === 'in_review') return 'Needs review';
  if (task.status === 'blocked') return 'Blocked';
  if (task.status === 'done') return 'Completed';
  return 'Queued';
}

export function workflowWorkers(state: GwiraLocalState): WorkflowWorker[] {
  const workspaceTasks = state.tasks.filter((task) => task.workspaceId === state.workspace.id);
  const workspaceTaskIds = new Set(workspaceTasks.map((task) => task.id));
  const pendingApprovalTaskIds = new Set(state.approvals.filter((approval) => approval.status === 'pending' && workspaceTaskIds.has(approval.taskId)).map((approval) => approval.taskId));
  const people = state.people.filter((person) => person.workspaceId === state.workspace.id).map((person) => personWorker(person, workspaceTasks, pendingApprovalTaskIds));
  const doats = state.doats.filter((doat) => doat.workspaceId === state.workspace.id && !doat.archivedAt).map((doat) => {
    const ui = doatToUiRecord(doat, state);
    const assigned = workspaceTasks.filter((task) => task.assignee?.kind === 'agent' && task.assignee.id === doat.id)
      .sort((left, right) => taskRank(left, pendingApprovalTaskIds) - taskRank(right, pendingApprovalTaskIds) || newestFirst(left, right));
    const task = assigned.find((item) => item.id === doat.operations.activeTaskId)
      ?? assigned.find((item) => item.agentRun?.status === 'running')
      ?? assigned[0];
    return {
      id: doat.id,
      kind: 'doat' as const,
      name: ui.name,
      role: ui.role,
      task,
      status: task ? statusForTask(task, pendingApprovalTaskIds) : doatStatus(ui.status),
      updatedAt: task?.updatedAt ?? doat.operations.updatedAt,
      flowNodeId: task ? `doatWork:${task.id}` : undefined,
      avatar: ui.avatar
    };
  });
  return [...people, ...doats].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name));
}
function personWorker(person: Person, tasks: Task[], pendingApprovalTaskIds: ReadonlySet<string>): WorkflowWorker {
  const assigned = tasks.filter((item) => item.assignee?.kind === 'person' && item.assignee.id === person.id)
    .sort((left, right) => taskRank(left, pendingApprovalTaskIds) - taskRank(right, pendingApprovalTaskIds) || newestFirst(left, right));
  const task = assigned[0];
  return { id: person.id, kind: 'person', name: person.name, role: person.role, task, status: task ? statusForTask(task, pendingApprovalTaskIds) : 'Idle', updatedAt: task?.updatedAt ?? person.createdAt, flowNodeId: task ? `humanWork:${task.id}` : undefined };
}
function doatStatus(status: string): string {
  if (status === 'waiting_approval' || status === 'waiting approval') return 'Needs approval';
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function workerGroup(worker: WorkflowWorker): WorkerGroup {
  if (attentionStatuses.has(worker.status.toLowerCase())) return 'attention';
  if (worker.status.toLowerCase() === 'working' || worker.status.toLowerCase() === 'planning') return 'working';
  return 'others';
}
export function recentActivity(state: GwiraLocalState): ActivityEvent[] {
  return state.activity
    .filter((event) => event.workspaceId === state.workspace.id && event.kind !== 'workspace_created')
    .slice()
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
export function relativeTime(value: string): string { const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000)); if (seconds < 60) return 'Just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
