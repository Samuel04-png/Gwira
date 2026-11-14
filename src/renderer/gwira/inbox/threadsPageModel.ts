import type { ThreadSummary } from '../messaging/domain/selectors.js';

/** "Following" is deliberately absent: there is no persisted follow state, and participation is not a follow. */
export type ThreadFilter = 'all' | 'unread' | 'started' | 'replied';

export const THREAD_FILTERS: readonly { id: ThreadFilter; label: string; hint: string }[] = [
  { id: 'all', label: 'All', hint: 'Threads you started or replied in' },
  { id: 'unread', label: 'Unread replies', hint: 'Threads with replies from others past your read position' },
  { id: 'started', label: 'Mine', hint: 'Threads whose first message is yours' },
  { id: 'replied', label: 'Replied', hint: 'Threads started by someone else where you replied' }
];

export function isThreadFilter(value: unknown): value is ThreadFilter {
  return THREAD_FILTERS.some((filter) => filter.id === value);
}

export interface ThreadKey { conversationId: string; rootId: string }

export const threadKeyId = (key: ThreadKey): string => `${key.conversationId}:${key.rootId}`;

export function matchesThreadFilter(summary: ThreadSummary, filter: ThreadFilter): boolean {
  switch (filter) {
    case 'unread': return summary.unreadReplies > 0;
    case 'started': return summary.startedByActor;
    case 'replied': return !summary.startedByActor;
    default: return true;
  }
}

export function threadFilterCounts(summaries: readonly ThreadSummary[]): Record<ThreadFilter, number> {
  const counts: Record<ThreadFilter, number> = { all: summaries.length, unread: 0, started: 0, replied: 0 };
  for (const summary of summaries) {
    if (summary.unreadReplies > 0) counts.unread += 1;
    if (summary.startedByActor) counts.started += 1; else counts.replied += 1;
  }
  return counts;
}

/** Case-insensitive match over the parent conversation, root and reply text, and participant names. */
export function threadSearchText(summary: ThreadSummary, conversationTitle: string): string {
  return [conversationTitle, summary.root.message.body, ...summary.replyBodies, ...summary.participants.map((person) => person.name)].join('\n').toLowerCase();
}

export function filterThreads(summaries: readonly ThreadSummary[], titles: ReadonlyMap<string, string>, filter: ThreadFilter, query: string): ThreadSummary[] {
  const needle = query.trim().toLowerCase();
  return summaries.filter((summary) => matchesThreadFilter(summary, filter)
    && (!needle || threadSearchText(summary, titles.get(summary.conversationId) ?? '').includes(needle)));
}

/** Readable one-line title: the root's first line, or a tombstone when the root was deleted. */
export function threadTitle(summary: ThreadSummary): string {
  if (summary.root.isDeleted) return 'Deleted message';
  const line = summary.root.message.body.split('\n').find((part) => part.trim())?.trim() ?? '';
  if (line) return line.length > 90 ? `${line.slice(0, 89)}…` : line;
  return summary.root.message.attachments[0]?.name ?? 'Linked records';
}

export function threadPreview(summary: ThreadSummary): { author: string; text: string } | undefined {
  const reply = summary.lastReply;
  if (!reply) return undefined;
  const text = reply.message.body.replace(/\s+/g, ' ').trim() || reply.message.attachments[0]?.name || 'Linked records';
  return { author: reply.isOwn ? 'You' : reply.author.name, text };
}

export function replyCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'reply' : 'replies'}`;
}

/** Keeps the current selection if still listed; otherwise returns the first visible thread, if any. */
export function resolveSelection(visible: readonly ThreadSummary[], selected: ThreadKey | undefined): ThreadKey | undefined {
  if (selected && visible.some((item) => item.rootId === selected.rootId && item.conversationId === selected.conversationId)) return selected;
  const first = visible[0];
  return first ? { conversationId: first.conversationId, rootId: first.rootId } : undefined;
}

export function stepSelection(visible: readonly ThreadSummary[], selected: ThreadKey | undefined, direction: 1 | -1): ThreadKey | undefined {
  if (visible.length === 0) return undefined;
  const index = selected ? visible.findIndex((item) => item.rootId === selected.rootId) : -1;
  const next = visible[Math.max(0, Math.min(visible.length - 1, index < 0 ? (direction === 1 ? 0 : visible.length - 1) : index + direction))]!;
  return { conversationId: next.conversationId, rootId: next.rootId };
}
