export interface PendingGlobalChatMessage {
  conversationId: string;
  messageId: string;
  content: string;
  create: boolean;
}

export interface GlobalChatState {
  conversationId: string | null;
  draft: string;
  drafts: Record<string, string>;
  pending: PendingGlobalChatMessage | null;
  width: number;
}

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseGlobalChatState(raw: string | null): GlobalChatState {
  if (raw === null) return {conversationId: null, draft: '', drafts: {}, pending: null, width: 392};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Gwira Chat state.');
  const state = value as Partial<GlobalChatState>;
  if (state.conversationId !== null && !uuid(state.conversationId)) throw new Error('Invalid Gwira Chat conversation.');
  if (typeof state.draft !== 'string' || state.draft.length > 10000) throw new Error('Invalid Gwira Chat draft.');
  const drafts: Record<string, string> = {};
  if (state.drafts !== undefined) {
    if (!state.drafts || typeof state.drafts !== 'object' || Array.isArray(state.drafts)) throw new Error('Invalid Gwira Chat drafts.');
    for (const [id, text] of Object.entries(state.drafts)) {
      if ((id !== 'new' && !uuid(id)) || typeof text !== 'string' || text.length > 10000) throw new Error('Invalid Gwira Chat draft.');
      drafts[id] = text;
    }
  }
  const pending = state.pending;
  if (pending !== null && (!pending || !uuid(pending.conversationId) || !uuid(pending.messageId) ||
      typeof pending.content !== 'string' || !pending.content.trim() || pending.content.length > 10000 ||
      typeof pending.create !== 'boolean' || (pending.create ? state.conversationId !== null : pending.conversationId !== state.conversationId))) {
    throw new Error('Invalid pending Gwira Chat message.');
  }
  const width = state.width === undefined ? 392 : state.width;
  if (typeof width !== 'number' || !Number.isFinite(width) || width < 320 || width > 540) throw new Error('Invalid Gwira Chat width.');
  return {conversationId: state.conversationId, draft: state.draft, drafts, pending, width};
}

export function selectGlobalChatConversation(state: GlobalChatState, id: string | null): GlobalChatState {
  if (state.pending) throw new Error('Confirm the previous message before switching conversations.');
  const drafts = {...state.drafts};
  const previous = state.conversationId ?? 'new';
  if (state.draft) drafts[previous] = state.draft;
  else delete drafts[previous];
  return {...state, conversationId: id, draft: drafts[id ?? 'new'] ?? '', drafts, pending: null};
}

export function prepareGlobalChatMessage(state: GlobalChatState, newId: () => string): PendingGlobalChatMessage {
  const content = state.draft.trim();
  if (!content || content.length > 10000) throw new Error('Invalid Gwira Chat message.');
  if (state.pending) {
    if (state.pending.content !== content) throw new Error('Confirm the previous message before sending a different message.');
    return state.pending;
  }
  return {conversationId: state.conversationId ?? newId(), messageId: newId(), content, create: state.conversationId === null};
}
