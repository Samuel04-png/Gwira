import { describe, expect, it } from 'vitest';
import type { Approval, Task } from '../../src/renderer/gwira/domain/types.js';
import { overdueTasks, pendingApprovals, recentActivity, summarizeWorkspace } from '../../src/renderer/gwira/home/homeViewModel.js';

const task = (id: string, status: Task['status'], dueDate?: string): Task => ({ id, workspaceId: 'workspace', title: id, status, priority: 'medium', dueDate, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
const approval = (id: string, status: Approval['status'], createdAt: string): Approval => ({ id, taskId: 'task', resultId: 'result', requestedBy: { kind: 'agent', id: 'agent' }, status, createdAt });

describe('home view model', () => {
  it('summarizes actual lifecycle and approval records', () => {
    const summary = summarizeWorkspace({ tasks: [task('todo', 'todo'), task('run', 'in_progress'), task('review', 'in_review'), task('done', 'done'), task('blocked', 'blocked')], approvals: [approval('pending', 'pending', '2026-01-03T00:00:00.000Z'), approval('decided', 'approved', '2026-01-02T00:00:00.000Z')] });
    expect(summary).toEqual({ totalTasks: 5, activeTasks: 2, inReview: 1, completed: 1, blocked: 1, pendingApprovals: 1 });
  });

  it('selects incomplete overdue work by calendar date without changing input', () => {
    const tasks = [task('later', 'todo', '2026-02-02T12:00:00.000Z'), task('overdue', 'in_progress', '2026-01-30'), task('done', 'done', '2026-01-01'), task('no-date', 'todo')];
    expect(overdueTasks(tasks, '2026-02-01').map((entry) => entry.id)).toEqual(['overdue']);
    expect(overdueTasks(tasks, 'not-a-date')).toEqual([]);
    expect(tasks.map((entry) => entry.id)).toEqual(['later', 'overdue', 'done', 'no-date']);
  });

  it('bounds and orders activity and pending approvals newest first', () => {
    const activity = [{ id: 'old', workspaceId: 'workspace', kind: 'task_created' as const, occurredAt: '2026-01-01T00:00:00.000Z', summary: 'old' }, { id: 'new', workspaceId: 'workspace', kind: 'task_created' as const, occurredAt: '2026-01-02T00:00:00.000Z', summary: 'new' }];
    expect(recentActivity(activity, 1).map((entry) => entry.id)).toEqual(['new']);
    expect(pendingApprovals([approval('old', 'pending', '2026-01-01T00:00:00.000Z'), approval('new', 'pending', '2026-01-02T00:00:00.000Z'), approval('done', 'approved', '2026-01-03T00:00:00.000Z')], 1).map((entry) => entry.id)).toEqual(['new']);
  });
});
