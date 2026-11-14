import { describe, expect, it } from 'vitest';
import {
  avatarInitials, buildFeedRows, filterConversations, groupConversations, isActivityItemOpenable, isNearBottom,
  moveNavIndex, navTargetIds, parseMessageQuery, sendStateLabel, stepDestination, unreadBadgeLabel, stableConversationOrder, visibleNavTargetIds, localDayKey
} from '../../src/renderer/gwira/inbox/inboxNavModel.js';

const conv = (id: string, kind: 'dm' | 'group' | 'channel', title: string, extra: object = {}): any => ({
  conversation: { id, kind, visibility: 'org', ...extra }, title, members: [{ name: 'Ama Mensah' }], unread: 0
});
const msg = (id: string, seq: number, at: string, author = 'p1', type = 'text', extra: object = {}): any => ({
  message: { id, seq, createdAt: at, author: { kind: 'human', id: author }, type, body: id }, isDeleted: false, ...extra
});

describe('inbox nav model', () => {
  const items = [conv('a', 'dm', 'Ama'), conv('b', 'channel', '#ops'), conv('c', 'group', 'Crew'), conv('d', 'channel', '#old', { archivedAt: 'x' })];
  it('groups, omits empty/archived, and orders targets', () => {
    const sections = groupConversations(items);
    expect(sections.map((s) => s.label)).toEqual(['Channels', 'Group chats', 'Direct messages']);
    expect(navTargetIds(sections)).toEqual(['unread', 'threads', 'drafts', 'needs-review', 'mentions', 'saved', 'b', 'c', 'a']);
    expect(navTargetIds(groupConversations(items, 'd'))).toContain('d');
  });
  it('keeps Doat DMs in their own Doats section', () => {
    const mixed = [...items, { ...conv('bot', 'dm', 'Review Doat'), hasDoatMember: true }, { ...conv('team', 'group', 'Mixed team'), hasDoatMember: true }];
    const sections = groupConversations(mixed);
    expect(sections.find((section) => section.id === 'dm')?.items.map((item) => item.conversation.id)).toEqual(['a']);
    expect(sections.find((section) => section.id === 'doat')?.items.map((item) => item.conversation.id)).toEqual(['bot']);
    expect(sections.find((section) => section.id === 'group')?.items.map((item) => item.conversation.id)).toEqual(['c', 'team']);
  });
  it('holds interaction order while refreshing records and safely merging new and removed ids', () => {
    const updated = { ...items[0], unread: 4 };
    const incoming = [items[2], updated, conv('new', 'dm', 'New')];
    const held = stableConversationOrder(incoming, ['a', 'b', 'c'], true);
    expect(held.map((item) => item.conversation.id)).toEqual(['a', 'c', 'new']);
    expect(held[0].unread).toBe(4);
    expect(stableConversationOrder(incoming, ['a', 'b', 'c'], false).map((item) => item.conversation.id)).toEqual(['c', 'a', 'new']);
  });
  it('omits collapsed rows from keyboard targets while retaining utility and section controls', () => {
    const targets = visibleNavTargetIds(groupConversations(items), new Set(['dm']), true);
    expect(targets).toEqual(['unread', 'threads', 'drafts', 'needs-review', 'mentions', 'saved', 'section:channels', 'b', 'section:group', 'c', 'section:dm']);
    expect(visibleNavTargetIds([], new Set(), false)).toEqual(['needs-review']);
  });
  it('groups by the displayed local calendar date around midnight', () => {
    const localFirst = new Date(2026, 0, 1, 23, 59).toISOString();
    const localSecond = new Date(2026, 0, 2, 0, 1).toISOString();
    expect(localDayKey(localFirst)).toBe('2026-01-01');
    expect(localDayKey(localSecond)).toBe('2026-01-02');
    const rows = buildFeedRows([msg('night1', 1, localFirst), msg('night2', 2, localSecond)]);
    expect(rows.filter((row) => row.kind === 'day')).toHaveLength(2);
    const sameDay = buildFeedRows([msg('first', 1, new Date(2026, 0, 1, 0, 1).toISOString()), msg('late', 2, localFirst)]);
    expect(sameDay.filter((row) => row.kind === 'day')).toHaveLength(1);
  });
  it('filters by title and member name', () => {
    expect(filterConversations(items, 'mensah').length).toBe(4);
    expect(filterConversations(items, 'ops').map((i) => i.title)).toEqual(['#ops']);
    expect(filterConversations(items, '  ').length).toBe(4);
  });
  it('moves index with clamping', () => {
    expect(moveNavIndex(0, 3, 'ArrowUp')).toBe(0);
    expect(moveNavIndex(2, 3, 'ArrowDown')).toBe(2);
    expect(moveNavIndex(1, 3, 'End')).toBe(2);
    expect(moveNavIndex(0, 0, 'Home')).toBe(-1);
    expect(unreadBadgeLabel(120)).toBe('99+');
  });
  it('steps through utility and conversation destinations using one selection shape', () => {
    const targets = navTargetIds(groupConversations(items));
    expect(stepDestination(targets, { kind: 'utility', view: 'unread' }, 'j')).toEqual({ kind: 'utility', view: 'threads' });
    expect(stepDestination(targets, { kind: 'utility', view: 'saved' }, 'j')).toEqual({ kind: 'conversation', id: 'b' });
    expect(stepDestination(targets, { kind: 'conversation', id: 'b' }, 'k')).toEqual({ kind: 'utility', view: 'saved' });
  });
  it('groups messages by author and window, with day and unread separators', () => {
    const rows = buildFeedRows([
      msg('m1', 1, '2026-01-01T10:00:00Z'), msg('m2', 2, '2026-01-01T10:02:00Z'),
      msg('m3', 3, '2026-01-01T10:30:00Z'), msg('m4', 4, '2026-01-01T10:31:00Z', 'p2'),
      msg('m5', 5, '2026-01-01T10:32:00Z', 'p2', 'system'), msg('m6', 6, '2026-01-02T09:00:00Z', 'p2')
    ], 4);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'group', 'group', 'unread', 'group', 'group', 'day', 'group']);
    expect((rows[1] as any).messages.length).toBe(2);
  });
  it('shows only honest send states', () => {
    expect(sendStateLabel({ message: { sendState: 'local_saved' } } as any)).toEqual({ label: 'Saved locally', failed: false });
    expect(sendStateLabel({ message: { sendState: 'failed' } } as any)).toEqual({ label: 'Failed — Retry', failed: true });
  });
  it('helpers', () => {
    expect(avatarInitials('Ama Mensah')).toBe('AM');
    expect(avatarInitials('#ops')).toBe('O');
    expect(isNearBottom(1000, 940, 50)).toBe(true);
    expect(isNearBottom(1000, 500, 50)).toBe(false);
    const ids = new Set(['t1']);
    expect(isActivityItemOpenable({ taskId: 't1' } as any, ids)).toBe(true);
    expect(isActivityItemOpenable({ taskId: 't2' } as any, ids)).toBe(false);
    expect(isActivityItemOpenable({} as any, ids)).toBe(false);
  });
  it('parses supported local message search filters without treating them as text', () => {
    expect(parseMessageQuery('project from:"Ama Mensah" in:#ops has:task has:file is:unread is:doat on:2026-10-24')).toEqual({
      text: 'project', from: 'Ama Mensah', inConversation: 'ops', hasTask: true, hasAttachment: true,
      unread: true, doat: true, on: '2026-10-24', ignored: []
    });
    expect(parseMessageQuery('before:tomorrow has:link')).toEqual({ text: '', before: 'tomorrow', ignored: ['has:link'] });
  });
});
