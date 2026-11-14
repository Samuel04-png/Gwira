import type { Assignee, BusinessProject, GwiraLocalState, Task } from '../domain/types.js';
import type { Message } from '../messaging/domain/types.js';
import { activityKindLabel } from './activityModel.js';

export type ReviewFilter = 'all' | 'approvals' | 'activity';
export type ReviewGroupId = 'approvals' | 'updates';

export interface ReviewPerson { name: string; isDoat: boolean; id?: string }
export interface ReviewEntry {
  key: string;
  kind: 'approval' | 'update';
  id: string;
  at: string;
  /** What is asked (approvals) or what happened (updates). */
  title: string;
  preview: string;
  requester: ReviewPerson;
  taskId?: string;
  taskTitle?: string;
  taskStatus?: Task['status'];
  /** The record resolved or disappeared while the view was open. */
  stale: boolean;
}
export interface ReviewGroup { id: ReviewGroupId; label: string; entries: ReviewEntry[] }
export interface LinkedMessage { conversationId: string; messageId: string; body: string; at: string }

export const REVIEW_FILTERS: readonly { id: ReviewFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'approvals', label: 'Approvals' }, { id: 'activity', label: 'Activity' }];
export const STALE_TITLE = 'No longer needs review';

function task(state: GwiraLocalState, id: string | undefined): Task | undefined {
  return state.tasks.find((item) => item.id === id && item.workspaceId === state.workspace.id);
}

export function reviewPerson(state: GwiraLocalState, actor: Assignee | undefined): ReviewPerson {
  if (!actor) return { name: 'Gwira', isDoat: false };
  const doat = state.doats.find((item) => item.id === actor.id && item.workspaceId === state.workspace.id);
  if (doat) return { name: doat.identity.name, isDoat: true, id: doat.id };
  const agent = actor.kind === 'agent' ? state.agents.find((item) => item.id === actor.id && item.workspaceId === state.workspace.id) : undefined;
  if (agent) return { name: agent.name, isDoat: true, id: agent.id };
  const person = state.people.find((item) => item.id === actor.id && item.workspaceId === state.workspace.id);
  return { name: person?.name ?? 'Unknown', isDoat: false, ...(person ? { id: person.id } : {}) };
}

/** "Approve" is added only when the task title does not already read as an ask. */
export function approvalAsk(title: string): string {
  return /^(approve|review|check|sign off)\b/i.test(title) ? title : `Approve ${title}`;
}

/** Approval requests are recorded without a free-text reason; the result they cover is the honest reason. */
export const APPROVAL_REASON = 'Result ready for your review';

/** Derived queue: pending approvals on live, unfinished tasks plus workspace activity on live tasks. Never persisted. */
export function reviewEntries(state: GwiraLocalState): ReviewEntry[] {
  const approvals = state.approvals.flatMap((approval): ReviewEntry[] => {
    const linked = task(state, approval.taskId);
    if (approval.status !== 'pending' || !linked || linked.status === 'done') return [];
    return [{
      key: `approval:${approval.id}`, kind: 'approval', id: approval.id, at: approval.createdAt, title: approvalAsk(linked.title),
      preview: approvalAsk(linked.title) === linked.title ? APPROVAL_REASON : `${linked.title} · ${APPROVAL_REASON}`, requester: reviewPerson(state, approval.requestedBy),
      taskId: linked.id, taskTitle: linked.title, taskStatus: linked.status, stale: false
    }];
  });
  const updates = state.activity.flatMap((event): ReviewEntry[] => {
    if (event.workspaceId !== state.workspace.id) return [];
    const linked = event.taskId ? task(state, event.taskId) : undefined;
    if (event.taskId && !linked) return [];
    return [{
      key: `update:${event.id}`, kind: 'update', id: event.id, at: event.occurredAt, title: event.summary,
      preview: activityKindLabel(event.kind), requester: reviewPerson(state, event.actor),
      ...(linked ? { taskId: linked.id, taskTitle: linked.title, taskStatus: linked.status } : {}), stale: false
    }];
  });
  const byRecent = (left: ReviewEntry, right: ReviewEntry): number => right.at.localeCompare(left.at) || left.key.localeCompare(right.key);
  return [...approvals.sort(byRecent), ...updates.sort(byRecent)];
}

/** Entries seen earlier in this visit that no longer qualify stay visible, marked stale, until the view is left. */
export function withStaleEntries(current: readonly ReviewEntry[], seen: ReadonlyMap<string, ReviewEntry>): ReviewEntry[] {
  const live = new Set(current.map((entry) => entry.key));
  const stale = [...seen.values()].filter((entry) => !live.has(entry.key)).map((entry): ReviewEntry => ({ ...entry, stale: true }));
  const byRecent = (left: ReviewEntry, right: ReviewEntry): number => right.at.localeCompare(left.at) || left.key.localeCompare(right.key);
  return [...current, ...stale].sort(byRecent);
}

export function filterReview(entries: readonly ReviewEntry[], filter: ReviewFilter): ReviewEntry[] {
  return entries.filter((entry) => filter === 'all' || (filter === 'approvals' ? entry.kind === 'approval' : entry.kind === 'update'));
}

export function groupReview(entries: readonly ReviewEntry[]): ReviewGroup[] {
  const groups: ReviewGroup[] = [
    { id: 'approvals', label: 'Waiting on you', entries: entries.filter((entry) => entry.kind === 'approval') },
    { id: 'updates', label: 'Updates', entries: entries.filter((entry) => entry.kind === 'update') }
  ];
  return groups.filter((group) => group.entries.length > 0);
}

/** Compact age such as "2d", "3h" or "12m". */
export function reviewAgeLabel(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

export type ReviewSource =
  | { status: 'unselected' }
  | { status: 'stale'; entry: ReviewEntry }
  | { status: 'available'; entry: ReviewEntry; task?: Task; project?: BusinessProject; owner?: ReviewPerson; message?: LinkedMessage };

/** Read-only source for the selected entry. Stale entries never expose live data. */
export function resolveReviewSource(state: GwiraLocalState, entry: ReviewEntry | undefined, linked: ReadonlyMap<string, LinkedMessage>): ReviewSource {
  if (!entry) return { status: 'unselected' };
  if (entry.stale) return { status: 'stale', entry };
  const record = task(state, entry.taskId);
  const project = state.projects.find((item) => item.id === record?.projectId && item.workspaceId === state.workspace.id);
  const message = (entry.kind === 'approval' ? linked.get(`approval:${entry.id}`) : undefined) ?? (entry.taskId ? linked.get(`task:${entry.taskId}`) : undefined);
  return { status: 'available', entry, ...(record ? { task: record } : {}), ...(project ? { project } : {}), ...(record?.assignee ? { owner: reviewPerson(state, record.assignee) } : {}), ...(message ? { message } : {}) };
}

/** Latest live message that references each task or approval. */
export function linkedReviewMessages(messages: readonly Message[]): Map<string, LinkedMessage> {
  const result = new Map<string, LinkedMessage>();
  for (const message of messages) {
    if (message.deletedAt || message.type !== 'text') continue;
    for (const ref of message.refs) {
      const key = ref.kind === 'task' ? `task:${ref.taskId}` : ref.kind === 'approval' ? `approval:${ref.approvalId}` : undefined;
      if (!key) continue;
      const previous = result.get(key);
      if (!previous || previous.at < message.createdAt) result.set(key, { conversationId: message.conversationId, messageId: message.id, body: message.body, at: message.createdAt });
    }
  }
  return result;
}
