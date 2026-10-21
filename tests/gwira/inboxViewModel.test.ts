import { describe, expect, it } from 'vitest';
import type { GwiraLocalState } from '../../src/renderer/gwira/domain/types.js';
import { inboxCounts, inboxItems } from '../../src/renderer/gwira/inbox/inboxViewModel.js';

const state = (): Pick<GwiraLocalState, 'tasks' | 'activity' | 'approvals'> => ({
  tasks: [{ id: 'task', workspaceId: 'workspace', title: 'Review contract', status: 'in_review', priority: 'high', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  approvals: [{ id: 'pending', taskId: 'task', resultId: 'result-a', requestedBy: { kind: 'agent', id: 'agent' }, status: 'pending', createdAt: '2026-01-03T00:00:00.000Z' }, { id: 'approved', taskId: 'task', resultId: 'result-b', requestedBy: { kind: 'agent', id: 'agent' }, status: 'approved', createdAt: '2026-01-04T00:00:00.000Z' }],
  activity: [{ id: 'activity', workspaceId: 'workspace', kind: 'task_status_changed', taskId: 'task', occurredAt: '2026-01-02T00:00:00.000Z', summary: 'Moved task' }]
});

describe('inbox view model', () => {
  it('derives only pending approvals and local activity, sorted newest first', () => {
    const items = inboxItems(state());
    expect(items.map((item) => item.id)).toEqual(['approval:pending', 'activity:activity']);
    expect(items[0]).toMatchObject({ kind: 'approval', title: 'Review contract', resultId: 'result-a' });
  });

  it('uses safe unavailable task labels and respects the requested bound', () => {
    const missing = state();
    missing.approvals[0] = { ...missing.approvals[0], taskId: 'missing' };
    expect(inboxItems(missing, 1)[0]).toMatchObject({ title: 'Unavailable task' });
    expect(inboxCounts(state())).toEqual({ pendingApprovals: 1, activity: 1 });
  });
});
