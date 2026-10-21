import type { ActivityEvent, Approval, GwiraLocalState, Task } from '../domain/types.js';

export interface HomeSummary {
  totalTasks: number;
  activeTasks: number;
  inReview: number;
  completed: number;
  blocked: number;
  pendingApprovals: number;
}

/** The date portion is intentional: due dates have no persisted time zone. */
function datePart(value: string | undefined): string | undefined {
  const part = value?.slice(0, 10);
  return part && /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : undefined;
}

export function summarizeWorkspace(state: Pick<GwiraLocalState, 'tasks' | 'approvals'>): HomeSummary {
  return {
    totalTasks: state.tasks.length,
    activeTasks: state.tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress').length,
    inReview: state.tasks.filter((task) => task.status === 'in_review').length,
    completed: state.tasks.filter((task) => task.status === 'done').length,
    blocked: state.tasks.filter((task) => task.status === 'blocked').length,
    pendingApprovals: state.approvals.filter((approval) => approval.status === 'pending').length
  };
}

/** Returns incomplete tasks whose calendar due date precedes `today` (YYYY-MM-DD). */
export function overdueTasks(tasks: readonly Task[], today: string): Task[] {
  const todayPart = datePart(today);
  if (!todayPart) return [];
  return tasks
    .filter((task) => task.status !== 'done')
    .filter((task) => {
      const dueDate = datePart(task.dueDate);
      return Boolean(dueDate && dueDate < todayPart);
    })
    .slice()
    .sort((left, right) => (datePart(left.dueDate) ?? '').localeCompare(datePart(right.dueDate) ?? '') || left.title.localeCompare(right.title));
}

export function recentActivity(activity: readonly ActivityEvent[], limit = 8): ActivityEvent[] {
  return activity
    .slice()
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id))
    .slice(0, Math.max(0, limit));
}

export function pendingApprovals(approvals: readonly Approval[], limit = 8): Approval[] {
  return approvals
    .filter((approval) => approval.status === 'pending')
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .slice(0, Math.max(0, limit));
}

export function taskTitle(state: Pick<GwiraLocalState, 'tasks'>, taskId: string): string {
  return state.tasks.find((task) => task.id === taskId)?.title ?? 'Unavailable task';
}
