import { searchMessages, type SearchFilters, type SearchResult } from '../messaging/domain/search.js';
import type { ConversationListItem, ParticipantView } from '../messaging/domain/selectors.js';
import type { MessagingScope, MessagingState, MessagingWork } from '../messaging/domain/types.js';
import { parseMessageQuery } from './inboxNavModel.js';

export interface MessageSearchOutcome {
  results: Array<SearchResult & { conversationTitle: string }>;
  /** Human-readable notes: unsupported operators and unresolved from:/in: values. */
  notes: string[];
  /** True when the query has searchable text or a supported filter. */
  active: boolean;
}

const fold = (value: string): string => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const byName = <T,>(items: readonly T[], name: (item: T) => string, wanted: string): T | undefined => {
  const needle = fold(wanted);
  return items.find((item) => fold(name(item)) === needle) ?? items.find((item) => fold(name(item)).includes(needle));
};

/** A date-only filter is interpreted as a UTC calendar day to keep local search deterministic. */
function dateStart(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date.toISOString();
}

function nextDateStart(value: string): string | undefined {
  const start = dateStart(value);
  if (!start) return undefined;
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function runMessageSearch(
  state: MessagingState, scope: MessagingScope, work: MessagingWork, raw: string,
  conversations: readonly ConversationListItem[], participants: readonly ParticipantView[]
): MessageSearchOutcome {
  const parsed = parseMessageQuery(raw);
  const notes = parsed.ignored.map((operator) => `"${operator}" is not supported and was ignored.`);
  let hasInvalidDate = false;
  const filters: SearchFilters = {};
  if (parsed.from) {
    const person = byName(participants, (item) => item.name, parsed.from);
    if (!person) return { results: [], notes: [...notes, `No person matches "from:${parsed.from}".`], active: true };
    filters.from = person.ref;
  }
  if (parsed.inConversation) {
    const conversation = conversations.find((item) => item.conversation.id === parsed.inConversation)
      ?? byName(conversations, (item) => item.title, parsed.inConversation);
    if (!conversation) return { results: [], notes: [...notes, `No conversation matches "in:${parsed.inConversation}".`], active: true };
    filters.inConversationId = conversation.conversation.id;
  }
  if (parsed.hasThread) filters.hasThread = true;
  if (parsed.hasTask) filters.hasTask = true;
  if (parsed.hasAttachment) filters.hasAttachment = true;
  if (parsed.saved) filters.saved = true;
  if (parsed.unread) filters.unread = true;
  if (parsed.doat) filters.doat = true;
  if (parsed.after) {
    const after = nextDateStart(parsed.after);
    if (!after) { notes.push(`"after:${parsed.after}" needs a YYYY-MM-DD date.`); hasInvalidDate = true; }
    else { filters.after = after; notes.push('Date filters use UTC calendar days.'); }
  }
  if (parsed.before) {
    const before = dateStart(parsed.before);
    if (!before) { notes.push(`"before:${parsed.before}" needs a YYYY-MM-DD date.`); hasInvalidDate = true; }
    else { filters.before = before; notes.push('Date filters use UTC calendar days.'); }
  }
  if (parsed.on) {
    const start = dateStart(parsed.on);
    const end = nextDateStart(parsed.on);
    if (!start || !end) { notes.push(`"on:${parsed.on}" needs a YYYY-MM-DD date.`); hasInvalidDate = true; }
    else { filters.after = start; filters.before = end; notes.push('Date filters use UTC calendar days.'); }
  }
  if (hasInvalidDate) return { results: [], notes, active: true };
  if (!parsed.text.trim() && Object.keys(filters).length === 0) {
    if (raw.trim() && notes.length === 0) notes.push('Add words or a supported filter to search messages.');
    return { results: [], notes, active: false };
  }
  const titles = new Map(conversations.map((item) => [item.conversation.id, item.title]));
  const results = searchMessages(state, scope, work, parsed.text, filters)
    .map((result) => ({ ...result, conversationTitle: titles.get(result.conversationId) ?? 'Conversation' }));
  return { results, notes, active: true };
}
