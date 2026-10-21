import type { TaskStatus } from './types.js';

const transitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['todo'],
  todo: ['backlog', 'in_progress', 'blocked'],
  in_progress: ['todo', 'in_review', 'blocked'],
  in_review: ['in_progress', 'done', 'blocked'],
  done: ['in_review'],
  blocked: ['todo', 'in_progress']
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}

export function allowedTaskTransitions(status: TaskStatus): readonly TaskStatus[] {
  return transitions[status];
}
