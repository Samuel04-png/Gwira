import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { LocalMessagingRepository } from '../data/localRepository.js';
import { sharedRepository } from '../data/sharedRepository.js';
import type { StorageLike } from '../data/messagingStore.js';
import type { MessagingScope, MessagingWork } from '../domain/types.js';
import { FLUSH_DRAFTS_EVENT, MessagingContext } from './useMessaging.js';
import type { MessagingActions, MessagingContextValue } from './useMessaging.js';

const DRAFT_FLUSH_MS = 400;

export interface MessagingProviderProps {
  scope: MessagingScope;
  /** Read-only slices of GwiraLocalState; messaging never writes them. */
  work: MessagingWork;
  /** Defaults to window.localStorage when available; otherwise state stays in memory and `durable` is false. */
  storage?: StorageLike;
  now?: () => string;
  rand?: () => number;
  children: ReactNode;
}

const unavailableStorage: StorageLike = {
  getItem: () => null,
  setItem: () => { throw new Error('storage unavailable'); }
};

function defaultStorage(): StorageLike {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : unavailableStorage;
  } catch {
    return unavailableStorage;
  }
}

/** Owns the messaging store for one organization+workspace. Remounts its store when either id changes. */
export function MessagingProvider({ scope, work, storage, now, rand, children }: MessagingProviderProps): React.ReactElement {
  const workRef = useRef(work);
  workRef.current = work;
  const nowRef = useRef(now);
  nowRef.current = now;
  const randRef = useRef(rand);
  randRef.current = rand;
  const resolvedStorage = useMemo(() => storage ?? defaultStorage(), [storage]);
  const repository = useMemo(
    () => now || rand ? new LocalMessagingRepository({ storage: resolvedStorage, scope: { organizationId: scope.organizationId, workspaceId: scope.workspaceId }, getWork: () => workRef.current, now: () => (nowRef.current ?? (() => new Date().toISOString()))(), rand: () => (randRef.current ?? Math.random)() }) : sharedRepository(resolvedStorage, scope, work),
    [resolvedStorage, scope.organizationId, scope.workspaceId]
  );
  if (!now && !rand) sharedRepository(resolvedStorage, scope, work);
  const snapshot = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the local actor a current-workspace person when people change.
  useEffect(() => { repository.reconcileSelf(); }, [repository, work.people]);

  useEffect(() => {
    const flush = () => { repository.flush(); };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [repository]);

  const actions = useMemo<MessagingActions>(() => ({
    setSelf: (personId) => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(FLUSH_DRAFTS_EVENT));
      return repository.dispatch({ type: 'setSelf', personId });
    },
    createDm: (participant) => repository.dispatch({ type: 'createDm', participant }),
    createGroup: (name, members) => repository.dispatch({ type: 'createGroup', name, members }),
    createChannel: (input) => repository.dispatch({ type: 'createChannel', ...input }),
    joinChannel: (conversationId) => repository.dispatch({ type: 'joinChannel', conversationId }),
    archiveConversation: (conversationId) => repository.dispatch({ type: 'archiveConversation', conversationId }),
    send: (input) => repository.dispatch({ type: 'sendMessage', ...input }),
    retry: (messageId) => repository.dispatch({ type: 'retryMessage', messageId }),
    edit: (messageId, body, mentions) => repository.dispatch({ type: 'editMessage', messageId, body, mentions }),
    remove: (messageId) => repository.dispatch({ type: 'deleteMessage', messageId }),
    toggleReaction: (messageId, emoji) => repository.dispatch({ type: 'toggleReaction', messageId, emoji }),
    toggleSaved: (messageId, saved, savedAt) => repository.dispatch({ type: 'toggleSaved', messageId, ...(saved === undefined ? {} : { saved }), ...(savedAt ? { savedAt } : {}) }),
    markRead: (conversationId, seq) => repository.dispatch({ type: 'markRead', conversationId, seq }),
    markUnread: (conversationId, messageId) => repository.dispatch({ type: 'markUnread', conversationId, messageId }),
    setDraft: (conversationId, body, threadRootId, actorPersonId, refs, updatedAt) => {
      const result = repository.dispatch({ type: 'setDraft', conversationId, threadRootId, body, actorPersonId, refs, updatedAt }, { deferPersist: true });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { repository.flush(); }, DRAFT_FLUSH_MS);
      return result;
    },
    deriveSystemEvents: () => repository.dispatch({ type: 'deriveSystemEvents' }),
    flush: () => repository.flush(),
    dismissTrimNotice: () => repository.dismissTrimNotice()
  }), [repository]);

  const value = useMemo<MessagingContextValue>(() => ({
    state: snapshot.state, durable: snapshot.durable, dirty: snapshot.dirty, trimmed: snapshot.trimmed, recovery: snapshot.recovery,
    writesBlocked: snapshot.writesBlocked, lastError: snapshot.lastError, scope: { organizationId: scope.organizationId, workspaceId: scope.workspaceId }, work, actions
  }), [snapshot, scope.organizationId, scope.workspaceId, work, actions]);

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}
