import type { ConversationListItem, MessageView } from '../messaging/domain/selectors.js';
import { mentionPlace } from './mentionsModel.js';

export type SavedMode = 'date' | 'conversation';
export type SavedBucket = 'week' | 'month' | 'earlier';
export type SavedView = MessageView & { savedAt: string; conversationUnavailable: boolean };

export const SAVED_MODES: readonly { id: SavedMode; label: string }[] = [
  { id: 'date', label: 'Date' },
  { id: 'conversation', label: 'Conversation' }
];

export interface SavedGroup { id: string; label: string; views: SavedView[] }

const BUCKET_LABELS: Record<SavedBucket, string> = { week: 'This week', month: 'This month', earlier: 'Earlier' };
export const UNAVAILABLE_LABEL = 'Conversation unavailable';

/** This week is the last seven days, this month the rest of the current calendar month. */
export function savedBucket(iso: string, now: Date): SavedBucket {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'earlier';
  if (now.getTime() - date.getTime() < 7 * 86_400_000) return 'week';
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() ? 'month' : 'earlier';
}

/** Where a message lives, for "Sara in #design-crit". */
export function savedPlace(view: SavedView, item: ConversationListItem | undefined): string {
  if (view.conversationUnavailable) return UNAVAILABLE_LABEL;
  if (!item) return UNAVAILABLE_LABEL;
  return item.conversation.kind === 'dm' ? `a direct message with ${item.title}` : mentionPlace(item);
}

function heading(view: SavedView, item: ConversationListItem | undefined): string {
  if (view.conversationUnavailable || !item) return UNAVAILABLE_LABEL;
  const kind = item.conversation.kind;
  return kind === 'channel' ? `#${item.title.replace(/^#/, '')}` : item.title;
}

/** Views arrive newest save first; both groupings keep that order inside each group. */
export function groupSaved(views: readonly SavedView[], mode: SavedMode, now: Date, places: ReadonlyMap<string, ConversationListItem>): SavedGroup[] {
  if (mode === 'date') {
    const buckets = new Map<SavedBucket, SavedView[]>();
    for (const view of views) {
      const bucket = savedBucket(view.savedAt, now);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), view]);
    }
    return (['week', 'month', 'earlier'] as const).flatMap((bucket) => buckets.has(bucket) ? [{ id: bucket, label: BUCKET_LABELS[bucket], views: buckets.get(bucket)! }] : []);
  }
  const groups = new Map<string, SavedGroup>();
  for (const view of views) {
    const id = view.conversationUnavailable ? 'unavailable' : view.message.conversationId;
    const group = groups.get(id) ?? { id, label: heading(view, places.get(view.message.conversationId)), views: [] };
    group.views.push(view);
    groups.set(id, group);
  }
  // Most recently saved conversation first; the unavailable group goes last.
  return [...groups.values()].sort((a, b) => (a.id === 'unavailable' ? 1 : 0) - (b.id === 'unavailable' ? 1 : 0));
}

/** "Saved today", "Saved yesterday", otherwise "Saved 3 Oct". */
export function savedTimeLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === now.toDateString()) return 'Saved today';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Saved yesterday';
  return `Saved ${date.getDate()} ${date.toLocaleDateString('en-GB', { month: 'short' })}`;
}
