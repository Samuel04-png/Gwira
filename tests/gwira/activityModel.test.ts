import { describe, expect, it } from 'vitest';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import { activityQueueFocusKey, activityQueueItems, resolveActivitySource, stableActivityQueueItems } from '../../src/renderer/gwira/inbox/activityModel.js';

function fixture() {
  const state = createEmptyLocalState({ organizationId: 'org', workspaceId: 'workspace' }, '2026-01-01T00:00:00Z');
  state.tasks = [{ id: 'task', workspaceId: 'workspace', title: 'Review contract', description: 'Read terms', status: 'in_review', priority: 'high', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }, { id: 'foreign', workspaceId: 'other', title: 'Private title', status: 'todo', priority: 'low', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }];
  state.approvals = [{ id: 'approval', taskId: 'task', resultId: 'result', status: 'pending', requestedBy: { kind: 'person', id: 'person' }, createdAt: '2026-01-02T00:00:00Z' }, { id: 'foreign-approval', taskId: 'foreign', resultId: 'secret', status: 'pending', requestedBy: { kind: 'person', id: 'other' }, createdAt: '2026-01-02T00:00:00Z' }];
  state.activity = [{ id: 'event', workspaceId: 'workspace', kind: 'task_updated', taskId: 'task', summary: 'Contract updated', occurredAt: '2026-01-03T00:00:00Z' }, { id: 'foreign-event', workspaceId: 'other', kind: 'task_updated', summary: 'Secret event', occurredAt: '2026-01-03T00:00:00Z' }];
  return state;
}

describe('Activity queue and live source', () => {
  it('derives real scoped queue with approvals first and actual IDs', () => {
    expect(activityQueueItems(fixture()).map((item) => item.key)).toEqual(['approval:approval', 'activity:event']);
    expect(activityQueueItems(fixture(), 'activity').map((item) => item.key)).toEqual(['activity:event']);
    expect(activityQueueItems(fixture(), 'approvals').map((item) => item.key)).toEqual(['approval:approval']);
  });
  it('resolves decided approvals after they leave the pending queue', () => {
    const state = fixture(); state.approvals[0]!.status = 'approved';
    expect(activityQueueItems(state, 'approvals')).toHaveLength(0);
    expect(resolveActivitySource(state, { kind: 'approval', id: 'approval' })).toMatchObject({ status: 'available', approval: { status: 'approved' }, task: { title: 'Review contract' } });
  });
  it('returns generic ID-only tombstones for removed or out-of-scope sources', () => {
    const state = fixture(); state.approvals = [];
    expect(resolveActivitySource(state, { kind: 'approval', id: 'approval' })).toEqual({ status: 'unavailable', selection: { kind: 'approval', id: 'approval' } });
    expect(resolveActivitySource(state, { kind: 'activity', id: 'foreign-event' }).status).toBe('unavailable');
    expect(resolveActivitySource(fixture(), { kind: 'approval', id: 'foreign-approval' }).status).toBe('unavailable');
  });
  it('does not expose a deleted task through approval metadata or invent task context for unlinked events', () => {
    const state = fixture(); state.tasks = []; state.activity[0]!.taskId = undefined;
    expect(resolveActivitySource(state, { kind: 'approval', id: 'approval' }).status).toBe('unavailable');
    expect(activityQueueItems(state)[0]!.title).toBe('Unavailable task');
    expect(resolveActivitySource(state, { kind: 'activity', id: 'event' })).toMatchObject({ status: 'available', title: 'Contract updated', task: undefined });
    expect(resolveActivitySource(state, undefined)).toEqual({ status: 'unselected' });
  });
  it('focus fallback never returns a selection or chooses a stale identity', () => {
    expect(activityQueueFocusKey(['a', 'c'], 'b', 1)).toBe('c');
    expect(activityQueueFocusKey(['a', 'c'], 'a', 1)).toBe('a');
    expect(activityQueueFocusKey([], 'b', 9)).toBeUndefined();
  });
  it('holds existing row order through live updates and appends new identities', () => {
    const items = activityQueueItems(fixture());
    const extra = { ...items[0]!, key: 'approval:new', selection: { kind: 'approval' as const, id: 'new' } };
    expect(stableActivityQueueItems([extra, ...items].reverse(), items.map((item) => item.key)).map((item) => item.key)).toEqual(['approval:approval', 'activity:event', 'approval:new']);
    expect(stableActivityQueueItems([extra, items[1]!], items.map((item) => item.key)).map((item) => item.key)).toEqual(['activity:event', 'approval:new']);
  });
});
