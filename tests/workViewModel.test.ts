import { describe, expect, it } from 'vitest';
import type { Task } from '../src/renderer/gwira/domain/types.js';
import { assigneeName, groupTasksByStatus, pendingApprovalsForTask } from '../src/renderer/gwira/work/workViewModel.js';

const task = (id: string, status: Task['status'], updatedAt: string, title = id): Task => ({ id, workspaceId: 'w', title, status, priority: 'medium', createdAt: updatedAt, updatedAt });

describe('work view model', () => {
  it('groups every task status and orders each group without changing input', () => {
    const tasks = [task('older', 'todo', '2026-01-01T00:00:00.000Z'), task('newer', 'todo', '2026-01-02T00:00:00.000Z'), task('done', 'done', '2026-01-03T00:00:00.000Z')];
    const groups = groupTasksByStatus(tasks);
    expect(groups.map((group) => group.status)).toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done']);
    expect(groups.find((group) => group.status === 'todo')?.tasks.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(tasks.map((item) => item.id)).toEqual(['older', 'newer', 'done']);
  });

  it('uses safe labels for unavailable assignees and filters pending approvals', () => {
    expect(assigneeName({ kind: 'person', id: 'missing' }, [], [])).toBe('Unknown assignee');
    expect(pendingApprovalsForTask([{ id: 'a', taskId: 't', resultId: 'r', requestedBy: { kind: 'agent', id: 'agent' }, status: 'pending', createdAt: 'now' }, { id: 'b', taskId: 't', resultId: 'r2', requestedBy: { kind: 'agent', id: 'agent' }, status: 'approved', createdAt: 'now' }], 't').map((item) => item.id)).toEqual(['a']);
  });
});
