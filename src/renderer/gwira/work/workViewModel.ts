import type { Agent, Approval, Assignee, GwiraLocalState, Person, Task, TaskStatus } from '../domain/types.js';

export const taskStatuses: readonly TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done'];

export interface TaskStatusGroup {
  status: TaskStatus;
  tasks: Task[];
}

/**
 * Keeps presentation ordering deterministic without mutating persisted state.
 * Tasks updated most recently appear first within each status column.
 */
export function groupTasksByStatus(tasks: readonly Task[]): TaskStatusGroup[] {
  return taskStatuses.map((status) => ({
    status,
    tasks: tasks
      .filter((task) => task.status === status)
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title))
  }));
}

export function assigneeName(assignee: Assignee | undefined, people: readonly Person[], agents: readonly Agent[]): string {
  if (!assignee) return 'Unassigned';
  const record = assignee.kind === 'person'
    ? people.find((person) => person.id === assignee.id)
    : agents.find((agent) => agent.id === assignee.id);
  return record?.name ?? 'Unknown assignee';
}

export function pendingApprovalsForTask(approvals: readonly Approval[], taskId: string): Approval[] {
  return approvals.filter((approval) => approval.taskId === taskId && approval.status === 'pending');
}

export function taskProjectName(task: Task, state: Pick<GwiraLocalState, 'projects'>): string {
  if (!task.projectId) return 'No project';
  return state.projects.find((project) => project.id === task.projectId)?.name ?? 'Unknown project';
}
