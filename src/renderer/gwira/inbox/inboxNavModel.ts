import type { ConversationListItem, MessageView } from '../messaging/domain/selectors.js';
import type { ParticipantRef } from '../messaging/domain/types.js';
import type { InboxItem } from './inboxViewModel.js';

export const NEEDS_REVIEW_NAV_ID = 'needs-review';
/** Quick-access rows in display order; every one is a real, working view. */
export const NAV_QUICK_IDS = ['unread', 'threads', 'drafts', NEEDS_REVIEW_NAV_ID, 'mentions', 'saved'] as const;
export type InboxQuickDestination = typeof NAV_QUICK_IDS[number];
export type InboxDestination =
  | { kind: 'utility'; view: InboxQuickDestination }
  | { kind: 'conversation'; id: string };

export type NavSectionId = 'channels' | 'dm' | 'group' | 'doat';
export interface NavSection { id: NavSectionId; label: string; items: ConversationListItem[] }

const SECTION_ORDER: Array<{ id: NavSectionId; label: string }> = [
  { id: 'channels', label: 'Channels' },
  { id: 'group', label: 'Group chats' },
  { id: 'dm', label: 'Direct messages' },
  { id: 'doat', label: 'Daots' }
];

export function navSectionOf(item: ConversationListItem): NavSectionId {
  const { kind } = item.conversation;
  if (kind === 'channel') return 'channels';
  if (kind === 'group') return 'group';
  return item.hasDoatMember ? 'doat' : 'dm';
}

export const NAV_ADD_ACTIONS: Record<NavSectionId, { label: string; kind: 'channel' | 'group' | 'dm' }> = {
  channels: { label: 'Add channel', kind: 'channel' },
  dm: { label: 'New direct message', kind: 'dm' },
  group: { label: 'New group', kind: 'group' },
  doat: { label: 'Message a Doat', kind: 'dm' }
};

function fold(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Every whitespace-separated word must appear in the title, topic or a member name. */
export function filterConversations(items: readonly ConversationListItem[], query: string): ConversationListItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = fold([item.title, item.conversation.id, item.conversation.topic ?? '', ...item.members.map((member) => `${member.name} ${member.ref?.id ?? ''}`)].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

/** Archived conversations are hidden unless they are the selected one. Empty sections are omitted. */
export function groupConversations(items: readonly ConversationListItem[], selectedId?: string): NavSection[] {
  const visible = items.filter((item) => !item.conversation.archivedAt || item.conversation.id === selectedId);
  return SECTION_ORDER
    .map((section) => ({ id: section.id, label: section.label, items: visible.filter((item) => navSectionOf(item) === section.id) }))
    .filter((section) => section.items.length > 0);
}


/** Hold relative row order while interacting, but refresh records and append genuinely new ids. */
export function stableConversationOrder(items: readonly ConversationListItem[], previousIds: readonly string[], hold: boolean): ConversationListItem[] {
  if (!hold) return [...items];
  const byId = new Map(items.map((item) => [item.conversation.id, item]));
  const ordered: ConversationListItem[] = [];
  for (const id of previousIds) {
    const item = byId.get(id);
    if (item) { ordered.push(item); byId.delete(id); }
  }
  for (const item of items) {
    if (byId.has(item.conversation.id)) { ordered.push(item); byId.delete(item.conversation.id); }
  }
  return ordered;
}

/** Utilities and section controls take part in the same visible roving sequence. */
export function visibleNavTargetIds(sections: readonly NavSection[], collapsed: ReadonlySet<string>, utilities: boolean, addActions = false, pinned: ReadonlySet<string> = new Set()): string[] {
  return [...(utilities ? [...NAV_QUICK_IDS] : [NEEDS_REVIEW_NAV_ID]), ...sections.flatMap((section) => [
    `section:${section.id}`,
    ...(collapsed.has(section.id)
      ? section.items.filter((item) => pinned.has(item.conversation.id)).map((item) => item.conversation.id)
      : [...section.items.map((item) => item.conversation.id), ...(addActions ? [`add:${section.id}`] : [])])
  ])];
}

/** Order used by J/K navigation: utility destinations first, then conversations by section. */
export function navTargetIds(sections: readonly NavSection[]): string[] {
  return [...NAV_QUICK_IDS, ...sections.flatMap((section) => section.items.map((item) => item.conversation.id))];
}

export function resolveDestination(destination: InboxDestination, conversations: readonly ConversationListItem[]): InboxDestination {
  if (destination.kind === 'utility') return destination;
  return conversations.some((item) => item.conversation.id === destination.id)
    ? destination
    : { kind: 'utility', view: NEEDS_REVIEW_NAV_ID };
}

/** J/K navigation uses the same destination model as pointer and button navigation. */
export function stepDestination(targets: readonly string[], current: InboxDestination, key: 'j' | 'k'): InboxDestination | undefined {
  const currentId = current.kind === 'utility' ? current.view : current.id;
  const index = targets.indexOf(currentId);
  const next = moveNavIndex(index < 0 ? 0 : index, targets.length, key === 'j' ? 'ArrowDown' : 'ArrowUp');
  const id = targets[next];
  if (id === undefined || id === currentId) return undefined;
  const view = NAV_QUICK_IDS.find((candidate) => candidate === id);
  return view ? { kind: 'utility', view } : { kind: 'conversation', id };
}

export function moveNavIndex(current: number, count: number, key: string): number {
  if (count <= 0) return -1;
  if (key === 'ArrowDown') return Math.min(count - 1, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}

export function unreadBadgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function conversationKindLabel(kind: 'dm' | 'group' | 'channel', visibility: 'private' | 'org'): string {
  if (kind === 'dm') return 'Direct message';
  if (kind === 'group') return 'Group';
  return visibility === 'private' ? 'Private channel' : 'Channel';
}

export function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'member' : 'members'}`;
}

export type FeedRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'unread'; key: string }
  | { kind: 'group'; key: string; author: ParticipantRef; messages: MessageView[] };

export const DEFAULT_GROUP_WINDOW_MS = 5 * 60_000;

export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const startOf = (value: Date): number => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function formatTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function sameAuthor(left: ParticipantRef, right: ParticipantRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/** Only plain text from one author inside the time window collapses into a group; events/system rows stand alone. */
export function buildFeedRows(messages: readonly MessageView[], newMessagesFromSeq?: number, windowMs = DEFAULT_GROUP_WINDOW_MS): FeedRow[] {
  const rows: FeedRow[] = [];
  let currentDay = '';
  let open: Extract<FeedRow, { kind: 'group' }> | undefined;
  let lastAt = 0;
  for (const view of messages) {
    const { message } = view;
    const day = localDayKey(message.createdAt);
    if (day !== currentDay) {
      currentDay = day;
      rows.push({ kind: 'day', key: `day:${day}`, label: formatDayLabel(message.createdAt) });
      open = undefined;
    }
    if (newMessagesFromSeq !== undefined && message.seq === newMessagesFromSeq) {
      rows.push({ kind: 'unread', key: `unread:${message.seq}` });
      open = undefined;
    }
    const at = Date.parse(message.createdAt);
    const groupable = message.type === 'text' && !view.isDeleted;
    const canJoin = open && groupable && open.messages.every((item) => item.message.type === 'text' && !item.isDeleted)
      && sameAuthor(open.author, message.author) && Number.isFinite(at) && at - lastAt >= 0 && at - lastAt <= windowMs;
    if (open && canJoin) {
      open.messages.push(view);
    } else {
      open = { kind: 'group', key: `group:${message.id}`, author: message.author, messages: [view] };
      rows.push(open);
    }
    lastAt = at;
    if (!groupable) open = undefined;
  }
  return rows;
}

export function sendStateLabel(view: Pick<MessageView, 'message'>): { label: string; failed: boolean } | undefined {
  if (view.message.sendState === 'failed') return { label: 'Failed — Retry', failed: true };
  if (view.message.sendState === 'local_saved') return { label: 'Saved locally', failed: false };
  if (view.message.sendState === 'server_saved') return { label: 'Sent', failed: false };
  return undefined;
}

export function avatarInitials(name: string): string {
  const parts = name.replace(/^#/, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = Array.from(parts[0]!)[0] ?? '?';
  const second = parts.length > 1 ? Array.from(parts[parts.length - 1]!)[0] ?? '' : '';
  return (first + second).toUpperCase();
}

/** Threshold in px from the bottom within which the reader counts as "following" the feed. */
export const STICK_TO_BOTTOM_PX = 48;

export function isNearBottom(scrollHeight: number, scrollTop: number, clientHeight: number, threshold = STICK_TO_BOTTOM_PX): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export function isActivityItemOpenable(item: InboxItem, taskIds: ReadonlySet<string>): boolean {
  return item.taskId !== undefined && taskIds.has(item.taskId);
}

export function activityEventLabel(kind: string): string {
  return kind.replaceAll('_', ' ');
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = element?.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element?.isContentEditable === true;
}

/** "Pending approvals" first, then "Recent activity"; each group keeps the incoming (newest-first) order. */
export function groupActivityItems(items: readonly InboxItem[]): { approvals: InboxItem[]; activity: InboxItem[] } {
  return { approvals: items.filter((item) => item.kind === 'approval'), activity: items.filter((item) => item.kind !== 'approval') };
}

export interface ParsedMessageQuery {
  text: string;
  from?: string;
  inConversation?: string;
  hasThread?: boolean;
  hasTask?: boolean;
  hasAttachment?: boolean;
  saved?: boolean;
  unread?: boolean;
  doat?: boolean;
  /** Date-only terms are converted by the search adapter into UTC boundaries. */
  before?: string;
  after?: string;
  on?: string;
  /** Operators that are not supported are ignored and explained to the user. */
  ignored: string[];
}

/**
 * Supports from:, in:, has:thread|task|file, is:saved|unread|doat and UTC date-only before:/after:/on:.
 * Values may be quoted. Anything else that looks like an operator is reported in `ignored` and not searched as text.
 */
export function parseMessageQuery(raw: string): ParsedMessageQuery {
  const parsed: ParsedMessageQuery = { text: '', ignored: [] };
  const rest: string[] = [];
  const pattern = /(\w+):("[^"]*"|\S*)|("[^"]*"|\S+)/g;
  for (const match of raw.matchAll(pattern)) {
    if (match[3] !== undefined) { rest.push(match[3].replace(/^"|"$/g, '')); continue; }
    const key = match[1]!.toLowerCase();
    const value = match[2]!.replace(/^"|"$/g, '').trim();
    if (key === 'from' && value) parsed.from = value;
    else if (key === 'in' && value) parsed.inConversation = value.replace(/^#/, '');
    else if ((key === 'has' && value.toLowerCase() === 'thread')) parsed.hasThread = true;
    else if (key === 'has' && value.toLowerCase() === 'task') parsed.hasTask = true;
    else if (key === 'has' && value.toLowerCase() === 'file') parsed.hasAttachment = true;
    else if ((key === 'has' || key === 'is') && value.toLowerCase() === 'saved') parsed.saved = true;
    else if (key === 'is' && value.toLowerCase() === 'unread') parsed.unread = true;
    else if (key === 'is' && value.toLowerCase() === 'doat') parsed.doat = true;
    else if (key === 'before' && value) parsed.before = value;
    else if (key === 'after' && value) parsed.after = value;
    else if (key === 'on' && value) parsed.on = value;
    else if (['from', 'in', 'has', 'is', 'before', 'after', 'on', 'during'].includes(key)) parsed.ignored.push(`${key}:${value}`);
    else rest.push(match[0]);
  }
  parsed.text = rest.join(' ');
  return parsed;
}

export type HighlightSegment = { text: string; match: boolean };

/** Splits a snippet into plain segments so results can be rendered without innerHTML. */
export function highlightSegments(snippet: string, ranges: readonly { start: number; end: number }[]): HighlightSegment[] {
  const out: HighlightSegment[] = [];
  let at = 0;
  for (const range of ranges) {
    const start = Math.max(at, range.start);
    const end = Math.min(snippet.length, range.end);
    if (end <= start) continue;
    if (start > at) out.push({ text: snippet.slice(at, start), match: false });
    out.push({ text: snippet.slice(start, end), match: true });
    at = end;
  }
  if (at < snippet.length) out.push({ text: snippet.slice(at), match: false });
  return out;
}
