import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react';
import { newClientId } from '../messaging/domain/ids.js';
import { MAX_BODY } from '../messaging/domain/types.js';
import type { EntityRef, Id, Message, ParticipantRef } from '../messaging/domain/types.js';
import type { ParticipantView } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import type { SendInput } from '../messaging/domain/reducer.js';
import { composerCharactersRemaining, composerLayoutBudget, entityRefKey, filterMentionCandidates, getMentionQuery, insertMention, normalizeComposerRefs, parseMentions, shouldSendOnEnter, shouldShowComposerCounter, toggleComposerRef, type ComposerLinkOption } from './composerModel.js';
import { MentionPicker } from './MentionPicker.js';
import { useDraft } from './useDraft.js';
import './composer.css';

export interface ComposerProps {
  conversationId: Id;
  threadRootId?: Id;
  conversationTitle?: string;
  actor: ParticipantRef;
  mentionCandidates: readonly ParticipantView[];
  /** Real task/approval records in the active workspace. File uploads are intentionally not supported. */
  linkOptions?: readonly ComposerLinkOption[];
  initialDraft?: string;
  initialDraftRefs?: readonly EntityRef[];
  /** Lets a retry from the feed/thread release the same composer failure state. */
  savedMessageIds?: ReadonlySet<Id>;
  onSendMessage: (input: SendInput) => DispatchResult | Promise<DispatchResult>;
  onSetDraft: (conversationId: Id, body: string, threadRootId?: Id, actorPersonId?: Id, refs?: EntityRef[]) => DispatchResult | Promise<DispatchResult>;
  onRetry: (messageId: Id) => DispatchResult | Promise<DispatchResult>;
  onFlush: () => boolean | Promise<boolean>;
  storageScope?: 'local' | 'workspace';
  pendingMessageId?: Id;
  doatNotConnected?: boolean;
  canSend?: boolean;
  editingMessage?: Message;
  onEditMessage?: (messageId: Id, body: string, mentions: SendInput['mentions']) => DispatchResult | Promise<DispatchResult>;
  onCancelEdit?: () => void;
}

const EMPTY_CANDIDATES: readonly ParticipantView[] = [];

export function Composer({
  conversationId, threadRootId, conversationTitle, actor, mentionCandidates = EMPTY_CANDIDATES, linkOptions = [], initialDraft = '', initialDraftRefs = [], savedMessageIds,
  onSendMessage, onSetDraft, onRetry, onFlush, doatNotConnected = false, canSend = true, storageScope = 'local', pendingMessageId,
  editingMessage, onEditMessage, onCancelEdit
}: ComposerProps): ReactElement {
  const draft = useDraft({ conversationId, threadRootId, actor, initialBody: initialDraft, initialRefs: initialDraftRefs, onSetDraft, onFlush });
  const [editingBody, setEditingBody] = useState(editingMessage?.body ?? '');
  const [editingPending, setEditingPending] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [failedMessageId, setFailedMessageId] = useState<Id>();
  const [failedEditId, setFailedEditId] = useState<Id>();
  const [failedDraftClear, setFailedDraftClear] = useState(false);
  const [status, setStatus] = useState('');
  const [mentionQuery, setMentionQuery] = useState<ReturnType<typeof getMentionQuery> | undefined>(undefined);
  const [activeMention, setActiveMention] = useState(0);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [refsExpanded, setRefsExpanded] = useState(false);
  const [compact, setCompact] = useState(false);
  const composerRef = useRef<HTMLElement>(null);
  const refsTriggerRef = useRef<HTMLButtonElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);
  const selectedRefsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linkTriggerRef = useRef<HTMLButtonElement>(null);
  const selectionRef = useRef<number | undefined>(undefined);
  const editingOwnMessage = Boolean(editingMessage && actor.kind === 'human' && editingMessage.author.kind === actor.kind && editingMessage.author.id === actor.id);
  const isEditing = Boolean(editingMessage && editingOwnMessage);
  const body = isEditing ? editingBody : draft.body;
  const linkedRefs = isEditing ? [] : draft.refs;
  const mentionMatches = useMemo(() => mentionQuery ? filterMentionCandidates(mentionCandidates, mentionQuery.query) : [], [mentionCandidates, mentionQuery]);
  const mentions = useMemo(() => parseMentions(body, mentionCandidates), [body, mentionCandidates]);
  const lengthNearLimit = shouldShowComposerCounter(body);
  const blockedByDoat = doatNotConnected && !canSend;
  const saveNeedsRetry = Boolean(failedMessageId || failedEditId || failedDraftClear);
  const sendingDisabled = !canSend || blockedByDoat || saveNeedsRetry || sendPending || editingPending || (isEditing && !onEditMessage) || (!body.trim() && linkedRefs.length === 0) || body.length > MAX_BODY;

  useEffect(() => { setEditingBody(editingMessage?.body ?? ''); setFailedEditId(undefined); }, [editingMessage?.id, editingMessage?.body]);
  useEffect(() => {
    setStatus('');
    setFailedMessageId(undefined);
    setFailedEditId(undefined);
    setFailedDraftClear(false);
    setMentionQuery(undefined);
    setLinkPickerOpen(false);
    setRefsExpanded(false);
  }, [conversationId, threadRootId, actor.kind, actor.id]);
  useEffect(()=>{
    if(pendingMessageId){setFailedMessageId(pendingMessageId);setStatus('Message status is unconfirmed. Retry to confirm it.');}
  },[pendingMessageId,conversationId]);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const composer = composerRef.current;
    if (!textarea || !composer) return;
    const pane = composer.closest<HTMLElement>('.gw-msg-thread, .gw-inbox-main') ?? composer.parentElement;
    const chromeHeight = pane ? [...pane.children].reduce((total, child) => {
      if (child === composer || child.classList.contains('gw-msg-feed') || child.classList.contains('gw-msg-thread__scroll')) return total;
      if (child.contains(composer)) {
        const wrapperStyle = window.getComputedStyle(child);
        return total + (Number.parseFloat(wrapperStyle.paddingTop) || 0) + (Number.parseFloat(wrapperStyle.paddingBottom) || 0);
      }
      return total + child.getBoundingClientRect().height;
    }, 0) : 0;
    const budget = composerLayoutBudget({ paneHeight: pane?.clientHeight ?? 500, chromeHeight, hasMode: Boolean(threadRootId || editingMessage), hasError: Boolean(status), hasDoatNote: doatNotConnected });
    setCompact(budget.compact);
    composer.style.setProperty('--composer-max-height', `${budget.composerHeight}px`);
    composer.style.setProperty('--composer-popup-height', `${budget.popupHeight}px`);
    textarea.style.height = '0px';
    const height = Math.max(20, Math.min(textarea.scrollHeight, budget.textareaHeight));
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > height ? 'auto' : 'hidden';
  }, [threadRootId, editingMessage?.id, status, doatNotConnected]);

  useEffect(() => {
    resizeTextarea();
    const pane = composerRef.current?.closest<HTMLElement>('.gw-msg-thread, .gw-inbox-main') ?? composerRef.current?.parentElement;
    if (!pane || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resizeTextarea);
    observer.observe(pane);
    window.addEventListener('resize', resizeTextarea);
    return () => { observer.disconnect(); window.removeEventListener('resize', resizeTextarea); };
  }, [resizeTextarea]);
  useEffect(() => { resizeTextarea(); }, [body, resizeTextarea]);
  useEffect(() => {
    if (!linkPickerOpen && !refsExpanded) return;
    const popup = linkPickerOpen ? linkPickerRef.current : selectedRefsRef.current;
    const request = requestAnimationFrame(() => popup?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !composerRef.current?.contains(event.target)) { setLinkPickerOpen(false); setRefsExpanded(false); }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => { cancelAnimationFrame(request); document.removeEventListener('pointerdown', closeOutside); };
  }, [linkPickerOpen, refsExpanded]);

  const savedLabel=storageScope==='local'?'Saved locally':'Sent';
  const clearDraftAfterSave = async (): Promise<boolean> => {
    const cleared = await draft.clearAfterSave();
    setFailedDraftClear(!cleared);
    return cleared;
  };

  useEffect(() => {
    if (!failedMessageId || !savedMessageIds?.has(failedMessageId)) return;
    setFailedMessageId(undefined);
    void draft.clearAfterSave().then(cleared=>{
      setFailedDraftClear(!cleared);
      setStatus(cleared ? savedLabel : `${savedLabel}, but the cleared draft was not durably saved.`);
    });
  }, [failedMessageId, savedMessageIds, draft.clearAfterSave,savedLabel]);

  const updateMentionQuery = useCallback((value: string, caret: number) => {
    const next = getMentionQuery(value, caret);
    setMentionQuery(next);
    setActiveMention(0);
  }, []);

  const setBody = useCallback((next: string) => {
    if (isEditing) setEditingBody(next.slice(0, MAX_BODY));
    else draft.setBody(next);
    const bounded = next.slice(0, MAX_BODY);
    updateMentionQuery(bounded, selectionRef.current ?? bounded.length);
    setStatus('');
  }, [isEditing, draft.setBody, updateMentionQuery]);

  const selectCandidate = useCallback((candidate: ParticipantView) => {
    if (!mentionQuery) return;
    const insertion = insertMention(body, mentionQuery, candidate);
    setBody(insertion.body);
    selectionRef.current = insertion.caret;
    setMentionQuery(undefined);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(insertion.caret, insertion.caret);
    });
  }, [body, mentionQuery, setBody]);

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery && mentionMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveMention((current) => (current + 1) % mentionMatches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMention((current) => (current + mentionMatches.length - 1) % mentionMatches.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
        event.preventDefault();
        selectCandidate(mentionMatches[activeMention] ?? mentionMatches[0]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(undefined);
        event.stopPropagation();
        return;
      }
    }
    if (shouldSendOnEnter({ key: event.key, shiftKey: event.shiftKey, nativeIsComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode })) {
      event.preventDefault();
      void submit();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value.slice(0, MAX_BODY);
    selectionRef.current = event.currentTarget.selectionStart;
    setBody(value);
  };

  const syncMentionCaret = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    if ('key' in event && event.key === 'Escape') return;
    const target = event.currentTarget;
    selectionRef.current = target.selectionStart;
    updateMentionQuery(target.value, target.selectionStart);
  };

  const submit = async () => {
    if (sendingDisabled) return;
    if (isEditing && editingMessage) {
      if (!onEditMessage) {
        setStatus('Editing is unavailable in this conversation.');
        return;
      }
      setEditingPending(true);
      setStatus('Saving edit…');
      try {
        const result = await onEditMessage(editingMessage.id, body, mentions);
        if (result.ok && result.durable) {
          setFailedEditId(undefined);
          setStatus(savedLabel);
          onCancelEdit?.();
        } else if (result.ok) {
          setFailedEditId(editingMessage.id);
          setStatus('Not durably saved. Retry to save this edit on this device.');
        }
        else setStatus(`Not saved: ${result.error.message}`);
      } catch {
        setStatus('Not saved. Try again.');
      } finally {
        setEditingPending(false);
      }
      return;
    }

    const clientId = newClientId(Date.now(), Math.random);
    setSendPending(true);
    setStatus(storageScope==='local'?'Saving locally…':'Sending…');
    try {
      const result = await onSendMessage({ conversationId, clientId, body, threadRootId, mentions, refs: linkedRefs });
      if (result.ok && result.durable) {
        setFailedMessageId(undefined);
        const cleared = await clearDraftAfterSave();
        setStatus(cleared ? savedLabel : `${savedLabel}, but the cleared draft was not durably saved.`);
        setMentionQuery(undefined);
      } else if (result.ok) {
        const messageId = result.value.messageId;
        setFailedMessageId(messageId);
        setStatus('Not durably saved. Retry before editing or sending another message.');
        draft.setBody(body);
        const restored = await draft.flush();
        if (restored) setStatus(storageScope==='local'?'Saved locally with a pending failure. Retry to finalize this message.':'Message status is unconfirmed. Retry to confirm it.');
      } else {
        setStatus(`Not saved: ${result.error.message}`);
      }
    } catch {
      setStatus('Not saved. Try again.');
    } finally {
      setSendPending(false);
    }
  };

  const retry = async () => {
    if ((!failedMessageId && !failedEditId && !failedDraftClear) || sendPending) return;
    setSendPending(true);
    setStatus(storageScope==='local'?'Retrying local save…':'Retrying send…');
    try {
      if (failedDraftClear && !failedMessageId && !failedEditId) {
        const cleared = await clearDraftAfterSave();
        setStatus(cleared ? savedLabel : 'Not durably saved. Retry again when storage is available.');
        return;
      }
      if (failedEditId) {
        const saved = await onFlush();
        if (saved) {
          setFailedEditId(undefined);
          setStatus(savedLabel);
          onCancelEdit?.();
        } else setStatus('Not durably saved. Retry again when storage is available.');
        return;
      }
      const result = await onRetry(failedMessageId!);
      if (result.ok && result.durable) {
        setFailedMessageId(undefined);
        const cleared = await clearDraftAfterSave();
        setStatus(cleared ? savedLabel : `${savedLabel}, but the cleared draft was not durably saved.`);
      } else if (result.ok) setStatus('Not durably saved. Retry again when storage is available.');
      else setStatus(`Not saved: ${result.error.message}`);
    } catch {
      setStatus('Not saved. Try again.');
    } finally {
      setSendPending(false);
    }
  };

  const pickerId = `gw-msg-mentions-${conversationId}-${threadRootId ?? 'main'}`;
  const activeOptionId = mentionMatches[activeMention] ? `${pickerId}-${mentionMatches[activeMention].ref.kind}-${mentionMatches[activeMention].ref.id}` : undefined;
  const selectedRefKeys = new Set(linkedRefs.map(entityRefKey));
  const availableLinks = useMemo(() => {
    const seen = new Set<string>();
    return linkOptions.filter((option) => {
      const key = entityRefKey(option.ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [linkOptions]);
  const toggleLink = (option: ComposerLinkOption): void => {
    if (option.disabled || saveNeedsRetry || sendPending || editingPending) return;
    const next = toggleComposerRef(linkedRefs, option.ref);
    if (next.length === linkedRefs.length && !selectedRefKeys.has(entityRefKey(option.ref))) {
      setStatus('A message can include up to 10 linked records.');
      return;
    }
    draft.setRefs(next);
    setStatus('');
  };

  const closeLinkPicker = (): void => { setLinkPickerOpen(false); requestAnimationFrame(() => linkTriggerRef.current?.focus()); };
  const closeSelectedRefs = (): void => {
    setRefsExpanded(false);
    requestAnimationFrame(() => (refsTriggerRef.current ?? linkTriggerRef.current ?? textareaRef.current)?.focus());
  };
  const popupKeys = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!buttons.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return <section ref={composerRef} className={`gw-msg-composer${isEditing ? ' is-editing' : ''}${compact ? ' is-compact' : ''}${saveNeedsRetry ? ' needs-retry' : ''}`} aria-label={threadRootId ? 'Thread reply composer' : 'Message composer'} onKeyDown={(event) => {
    if (event.key !== 'Escape') return;
    if (linkPickerOpen) { event.preventDefault(); event.stopPropagation(); closeLinkPicker(); }
    else if (refsExpanded) { event.preventDefault(); event.stopPropagation(); closeSelectedRefs(); }
    else if (isEditing && onCancelEdit) { event.preventDefault(); event.stopPropagation(); onCancelEdit(); requestAnimationFrame(() => textareaRef.current?.focus()); }
  }}>
    {(doatNotConnected || !canSend || (isEditing && !onEditMessage) || threadRootId || isEditing) && <div className="gw-msg-composer-context">
    {draft.error && <p className="gw-msg-doat-note" role="alert">{draft.error}</p>}
    {doatNotConnected && <p className="gw-msg-doat-note" role="note">Doat disconnected · saved on this device, not sent to a running Doat.</p>}
    {!canSend && <p className="gw-msg-blocked-note" role="status">Posting is unavailable in this conversation.</p>}
    {isEditing && !onEditMessage && <p className="gw-msg-blocked-note" role="status">Editing is unavailable here.</p>}
    {(threadRootId || isEditing) && <div className="gw-msg-mode-label">{isEditing ? 'Editing your message' : 'Replying in thread'}</div>}
    </div>}
    <div className="gw-msg-composer-box">
      <div className="gw-msg-textarea-wrap">
        {mentionQuery && mentionMatches.length > 0 && <MentionPicker
          candidates={mentionCandidates}
          id={pickerId}
          query={mentionQuery.query}
          activeIndex={activeMention}
          onSelect={selectCandidate}
          onActiveChange={setActiveMention}
        />}
        <textarea
          ref={textareaRef}
          className="gw-msg-textarea"
          aria-label={threadRootId ? 'Write a thread reply' : isEditing ? 'Edit message' : 'Write a message'}
          aria-autocomplete="list"
          aria-controls={mentionQuery ? pickerId : undefined}
          aria-activedescendant={activeOptionId}
          aria-describedby={`${pickerId}-help${lengthNearLimit ? ` ${pickerId}-counter` : ''} ${pickerId}-status`}
          placeholder={isEditing ? 'Edit your message' : threadRootId ? 'Reply in this thread' : conversationTitle ? `Message ${conversationTitle}` : 'Write a message'}
          value={body}
          maxLength={MAX_BODY}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleTextareaKeyDown}
          onClick={syncMentionCaret}
          onKeyUp={syncMentionCaret}
          onSelect={syncMentionCaret}
          disabled={!canSend || saveNeedsRetry || sendPending || editingPending}
        />
      </div>
      {!isEditing && linkedRefs.length > 0 && refsExpanded ? <div ref={selectedRefsRef} id={`${pickerId}-refs`} className="gw-msg-selected-refs" role="group" aria-label="Linked records" onKeyDown={popupKeys}>
        <div className="gw-msg-popup-heading"><strong>{linkedRefs.length} linked {linkedRefs.length === 1 ? 'record' : 'records'}</strong><button type="button" onClick={closeSelectedRefs}>Done</button></div>
        <ul className="gw-msg-links__selected">{linkedRefs.map((ref) => {
          const option = availableLinks.find((item) => entityRefKey(item.ref) === entityRefKey(ref));
          return <li key={entityRefKey(ref)}><span>{option?.label ?? 'Linked record'}</span><button type="button" disabled={saveNeedsRetry || sendPending || editingPending} aria-label={`Remove link to ${option?.label ?? 'record'}`} onClick={() => {
            draft.setRefs(toggleComposerRef(linkedRefs, ref));
            if (linkedRefs.length === 1) closeSelectedRefs();
            else requestAnimationFrame(() => selectedRefsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
          }}>Remove</button></li>;
        })}</ul>
      </div> : null}
      {!isEditing && availableLinks.length > 0 && linkPickerOpen ? <div ref={linkPickerRef} className="gw-msg-link-picker" role="group" aria-label="Link a task or approval" onKeyDown={popupKeys}>
        <div className="gw-msg-popup-heading"><strong>Link a record</strong><button type="button" className="gw-msg-link-picker__close" onClick={closeLinkPicker}>Done</button></div>
        <p>Tasks and approvals in this workspace</p>
        <ul>{availableLinks.map((option) => {
          const selected = selectedRefKeys.has(entityRefKey(option.ref));
          return <li key={entityRefKey(option.ref)}><button type="button" aria-pressed={selected} disabled={option.disabled || saveNeedsRetry || sendPending || editingPending} onClick={() => toggleLink(option)}><strong>{option.label}</strong>{option.detail ? <span>{option.detail}</span> : null}{selected ? <em>Linked</em> : null}</button></li>;
        })}</ul>
      </div> : null}
      <div className="gw-msg-composer-footer">
        <div className="gw-msg-composer-tools">
          {!isEditing && availableLinks.length > 0 ? <button ref={linkTriggerRef} type="button" disabled={saveNeedsRetry || sendPending || editingPending} className="gw-msg-secondary-button" aria-haspopup="true" aria-expanded={linkPickerOpen} onClick={() => { setLinkPickerOpen((open) => !open); setRefsExpanded(false); }}>Link record</button> : null}
          {!isEditing && linkedRefs.length > 0 ? <button ref={refsTriggerRef} type="button" className="gw-msg-linked-count" aria-expanded={refsExpanded} aria-controls={`${pickerId}-refs`} onClick={() => { setRefsExpanded((open) => !open); setLinkPickerOpen(false); }}>{linkedRefs.length} linked</button> : null}
          <span className="gw-msg-composer-hint" id={`${pickerId}-help`}>{isEditing ? 'Enter saves · Shift+Enter adds a line' : storageScope==='local'?'Enter saves locally · Shift+Enter adds a line':'Enter sends · Shift+Enter adds a line'}</span>
        </div>
        {lengthNearLimit && <span className="gw-msg-char-count" id={`${pickerId}-counter`} aria-live="polite">{composerCharactersRemaining(body)} left</span>}
        <div className="gw-msg-composer-actions">
          {saveNeedsRetry && <button className="gw-msg-retry-button" type="button" onClick={() => void retry()} disabled={sendPending} title={storageScope==='local'?'Retry saving this message locally':'Retry sending this message'}>Retry</button>}
          {isEditing && onCancelEdit && <button className="gw-msg-secondary-button" type="button" onClick={onCancelEdit} title="Cancel editing">Cancel</button>}
          <button className="gw-msg-send-button" type="button" onClick={() => void submit()} disabled={sendingDisabled} title={storageScope==='local'?(isEditing ? 'Save message edit locally' : 'Save message locally'):'Send message'}>
            {sendPending || editingPending ? 'Saving…' : isEditing ? 'Save edit' : 'Send'}
          </button>
        </div>
      </div>
    </div>
    <div className={`gw-msg-status-row${saveNeedsRetry || status.startsWith('Not saved') ? ' is-error' : ''}`}>
      <span className="gw-msg-save-status" id={`${pickerId}-status`} role="status" aria-live="polite">{status}</span>
    </div>
  </section>;
}
