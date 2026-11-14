import type { ConversationListItem, MessageView } from '../messaging/domain/selectors.js';

export type UnreadFilter = 'all' | 'channels' | 'dms' | 'groups' | 'doats';
export type UnreadSort = 'recent' | 'oldest';
export type UnreadKind = Exclude<UnreadFilter, 'all'>;

export const UNREAD_FILTERS: readonly { id: UnreadFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'channels', label: 'Channels' },
  { id: 'dms', label: 'Direct messages' },
  { id: 'groups', label: 'Groups' },
  { id: 'doats', label: 'Doats' }
];

export const UNREAD_SORTS: readonly { id: UnreadSort; label: string }[] = [
  { id: 'recent', label: 'Most recent activity' },
  { id: 'oldest', label: 'Oldest unread first' }
];

export interface UnreadGroup {
  conversationId: string;
  title: string;
  kind: UnreadKind;
  typeLabel: string;
  item: ConversationListItem;
  /** Unread messages in reading order (oldest first). */
  messages: MessageView[];
  count: number;
  mentionCount: number;
  firstUnreadMessageId: string;
  oldestAt: string;
  latestAt: string;
  preview: { author: string; text: string; isDoat: boolean };
}

/** Matches the sidebar's own section rules so a conversation never changes category between surfaces. */
export function unreadKind(item: ConversationListItem): UnreadKind {
  if (item.conversation.kind === 'channel') return 'channels';
  if (item.conversation.kind === 'group') return 'groups';
  return item.hasDoatMember ? 'doats' : 'dms';
}

const TYPE_LABEL: Record<UnreadKind, string> = { channels: 'Channel', dms: 'Direct message', groups: 'Group', doats: 'Doat' };

export function isUnreadFilter(value: unknown): value is UnreadFilter {
  return UNREAD_FILTERS.some((filter) => filter.id === value);
}

export function isUnreadSort(value: unknown): value is UnreadSort {
  return UNREAD_SORTS.some((sort) => sort.id === value);
}

function plainPreview(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

/** Groups already-authorized unread message views by conversation. No read state is read or written here. */
export function buildUnreadGroups(views: readonly MessageView[], conversations: readonly ConversationListItem[]): UnreadGroup[] {
  const byId = new Map(conversations.map((item) => [item.conversation.id, item]));
  const buckets = new Map<string, MessageView[]>();
  for (const view of views) {
    if (!view.unread || !byId.has(view.message.conversationId)) continue;
    const list = buckets.get(view.message.conversationId);
    if (list) list.push(view); else buckets.set(view.message.conversationId, [view]);
  }
  const groups: UnreadGroup[] = [];
  for (const [conversationId, list] of buckets) {
    const item = byId.get(conversationId)!;
    const messages = [...list].sort((a, b) => a.message.seq - b.message.seq);
    const latest = messages[messages.length - 1]!;
    const first = messages[0]!;
    const kind = unreadKind(item);
    groups.push({
      conversationId, title: item.title, kind, typeLabel: TYPE_LABEL[kind], item, messages,
      count: messages.length,
      mentionCount: messages.filter((view) => view.mentionsActor).length,
      firstUnreadMessageId: first.message.id,
      oldestAt: first.message.createdAt,
      latestAt: latest.message.createdAt,
      preview: { author: latest.author.name, text: plainPreview(latest.message.body) || 'Linked records', isDoat: latest.author.ref.kind === 'doat' }
    });
  }
  return groups;
}

export function filterUnreadGroups(groups: readonly UnreadGroup[], filter: UnreadFilter): UnreadGroup[] {
  return filter === 'all' ? [...groups] : groups.filter((group) => group.kind === filter);
}

export function sortUnreadGroups(groups: readonly UnreadGroup[], sort: UnreadSort): UnreadGroup[] {
  const compare = sort === 'recent'
    ? (a: UnreadGroup, b: UnreadGroup) => (a.latestAt < b.latestAt ? 1 : a.latestAt > b.latestAt ? -1 : 0)
    : (a: UnreadGroup, b: UnreadGroup) => (a.oldestAt < b.oldestAt ? -1 : a.oldestAt > b.oldestAt ? 1 : 0);
  return [...groups].sort((a, b) => compare(a, b) || (a.conversationId < b.conversationId ? -1 : 1));
}

export function unreadFilterCounts(groups: readonly UnreadGroup[]): Record<UnreadFilter, number> {
  const counts: Record<UnreadFilter, number> = { all: groups.length, channels: 0, dms: 0, groups: 0, doats: 0 };
  for (const group of groups) counts[group.kind] += 1;
  return counts;
}

export function unreadTotals(groups: readonly UnreadGroup[]): { messages: number; conversations: number; mentions: number } {
  return groups.reduce((total, group) => ({ messages: total.messages + group.count, conversations: total.conversations + 1, mentions: total.mentions + group.mentionCount }), { messages: 0, conversations: 0, mentions: 0 });
}

export function unreadSummary(totals: { messages: number; conversations: number }): string {
  if (totals.messages === 0) return 'Nothing waiting for you';
  const m = `${totals.messages} unread ${totals.messages === 1 ? 'message' : 'messages'}`;
  return `${m} across ${totals.conversations} ${totals.conversations === 1 ? 'conversation' : 'conversations'}`;
}

/** Splits a body into plain and @mention spans using validated mention offsets. */
export function bodySegments(body: string, mentions: readonly { start: number; end: number }[]): Array<{ text: string; mention: boolean }> {
  const ranges = [...mentions].filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= body.length).sort((a, b) => a.start - b.start);
  const segments: Array<{ text: string; mention: boolean }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) segments.push({ text: body.slice(cursor, range.start), mention: false });
    segments.push({ text: body.slice(range.start, range.end), mention: true });
    cursor = range.end;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor), mention: false });
  return segments;
}

/** "12m", "3h", "Yesterday", "Oct 22": compact and stable for a scan-first list. */
export function relativeTimeLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `${Math.floor(minutes / 60)}h`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
