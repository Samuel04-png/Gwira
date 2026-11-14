import type { ConversationListItem, MessageView } from '../messaging/domain/selectors.js';

export type MentionFilter = 'unread' | 'all';
export type MentionBucket = 'today' | 'yesterday' | 'earlier';

export const MENTION_FILTERS: readonly { id: MentionFilter; label: string }[] = [
  { id: 'unread', label: 'Unread' },
  { id: 'all', label: 'All' }
];

const BUCKET_LABEL: Record<MentionBucket, string> = { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' };

export interface MentionGroup { id: MentionBucket; label: string; views: MessageView[] }

/** Calendar-day bucket in the viewer's local time. Future-dated messages count as today. */
export function mentionBucket(iso: string, now: Date): MentionBucket {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'earlier';
  const startOf = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : 'earlier';
}

export function filterMentions(views: readonly MessageView[], filter: MentionFilter): MessageView[] {
  return filter === 'unread' ? views.filter((view) => view.unread) : [...views];
}

/** Groups newest-first views into Today, Yesterday and Earlier; empty groups are omitted. */
export function groupMentions(views: readonly MessageView[], now: Date): MentionGroup[] {
  const buckets: Record<MentionBucket, MessageView[]> = { today: [], yesterday: [], earlier: [] };
  for (const view of views) buckets[mentionBucket(view.message.createdAt, now)].push(view);
  return (['today', 'yesterday', 'earlier'] as const).filter((id) => buckets[id].length > 0).map((id) => ({ id, label: BUCKET_LABEL[id], views: buckets[id] }));
}

export function mentionUnreadCount(views: readonly MessageView[]): number {
  return views.reduce((sum, view) => sum + (view.unread ? 1 : 0), 0);
}

/** Where a mention happened, phrased for "X mentioned you in …". */
export function mentionPlace(item: ConversationListItem | undefined): string {
  if (!item) return 'a conversation';
  const kind = item.conversation.kind;
  if (kind === 'channel') return `#${item.title.replace(/^#/, '')}`;
  if (kind === 'dm') return 'a direct message';
  return item.title;
}

/** Short time on the right of a row: relative today, clock time yesterday, date earlier. */
export function mentionTimeLabel(iso: string, now: Date, relative: (iso: string, now: Date) => string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const bucket = mentionBucket(iso, now);
  if (bucket === 'yesterday') return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return relative(iso, now);
}
