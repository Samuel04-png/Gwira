import { describe, expect, it } from 'vitest';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import { createInboxSampleWork, createInboxSampleState } from '../../src/renderer/gwira/inbox/inboxDevSample.js';
import { approvalAsk, filterReview, groupReview, linkedReviewMessages, resolveReviewSource, reviewAgeLabel, reviewEntries, withStaleEntries } from '../../src/renderer/gwira/inbox/needsReviewModel.js';

const scope = { organizationId: 'org', workspaceId: 'workspace' };
function sampleState() {
  const state = createEmptyLocalState(scope, '2026-10-24T00:00:00Z');
  const work = createInboxSampleWork(scope);
  return { ...state, people: work.people, doats: work.doats, tasks: work.tasks, approvals: work.approvals, activity: work.activity };
}

describe('Needs review model', () => {
  it('lists the 2 sample approvals first, then the 2 updates', () => {
    const entries = reviewEntries(sampleState());
    expect(entries.map((entry) => entry.kind)).toEqual(['approval', 'approval', 'update', 'update']);
    expect(groupReview(entries).map((group) => [group.label, group.entries.length])).toEqual([['Waiting on you', 2], ['Updates', 2]]);
    expect(entries[0]).toMatchObject({ title: 'Approve the launch copy', requester: { name: 'Quill', isDoat: true } });
    expect(entries[0]!.preview).toBe('Result ready for your review');
    expect(reviewEntries({ ...sampleState(), tasks: sampleState().tasks.map((task) => task.id === 'inbox-sample-task-copy' ? { ...task, title: 'Weekend campaign' } : task) })[0]!.preview).toBe('Weekend campaign · Result ready for your review');
  });
  it('filters All, Approvals and Activity', () => {
    const entries = reviewEntries(sampleState());
    expect(filterReview(entries, 'all')).toHaveLength(4);
    expect(filterReview(entries, 'approvals').every((entry) => entry.kind === 'approval')).toBe(true);
    expect(filterReview(entries, 'activity')).toHaveLength(2);
  });
  it('drops approvals that are decided or whose task is done or deleted', () => {
    const state = sampleState();
    state.approvals[0]!.status = 'approved';
    state.tasks = state.tasks.map((task) => task.id === 'inbox-sample-task-pricing' ? { ...task, status: 'done' as const } : task);
    expect(reviewEntries(state).filter((entry) => entry.kind === 'approval')).toHaveLength(0);
    state.approvals[1]!.status = 'pending';
    state.tasks = state.tasks.filter((task) => task.id !== 'inbox-sample-task-pricing');
    expect(reviewEntries(state).filter((entry) => entry.kind === 'approval')).toHaveLength(0);
  });
  it('keeps resolved entries as stale until the visit ends and never exposes live data for them', () => {
    const before = reviewEntries(sampleState());
    const seen = new Map(before.map((entry) => [entry.key, entry]));
    const state = sampleState();
    state.approvals[0]!.status = 'approved';
    const merged = withStaleEntries(reviewEntries(state), seen);
    expect(merged).toHaveLength(4);
    const stale = merged.find((entry) => entry.key === before[0]!.key)!;
    expect(stale.stale).toBe(true);
    expect(resolveReviewSource(state, stale, new Map())).toMatchObject({ status: 'stale' });
    expect(merged.filter((entry) => entry.stale)).toHaveLength(1);
  });
  it('formats approval age compactly', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(reviewAgeLabel('2026-10-24T12:00:00Z', now)).toBe('2d');
    expect(reviewAgeLabel('2026-10-26T09:00:00Z', now)).toBe('3h');
    expect(reviewAgeLabel('2026-10-26T11:48:00Z', now)).toBe('12m');
    expect(reviewAgeLabel('2026-10-26T12:00:00Z', now)).toBe('now');
  });
  it('does not double the verb in the ask', () => {
    expect(approvalAsk('Approve the launch copy')).toBe('Approve the launch copy');
    expect(approvalAsk('Weekend campaign')).toBe('Approve Weekend campaign');
  });
  it('resolves task facts and the linked conversation message', () => {
    const state = sampleState();
    const messages = createInboxSampleState(scope).messages;
    const linked = linkedReviewMessages(messages);
    const entry = reviewEntries(state)[0]!;
    const source = resolveReviewSource(state, entry, linked);
    expect(source).toMatchObject({ status: 'available', task: { priority: 'high', dueDate: '2026-10-27' }, owner: { isDoat: false } });
    expect(source.status === 'available' && source.message?.messageId).toBe('inbox-sample-message-3-2');
    const second = resolveReviewSource(state, reviewEntries(state)[1]!, linked);
    expect(second.status === 'available' && second.message).toBeUndefined();
  });
});
