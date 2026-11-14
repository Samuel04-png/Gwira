import { actorRole, canReadConversation, createLocalContext, hasValidActor, inScope, isCurrentDoat, resolveEntityRef } from './authorize.js';
import type { LocalContext, ResolvedRef } from './authorize.js';
import { sameParticipant } from './ids.js';
import { SYSTEM_PARTICIPANT_ID, sameScope } from './types.js';
import type { Conversation, Draft, Id, MemberRole, Membership, Message, MessagingScope, MessagingState, MessagingWork, ParticipantRef } from './types.js';

/**
 * Pure view models: `(state, scope, work, args) -> data`. Each selector returns an
 * empty result for a stale scope or an invalid actor and never exposes
 * conversations the actor cannot read. Display data (names) is resolved here from
 * current Gwira records and is never stored on messages.
 */
export function localContextFor(state: MessagingState, scope: MessagingScope, work: MessagingWork): LocalContext | undefined {
  if (!sameScope(state, scope)) return undefined;
  const ctx = createLocalContext(scope, state.selfPersonId, work);
  return hasValidActor(ctx) ? ctx : undefined;
}

export interface ParticipantView { ref: ParticipantRef; name: string; available: boolean; role?: string }

export function participantView(work: MessagingWork, scope: MessagingScope, ref: ParticipantRef): ParticipantView {
  if (ref.kind === 'system') return { ref, name: 'Gwira', available: true };
  if (ref.kind === 'human') {
    const person = work.people.find((item) => item.id === ref.id && item.workspaceId === scope.workspaceId);
    return person ? { ref, name: person.name, available: true, role: person.role } : { ref, name: 'Unavailable person', available: false };
  }
  const doat = work.doats.find((item) => item.id === ref.id && item.workspaceId === scope.workspaceId);
  return doat ? { ref, name: doat.identity.name, available: true, role: doat.identity.role } : { ref, name: 'Unavailable Doat', available: false };
}

/** People and (non-archived) Doats that may be added to conversations in this workspace. */
export function selectEligibleParticipants(work: MessagingWork, scope: MessagingScope): ParticipantView[] {
  const people = work.people.filter((p) => p.workspaceId === scope.workspaceId).map((p) => participantView(work, scope, { kind: 'human', id: p.id }));
  const doats = work.doats.filter((d) => d.workspaceId === scope.workspaceId && !d.archivedAt).map((d) => participantView(work, scope, { kind: 'doat', id: d.id }));
  return [...people, ...doats];
}

function membersOf(state: MessagingState, conversationId: Id): Membership[] {
  return state.memberships.filter((item) => item.conversationId === conversationId && !item.leftAt);
}

function cursorFor(state: MessagingState, conversationId: Id, actor: Id): number {
  return state.readCursors.find((item) => item.conversationId === conversationId && item.actorPersonId === actor)?.lastReadSeq ?? 0;
}

function isUnreadFor(message: Message, actor: Id, cursor: number): boolean {
  return message.seq > cursor && !message.deletedAt && !(message.author.kind === 'human' && message.author.id === actor);
}

export interface UnreadSummary { unread: number; mentionUnread: number; firstUnreadSeq?: number }

export function selectUnread(state: MessagingState, scope: MessagingScope, work: MessagingWork, conversationId: Id): UnreadSummary {
  const ctx = localContextFor(state, scope, work);
  const conv = state.conversations.find((item) => item.id === conversationId);
  if (!ctx || !conv || !canReadConversation(ctx, conv, state.memberships)) return { unread: 0, mentionUnread: 0 };
  const actor = ctx.actorPersonId as Id;
  const cursor = cursorFor(state, conv.id, actor);
  let unread = 0;
  let mentionUnread = 0;
  let firstUnreadSeq: number | undefined;
  for (const message of state.messages) {
    if (message.conversationId !== conv.id || !isUnreadFor(message, actor, cursor)) continue;
    unread += 1;
    if (message.mentions.some((mention) => mention.participant.kind === 'human' && mention.participant.id === actor)) mentionUnread += 1;
    if (firstUnreadSeq === undefined || message.seq < firstUnreadSeq) firstUnreadSeq = message.seq;
  }
  return { unread, mentionUnread, ...(firstUnreadSeq !== undefined ? { firstUnreadSeq } : {}) };
}

export interface ConversationListItem {
  conversation: Conversation;
  title: string;
  members: ParticipantView[];
  role?: MemberRole;
  isMember: boolean;
  unread: number;
  mentionUnread: number;
  lastMessagePreview?: string;
  sortAt: string;
  /** True when a DM/group member is a Doat: messages are saved locally, not sent to a running Doat. */
  hasDoatMember: boolean;
}

export function selectConversationList(state: MessagingState, scope: MessagingScope, work: MessagingWork): ConversationListItem[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  const self: ParticipantRef = { kind: 'human', id: ctx.actorPersonId as Id };
  const items: ConversationListItem[] = [];
  for (const conv of state.conversations) {
    if (!canReadConversation(ctx, conv, state.memberships)) continue;
    const members = membersOf(state, conv.id).map((item) => ({ ...participantView(work, scope, item.participant) }));
    const other = members.find((member) => !sameParticipant(member.ref, self));
    const { unread, mentionUnread } = selectUnread(state, scope, work, conv.id);
    const last = latestVisible(state, conv.id);
    items.push({
      conversation: conv,
      title: conv.kind === 'dm' ? (other?.name ?? 'Direct message') : (conv.kind === 'channel' ? `#${conv.name ?? ''}` : conv.name ?? 'Group'),
      members, role: actorRole(ctx, conv, state.memberships), isMember: actorRole(ctx, conv, state.memberships) !== undefined,
      unread, mentionUnread,
      ...(last ? { lastMessagePreview: last.body.slice(0, 120) } : {}),
      sortAt: conv.lastMessageAt ?? conv.createdAt,
      hasDoatMember: members.some((member) => member.ref.kind === 'doat')
    });
  }
  return items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0) || (a.conversation.id < b.conversation.id ? -1 : 1));
}

function latestVisible(state: MessagingState, conversationId: Id): Message | undefined {
  let best: Message | undefined;
  for (const message of state.messages) {
    if (message.conversationId === conversationId && !message.deletedAt && (!best || message.seq > best.seq)) best = message;
  }
  return best;
}

export interface ReactionSummary { emoji: string; count: number; reactedByActor: boolean }
export interface MessageView {
  message: Message;
  author: ParticipantView;
  isOwn: boolean;
  isDeleted: boolean;
  reactions: ReactionSummary[];
  savedByActor: boolean;
  mentionsActor: boolean;
  unread: boolean;
  refs: ResolvedRef[];
  replyCount: number;
  lastReplyAt?: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Present only when a failed local message needs the "Not durably saved · Retry" affordance. */
  failed: boolean;
}

function buildView(state: MessagingState, ctx: LocalContext, scope: MessagingScope, work: MessagingWork, message: Message, cursor: number): MessageView {
  const actor = ctx.actorPersonId as Id;
  const byEmoji = new Map<string, ReactionSummary>();
  for (const reaction of state.reactions) {
    if (reaction.messageId !== message.id) continue;
    const entry = byEmoji.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, reactedByActor: false };
    entry.count += 1;
    if (reaction.actorPersonId === actor) entry.reactedByActor = true;
    byEmoji.set(reaction.emoji, entry);
  }
  const own = message.author.kind === 'human' && message.author.id === actor;
  return {
    message, author: participantView(work, scope, message.author), isOwn: own, isDeleted: !!message.deletedAt,
    reactions: [...byEmoji.values()].sort((a, b) => (a.emoji < b.emoji ? -1 : 1)),
    savedByActor: state.saved.some((item) => item.messageId === message.id && item.actorPersonId === actor),
    mentionsActor: message.mentions.some((mention) => mention.participant.kind === 'human' && mention.participant.id === actor),
    unread: isUnreadFor(message, actor, cursor),
    refs: message.refs.map((ref) => resolveEntityRef(ctx, ref)),
    replyCount: message.replyCount ?? 0, ...(message.lastReplyAt ? { lastReplyAt: message.lastReplyAt } : {}),
    canEdit: own && message.type === 'text' && !message.deletedAt,
    canDelete: own && !message.deletedAt,
    failed: message.sendState === 'failed'
  };
}

export interface FeedView {
  conversation: Conversation;
  title: string;
  members: ParticipantView[];
  canPost: boolean;
  /** Main timeline: roots and non-thread messages in seq order; replies live in the thread view. */
  messages: MessageView[];
  /** The "New messages" divider sits before this seq. */
  newMessagesFromSeq?: number;
  doatNotConnected: boolean;
  unread: UnreadSummary;
}

export function selectFeed(state: MessagingState, scope: MessagingScope, work: MessagingWork, conversationId: Id): FeedView | undefined {
  const ctx = localContextFor(state, scope, work);
  const conv = state.conversations.find((item) => item.id === conversationId);
  if (!ctx || !conv || !canReadConversation(ctx, conv, state.memberships)) return undefined;
  const item = selectConversationList(state, scope, work).find((entry) => entry.conversation.id === conv.id);
  const cursor = cursorFor(state, conv.id, ctx.actorPersonId as Id);
  const messages = state.messages
    .filter((message) => message.conversationId === conv.id && !message.threadRootId)
    .sort((a, b) => a.seq - b.seq)
    .map((message) => buildView(state, ctx, scope, work, message, cursor));
  const unread = selectUnread(state, scope, work, conv.id);
  const canPost = actorRole(ctx, conv, state.memberships) !== undefined && actorRole(ctx, conv, state.memberships) !== 'guest' && !conv.archivedAt;
  return {
    conversation: conv, title: item?.title ?? '', members: item?.members ?? [], canPost, messages,
    ...(unread.firstUnreadSeq !== undefined ? { newMessagesFromSeq: unread.firstUnreadSeq } : {}),
    doatNotConnected: item?.hasDoatMember ?? false, unread
  };
}

export interface ThreadView { root: MessageView; replies: MessageView[]; canPost: boolean }

export function selectThread(state: MessagingState, scope: MessagingScope, work: MessagingWork, conversationId: Id, rootId: Id): ThreadView | undefined {
  const ctx = localContextFor(state, scope, work);
  const conv = state.conversations.find((item) => item.id === conversationId);
  if (!ctx || !conv || !canReadConversation(ctx, conv, state.memberships)) return undefined;
  const root = state.messages.find((item) => item.id === rootId && item.conversationId === conv.id && !item.threadRootId);
  if (!root) return undefined;
  const cursor = cursorFor(state, conv.id, ctx.actorPersonId as Id);
  const replies = state.messages.filter((item) => item.threadRootId === root.id && item.conversationId === conv.id).sort((a, b) => a.seq - b.seq);
  const role = actorRole(ctx, conv, state.memberships);
  return {
    root: buildView(state, ctx, scope, work, root, cursor),
    replies: replies.map((reply) => buildView(state, ctx, scope, work, reply, cursor)),
    canPost: role !== undefined && role !== 'guest' && !conv.archivedAt && !root.deletedAt
  };
}

/**
 * Only the current actor's saved rows, newest save first. A message whose conversation the actor can no
 * longer read stays listed as `conversationUnavailable` (preview kept, no way to open it); deleted messages
 * and other workspaces are excluded.
 */
export function selectSaved(state: MessagingState, scope: MessagingScope, work: MessagingWork): Array<MessageView & { savedAt: string; conversationUnavailable: boolean }> {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  const actor = ctx.actorPersonId as Id;
  const result: Array<MessageView & { savedAt: string; conversationUnavailable: boolean }> = [];
  for (const row of state.saved) {
    if (row.actorPersonId !== actor) continue;
    const message = state.messages.find((item) => item.id === row.messageId);
    const conv = message ? state.conversations.find((item) => item.id === message.conversationId) : undefined;
    if (!message || !conv || message.deletedAt || !inScope(ctx, conv)) continue;
    const readable = canReadConversation(ctx, conv, state.memberships);
    result.push({ ...buildView(state, ctx, scope, work, message, cursorFor(state, conv.id, actor)), savedAt: row.savedAt, conversationUnavailable: !readable });
  }
  return result.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0) || (a.message.id < b.message.id ? -1 : 1));
}

/** Messages in readable conversations that mention the current actor, newest first. */
export function selectMentions(state: MessagingState, scope: MessagingScope, work: MessagingWork): MessageView[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  const actor = ctx.actorPersonId as Id;
  const result: MessageView[] = [];
  for (const message of state.messages) {
    if (message.deletedAt || !message.mentions.some((mention) => mention.participant.kind === 'human' && mention.participant.id === actor)) continue;
    const conv = state.conversations.find((item) => item.id === message.conversationId);
    if (!conv || !canReadConversation(ctx, conv, state.memberships)) continue;
    result.push(buildView(state, ctx, scope, work, message, cursorFor(state, conv.id, actor)));
  }
  return result.sort((a, b) => (a.message.createdAt < b.message.createdAt ? 1 : a.message.createdAt > b.message.createdAt ? -1 : 0) || b.message.seq - a.message.seq);
}

/** Unread roots and replies across readable conversations, without advancing any cursor. */
export function selectUnreadMessages(state: MessagingState, scope: MessagingScope, work: MessagingWork): MessageView[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  const actor = ctx.actorPersonId as Id;
  const result: MessageView[] = [];
  for (const message of state.messages) {
    const conv = state.conversations.find((item) => item.id === message.conversationId);
    if (!conv || !canReadConversation(ctx, conv, state.memberships)) continue;
    const cursor = cursorFor(state, conv.id, actor);
    if (isUnreadFor(message, actor, cursor)) result.push(buildView(state, ctx, scope, work, message, cursor));
  }
  return result.sort((a, b) => (a.message.createdAt < b.message.createdAt ? 1 : a.message.createdAt > b.message.createdAt ? -1 : 0) || b.message.seq - a.message.seq);
}

/** Thread roots in readable conversations that the current actor started or replied in, most recently active first. */
export function selectThreads(state: MessagingState, scope: MessagingScope, work: MessagingWork): MessageView[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  const actor = ctx.actorPersonId as Id;
  const involved = new Set<Id>();
  for (const message of state.messages) {
    if (message.deletedAt || message.author.kind !== 'human' || message.author.id !== actor) continue;
    involved.add(message.threadRootId ?? message.id);
  }
  const result: MessageView[] = [];
  for (const message of state.messages) {
    if (message.threadRootId || message.deletedAt || !message.replyCount || !involved.has(message.id)) continue;
    const conv = state.conversations.find((item) => item.id === message.conversationId);
    if (!conv || !canReadConversation(ctx, conv, state.memberships)) continue;
    result.push(buildView(state, ctx, scope, work, message, cursorFor(state, conv.id, actor)));
  }
  const activity = (view: MessageView): string => view.message.lastReplyAt ?? view.message.createdAt;
  return result.sort((a, b) => (activity(a) < activity(b) ? 1 : activity(a) > activity(b) ? -1 : 0) || (a.message.id < b.message.id ? -1 : 1));
}

export interface ThreadSummary {
  conversationId: Id;
  rootId: Id;
  root: MessageView;
  replyCount: number;
  /** Replies from others past this actor's conversation read cursor. There is no per-thread cursor. */
  unreadReplies: number;
  lastReply?: MessageView;
  /** Distinct authors of the root and live replies, in first-appearance order. */
  participants: ParticipantView[];
  startedByActor: boolean;
  lastActivityAt: string;
  /** Live reply bodies, used only for thread search. */
  replyBodies: string[];
}

/**
 * Threads the actor started or replied in, with per-thread reply, unread and participant data.
 * Deleted roots stay listed (as tombstones) while live replies exist. Unreadable conversations are excluded.
 */
export function selectThreadSummaries(state: MessagingState, scope: MessagingScope, work: MessagingWork): ThreadSummary[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  const actor = ctx.actorPersonId as Id;
  const repliesByRoot = new Map<Id, Message[]>();
  const involved = new Set<Id>();
  for (const message of state.messages) {
    if (message.threadRootId && !message.deletedAt) {
      const list = repliesByRoot.get(message.threadRootId);
      if (list) list.push(message); else repliesByRoot.set(message.threadRootId, [message]);
    }
    if (!message.deletedAt && message.author.kind === 'human' && message.author.id === actor) involved.add(message.threadRootId ?? message.id);
  }
  const readable = new Map<Id, number>();
  for (const conv of state.conversations) if (canReadConversation(ctx, conv, state.memberships)) readable.set(conv.id, cursorFor(state, conv.id, actor));
  const result: ThreadSummary[] = [];
  for (const root of state.messages) {
    if (root.threadRootId || !involved.has(root.id)) continue;
    const replies = (repliesByRoot.get(root.id) ?? []).filter((reply) => reply.conversationId === root.conversationId).sort((a, b) => a.seq - b.seq);
    const cursor = readable.get(root.conversationId);
    if (cursor === undefined || replies.length === 0) continue;
    const rootView = buildView(state, ctx, scope, work, root, cursor);
    const replyViews = replies.map((reply) => buildView(state, ctx, scope, work, reply, cursor));
    const seen = new Set<string>();
    const participants: ParticipantView[] = [];
    for (const view of [rootView, ...replyViews]) {
      if (view.isDeleted && view === rootView) continue;
      const key = `${view.message.author.kind}:${view.message.author.kind === 'system' ? '' : (view.message.author as { id: string }).id}`;
      if (!seen.has(key)) { seen.add(key); participants.push(view.author); }
    }
    const lastReply = replyViews[replyViews.length - 1]!;
    result.push({
      conversationId: root.conversationId, rootId: root.id, root: rootView, replyCount: replyViews.length,
      unreadReplies: replyViews.filter((view) => view.unread).length,
      lastReply, participants, replyBodies: replyViews.map((view) => view.message.body),
      startedByActor: rootView.isOwn,
      lastActivityAt: lastReply.message.createdAt > root.createdAt ? lastReply.message.createdAt : root.createdAt
    });
  }
  return result.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : a.lastActivityAt > b.lastActivityAt ? -1 : 0) || (a.rootId < b.rootId ? -1 : 1));
}

/** Only the current actor's non-empty drafts in readable conversations, newest first. */
export function selectDrafts(state: MessagingState, scope: MessagingScope, work: MessagingWork): Draft[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  return state.drafts
    .filter((draft) => draft.actorPersonId === ctx.actorPersonId && draft.body.trim().length > 0)
    .filter((draft) => {
      const conv = state.conversations.find((item) => item.id === draft.conversationId);
      return conv ? canReadConversation(ctx, conv, state.memberships) : false;
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** The current actor's own messages that failed to save, in readable conversations, newest first. */
export function selectFailedSends(state: MessagingState, scope: MessagingScope, work: MessagingWork): Message[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  return state.messages
    .filter((message) => message.sendState === 'failed' && !message.deletedAt && message.author.kind === 'human' && message.author.id === ctx.actorPersonId)
    .filter((message) => {
      const conv = state.conversations.find((item) => item.id === message.conversationId);
      return conv ? canReadConversation(ctx, conv, state.memberships) : false;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** The current actor's draft for a conversation/thread; other actors' drafts are never returned. */
export function selectDraft(state: MessagingState, scope: MessagingScope, work: MessagingWork, conversationId: Id, threadRootId?: Id): Draft | undefined {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return undefined;
  return state.drafts.find((draft) => draft.conversationId === conversationId && draft.threadRootId === threadRootId && draft.actorPersonId === ctx.actorPersonId);
}

/** Active, mentionable members of a conversation the actor can post in (excludes the actor and system). */
export function selectMentionCandidates(state: MessagingState, scope: MessagingScope, work: MessagingWork, conversationId: Id): ParticipantView[] {
  const ctx = localContextFor(state, scope, work);
  const conv = state.conversations.find((item) => item.id === conversationId);
  if (!ctx || !conv || !canReadConversation(ctx, conv, state.memberships)) return [];
  return membersOf(state, conv.id)
    .filter((item) => item.participant.kind !== 'system' && item.participant.id !== SYSTEM_PARTICIPANT_ID)
    .filter((item) => item.participant.kind === 'human' ? work.people.some((p) => p.id === item.participant.id && p.workspaceId === scope.workspaceId) : isCurrentDoat(ctx, item.participant.id))
    .map((item) => participantView(work, scope, item.participant));
}

/** Total unread across readable conversations, for a nav badge. */
export function selectTotalUnread(state: MessagingState, scope: MessagingScope, work: MessagingWork): number {
  return selectConversationList(state, scope, work).reduce((sum, item) => sum + item.unread, 0);
}

/** Failed (not durably saved) messages authored by the current actor. */
export function selectFailedMessages(state: MessagingState, scope: MessagingScope, work: MessagingWork): Message[] {
  const ctx = localContextFor(state, scope, work);
  if (!ctx) return [];
  return state.messages.filter((message) => message.sendState === 'failed' && message.author.kind === 'human' && message.author.id === ctx.actorPersonId);
}
