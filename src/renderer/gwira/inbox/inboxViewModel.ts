import type { ActivityEvent, Approval, GwiraLocalState } from '../domain/types.js';

export type InboxItem =
  | { kind: 'approval'; id: string; occurredAt: string; taskId: string; title: string; resultId: string }
  | { kind: 'activity'; id: string; occurredAt: string; taskId?: string; title: string; event: ActivityEvent };

function titleForTask(state: Pick<GwiraLocalState, 'tasks'>, taskId: string): string {
  return state.tasks.find((task) => task.id === taskId)?.title ?? 'Unavailable task';
}

/**
 * Inbox is intentionally derived from local activity and approval records.
 * It does not represent email, chat, people notifications or external connectors.
 */
export function inboxItems(state: Pick<GwiraLocalState, 'tasks' | 'activity' | 'approvals'>, limit = 50): InboxItem[] {
  const approvals: InboxItem[] = state.approvals
    .filter((approval): approval is Approval => approval.status === 'pending')
    .map((approval) => ({ kind: 'approval', id: `approval:${approval.id}`, occurredAt: approval.createdAt, taskId: approval.taskId, title: titleForTask(state, approval.taskId), resultId: approval.resultId }));
  const activity: InboxItem[] = state.activity.map((event) => ({ kind: 'activity', id: `activity:${event.id}`, occurredAt: event.occurredAt, taskId: event.taskId, title: event.summary, event }));
  return [...approvals, ...activity]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id))
    .slice(0, Math.max(0, limit));
}

export function inboxCounts(state: Pick<GwiraLocalState, 'activity' | 'approvals'>): { pendingApprovals: number; activity: number } {
  return { pendingApprovals: state.approvals.filter((approval) => approval.status === 'pending').length, activity: state.activity.length };
}
