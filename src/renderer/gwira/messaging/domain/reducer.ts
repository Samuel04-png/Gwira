import { activeMembership, canDeleteMessage, canEditMessage, canJoinChannel, canPostInConversation, canReact, canReadConversation, createLocalContext, hasValidActor, isCurrentPerson, isEligibleParticipant, resolveEntityRef } from './authorize.js';
import type { LocalContext } from './authorize.js';
import { dmKeyFor, isClientId, isLocalId, newUniqueId, participantKey, sameParticipant } from './ids.js';
import { MAX_ATTACHMENTS, MAX_BODY, MAX_CONVERSATIONS, MAX_DRAFTS, MAX_MEMBERS, MAX_MENTIONS, MAX_NAME, MAX_REFS, MAX_TOPIC, MAX_UNSAVED_MESSAGES, REACTION_EMOJI, messagingError, sameScope } from './types.js';
import type { AttachmentRef, Conversation, EntityRef, FailureReason, Id, IsoDate, MemberRole, Membership, Mention, Message, MessagingScope, MessagingState, MessagingWork, ParticipantRef, Result } from './types.js';
import { deriveSystemEvents } from './systemEvents.js';
import { normalizeBody, parseAttachment, parseEntityRef, recomputeDerived, sanitizeLabel } from './validate.js';

/**
 * Everything a pure transition needs. `now` and `rand` are injected so tests are
 * deterministic; the UI never assigns ids, sequence numbers or timestamps.
 */
export interface MessagingContext {
  scope: MessagingScope;
  work: MessagingWork;
  now: IsoDate;
  rand?: () => number;
}

export interface SendInput {
  conversationId: Id;
  /** Idempotency key created once per user send; reuse it on retry. */
  clientId: string;
  body: string;
  threadRootId?: Id;
  /** Structured composer picks; offsets are into the submitted body. */
  mentions?: Mention[];
  /** Metadata only; no bytes are ever stored. */
  attachments?: Array<Omit<AttachmentRef, 'status'>>;
  refs?: EntityRef[];
}

export type MessagingAction =
  | { type: 'setSelf'; personId: Id }
  | { type: 'createDm'; participant: ParticipantRef }
  | { type: 'createGroup'; name: string; members: ParticipantRef[] }
  | { type: 'createChannel'; name: string; topic?: string; visibility?: 'private' | 'org'; members?: ParticipantRef[]; linkedTaskId?: Id; linkedProjectId?: Id }
  | { type: 'joinChannel'; conversationId: Id }
  | { type: 'archiveConversation'; conversationId: Id }
  | ({ type: 'sendMessage' } & SendInput)
  | { type: 'retryMessage'; messageId: Id }
  | { type: 'markSendFailed'; messageId: Id; reason: FailureReason }
  | { type: 'editMessage'; messageId: Id; body: string; mentions?: Mention[] }
  | { type: 'deleteMessage'; messageId: Id }
  | { type: 'toggleReaction'; messageId: Id; emoji: string; present?: boolean }
  | { type: 'toggleSaved'; messageId: Id; saved?: boolean; savedAt?: string }
  | { type: 'markRead'; conversationId: Id; seq?: number }
  | { type: 'markUnread'; conversationId: Id; messageId: Id }
  | { type: 'setDraft'; conversationId: Id; threadRootId?: Id; body: string; refs?: EntityRef[]; /** Actor that composed the draft; a write for anyone but the current self is rejected. */ actorPersonId?: Id; /** Restores the original edit time when Undo brings a discarded draft back. */ updatedAt?: string }
  | { type: 'deriveSystemEvents' };

export interface TransitionValue {
  conversationId?: Id;
  messageId?: Id;
  /** True when an idempotent send matched an existing (conversationId, clientId). */
  duplicate?: boolean;
}
export type TransitionResult = { ok: true; state: MessagingState; value: TransitionValue } | { ok: false; state: MessagingState; error: { code: string; message: string } };

function fail(state: MessagingState, code: Parameters<typeof messagingError>[0], message: string): TransitionResult {
  return { ok: false, state, error: messagingError(code, message).error };
}
function done(state: MessagingState, value: TransitionValue = {}): TransitionResult {
  return { ok: true, state, value };
}

function uniqueId(ctx: MessagingContext, prefix: string, taken: (id: string) => boolean): string {
  return newUniqueId(prefix, Date.parse(ctx.now) || 0, ctx.rand ?? Math.random, taken);
}

function validBody(body: unknown): body is string {
  return typeof body === 'string' && body.length <= MAX_BODY * 2;
}

/** Applies one action. Never mutates its input; on error returns the unchanged state. */
export function applyMessagingAction(state: MessagingState, action: MessagingAction, ctx: MessagingContext): TransitionResult {
  if (!sameScope(state, ctx.scope)) return fail(state, 'scope_mismatch', 'State belongs to a different organization or workspace.');
  const local = createLocalContext(ctx.scope, state.selfPersonId, ctx.work);
  switch (action.type) {
    case 'setSelf': {
      if (!isCurrentPerson(local, action.personId)) return fail(state, 'invalid_actor', 'Actor must be a person in the current workspace.');
      return done({ ...state, selfPersonId: action.personId });
    }
    case 'createDm': return createDm(state, action.participant, ctx, local);
    case 'createGroup': return createRoom(state, { kind: 'group', name: action.name, members: action.members, visibility: 'private' }, ctx, local);
    case 'createChannel': return createRoom(state, { kind: 'channel', name: action.name, topic: action.topic, members: action.members ?? [], visibility: action.visibility ?? 'org', linkedTaskId: action.linkedTaskId, linkedProjectId: action.linkedProjectId }, ctx, local);
    case 'joinChannel': {
      const conv = state.conversations.find((item) => item.id === action.conversationId);
      if (!conv) return fail(state, 'not_found', 'Conversation not found.');
      if (!canJoinChannel(local, conv, state.memberships)) return fail(state, 'forbidden', 'This channel cannot be joined.');
      const membership: Membership = { conversationId: conv.id, participant: { kind: 'human', id: state.selfPersonId as string }, role: 'member', joinedAt: ctx.now };
      const withoutOld = state.memberships.filter((item) => !(item.conversationId === conv.id && sameParticipant(item.participant, membership.participant)));
      return done({ ...state, memberships: [...withoutOld, membership] }, { conversationId: conv.id });
    }
    case 'archiveConversation': {
      const conv = state.conversations.find((item) => item.id === action.conversationId);
      if (!conv) return fail(state, 'not_found', 'Conversation not found.');
      const role = hasValidActor(local) ? activeMembership(state.memberships, conv.id, { kind: 'human', id: state.selfPersonId as string })?.role : undefined;
      if (conv.kind === 'dm' || (role !== 'owner' && role !== 'admin')) return fail(state, 'forbidden', 'Only an owner or admin can archive a group or channel.');
      if (conv.archivedAt) return done(state, { conversationId: conv.id });
      return done({ ...state, conversations: state.conversations.map((item) => (item.id === conv.id ? { ...item, archivedAt: ctx.now } : item)) }, { conversationId: conv.id });
    }
    case 'sendMessage': return sendMessage(state, action, ctx, local);
    case 'retryMessage': {
      const message = state.messages.find((item) => item.id === action.messageId);
      if (!message) return fail(state, 'not_found', 'Message not found.');
      if (message.sendState !== 'failed') return done(state, { messageId: message.id, conversationId: message.conversationId });
      if (!hasValidActor(local) || message.author.kind !== 'human' || message.author.id !== state.selfPersonId) return fail(state, 'forbidden', 'Only the author can retry a message.');
      const { failureReason: _reason, ...rest } = message;
      return done({ ...state, messages: state.messages.map((item) => (item.id === message.id ? { ...rest, sendState: 'local_saved' as const } : item)) }, { messageId: message.id, conversationId: message.conversationId });
    }
    case 'markSendFailed': {
      const message = state.messages.find((item) => item.id === action.messageId);
      if (!message) return fail(state, 'not_found', 'Message not found.');
      return done({ ...state, messages: state.messages.map((item) => (item.id === message.id ? { ...item, sendState: 'failed' as const, failureReason: action.reason } : item)) }, { messageId: message.id, conversationId: message.conversationId });
    }
    case 'editMessage': return editMessage(state, action, ctx, local);
    case 'deleteMessage': {
      const message = state.messages.find((item) => item.id === action.messageId);
      if (!message) return fail(state, 'not_found', 'Message not found.');
      if (!canDeleteMessage(local, message)) return fail(state, 'forbidden', 'Only the author can delete this message.');
      const tombstone: Message = { ...message, body: '', deletedAt: ctx.now, mentions: [], attachments: [], refs: [] };
      const next = recomputeDerived({
        ...state,
        messages: state.messages.map((item) => (item.id === message.id ? tombstone : item)),
        reactions: state.reactions.filter((item) => item.messageId !== message.id),
        saved: state.saved.filter((item) => item.messageId !== message.id)
      });
      return done(next, { messageId: message.id, conversationId: message.conversationId });
    }
    case 'toggleReaction': return toggleReaction(state, action, ctx, local);
    case 'toggleSaved': {
      const message = state.messages.find((item) => item.id === action.messageId);
      const conv = message ? state.conversations.find((item) => item.id === message.conversationId) : undefined;
      const actor = state.selfPersonId as string;
      const exists = state.saved.some((item) => item.messageId === action.messageId && item.actorPersonId === actor);
      const want = action.saved ?? !exists;
      // Removing a save stays possible after the conversation became unavailable; adding needs a readable message.
      if (!want && exists) return done({ ...state, saved: state.saved.filter((item) => !(item.messageId === action.messageId && item.actorPersonId === actor)) }, { messageId: action.messageId });
      if (!message || !conv) return fail(state, 'not_found', 'Message not found.');
      if (message.deletedAt || !canReadConversation(local, conv, state.memberships)) return fail(state, 'forbidden', 'This message cannot be saved.');
      if (want === exists) return done(state, { messageId: message.id });
      const savedAt = action.savedAt && !Number.isNaN(Date.parse(action.savedAt)) && action.savedAt <= ctx.now ? action.savedAt : ctx.now;
      return done({ ...state, saved: [...state.saved, { messageId: message.id, conversationId: message.conversationId, actorPersonId: actor, savedAt }] }, { messageId: message.id });
    }
    case 'markRead': {
      const conv = state.conversations.find((item) => item.id === action.conversationId);
      if (!conv) return fail(state, 'not_found', 'Conversation not found.');
      if (!canReadConversation(local, conv, state.memberships)) return fail(state, 'forbidden', 'Conversation is not readable.');
      const target = Math.min(conv.lastMessageSeq, Math.max(0, Math.floor(action.seq ?? conv.lastMessageSeq)));
      const current = state.readCursors.find((item) => item.conversationId === conv.id && item.actorPersonId === state.selfPersonId);
      if (current && current.lastReadSeq >= target) return done(state, { conversationId: conv.id });
      return done(setCursor(state, conv.id, target, ctx.now), { conversationId: conv.id });
    }
    case 'markUnread': {
      const conv = state.conversations.find((item) => item.id === action.conversationId);
      const message = state.messages.find((item) => item.id === action.messageId && item.conversationId === action.conversationId);
      if (!conv || !message) return fail(state, 'not_found', 'Message not found.');
      if (!canReadConversation(local, conv, state.memberships)) return fail(state, 'forbidden', 'Conversation is not readable.');
      return done(setCursor(state, conv.id, Math.max(0, message.seq - 1), ctx.now), { conversationId: conv.id, messageId: message.id });
    }
    case 'setDraft': return setDraft(state, action, ctx, local);
    case 'deriveSystemEvents': return deriveSystemEvents(state, ctx);
  }
}

function setCursor(state: MessagingState, conversationId: Id, lastReadSeq: number, now: IsoDate): MessagingState {
  const actor = state.selfPersonId as string;
  const rest = state.readCursors.filter((item) => !(item.conversationId === conversationId && item.actorPersonId === actor));
  return { ...state, readCursors: [...rest, { conversationId, actorPersonId: actor, lastReadSeq, updatedAt: now }] };
}

function dedupeParticipants(list: ParticipantRef[]): ParticipantRef[] {
  const seen = new Set<string>();
  return list.filter((participant) => (seen.has(participantKey(participant)) ? false : (seen.add(participantKey(participant)), true)));
}

function createDm(state: MessagingState, participant: ParticipantRef, ctx: MessagingContext, local: LocalContext): TransitionResult {
  if (!hasValidActor(local)) return fail(state, 'invalid_actor', 'Choose a local person before starting a conversation.');
  const self: ParticipantRef = { kind: 'human', id: state.selfPersonId as string };
  if (participant.kind === 'system' || sameParticipant(self, participant) || !isEligibleParticipant(local, participant)) {
    return fail(state, 'invalid', 'A direct message needs another person or Doat from this workspace.');
  }
  const dmKey = dmKeyFor(self, participant);
  const existing = state.conversations.find((conv) => conv.dmKey === dmKey);
  if (existing) return done(state, { conversationId: existing.id, duplicate: true });
  if (state.conversations.length >= MAX_CONVERSATIONS) return fail(state, 'limit', 'Conversation limit reached.');
  const id = uniqueId(ctx, 'conv', (candidate) => state.conversations.some((conv) => conv.id === candidate));
  const conv: Conversation = { id, organizationId: state.organizationId, workspaceId: state.workspaceId, kind: 'dm', visibility: 'private', dmKey, createdAt: ctx.now, createdBy: self, lastMessageSeq: 0 };
  const memberships: Membership[] = [
    { conversationId: id, participant: self, role: 'member', joinedAt: ctx.now },
    { conversationId: id, participant: participant, role: 'member', joinedAt: ctx.now }
  ];
  return done({ ...state, conversations: [...state.conversations, conv], memberships: [...state.memberships, ...memberships] }, { conversationId: id });
}

interface RoomInput {
  kind: 'group' | 'channel';
  name: string;
  topic?: string;
  members: ParticipantRef[];
  visibility: 'private' | 'org';
  linkedTaskId?: Id;
  linkedProjectId?: Id;
}

function createRoom(state: MessagingState, input: RoomInput, ctx: MessagingContext, local: LocalContext): TransitionResult {
  if (!hasValidActor(local)) return fail(state, 'invalid_actor', 'Choose a local person before creating a conversation.');
  if (typeof input.name !== 'string') return fail(state, 'invalid', 'A name is required.');
  const name = sanitizeLabel(input.kind === 'channel' ? input.name.replace(/^#+/, '') : input.name, MAX_NAME);
  if (!name) return fail(state, 'invalid', 'A name is required.');
  if (input.kind === 'group' && input.visibility !== 'private') return fail(state, 'invalid', 'Groups are private.');
  if (input.kind === 'channel' && state.conversations.some((conv) => conv.kind === 'channel' && !conv.archivedAt && conv.name?.toLowerCase() === name.toLowerCase())) {
    return fail(state, 'duplicate', 'A channel with that name already exists.');
  }
  if (state.conversations.length >= MAX_CONVERSATIONS) return fail(state, 'limit', 'Conversation limit reached.');
  const self: ParticipantRef = { kind: 'human', id: state.selfPersonId as string };
  const others = dedupeParticipants(input.members).filter((member) => !sameParticipant(member, self));
  if (others.length + 1 > MAX_MEMBERS || others.some((member) => member.kind === 'system' || !isEligibleParticipant(local, member))) {
    return fail(state, 'invalid', 'Members must be people or Doats from this workspace.');
  }
  if (input.kind === 'group' && others.length === 0) return fail(state, 'invalid', 'A group needs at least one other member.');
  const topic = input.topic ? sanitizeLabel(input.topic, MAX_TOPIC) : '';
  let linkedTaskId: Id | undefined;
  let linkedProjectId: Id | undefined;
  if (input.linkedTaskId !== undefined) {
    if (!ctx.work.tasks.some((task) => task.id === input.linkedTaskId && task.workspaceId === state.workspaceId)) return fail(state, 'invalid', 'Linked task is not in this workspace.');
    linkedTaskId = input.linkedTaskId;
  }
  if (input.linkedProjectId !== undefined) {
    if (!ctx.work.projects.some((project) => project.id === input.linkedProjectId && project.workspaceId === state.workspaceId)) return fail(state, 'invalid', 'Linked project is not in this workspace.');
    linkedProjectId = input.linkedProjectId;
  }
  const id = uniqueId(ctx, 'conv', (candidate) => state.conversations.some((conv) => conv.id === candidate));
  const conv: Conversation = {
    id, organizationId: state.organizationId, workspaceId: state.workspaceId, kind: input.kind, name,
    ...(topic ? { topic } : {}), visibility: input.visibility,
    ...(linkedTaskId ? { linkedTaskId } : {}), ...(linkedProjectId ? { linkedProjectId } : {}),
    createdAt: ctx.now, createdBy: self, lastMessageSeq: 0
  };
  const role = (participant: ParticipantRef): MemberRole => (sameParticipant(participant, self) ? 'owner' : 'member');
  const memberships: Membership[] = [self, ...others].map((participant) => ({ conversationId: id, participant, role: role(participant), joinedAt: ctx.now }));
  return done({ ...state, conversations: [...state.conversations, conv], memberships: [...state.memberships, ...memberships] }, { conversationId: id });
}

function sendMessage(state: MessagingState, input: SendInput, ctx: MessagingContext, local: LocalContext): TransitionResult {
  if (!hasValidActor(local)) return fail(state, 'invalid_actor', 'Choose a local person before sending.');
  const conv = state.conversations.find((item) => item.id === input.conversationId);
  if (!conv) return fail(state, 'not_found', 'Conversation not found.');
  if (!canPostInConversation(local, conv, state.memberships)) return fail(state, 'forbidden', 'You cannot post in this conversation.');
  if (!isClientId(input.clientId)) return fail(state, 'invalid', 'Invalid client id.');
  const duplicate = state.messages.find((item) => item.conversationId === conv.id && item.clientId === input.clientId);
  if (duplicate) return done(state, { messageId: duplicate.id, conversationId: conv.id, duplicate: true });
  if (state.messages.filter((item) => item.sendState === 'failed').length >= MAX_UNSAVED_MESSAGES) return fail(state, 'limit', 'Too many messages are not saved on this device. Free up storage and retry them before sending more.');
  if (!validBody(input.body)) return fail(state, 'invalid', 'Message body is invalid.');
  const body = normalizeBody(input.body);
  if (body.length > MAX_BODY) return fail(state, 'invalid', `Messages are limited to ${MAX_BODY} characters.`);
  const attachments = (input.attachments ?? []).map((item) => parseAttachment({ ...item, status: 'metadata_only' }));
  if ((input.attachments ?? []).length > MAX_ATTACHMENTS || attachments.some((item) => !item)) return fail(state, 'invalid', 'Invalid attachment metadata.');
  const refsIn = input.refs ?? [];
  const refs = refsIn.map(parseEntityRef);
  if (refsIn.length > MAX_REFS || refs.some((ref) => !ref)) return fail(state, 'invalid', 'Invalid reference.');
  if ((refs as EntityRef[]).some((ref) => resolveEntityRef(local, ref).status !== 'available')) return fail(state, 'invalid', 'A referenced item is not available in this workspace.');
  if (body.trim().length === 0 && attachments.length === 0 && refs.length === 0) return fail(state, 'invalid', 'Message is empty.');
  const mentions = validateMentions(input.mentions ?? [], body, state, conv.id, local);
  if (!mentions) return fail(state, 'invalid', 'Mentions must point to members of this conversation.');
  let root: Message | undefined;
  if (input.threadRootId !== undefined) {
    root = state.messages.find((item) => item.id === input.threadRootId);
    if (!root || root.conversationId !== conv.id || root.threadRootId || root.deletedAt) return fail(state, 'invalid', 'Replies need a visible root message in the same conversation.');
  }
  const seq = conv.lastMessageSeq + 1;
  const id = uniqueId(ctx, 'msg', (candidate) => state.messages.some((item) => item.id === candidate));
  const message: Message = {
    id, clientId: input.clientId, conversationId: conv.id, organizationId: state.organizationId, workspaceId: state.workspaceId, seq,
    author: { kind: 'human', id: state.selfPersonId as string }, type: 'text', body, createdAt: ctx.now,
    ...(root ? { threadRootId: root.id } : {}),
    mentions, attachments: attachments as AttachmentRef[], refs: refs as EntityRef[], sendState: 'local_saved'
  };
  const actor = state.selfPersonId as string;
  const next = recomputeDerived({
    ...state,
    messages: [...state.messages, message],
    // Only the sending actor's draft is cleared.
    drafts: state.drafts.filter((draft) => !(draft.conversationId === conv.id && draft.actorPersonId === actor && draft.threadRootId === message.threadRootId))
  });
  return done(next, { messageId: id, conversationId: conv.id });
}

function validateMentions(mentions: Mention[], body: string, state: MessagingState, conversationId: Id, local: LocalContext): Mention[] | undefined {
  if (mentions.length > MAX_MENTIONS) return undefined;
  const result: Mention[] = [];
  for (const mention of mentions) {
    const participant = mention?.participant;
    if (!participant || participant.kind === 'system' || !isLocalId(participant.id) || !Number.isInteger(mention.start) || !Number.isInteger(mention.end)) return undefined;
    if (mention.start < 0 || mention.end <= mention.start || mention.end > body.length) return undefined;
    if (!isEligibleParticipant(local, participant) || !activeMembership(state.memberships, conversationId, participant)) return undefined;
    result.push({ participant: { kind: participant.kind, id: participant.id }, start: mention.start, end: mention.end });
  }
  return result;
}

function editMessage(state: MessagingState, action: Extract<MessagingAction, { type: 'editMessage' }>, ctx: MessagingContext, local: LocalContext): TransitionResult {
  const message = state.messages.find((item) => item.id === action.messageId);
  if (!message) return fail(state, 'not_found', 'Message not found.');
  const conv = state.conversations.find((item) => item.id === message.conversationId);
  if (!conv || !canEditMessage(local, message) || !canPostInConversation(local, conv, state.memberships)) return fail(state, 'forbidden', 'Only the author can edit this message.');
  if (!validBody(action.body)) return fail(state, 'invalid', 'Message body is invalid.');
  const body = normalizeBody(action.body);
  if (body.length > MAX_BODY) return fail(state, 'invalid', `Messages are limited to ${MAX_BODY} characters.`);
  if (body.trim().length === 0 && message.attachments.length === 0 && message.refs.length === 0) return fail(state, 'invalid', 'Message is empty.');
  const mentions = validateMentions(action.mentions ?? [], body, state, conv.id, local);
  if (!mentions) return fail(state, 'invalid', 'Mentions must point to members of this conversation.');
  const edited: Message = { ...message, body, mentions, editedAt: ctx.now };
  return done({ ...state, messages: state.messages.map((item) => (item.id === message.id ? edited : item)) }, { messageId: message.id, conversationId: conv.id });
}

function toggleReaction(state: MessagingState, action: Extract<MessagingAction, { type: 'toggleReaction' }>, ctx: MessagingContext, local: LocalContext): TransitionResult {
  if (!REACTION_EMOJI.includes(action.emoji as typeof REACTION_EMOJI[number])) return fail(state, 'invalid', 'That reaction is not available.');
  const message = state.messages.find((item) => item.id === action.messageId);
  const conv = message ? state.conversations.find((item) => item.id === message.conversationId) : undefined;
  if (!message || !conv) return fail(state, 'not_found', 'Message not found.');
  const actor = state.selfPersonId;
  if (!actor || !canReact(local, conv, state.memberships, message, actor)) return fail(state, 'forbidden', 'You cannot react to this message.');
  const same = (item: { messageId: Id; emoji: string; actorPersonId: Id }) => item.messageId === message.id && item.emoji === action.emoji && item.actorPersonId === actor;
  const exists = state.reactions.some(same);
  const want = action.present ?? !exists;
  if (want === exists) return done(state, { messageId: message.id });
  const reactions = want ? [...state.reactions, { messageId: message.id, emoji: action.emoji, actorPersonId: actor, at: ctx.now }] : state.reactions.filter((item) => !same(item));
  return done({ ...state, reactions }, { messageId: message.id });
}

function setDraft(state: MessagingState, action: Extract<MessagingAction, { type: 'setDraft' }>, ctx: MessagingContext, local: LocalContext): TransitionResult {
  if (action.actorPersonId !== undefined && action.actorPersonId !== state.selfPersonId) return fail(state, 'invalid_actor', 'The draft belongs to a different local person.');
  const conv = state.conversations.find((item) => item.id === action.conversationId);
  if (!conv) return fail(state, 'not_found', 'Conversation not found.');
  if (!canPostInConversation(local, conv, state.memberships)) return fail(state, 'forbidden', 'You cannot post in this conversation.');
  if (action.threadRootId !== undefined) {
    const root = state.messages.find((item) => item.id === action.threadRootId);
    if (!root || root.conversationId !== conv.id || root.threadRootId) return fail(state, 'invalid', 'Thread draft needs a valid root.');
  }
  if (typeof action.body !== 'string') return fail(state, 'invalid', 'Draft is invalid.');
  const refsIn = action.refs ?? [];
  const refs = refsIn.map(parseEntityRef);
  if (refsIn.length > MAX_REFS || refs.some((ref) => !ref)) return fail(state, 'invalid', 'Draft links are invalid.');
  const uniqueRefs: EntityRef[] = [];
  const seenRefs = new Set<string>();
  for (const ref of refs as EntityRef[]) {
    const key = JSON.stringify(ref);
    if (!seenRefs.has(key)) { seenRefs.add(key); uniqueRefs.push(ref); }
  }
  if (uniqueRefs.some((ref) => resolveEntityRef(local, ref).status !== 'available')) return fail(state, 'invalid', 'A linked record is not available in this workspace.');
  const actor = state.selfPersonId as string;
  const same = (draft: { conversationId: Id; threadRootId?: Id; actorPersonId: Id }) => draft.conversationId === conv.id && draft.actorPersonId === actor && draft.threadRootId === action.threadRootId;
  const body = normalizeBody(action.body).slice(0, MAX_BODY);
  const rest = state.drafts.filter((draft) => !same(draft));
  if (body.length === 0 && uniqueRefs.length === 0) return done(rest.length === state.drafts.length ? state : { ...state, drafts: rest }, { conversationId: conv.id });
  const draft = { conversationId: conv.id, ...(action.threadRootId ? { threadRootId: action.threadRootId } : {}), actorPersonId: actor, body, ...(uniqueRefs.length ? { refs: uniqueRefs } : {}), updatedAt: action.updatedAt && !Number.isNaN(Date.parse(action.updatedAt)) && action.updatedAt <= ctx.now ? action.updatedAt : ctx.now };
  let drafts = [...rest, draft];
  if (drafts.length > MAX_DRAFTS) {
    const oldest = [...rest].sort((x, y) => (x.updatedAt < y.updatedAt ? -1 : x.updatedAt > y.updatedAt ? 1 : 0))[0];
    drafts = drafts.filter((item) => item !== oldest);
  }
  return done({ ...state, drafts }, { conversationId: conv.id });
}
