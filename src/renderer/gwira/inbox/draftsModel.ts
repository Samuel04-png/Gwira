import type { ConversationListItem } from '../messaging/domain/selectors.js';
import type { Draft, FailureReason, Message } from '../messaging/domain/types.js';

export type DraftEntry =
  | { kind: 'draft'; key: string; at: string; draft: Draft }
  | { kind: 'failed'; key: string; at: string; message: Message };

export interface DraftGroup { id: 'failed' | 'drafts'; label: string; entries: DraftEntry[] }

export const FAILURE_LABELS: Record<FailureReason, string> = {
  storage_full: 'Not saved: this device is out of storage',
  storage_unavailable: 'Not saved: local storage was unavailable',
  validation: 'Not saved: the message could not be accepted'
};

export function failureLabel(reason: FailureReason | undefined): string {
  return reason ? FAILURE_LABELS[reason] : 'Not saved: the message could not be sent';
}

export function draftKey(draft: Pick<Draft, 'conversationId' | 'threadRootId'>): string {
  return `draft:${draft.conversationId}:${draft.threadRootId ?? ''}`;
}

/** Failed sends come first, then drafts by last edit; empty groups are omitted. */
export function buildDraftEntries(drafts: readonly Draft[], failed: readonly Message[]): DraftEntry[] {
  const failedEntries = failed.map((message): DraftEntry => ({ kind: 'failed', key: `failed:${message.id}`, at: message.createdAt, message }));
  const draftEntries = drafts.map((draft): DraftEntry => ({ kind: 'draft', key: draftKey(draft), at: draft.updatedAt, draft }));
  return [...failedEntries, ...draftEntries];
}

export function groupDraftEntries(entries: readonly DraftEntry[]): DraftGroup[] {
  const failed = entries.filter((entry) => entry.kind === 'failed');
  const drafts = entries.filter((entry) => entry.kind === 'draft');
  const groups: DraftGroup[] = [];
  if (failed.length) groups.push({ id: 'failed', label: 'Failed to send', entries: failed });
  if (drafts.length) groups.push({ id: 'drafts', label: 'Drafts', entries: drafts });
  return groups;
}

/** Where the draft will be sent: "# launch-planning", "Sara Parras", "Thread in #design-crit". */
export function draftDestination(item: ConversationListItem | undefined, inThread: boolean): string {
  if (!item) return inThread ? 'Thread' : 'Conversation';
  const name = item.conversation.kind === 'channel' ? item.title.replace(/^#\s*/, '') : item.title;
  if (!inThread) return name;
  return item.conversation.kind === 'channel' ? `Thread in #${item.title.replace(/^#\s*/, '')}` : `Thread in ${item.title}`;
}

/** "Edited 2h ago", "Edited yesterday", "Edited 3 Oct". */
export function editedLabel(iso: string, now: Date, verb = 'Edited'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return verb;
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return `${verb} just now`;
  if (minutes < 60) return `${verb} ${minutes}m ago`;
  if (minutes < 24 * 60 && date.toDateString() === now.toDateString()) return `${verb} ${Math.floor(minutes / 60)}h ago`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `${verb} yesterday`;
  return `${verb} ${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
}
