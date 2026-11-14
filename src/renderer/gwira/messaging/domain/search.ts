import { canReadConversation } from './authorize.js';
import { sameParticipant } from './ids.js';
import { localContextFor, participantView, selectConversationList } from './selectors.js';
import type { ConversationListItem, ParticipantView } from './selectors.js';
import { MAX_SEARCH_RESULTS } from './types.js';
import type { Id, Message, MessageType, MessagingScope, MessagingState, MessagingWork, ParticipantRef } from './types.js';

export interface SearchFilters {
  from?: ParticipantRef;
  inConversationId?: Id;
  type?: MessageType;
  hasThread?: boolean;
  hasTask?: boolean;
  hasAttachment?: boolean;
  saved?: boolean;
  unread?: boolean;
  doat?: boolean;
  /** Inclusive UTC timestamp boundary. */
  after?: string;
  /** Exclusive UTC timestamp boundary. */
  before?: string;
}

export interface SearchRange { start: number; end: number }
export interface SearchResult {
  message: Message;
  conversationId: Id;
  author: ParticipantView;
  /** Plain text excerpt (never HTML); ranges are offsets into `snippet`. */
  snippet: string;
  ranges: SearchRange[];
}

interface Folded { text: string; map: number[] }

/** Case/diacritic folding that keeps an index map back to the original UTF-16 offsets. */
function fold(value: string): Folded {
  let text = '';
  const map: number[] = [];
  let index = 0;
  for (const char of value) {
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let i = 0; i < folded.length; i += 1) map.push(index);
    text += folded;
    index += char.length;
  }
  map.push(index);
  return { text, map };
}

function tokens(query: string): string[] {
  return fold(query).text.split(/\s+/).filter(Boolean).slice(0, 8);
}

const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 160;

/**
 * Membership-aware search. Only conversations the actor can read are searched;
 * tombstones are excluded. Results: createdAt desc, seq desc, id; capped at 100.
 */
export function searchMessages(state: MessagingState, scope: MessagingScope, work: MessagingWork, query: string, filters: SearchFilters = {}, actorPersonId?: Id): SearchResult[] {
  const ctx = localContextFor(state, scope, work);
  const words = tokens(query);
  const hasFilter = Object.values(filters).some((value) => value !== undefined);
  if (!ctx || (!hasFilter && words.length === 0) || (actorPersonId !== undefined && actorPersonId !== ctx.actorPersonId)) return [];
  const actor = ctx.actorPersonId as Id;
  const readable = new Set(state.conversations.filter((conv) => canReadConversation(ctx, conv, state.memberships)).map((conv) => conv.id));
  const savedIds = filters.saved ? new Set(state.saved.filter((row) => row.actorPersonId === actor).map((row) => row.messageId)) : undefined;
  const readByConversation = new Map(state.readCursors.filter((row) => row.actorPersonId === actor).map((row) => [row.conversationId, row.lastReadSeq]));
  const after = filters.after ? Date.parse(filters.after) : undefined;
  const before = filters.before ? Date.parse(filters.before) : undefined;
  const results: SearchResult[] = [];
  for (const message of state.messages) {
    if (message.deletedAt || !readable.has(message.conversationId)) continue;
    if (filters.inConversationId && message.conversationId !== filters.inConversationId) continue;
    if (filters.type && message.type !== filters.type) continue;
    if (filters.from && !sameParticipant(message.author, filters.from)) continue;
    if (filters.hasThread !== undefined && ((message.replyCount ?? 0) > 0) !== filters.hasThread) continue;
    if (filters.hasTask !== undefined && message.refs.some((ref) => ref.kind === 'task') !== filters.hasTask) continue;
    if (filters.hasAttachment !== undefined && (message.attachments.length > 0) !== filters.hasAttachment) continue;
    if (savedIds && !savedIds.has(message.id)) continue;
    const isOwnHumanMessage = message.author.kind === 'human' && message.author.id === actor;
    const unread = message.seq > (readByConversation.get(message.conversationId) ?? 0) && !isOwnHumanMessage;
    if (filters.unread !== undefined && unread !== filters.unread) continue;
    if (filters.doat !== undefined && (message.author.kind === 'doat') !== filters.doat) continue;
    const createdAt = Date.parse(message.createdAt);
    if (after !== undefined && (!Number.isFinite(createdAt) || createdAt < after)) continue;
    if (before !== undefined && (!Number.isFinite(createdAt) || createdAt >= before)) continue;
    const folded = fold(message.body);
    const found: SearchRange[] = [];
    let allMatch = true;
    for (const word of words) {
      const at = folded.text.indexOf(word);
      if (at < 0) { allMatch = false; break; }
      found.push({ start: folded.map[at], end: folded.map[at + word.length] });
    }
    if (!allMatch) continue;
    // Filter-only searches have no matched range; show a safe leading excerpt.
    const first = found.length > 0 ? Math.min(...found.map((range) => range.start)) : 0;
    const from = Math.max(0, first - SNIPPET_BEFORE);
    const snippet = message.body.slice(from, from + SNIPPET_LENGTH);
    const ranges = found
      .map((range) => ({ start: range.start - from, end: Math.min(range.end - from, snippet.length) }))
      .filter((range) => range.start >= 0 && range.start < snippet.length && range.end > range.start)
      .sort((a, b) => a.start - b.start);
    results.push({ message, conversationId: message.conversationId, author: participantView(work, scope, message.author), snippet, ranges });
  }
  results.sort((a, b) => (a.message.createdAt < b.message.createdAt ? 1 : a.message.createdAt > b.message.createdAt ? -1 : 0) || b.message.seq - a.message.seq || (a.message.id < b.message.id ? -1 : 1));
  return results.slice(0, MAX_SEARCH_RESULTS);
}

/** Quick-switcher search over readable conversation titles and member names. */
export function searchConversations(state: MessagingState, scope: MessagingScope, work: MessagingWork, query: string): ConversationListItem[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  return selectConversationList(state, scope, work)
    .filter((item) => {
      const haystack = fold([item.title, item.conversation.topic ?? '', ...item.members.map((member) => member.name)].join(' ')).text;
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, MAX_SEARCH_RESULTS);
}
