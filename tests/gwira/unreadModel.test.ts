import { describe, expect, it } from 'vitest';
import type { ConversationListItem, MessageView } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import {
  bodySegments, buildUnreadGroups, filterUnreadGroups, relativeTimeLabel, sortUnreadGroups,
  unreadFilterCounts, unreadKind, unreadSummary, unreadTotals
} from '../../src/renderer/gwira/inbox/unreadModel.js';

function item(id: string, kind: 'channel' | 'dm' | 'group', hasDoatMember = false): ConversationListItem {
  return { conversation: { id, kind, visibility: 'public' }, title: id, members: [], unread: 0, mentionUnread: 0, hasDoatMember, sortAt: '' } as unknown as ConversationListItem;
}

function view(conversationId: string, seq: number, at: string, extra: Partial<{ unread: boolean; mention: boolean; body: string; doat: boolean }> = {}): MessageView {
  return {
    message: { id: `${conversationId}-${seq}`, conversationId, seq, body: extra.body ?? `m${seq}`, createdAt: at, mentions: [], attachments: [] },
    author: { name: 'Mina', ref: { kind: extra.doat ? 'doat' : 'human' } },
    unread: extra.unread ?? true, mentionsActor: extra.mention ?? false, refs: [], reactions: [], replyCount: 0
  } as unknown as MessageView;
}

const conversations = [item('c1', 'channel'), item('d1', 'dm'), item('d2', 'dm', true), item('g1', 'group')];
const views = [
  view('c1', 1, '2025-01-01T10:00:00Z'), view('c1', 2, '2025-01-01T12:00:00Z', { mention: true }),
  view('d1', 1, '2025-01-01T11:00:00Z'), view('d2', 1, '2025-01-01T09:00:00Z', { doat: true }),
  view('g1', 3, '2025-01-01T13:00:00Z'), view('zz', 1, '2025-01-01T13:00:00Z'), view('c1', 9, '2025-01-01T14:00:00Z', { unread: false })
];

describe('unread model', () => {
  const groups = buildUnreadGroups(views, conversations);
  it('groups by conversation, ignoring read and unknown conversations', () => {
    expect(groups.map((g) => [g.conversationId, g.count]).sort()).toEqual([['c1', 2], ['d1', 1], ['d2', 1], ['g1', 1]]);
    expect(unreadTotals(groups)).toEqual({ messages: 5, conversations: 4, mentions: 1 });
  });
  it('classifies Doat DMs with Doats, matching the sidebar', () => {
    expect(unreadKind(conversations[2]!)).toBe('doats');
    expect(unreadKind(item('g2', 'group', true))).toBe('groups');
    expect(unreadKind(item('c2', 'channel', true))).toBe('channels');
    expect(unreadFilterCounts(groups)).toEqual({ all: 4, channels: 1, dms: 1, groups: 1, doats: 1 });
    expect(filterUnreadGroups(groups, 'doats').map((g) => g.conversationId)).toEqual(['d2']);
  });
  it('orders messages oldest first and exposes the first unread id for undo', () => {
    const c1 = groups.find((g) => g.conversationId === 'c1')!;
    expect(c1.messages.map((m) => m.message.seq)).toEqual([1, 2]);
    expect(c1.firstUnreadMessageId).toBe('c1-1');
  });
  it('sorts by recent activity or oldest unread, deterministically', () => {
    expect(sortUnreadGroups(groups, 'recent').map((g) => g.conversationId)).toEqual(['g1', 'c1', 'd1', 'd2']);
    expect(sortUnreadGroups(groups, 'oldest').map((g) => g.conversationId)).toEqual(['d2', 'c1', 'd1', 'g1']);
  });
  it('does not mutate inputs', () => {
    const copy = JSON.stringify(views);
    buildUnreadGroups(views, conversations);
    expect(JSON.stringify(views)).toBe(copy);
  });
  it('handles large datasets', () => {
    const many = Array.from({ length: 5000 }, (_, i) => view(`c${i % 50}`, i, '2025-01-01T10:00:00Z'));
    const list = Array.from({ length: 50 }, (_, i) => item(`c${i}`, 'channel'));
    expect(buildUnreadGroups(many, list)).toHaveLength(50);
  });
  it('summarises', () => {
    expect(unreadSummary({ messages: 0, conversations: 0 })).toBe('Nothing waiting for you');
    expect(unreadSummary({ messages: 1, conversations: 1 })).toBe('1 unread message across 1 conversation');
    expect(unreadSummary({ messages: 5, conversations: 4 })).toBe('5 unread messages across 4 conversations');
  });
  it('splits mention spans and ignores invalid ranges', () => {
    expect(bodySegments('hi @Ann ok', [{ start: 3, end: 7 }, { start: 50, end: 60 }])).toEqual([
      { text: 'hi ', mention: false }, { text: '@Ann', mention: true }, { text: ' ok', mention: false }]);
  });
  it('formats relative time', () => {
    const now = new Date('2025-01-01T12:00:00Z');
    expect(relativeTimeLabel('2025-01-01T11:48:00Z', now)).toBe('12m');
    expect(relativeTimeLabel('not a date', now)).toBe('');
  });
});
