import { createContext, useContext } from 'react';
import type { DispatchResult, RepositorySnapshot } from '../data/localRepository.js';
import type { SendInput } from '../domain/reducer.js';
import type { EntityRef, Id, Mention, MessagingScope, MessagingState, MessagingWork, ParticipantRef } from '../domain/types.js';

/** Pending composer drafts listen for this and write while the previous actor is still selected. */
export const FLUSH_DRAFTS_EVENT = 'gwira-inbox-flush-drafts';

export interface MessagingActions {
  setSelf(personId: Id): DispatchResult;
  createDm(participant: ParticipantRef): DispatchResult;
  createGroup(name: string, members: ParticipantRef[]): DispatchResult;
  createChannel(input: { name: string; topic?: string; visibility?: 'private' | 'org'; members?: ParticipantRef[]; linkedTaskId?: Id; linkedProjectId?: Id }): DispatchResult;
  joinChannel(conversationId: Id): DispatchResult;
  archiveConversation(conversationId: Id): DispatchResult;
  send(input: SendInput): DispatchResult;
  retry(messageId: Id): DispatchResult;
  edit(messageId: Id, body: string, mentions?: Mention[]): DispatchResult;
  remove(messageId: Id): DispatchResult;
  toggleReaction(messageId: Id, emoji: string): DispatchResult;
  /** `savedAt` lets Undo restore the original save time. */
  toggleSaved(messageId: Id, saved?: boolean, savedAt?: string): DispatchResult;
  markRead(conversationId: Id, seq?: number): DispatchResult;
  markUnread(conversationId: Id, messageId: Id): DispatchResult;
  /** Debounced write; an empty body and no links deletes only the current actor's draft. */
  setDraft(conversationId: Id, body: string, threadRootId?: Id, actorPersonId?: Id, refs?: EntityRef[], updatedAt?: string): DispatchResult;
  deriveSystemEvents(): DispatchResult;
  /** Retries any pending/failed write now. Returns whether the state is durably saved. */
  flush(): boolean;
  dismissTrimNotice(): void;
}

export interface MessagingContextValue extends Pick<RepositorySnapshot, 'durable' | 'dirty' | 'trimmed' | 'recovery' | 'writesBlocked' | 'lastError'> {
  state: MessagingState;
  scope: MessagingScope;
  /** Read-only work slices last passed to the provider; hand these to selectors. */
  work: MessagingWork;
  actions: MessagingActions;
}

export const MessagingContext = createContext<MessagingContextValue | null>(null);

export function useMessaging(): MessagingContextValue {
  const value = useContext(MessagingContext);
  if (!value) throw new Error('useMessaging must be used inside <MessagingProvider>.');
  return value;
}
