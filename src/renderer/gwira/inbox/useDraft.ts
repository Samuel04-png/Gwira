import { useCallback, useEffect, useRef, useState } from 'react';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import type { EntityRef, ParticipantRef } from '../messaging/domain/types.js';
import { FLUSH_DRAFTS_EVENT } from '../messaging/react/useMessaging.js';
import { composerDraftKey, limitComposerBody, normalizeComposerRefs } from './composerModel.js';

export interface UseDraftOptions {
  conversationId: string;
  threadRootId?: string;
  actor: ParticipantRef;
  initialBody?: string;
  initialRefs?: readonly EntityRef[];
  onSetDraft: (conversationId: string, body: string, threadRootId?: string, actorPersonId?: string, refs?: EntityRef[]) => DispatchResult | Promise<DispatchResult>;
  onFlush: () => boolean | Promise<boolean>;
  debounceMs?: number;
}

export interface UseDraftResult {
  body: string;
  refs: EntityRef[];
  setBody: (body: string) => void;
  setRefs: (refs: readonly EntityRef[]) => void;
  flush: () => Promise<boolean>;
  clearAfterSave: () => Promise<boolean>;
  error: string;
}

/** Fired by the page before the local actor changes so pending drafts are written for the actor who typed them. */
export { FLUSH_DRAFTS_EVENT };

interface PendingDraft extends Pick<UseDraftOptions, 'conversationId' | 'threadRootId' | 'onSetDraft' | 'onFlush'> {
  key: string;
  actorId: string;
  body: string;
  refs: EntityRef[];
}

export function useDraft(options: UseDraftOptions): UseDraftResult {
  const { conversationId, threadRootId, actor, onSetDraft, onFlush, debounceMs = 450 } = options;
  const key = composerDraftKey(conversationId, threadRootId, actor);
  const initialBody = limitComposerBody(options.initialBody ?? '');
  const initialRefs = normalizeComposerRefs(options.initialRefs ?? []);
  const [stored, setStored] = useState(() => ({ key, body: initialBody, refs: initialRefs }));
  const pending = useRef<PendingDraft | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writes = useRef<Promise<boolean>>(Promise.resolve(true));
  const mounted = useRef(true);
  const [error,setError] = useState('');
  const body = stored.key === key ? stored.body : initialBody;
  const refs = stored.key === key ? stored.refs : initialRefs;

  const save = useCallback((next:PendingDraft):Promise<boolean> => {
    const task=writes.current.then(async()=>{
      const result=await next.onSetDraft(next.conversationId,next.body,next.threadRootId,next.actorId,next.refs);
      return result.ok && await next.onFlush();
    }).then(saved=>{
      if(mounted.current)setError(saved?'':'Draft could not be saved.');
      return saved;
    }).catch(()=>{
      if(mounted.current)setError('Draft could not be saved.');
      else console.warn('[inbox] Draft could not be saved.');
      return false;
    });
    writes.current=task;return task;
  },[]);
  const flushPending = useCallback((expectedKey?: string): Promise<boolean> => {
    const next = pending.current;
    if (!next || (expectedKey !== undefined && next.key !== expectedKey)) return writes.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    pending.current = undefined;
    return save(next);
  }, [save]);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  useEffect(() => () => {
    void flushPending(key);
  }, [key, flushPending]);

  useEffect(() => {
    const onFlush = (): void => { void flushPending(); };
    window.addEventListener(FLUSH_DRAFTS_EVENT, onFlush);
    window.addEventListener('pagehide', onFlush);
    return () => {
      window.removeEventListener(FLUSH_DRAFTS_EVENT, onFlush);
      window.removeEventListener('pagehide', onFlush);
    };
  }, [flushPending]);

  const queueDraft = useCallback((nextBody: string, nextRefs: readonly EntityRef[]) => {
    const bounded = limitComposerBody(nextBody);
    const normalizedRefs = normalizeComposerRefs(nextRefs);
    setStored({ key, body: bounded, refs: normalizedRefs });
    pending.current = { key, actorId: actor.id, body: bounded, refs: normalizedRefs, conversationId, threadRootId, onSetDraft, onFlush };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flushPending(key); }, debounceMs);
  }, [key, actor.id, conversationId, threadRootId, onSetDraft, onFlush, debounceMs, flushPending]);

  const setBody = useCallback((nextBody: string) => {
    queueDraft(nextBody, refs);
  }, [queueDraft, refs]);

  const setRefs = useCallback((nextRefs: readonly EntityRef[]) => {
    queueDraft(body, nextRefs);
  }, [queueDraft, body]);

  const clearAfterSave = useCallback(() => {
    if (pending.current?.key === key) pending.current = undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    setStored({ key, body: '', refs: [] });
    return save({key,actorId:actor.id,conversationId,threadRootId,body:'',refs:[],onSetDraft,onFlush});
  }, [key, actor.id, conversationId, threadRootId, onSetDraft, onFlush,save]);

  return {
    body,
    refs,
    setBody,
    setRefs,
    flush: () => flushPending(key),
    clearAfterSave,
    error
  };
}
