import { describe, expect, it } from 'vitest';
import type { MessagingScope } from '../../src/renderer/gwira/messaging/domain/types.js';
import { createInboxSampleState, createInboxSampleWork } from '../../src/renderer/gwira/inbox/inboxDevSample.js';
import { selectThread, selectThreadSummaries } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import { filterThreads, matchesThreadFilter, replyCountLabel, resolveSelection, stepSelection, threadFilterCounts, threadKeyId, threadTitle } from '../../src/renderer/gwira/inbox/threadsPageModel.js';

const scope: MessagingScope = { organizationId: '00000000-0000-4000-8000-000000000001', workspaceId: '00000000-0000-4000-8000-000000000002' };
const work = createInboxSampleWork(scope);
const state = createInboxSampleState(scope);
const summaries = selectThreadSummaries(state, scope, work);
const titles = new Map([['inbox-sample-channel-design', 'design-crit'], ['inbox-sample-channel-customer', 'customer-notes']]);

describe('selectThreadSummaries', () => {
  it('lists threads newest activity first with accurate reply counts', () => {
    expect(summaries.length).toBeGreaterThanOrEqual(3);
    const times = summaries.map((item) => Date.parse(item.lastActivityAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const item of summaries) {
      const replies = state.messages.filter((message) => message.threadRootId === item.rootId && !message.deletedAt);
      expect(item.replyCount).toBe(replies.length);
      expect(item.root.message.id).toBe(item.rootId);
    }
  });

  it('counts only unread replies from other people', () => {
    const design = summaries.find((item) => item.conversationId === 'inbox-sample-channel-design')!;
    const expected = state.messages.filter((message) => message.threadRootId === design.rootId && message.seq > 3 && !(message.author.kind === 'human' && message.author.id === state.selfPersonId)).length;
    expect(design.unreadReplies).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(design.participants.length).toBeGreaterThan(1);
  });

  it('is empty for a person who never joined a thread', () => {
    const stranger = { ...state, selfPersonId: '00000000-0000-4000-8000-0000000009ff' };
    expect(selectThreadSummaries(stranger, scope, work)).toEqual([]);
  });

  it('keeps a deleted root as a tombstone while replies remain', () => {
    const design = summaries.find((item) => item.conversationId === 'inbox-sample-channel-design')!;
    const deleted = { ...state, messages: state.messages.map((message) => message.id === design.rootId ? { ...message, deletedAt: state.messages[0]!.createdAt } : message) };
    const after = selectThreadSummaries(deleted, scope, work).find((item) => item.rootId === design.rootId)!;
    expect(after).toBeDefined();
    expect(threadTitle(after)).toBe('Deleted message');
    expect(selectThread(deleted, scope, work, design.conversationId, design.rootId)?.canPost).toBe(false);
  });

  it('stays fast for a long discussion', () => {
    const design = summaries.find((item) => item.conversationId === 'inbox-sample-channel-design')!;
    const template = state.messages.find((message) => message.threadRootId === design.rootId)!;
    const extra = Array.from({ length: 2000 }, (_, index) => ({ ...template, id: `long-${index}`, clientId: `long-${index}`, seq: 100 + index }));
    const long = { ...state, messages: [...state.messages, ...extra] };
    const started = performance.now();
    const result = selectThreadSummaries(long, scope, work).find((item) => item.rootId === design.rootId)!;
    expect(result.replyCount).toBe(design.replyCount + 2000);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('threads page model', () => {
  it('filters and counts truthfully', () => {
    const counts = threadFilterCounts(summaries);
    expect(counts.all).toBe(summaries.length);
    expect(counts.unread).toBe(summaries.filter((item) => item.unreadReplies > 0).length);
    expect(filterThreads(summaries, titles, 'unread', '').every((item) => matchesThreadFilter(item, 'unread'))).toBe(true);
    expect(filterThreads(summaries, titles, 'all', 'design-crit').every((item) => item.conversationId === 'inbox-sample-channel-design')).toBe(true);
    expect(filterThreads(summaries, titles, 'all', 'zzzz-no-match')).toEqual([]);
  });

  it('searches every reply, not just the latest', () => {
    const target = summaries[0]!;
    const earlier = target.replyBodies[0]!;
    const uniqueWord = earlier.split(' ').find((word) => word.length > 6)!;
    expect(filterThreads(summaries, titles, 'all', uniqueWord).some((item) => item.rootId === target.rootId)).toBe(true);
  });

  it('resolves and steps selection without leaving the list', () => {
    const first = { conversationId: summaries[0]!.conversationId, rootId: summaries[0]!.rootId };
    expect(resolveSelection(summaries, undefined)).toEqual(first);
    expect(resolveSelection(summaries, { conversationId: 'gone', rootId: 'gone' })).toEqual(first);
    expect(stepSelection(summaries, first, -1)).toEqual(first);
    const second = stepSelection(summaries, first, 1)!;
    expect(threadKeyId(second)).not.toBe(threadKeyId(first));
    expect(replyCountLabel(1)).toBe('1 reply');
    expect(replyCountLabel(3)).toBe('3 replies');
  });
});
