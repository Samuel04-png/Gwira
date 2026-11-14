import { isClientId, isLocalId, dmKeyFor, participantKey } from './ids.js';
import { createLocalContext, resolveEntityRef } from './authorize.js';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_BODY, MAX_CONVERSATIONS, MAX_DRAFTS, MAX_MEMBERS, MAX_MENTIONS, MAX_NAME, MAX_REFS, MAX_TOPIC, MESSAGING_SCHEMA_VERSION, REACTION_EMOJI, SYSTEM_PARTICIPANT_ID } from './types.js';
import type { AttachmentRef, Conversation, Draft, EntityRef, FailureReason, MemberRole, Membership, Mention, Message, MessageType, MessagingScope, MessagingState, MessagingWork, ParticipantRef, Reaction, ReadCursor, SavedMessage } from './types.js';

/** Input size guard so a hostile payload cannot make load unbounded. */
export const MAX_RAW_PAYLOAD_CHARS = 8 * 1024 * 1024;

function rec(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function date(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}
function optDate(value: unknown): value is string | undefined { return value === undefined || date(value); }

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Plain text only: normalises newlines and strips control characters. Never HTML. */
export function normalizeBody(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(CONTROL, '');
}

export function sanitizeLabel(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Attachment names: strip path separators and control characters. */
export function sanitizeFileName(value: string): string {
  return sanitizeLabel(value.replace(/[\\/]/g, ' '), 200);
}

export function parseParticipant(value: unknown): ParticipantRef | undefined {
  const item = rec(value);
  if (!item || !isLocalId(item.id)) return undefined;
  if (item.kind === 'human' || item.kind === 'doat') return { kind: item.kind, id: item.id };
  if (item.kind === 'system' && item.id === SYSTEM_PARTICIPANT_ID) return { kind: 'system', id: item.id };
  return undefined;
}

export function parseEntityRef(value: unknown): EntityRef | undefined {
  const item = rec(value);
  if (!item) return undefined;
  if (item.kind === 'task' && isLocalId(item.taskId)) return { kind: 'task', taskId: item.taskId };
  if (item.kind === 'approval' && isLocalId(item.approvalId)) return { kind: 'approval', approvalId: item.approvalId };
  if (item.kind === 'activity' && isLocalId(item.activityId)) return { kind: 'activity', activityId: item.activityId };
  if (item.kind === 'doat_run' && isLocalId(item.doatId) && typeof item.runId === 'string' && item.runId.length > 0 && item.runId.length <= 200) return { kind: 'doat_run', doatId: item.doatId, runId: item.runId };
  return undefined;
}

export function parseAttachment(value: unknown): AttachmentRef | undefined {
  const item = rec(value);
  if (!item || !isLocalId(item.id) || typeof item.name !== 'string' || typeof item.mimeType !== 'string') return undefined;
  const name = sanitizeFileName(item.name);
  if (!name || !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,100}$/i.test(item.mimeType)) return undefined;
  if (typeof item.sizeBytes !== 'number' || !Number.isInteger(item.sizeBytes) || item.sizeBytes < 0 || item.sizeBytes > MAX_ATTACHMENT_BYTES) return undefined;
  return { id: item.id, name, mimeType: item.mimeType, sizeBytes: item.sizeBytes, status: 'metadata_only' };
}

export function parseMentions(value: unknown, bodyLength: number): Mention[] {
  if (!Array.isArray(value)) return [];
  const result: Mention[] = [];
  for (const raw of value.slice(0, MAX_MENTIONS)) {
    const item = rec(raw);
    const participant = item ? parseParticipant(item.participant) : undefined;
    if (!item || !participant || participant.kind === 'system') continue;
    if (typeof item.start !== 'number' || typeof item.end !== 'number' || !Number.isInteger(item.start) || !Number.isInteger(item.end)) continue;
    if (item.start < 0 || item.end <= item.start || item.end > bodyLength) continue;
    result.push({ participant, start: item.start, end: item.end });
  }
  return result;
}

const MEMBER_ROLES: readonly MemberRole[] = ['owner', 'admin', 'member', 'guest'];
const MESSAGE_TYPES: readonly MessageType[] = ['text', 'system', 'approval_event', 'task_event', 'doat_run_event'];
const FAILURES: readonly FailureReason[] = ['storage_full', 'storage_unavailable', 'validation'];

function parseConversation(value: unknown, scope: MessagingScope): Conversation | undefined {
  const item = rec(value);
  if (!item || !isLocalId(item.id) || item.organizationId !== scope.organizationId || item.workspaceId !== scope.workspaceId) return undefined;
  if (item.kind !== 'dm' && item.kind !== 'group' && item.kind !== 'channel') return undefined;
  if (item.visibility !== 'private' && item.visibility !== 'org') return undefined;
  if (item.kind !== 'channel' && item.visibility !== 'private') return undefined;
  const createdBy = parseParticipant(item.createdBy);
  if (!createdBy || !date(item.createdAt) || !optDate(item.archivedAt) || !optDate(item.lastMessageAt)) return undefined;
  const name = typeof item.name === 'string' ? sanitizeLabel(item.name, MAX_NAME) : undefined;
  if (item.kind !== 'dm' && !name) return undefined;
  const topic = typeof item.topic === 'string' ? sanitizeLabel(item.topic, MAX_TOPIC) : undefined;
  const lastMessageSeq = typeof item.lastMessageSeq === 'number' && Number.isInteger(item.lastMessageSeq) && item.lastMessageSeq >= 0 ? item.lastMessageSeq : 0;
  return {
    id: item.id, organizationId: scope.organizationId, workspaceId: scope.workspaceId, kind: item.kind,
    ...(item.kind === 'dm' ? {} : { name }),
    ...(topic ? { topic } : {}),
    visibility: item.visibility,
    ...(item.kind === 'dm' && typeof item.dmKey === 'string' ? { dmKey: item.dmKey } : {}),
    ...(isLocalId(item.linkedTaskId) ? { linkedTaskId: item.linkedTaskId } : {}),
    ...(isLocalId(item.linkedProjectId) ? { linkedProjectId: item.linkedProjectId } : {}),
    createdAt: item.createdAt, createdBy,
    ...(typeof item.archivedAt === 'string' ? { archivedAt: item.archivedAt } : {}),
    ...(typeof item.lastMessageAt === 'string' ? { lastMessageAt: item.lastMessageAt } : {}),
    lastMessageSeq
  };
}

function parseMembership(value: unknown): Membership | undefined {
  const item = rec(value);
  const participant = item ? parseParticipant(item.participant) : undefined;
  if (!item || !participant || !isLocalId(item.conversationId) || !MEMBER_ROLES.includes(item.role as MemberRole) || !date(item.joinedAt) || !optDate(item.leftAt)) return undefined;
  return {
    conversationId: item.conversationId, participant, role: item.role as MemberRole, joinedAt: item.joinedAt,
    ...(typeof item.leftAt === 'string' ? { leftAt: item.leftAt } : {}),
    ...(item.muted === true ? { muted: true } : {})
  };
}

function parseMessage(value: unknown, scope: MessagingScope): Message | undefined {
  const item = rec(value);
  if (!item || !isLocalId(item.id) || !isClientId(item.clientId) || !isLocalId(item.conversationId)) return undefined;
  if (item.organizationId !== scope.organizationId || item.workspaceId !== scope.workspaceId) return undefined;
  if (typeof item.seq !== 'number' || !Number.isInteger(item.seq) || item.seq < 1) return undefined;
  const author = parseParticipant(item.author);
  if (!author || !MESSAGE_TYPES.includes(item.type as MessageType) || typeof item.body !== 'string' || item.body.length > MAX_BODY) return undefined;
  if (!date(item.createdAt) || !optDate(item.editedAt) || !optDate(item.deletedAt)) return undefined;
  if (item.sendState !== 'local_saved' && item.sendState !== 'failed') return undefined;
  if (item.threadRootId !== undefined && !isLocalId(item.threadRootId)) return undefined;
  const type = item.type as MessageType;
  // Local mode has no verified Doat message source; Doat-authored records are never accepted.
  if (author.kind === 'doat') return undefined;
  const body = normalizeBody(item.body);
  const refs = (Array.isArray(item.refs) ? item.refs : []).slice(0, MAX_REFS).map(parseEntityRef).filter((ref): ref is EntityRef => !!ref);
  const attachments = (Array.isArray(item.attachments) ? item.attachments : []).slice(0, MAX_ATTACHMENTS).map(parseAttachment).filter((a): a is AttachmentRef => !!a);
  if (type === 'text' ? author.kind !== 'human' : author.kind !== 'system' || refs.length === 0) return undefined;
  const deleted = typeof item.deletedAt === 'string';
  if (!deleted && type === 'text' && body.trim().length === 0 && attachments.length === 0 && refs.length === 0) return undefined;
  const failureReason = FAILURES.includes(item.failureReason as FailureReason) && item.sendState === 'failed' ? item.failureReason as FailureReason : undefined;
  return {
    id: item.id, clientId: item.clientId, conversationId: item.conversationId, organizationId: scope.organizationId, workspaceId: scope.workspaceId,
    seq: item.seq, author, type, body: deleted ? '' : body, createdAt: item.createdAt,
    ...(typeof item.editedAt === 'string' ? { editedAt: item.editedAt } : {}),
    ...(deleted ? { deletedAt: item.deletedAt as string } : {}),
    ...(typeof item.threadRootId === 'string' ? { threadRootId: item.threadRootId } : {}),
    ...(typeof item.replyCount === 'number' ? { replyCount: item.replyCount } : {}),
    ...(typeof item.lastReplyAt === 'string' && date(item.lastReplyAt) ? { lastReplyAt: item.lastReplyAt } : {}),
    mentions: deleted ? [] : parseMentions(item.mentions, body.length),
    attachments: deleted ? [] : attachments,
    refs: deleted ? [] : refs,
    sendState: item.sendState,
    ...(failureReason ? { failureReason } : {})
  };
}

/** Recomputes denormalised sequence/time/reply data from the message list. */
export function recomputeDerived(state: MessagingState): MessagingState {
  const bySeq = (a: Message, b: Message) => a.seq - b.seq;
  const byConversation = new Map<string, Message[]>();
  for (const message of state.messages) {
    const list = byConversation.get(message.conversationId);
    if (list) list.push(message); else byConversation.set(message.conversationId, [message]);
  }
  const replies = new Map<string, Message[]>();
  for (const message of state.messages) {
    if (message.threadRootId && !message.deletedAt) {
      const list = replies.get(message.threadRootId);
      if (list) list.push(message); else replies.set(message.threadRootId, [message]);
    }
  }
  const messages = state.messages.map((message) => {
    const { replyCount: _count, lastReplyAt: _last, ...rest } = message;
    const list = replies.get(message.id);
    if (!list || list.length === 0 || message.threadRootId) return rest;
    return { ...rest, replyCount: list.length, lastReplyAt: [...list].sort(bySeq)[list.length - 1].createdAt };
  });
  const conversations = state.conversations.map((conv) => {
    const { lastMessageSeq, lastMessageAt, ...rest } = conv;
    const list = byConversation.get(conv.id);
    if (!list || list.length === 0) return { ...rest, lastMessageSeq, ...(lastMessageAt ? { lastMessageAt } : {}) };
    const newest = [...list].sort(bySeq)[list.length - 1];
    return { ...rest, lastMessageSeq: Math.max(lastMessageSeq, newest.seq), lastMessageAt: newest.createdAt };
  });
  return { ...state, messages, conversations };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Stable ordering so serialization never depends on insertion order. */
export function canonicalizeState(state: MessagingState): MessagingState {
  return {
    ...state,
    conversations: [...state.conversations].sort((a, b) => cmp(a.id, b.id)),
    memberships: [...state.memberships].sort((a, b) => cmp(a.conversationId, b.conversationId) || cmp(participantKey(a.participant), participantKey(b.participant))),
    messages: [...state.messages].sort((a, b) => cmp(a.conversationId, b.conversationId) || a.seq - b.seq || cmp(a.id, b.id)),
    reactions: [...state.reactions].sort((a, b) => cmp(a.messageId, b.messageId) || cmp(a.emoji, b.emoji) || cmp(a.actorPersonId, b.actorPersonId)),
    saved: [...state.saved].sort((a, b) => cmp(a.messageId, b.messageId) || cmp(a.actorPersonId, b.actorPersonId)),
    readCursors: [...state.readCursors].sort((a, b) => cmp(a.conversationId, b.conversationId) || cmp(a.actorPersonId, b.actorPersonId)),
    drafts: [...state.drafts].sort((a, b) => cmp(a.conversationId, b.conversationId) || cmp(a.threadRootId ?? '', b.threadRootId ?? '') || cmp(a.actorPersonId, b.actorPersonId))
  };
}

export type SanitizeResult =
  | { status: 'ok'; state: MessagingState; repairs: number; issues: string[] }
  | { status: 'scope_mismatch' }
  | { status: 'invalid'; issue: string };

/**
 * Builds a fresh, bounded state from untrusted input: unknown fields are dropped,
 * malformed records are removed, and denormalised data is recomputed. Irreparable
 * structure or a different organization/workspace is reported, never hydrated.
 */
export function sanitizeMessagingState(raw: unknown, scope: MessagingScope, work?: MessagingWork): SanitizeResult {
  const item = rec(raw);
  if (!item || item.schemaVersion !== MESSAGING_SCHEMA_VERSION) return { status: 'invalid', issue: 'unsupported schema' };
  if (item.organizationId !== scope.organizationId || item.workspaceId !== scope.workspaceId) return { status: 'scope_mismatch' };
  for (const key of ['conversations', 'memberships', 'messages', 'reactions', 'saved', 'readCursors', 'drafts'] as const) {
    if (!Array.isArray(item[key])) return { status: 'invalid', issue: `${key} is not an array` };
  }
  const issues: string[] = [];
  let repairs = 0;
  const repair = (issue: string) => { repairs += 1; if (issues.length < 20) issues.push(issue); };
  const list = (key: string) => item[key] as unknown[];

  // Conversations and memberships.
  const members = new Map<string, Membership[]>();
  const seenMembers = new Set<string>();
  for (const value of list('memberships')) {
    const membership = parseMembership(value);
    const key = membership ? `${membership.conversationId}\n${participantKey(membership.participant)}` : '';
    if (!membership || seenMembers.has(key)) { repair('invalid or duplicate membership'); continue; }
    seenMembers.add(key);
    const group = members.get(membership.conversationId);
    if (group) { if (group.length < MAX_MEMBERS) group.push(membership); else repair('too many members'); } else members.set(membership.conversationId, [membership]);
  }
  const conversations: Conversation[] = [];
  const seenConversations = new Set<string>();
  const seenDm = new Set<string>();
  for (const value of list('conversations')) {
    const parsed = parseConversation(value, scope);
    if (!parsed || seenConversations.has(parsed.id)) { repair('invalid or duplicate conversation'); continue; }
    let conv = parsed;
    if (conv.kind === 'dm') {
      const rows = members.get(conv.id) ?? [];
      if (rows.length !== 2 || rows.some((row) => row.participant.kind === 'system')) { repair('dm without exactly two members'); continue; }
      const dmKey = dmKeyFor(rows[0].participant, rows[1].participant);
      if (seenDm.has(dmKey) || rows[0].participant.id === rows[1].participant.id && rows[0].participant.kind === rows[1].participant.kind) { repair('duplicate dm'); continue; }
      seenDm.add(dmKey);
      if (conv.dmKey !== dmKey) repair('dm key recomputed');
      conv = { ...conv, dmKey };
    }
    seenConversations.add(conv.id);
    conversations.push(conv);
  }
  const keptConversations = [...conversations]
    .sort((a, b) => cmp(b.lastMessageAt ?? b.createdAt, a.lastMessageAt ?? a.createdAt) || cmp(a.id, b.id))
    .slice(0, MAX_CONVERSATIONS);
  if (keptConversations.length < conversations.length) repair('too many conversations');
  const conversationIds = new Set(keptConversations.map((conv) => conv.id));
  const memberships = [...members.values()].flat().filter((membership) => {
    const keep = conversationIds.has(membership.conversationId);
    if (!keep) repair('orphan membership');
    return keep;
  });

  // Messages.
  const currentPeople = work ? new Set(work.people.filter((person) => person.workspaceId === scope.workspaceId).map((person) => person.id)) : undefined;
  const parsedMessages: Message[] = [];
  const seenIds = new Set<string>();
  const seenClient = new Set<string>();
  for (const value of list('messages')) {
    const message = parseMessage(value, scope);
    if (!message || !conversationIds.has(message.conversationId)) { repair('invalid or orphan message'); continue; }
    if (message.author.kind === 'human' && currentPeople && !currentPeople.has(message.author.id)) { repair('message author is not a current-workspace person'); continue; }
    const clientKey = `${message.conversationId}\n${message.clientId}`;
    if (seenIds.has(message.id) || seenClient.has(clientKey)) { repair('duplicate message'); continue; }
    seenIds.add(message.id);
    seenClient.add(clientKey);
    parsedMessages.push(message);
  }
  // Unique sequence per conversation: later duplicates move to the end.
  const maxSeq = new Map<string, number>();
  for (const conv of keptConversations) maxSeq.set(conv.id, conv.lastMessageSeq);
  for (const message of parsedMessages) maxSeq.set(message.conversationId, Math.max(maxSeq.get(message.conversationId) ?? 0, message.seq));
  const usedSeq = new Set<string>();
  const ordered = [...parsedMessages].sort((a, b) => cmp(a.conversationId, b.conversationId) || a.seq - b.seq || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id));
  const sequenced = ordered.map((message) => {
    const key = `${message.conversationId}\n${message.seq}`;
    if (!usedSeq.has(key)) { usedSeq.add(key); return message; }
    const next = (maxSeq.get(message.conversationId) ?? 0) + 1;
    maxSeq.set(message.conversationId, next);
    usedSeq.add(`${message.conversationId}\n${next}`);
    repair('duplicate sequence renumbered');
    return { ...message, seq: next };
  });
  const rootIds = new Map(sequenced.filter((message) => !message.threadRootId).map((message) => [message.id, message.conversationId]));
  const messages = sequenced.filter((message) => {
    if (!message.threadRootId) return true;
    const ok = rootIds.get(message.threadRootId) === message.conversationId;
    if (!ok) repair('reply without a valid same-conversation root');
    return ok;
  });
  const messageById = new Map(messages.map((message) => [message.id, message]));

  const reactions: Reaction[] = [];
  const seenReactions = new Set<string>();
  for (const value of list('reactions')) {
    const row = rec(value);
    const key = row ? `${String(row.messageId)}\n${String(row.emoji)}\n${String(row.actorPersonId)}` : '';
    if (!row || !isLocalId(row.messageId) || !isLocalId(row.actorPersonId) || !date(row.at) || !REACTION_EMOJI.includes(row.emoji as typeof REACTION_EMOJI[number]) || !messageById.has(row.messageId) || messageById.get(row.messageId)?.deletedAt || seenReactions.has(key)) { repair('invalid reaction'); continue; }
    seenReactions.add(key);
    reactions.push({ messageId: row.messageId, emoji: row.emoji as string, actorPersonId: row.actorPersonId, at: row.at });
  }
  const saved: SavedMessage[] = [];
  const seenSaved = new Set<string>();
  for (const value of list('saved')) {
    const row = rec(value);
    const target = row && isLocalId(row.messageId) ? messageById.get(row.messageId) : undefined;
    const key = row ? `${String(row.messageId)}\n${String(row.actorPersonId)}` : '';
    if (!row || !target || target.deletedAt || row.conversationId !== target.conversationId || !isLocalId(row.actorPersonId) || !date(row.savedAt) || seenSaved.has(key)) { repair('invalid saved message'); continue; }
    seenSaved.add(key);
    saved.push({ messageId: target.id, conversationId: target.conversationId, actorPersonId: row.actorPersonId, savedAt: row.savedAt });
  }
  const lastSeq = new Map(keptConversations.map((conv) => [conv.id, Math.max(conv.lastMessageSeq, maxSeq.get(conv.id) ?? 0)]));
  const readCursors: ReadCursor[] = [];
  const seenCursor = new Set<string>();
  for (const value of list('readCursors')) {
    const row = rec(value);
    const key = row ? `${String(row.conversationId)}\n${String(row.actorPersonId)}` : '';
    if (!row || !isLocalId(row.conversationId) || !lastSeq.has(row.conversationId) || !isLocalId(row.actorPersonId) || typeof row.lastReadSeq !== 'number' || !Number.isInteger(row.lastReadSeq) || row.lastReadSeq < 0 || !date(row.updatedAt) || seenCursor.has(key)) { repair('invalid read cursor'); continue; }
    seenCursor.add(key);
    const clamped = Math.min(row.lastReadSeq, lastSeq.get(row.conversationId) ?? 0);
    if (clamped !== row.lastReadSeq) repair('read cursor clamped');
    readCursors.push({ conversationId: row.conversationId, actorPersonId: row.actorPersonId, lastReadSeq: clamped, updatedAt: row.updatedAt });
  }
  const drafts: Draft[] = [];
  const seenDraft = new Set<string>();
  for (const value of list('drafts')) {
    const row = rec(value);
    const root = row && isLocalId(row.threadRootId) ? messageById.get(row.threadRootId) : undefined;
    const key = row ? `${String(row.conversationId)}\n${String(row.threadRootId ?? '')}\n${String(row.actorPersonId)}` : '';
    const validThread = row ? row.threadRootId === undefined || (!!root && root.conversationId === row.conversationId && !root.threadRootId) : false;
    if (!row || !isLocalId(row.conversationId) || !conversationIds.has(row.conversationId) || !isLocalId(row.actorPersonId) || typeof row.body !== 'string' || !validThread || !date(row.updatedAt) || seenDraft.has(key)) { repair('invalid draft'); continue; }
    const body = normalizeBody(row.body).slice(0, MAX_BODY);
    const actorPersonId = row.actorPersonId as string;
    const draftRefs = (Array.isArray(row.refs) ? row.refs : []).slice(0, MAX_REFS)
      .map(parseEntityRef)
      .filter((ref): ref is EntityRef => !!ref);
    const uniqueDraftRefs = draftRefs.filter((ref, index) => draftRefs.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(ref)) === index);
    const availableDraftRefs = work
      ? uniqueDraftRefs.filter((ref) => resolveEntityRef(createLocalContext(scope, actorPersonId, work), ref).status === 'available')
      : uniqueDraftRefs;
    if (availableDraftRefs.length !== draftRefs.length) repair('invalid draft link');
    if (body.length === 0 && availableDraftRefs.length === 0) { repair('empty draft'); continue; }
    seenDraft.add(key);
    drafts.push({ conversationId: row.conversationId, ...(typeof row.threadRootId === 'string' ? { threadRootId: row.threadRootId } : {}), actorPersonId, body, ...(availableDraftRefs.length ? { refs: availableDraftRefs } : {}), updatedAt: row.updatedAt });
  }
  const cappedDrafts = [...drafts].sort((a, b) => cmp(b.updatedAt, a.updatedAt) || cmp(a.conversationId, b.conversationId)).slice(0, MAX_DRAFTS);
  if (cappedDrafts.length < drafts.length) repair('too many drafts');

  let selfPersonId: string | null = isLocalId(item.selfPersonId) ? item.selfPersonId : null;
  if (item.selfPersonId !== null && item.selfPersonId !== undefined && selfPersonId === null) repair('invalid self actor');
  if (selfPersonId && currentPeople && !currentPeople.has(selfPersonId)) { selfPersonId = null; repair('self actor is not a current-workspace person'); }

  const base: MessagingState = {
    schemaVersion: MESSAGING_SCHEMA_VERSION, organizationId: scope.organizationId, workspaceId: scope.workspaceId, selfPersonId,
    conversations: keptConversations.map((conv) => ({ ...conv, lastMessageSeq: lastSeq.get(conv.id) ?? conv.lastMessageSeq })),
    memberships, messages, reactions, saved, readCursors, drafts: cappedDrafts
  };
  const derived = recomputeDerived(base);
  const derivedMessages = new Map(derived.messages.map((message) => [message.id, message]));
  const messagesDiffer = base.messages.some((message) => {
    const next = derivedMessages.get(message.id);
    return next?.replyCount !== message.replyCount || next?.lastReplyAt !== message.lastReplyAt;
  });
  const derivedConversations = new Map(derived.conversations.map((conv) => [conv.id, conv]));
  const conversationsDiffer = base.conversations.some((conv) => {
    const next = derivedConversations.get(conv.id);
    return next?.lastMessageSeq !== conv.lastMessageSeq || next?.lastMessageAt !== conv.lastMessageAt;
  });
  if (messagesDiffer || conversationsDiffer) repair('denormalised counters recomputed');
  return { status: 'ok', state: canonicalizeState(derived), repairs, issues };
}

export interface ValidationReport { ok: boolean; issues: string[] }

/** Strict check: ok only if the state is already scoped, well-formed and needs no repair. */
export function validateMessagingState(state: unknown, scope: MessagingScope, work?: MessagingWork): ValidationReport {
  const result = sanitizeMessagingState(state, scope, work);
  if (result.status === 'scope_mismatch') return { ok: false, issues: ['organization/workspace mismatch'] };
  if (result.status === 'invalid') return { ok: false, issues: [result.issue] };
  return { ok: result.repairs === 0, issues: result.issues };
}
