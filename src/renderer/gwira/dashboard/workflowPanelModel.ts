import { doatToUiRecord } from '../doats/doatViewModel.js';
import type { ActivityEvent, GwiraLocalState, Person, Task } from '../domain/types.js';

export type WorkerKind = 'person' | 'doat';
export type WorkerGroup = 'working' | 'attention' | 'others';
export interface WorkflowWorker { id: string; kind: WorkerKind; name: string; role: string; task?: Task; status: string; updatedAt: string; flowNodeId?: string; }

const active = new Set(['in_progress', 'in_review']);
export function workflowWorkers(state: GwiraLocalState): WorkflowWorker[] {
  const people = state.people.map((person) => personWorker(person, state.tasks));
  const doats = state.doats.filter((doat) => !doat.archivedAt).map((doat) => {
    const ui = doatToUiRecord(doat, state); const task = state.tasks.find((item) => item.agentRun?.status === 'running' && item.assignee?.id === doat.id) ?? state.tasks.find((item) => item.assignee?.id === doat.id);
    return { id: doat.id, kind: 'doat' as const, name: ui.name, role: ui.role, task, status: ui.status.replaceAll('_', ' '), updatedAt: doat.operations.updatedAt, flowNodeId: task?.agentRun ? `doatRun:${task.agentRun.sessionId}` : undefined };
  });
  return [...people, ...doats].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name));
}
function personWorker(person: Person, tasks: Task[]): WorkflowWorker {
  const task = tasks.filter((item) => item.assignee?.kind === 'person' && item.assignee.id === person.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return { id: person.id, kind: 'person', name: person.name, role: person.role, task, status: task ? task.status.replaceAll('_', ' ') : 'No reported work', updatedAt: task?.updatedAt ?? person.createdAt, flowNodeId: task ? `humanWork:${task.id}` : undefined };
}
export function workerGroup(worker: WorkflowWorker): WorkerGroup {
  if (worker.status === 'blocked' || worker.status === 'failed' || worker.status === 'waiting approval' || worker.status === 'waiting_for_approval') return 'attention';
  if (worker.status === 'working' || worker.task && active.has(worker.task.status)) return 'working';
  return 'others';
}
export function recentActivity(state: GwiraLocalState): ActivityEvent[] { return state.activity.slice().sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)); }
export function relativeTime(value: string): string { const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000)); if (seconds < 60) return 'Just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
