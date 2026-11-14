import type { ActivityEvent, Approval, Assignee, BusinessProject, GwiraLocalState, Task } from '../domain/types.js';

export type ActivitySelection = { kind: 'approval' | 'activity'; id: string };
export type ActivityFilter = 'all' | 'approvals' | 'activity';
export interface ActivityQueueItem {
  selection: ActivitySelection;
  key: string;
  occurredAt: string;
  label: string;
  title: string;
  preview: string;
  actorName?: string;
}
export type ActivitySourceModel =
  | { status: 'unselected' }
  | { status: 'unavailable'; selection: ActivitySelection }
  | { status: 'available'; selection: ActivitySelection; title: string; occurredAt: string; actorName?: string; task?: Task; project?: BusinessProject; approval?: Approval; event?: ActivityEvent };

export function activitySelectionKey(selection: ActivitySelection): string { return `${selection.kind}:${selection.id}`; }
export function sameActivitySelection(left: ActivitySelection | undefined, right: ActivitySelection | undefined): boolean {
  return Boolean(left && right && left.kind === right.kind && left.id === right.id);
}
function scopedTask(state: GwiraLocalState, id: string | undefined): Task | undefined {
  return state.tasks.find((task) => task.id === id && task.workspaceId === state.workspace.id);
}
function actorName(state: GwiraLocalState, actor: Assignee | undefined): string | undefined {
  if (!actor) return undefined;
  if (actor.kind === 'person') return state.people.find((person) => person.id === actor.id && person.workspaceId === state.workspace.id)?.name;
  return state.agents.find((agent) => agent.id === actor.id && agent.workspaceId === state.workspace.id)?.name;
}
function projectFor(state: GwiraLocalState, id: string | undefined): BusinessProject | undefined {
  return state.projects.find((project) => project.id === id && project.workspaceId === state.workspace.id);
}
export function activityKindLabel(kind: string): string { return kind.replaceAll('_', ' '); }

/** Queue is derived, never persisted. Missing-task approvals remain honestly unavailable; known foreign tasks are excluded. */
export function activityQueueItems(state: GwiraLocalState, filter: ActivityFilter = 'all'): ActivityQueueItem[] {
  const approvals = filter === 'activity' ? [] : state.approvals.filter((approval) => {
    const task = state.tasks.find((candidate) => candidate.id === approval.taskId);
    return approval.status === 'pending' && (!task || task.workspaceId === state.workspace.id);
  }).map((approval): ActivityQueueItem => {
    const selection: ActivitySelection = { kind: 'approval', id: approval.id };
    const task = scopedTask(state, approval.taskId);
    return { selection, key: activitySelectionKey(selection), occurredAt: approval.createdAt, label: 'Approval requested', title: task?.title ?? 'Unavailable task', preview: 'Waiting for review', actorName: actorName(state, approval.requestedBy) };
  });
  const events = filter === 'approvals' ? [] : state.activity.filter((event) => event.workspaceId === state.workspace.id).map((event): ActivityQueueItem => {
    const selection: ActivitySelection = { kind: 'activity', id: event.id };
    const task = scopedTask(state, event.taskId);
    return { selection, key: activitySelectionKey(selection), occurredAt: event.occurredAt, label: activityKindLabel(event.kind), title: event.summary, preview: task?.title ?? (event.taskId ? 'Task unavailable' : 'Workspace activity'), actorName: actorName(state, event.actor) };
  });
  const sort = (left: ActivityQueueItem, right: ActivityQueueItem): number => right.occurredAt.localeCompare(left.occurredAt) || left.key.localeCompare(right.key);
  return [...approvals.sort(sort), ...events.sort(sort)];
}

/** Look up full live records, not only pending queue entries. No stale summary survives a deleted source. */
export function resolveActivitySource(state: GwiraLocalState, selection: ActivitySelection | undefined): ActivitySourceModel {
  if (!selection) return { status: 'unselected' };
  const unavailable: ActivitySourceModel = { status: 'unavailable', selection };
  if (selection.kind === 'approval') {
    const approval = state.approvals.find((item) => item.id === selection.id);
    const task = approval ? scopedTask(state, approval.taskId) : undefined;
    if (!approval || !task) return unavailable;
    return { status: 'available', selection, title: task.title, occurredAt: approval.createdAt, actorName: actorName(state, approval.requestedBy), approval, task, project: projectFor(state, task.projectId) };
  }
  const event = state.activity.find((item) => item.id === selection.id && item.workspaceId === state.workspace.id);
  if (!event) return unavailable;
  const task = scopedTask(state, event.taskId);
  const linkedApproval = event.approvalId ? state.approvals.find((approval) => approval.id === event.approvalId && scopedTask(state, approval.taskId)) : undefined;
  return { status: 'available', selection, title: event.summary, occurredAt: event.occurredAt, actorName: actorName(state, event.actor), event, task, approval: linkedApproval, project: projectFor(state, task?.projectId ?? event.projectId) };
}

export function activityQueueFocusKey(keys: readonly string[], previousKey: string | undefined, previousIndex = 0): string | undefined {
  if (previousKey && keys.includes(previousKey)) return previousKey;
  return keys[Math.min(Math.max(previousIndex, 0), keys.length - 1)];
}

/** Hold existing row positions while a pointer/keyboard interaction is in progress. New identities append. */
export function stableActivityQueueItems(items: readonly ActivityQueueItem[], heldKeys: readonly string[] | undefined): ActivityQueueItem[] {
  if (!heldKeys) return [...items];
  const byKey = new Map(items.map((item) => [item.key, item]));
  const held = heldKeys.flatMap((key) => { const item = byKey.get(key); return item ? [item] : []; });
  const heldSet = new Set(heldKeys);
  return [...held, ...items.filter((item) => !heldSet.has(item.key))];
}
