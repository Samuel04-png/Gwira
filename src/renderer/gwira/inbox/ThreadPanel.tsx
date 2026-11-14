import { Icon } from "../../components/Icon.js";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MessageView, ParticipantView, ThreadView } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import type { SendInput } from '../messaging/domain/reducer.js';
import type { EntityRef, Id, Message, ParticipantRef } from '../messaging/domain/types.js';
import { Composer } from './Composer.js';
import type { ComposerLinkOption } from './composerModel.js';
import { MessageActions } from './MessageActions.js';
import type { MessageActionsProps } from './MessageActions.js';
import { MessageAvatar } from './MessageFeed.js';
import { ReactionBar } from './ReactionBar.js';
import { formatTimeLabel } from './inboxNavModel.js';
import { threadHeading } from './threadsModel.js';
import { actionFailureMessage } from './threadsModel.js';
import { createFeedScrollCache, feedScrollKey, restoredFeedScrollTop } from './feedScrollModel.js';
import { isNearBottom } from './inboxNavModel.js';
import './threads.css';

const sessionThreadPositions = createFeedScrollCache();

export interface ThreadPanelProps {
  /** Output of selectThread(); undefined means the thread is unavailable. */
  thread: ThreadView | undefined;
  conversationId: Id;
  actor: ParticipantRef;
  mentionCandidates: readonly ParticipantView[];
  initialDraft?: string;
  initialDraftRefs?: readonly EntityRef[];
  savedMessageIds?: ReadonlySet<Id>;
  linkOptions?: readonly ComposerLinkOption[];
  onClose: () => void;
  onSendMessage: (input: SendInput) => DispatchResult | Promise<DispatchResult>;
  onSetDraft: (conversationId: Id, body: string, threadRootId?: Id, actorPersonId?: Id, refs?: EntityRef[]) => DispatchResult;
  onRetry: (messageId: Id) => DispatchResult | Promise<DispatchResult>;
  onFlush: () => boolean;
  onEditMessage: (messageId: Id, body: string, mentions: SendInput['mentions']) => DispatchResult | Promise<DispatchResult>;
  onToggleReaction: MessageActionsProps['onToggleReaction'];
  onToggleSaved: MessageActionsProps['onToggleSaved'];
  onMarkUnread: MessageActionsProps['onMarkUnread'];
  onDelete: MessageActionsProps['onDelete'];
  doatNotConnected?: boolean;
  onOpenTask?: (taskId: string) => void;
  highlightedMessageId?: string;
  /** Organization/workspace/actor identity for ephemeral viewport metadata. */
  scrollScopeKey?: string;
  /** Captured by the host before making the underlying conversation inert. */
  returnFocusTo?: HTMLElement | null;
  /** 'page' renders the discussion inside the Threads page: no close button, no focus stealing, connected timeline. */
  variant?: 'drawer' | 'page';
  conversationTitle?: string;
  onOpenConversation?: () => void;
  /** Narrow master/detail only: returns to the thread list. */
  onBack?: () => void;
}

export function ThreadPanel(props: ThreadPanelProps): React.ReactElement {
  const { thread, conversationId, actor, mentionCandidates, initialDraft, onClose, onSendMessage, onSetDraft, onRetry, onFlush, onEditMessage, onToggleReaction, onToggleSaved, onMarkUnread, onDelete, doatNotConnected } = props;
  const [editing, setEditing] = useState<Message | undefined>();
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const instancePositions = useRef(createFeedScrollCache());
  const positions = props.scrollScopeKey ? sessionThreadPositions : instancePositions.current;
  const [reactionStatus, setReactionStatus] = useState('');
  const [behind, setBehind] = useState(false);
  const returnFocus = useRef<Element | null>(null);
  const rootId = thread?.root.message.id;
  const key = rootId ? feedScrollKey(props.scrollScopeKey ?? '', `${conversationId}:${rootId}`) : undefined;
  const lastKey = useRef<string | undefined>(undefined);
  const lastReply = useRef<string | undefined>(undefined);
  const lastHighlight = useRef<string | undefined>(undefined);
  const following = useRef(true);
  const live = useRef({ key, positions });
  live.current = { key, positions };

  const rememberScroll = useCallback((): void => {
    const el = scrollRef.current;
    if (!el || !live.current.key) return;
    const top = el.getBoundingClientRect().top;
    const anchor = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find((row) => row.getBoundingClientRect().bottom > top);
    live.current.positions.set(live.current.key, { anchorId: anchor?.dataset.messageId, anchorOffset: anchor ? anchor.getBoundingClientRect().top - top : 0, scrollTop: el.scrollTop, followLatest: following.current });
  }, []);
  const restoreScroll = useCallback((): boolean => {
    const el = scrollRef.current;
    const snapshot = live.current.key ? live.current.positions.get(live.current.key) : undefined;
    if (!el || !snapshot) return false;
    const anchor = snapshot.anchorId ? el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(snapshot.anchorId)}"]`) : undefined;
    const anchorTop = anchor ? anchor.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop : undefined;
    el.scrollTop = restoredFeedScrollTop(snapshot, anchorTop, el.scrollHeight - el.clientHeight);
    following.current = snapshot.followLatest;
    setBehind(!snapshot.followLatest);
    return true;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !thread) return;
    const highlightKey = props.highlightedMessageId && key ? `${key}:${props.highlightedMessageId}` : undefined;
    const target = props.highlightedMessageId ? el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(props.highlightedMessageId)}"]`) : undefined;
    const latest = thread.replies.at(-1);
    if (target && highlightKey !== lastHighlight.current) {
      target.scrollIntoView({ block: 'center' });
      target.focus({ preventScroll: true });
      following.current = isNearBottom(el.scrollHeight, el.scrollTop, el.clientHeight);
    } else if (lastKey.current !== key) {
      if (!restoreScroll()) { el.scrollTop = 0; following.current = isNearBottom(el.scrollHeight, 0, el.clientHeight); }
    } else if (latest?.message.id !== lastReply.current && latest) {
      if (following.current || latest.isOwn) { el.scrollTop = el.scrollHeight; following.current = true; }
      else restoreScroll();
    }
    lastKey.current = key;
    lastReply.current = latest?.message.id;
    lastHighlight.current = highlightKey;
    setBehind(!following.current);
    rememberScroll();
  }, [key, thread?.replies.length, thread?.replies.at(-1)?.message.id, props.highlightedMessageId, rememberScroll, restoreScroll]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const history = historyRef.current;
    if (!scroll || !history || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { restoreScroll(); rememberScroll(); });
    observer.observe(scroll); observer.observe(history);
    return () => observer.disconnect();
  }, [Boolean(thread), rememberScroll, restoreScroll]);

  const isPage = props.variant === 'page';
  useEffect(() => {
    if (isPage) return;
    returnFocus.current = props.returnFocusTo ?? document.activeElement;
    if (!props.highlightedMessageId) panelRef.current?.focus();
    return () => {
      const target = returnFocus.current;
      // Let the host release its inert overlay background before returning focus.
      requestAnimationFrame(() => {
        if (target instanceof HTMLElement && target.isConnected) {
          target.closest<HTMLElement>('.gw-msg-row')?.focus();
          target.focus();
        }
      });
    };
  }, []);
  useEffect(() => { setEditing(undefined); setReactionStatus(''); }, [rootId, actor.id]);
  // Drop an edit target that was deleted or is no longer editable.
  useEffect(() => {
    if (!editing || !thread) return;
    const views = [thread.root, ...thread.replies];
    const current = views.find((view) => view.message.id === editing.id);
    if (!current || !current.canEdit || current.isDeleted) setEditing(undefined);
  }, [thread, editing]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (isPage && !editing) return;
    event.stopPropagation();
    if (editing) setEditing(undefined);
    else onClose();
  };

  const header = isPage
    ? <header className="gw-msg-thread__header is-page">
      {props.onBack ? <button type="button" className="gw-msg-action gw-msg-action--label" onClick={props.onBack}><Icon name="back" /> Threads</button> : null}
      <h2 id="gw-msg-thread-title"><span className="gw-msg-thread__where">{props.conversationTitle ?? 'Conversation'}</span>{thread ? <span> · {threadHeading(thread.replies.length)}</span> : null}</h2>
      {props.onOpenConversation ? <button type="button" className="gw-msg-action gw-msg-action--label gw-msg-thread__open" onClick={props.onOpenConversation}>Open conversation</button> : null}
    </header>
    : <header className="gw-msg-thread__header">
      <h2 id="gw-msg-thread-title">Thread{thread ? <span> · {threadHeading(thread.replies.length)}</span> : null}</h2>
      <button type="button" className="gw-msg-action" aria-label="Close thread" onClick={onClose}><span aria-hidden="true"><Icon name="close" /></span></button>
    </header>;
  const Shell = isPage ? 'section' : 'aside';
  const shellRole = isPage ? 'region' : 'complementary';
  const shellClass = `gw-msg-thread${isPage ? ' is-page' : ''}`;

  if (!thread) {
    return <Shell className={shellClass} ref={panelRef as React.Ref<HTMLElement>} tabIndex={-1} role={shellRole} aria-labelledby="gw-msg-thread-title" onKeyDown={onKeyDown}>
      {header}
      <p className="gw-msg-thread__empty" role="status">This thread is unavailable. It may have been removed or you may not have access.</p>
    </Shell>;
  }

  const renderRow = (view: MessageView, isRoot: boolean): React.ReactElement => {
    const { message } = view;
    return <article tabIndex={0} aria-label={`Message from ${view.author.name}`} key={message.id} className={`gw-msg-thread__row${isRoot ? ' is-root' : ''}${view.unread ? ' is-unread' : ''}${view.isDeleted ? ' is-deleted' : ''}${props.highlightedMessageId === message.id ? ' is-source' : ''}`} data-message-id={message.id}>
      <MessageAvatar author={message.author} name={view.author.name} />
      <div className="gw-msg-thread__body">
        {isRoot && !isPage ? <span className="gw-msg-thread__source-label">Original message</span> : null}
        {props.highlightedMessageId === message.id ? <span className="gw-msg-thread__source-label">Source message</span> : null}
        <div className="gw-msg-thread__meta"><strong>{view.author.name}</strong>{message.author.kind === 'doat' ? <span>Doat</span> : null}<time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{formatTimeLabel(message.createdAt)}</time>{message.editedAt && !view.isDeleted ? <span>edited</span> : null}{isPage && view.unread ? <span className="gw-msg-thread__new">New</span> : null}</div>
        {view.isDeleted
          ? <p className="gw-msg-thread__text is-deleted">This message was deleted.</p>
          : <p className="gw-msg-thread__text">{message.body}</p>}
        {!view.isDeleted && message.sendState === 'failed' && view.isOwn
          ? <button type="button" className="gw-msg-thread__failed" onClick={() => { void onRetry(message.id); }}>Not saved — Retry</button>
          : null}
        {!view.isDeleted && message.attachments.length > 0 ? <ul className="gw-msg-row__attachments">{message.attachments.map((file) => <li key={file.id}>{file.name} <span>(name only, file not stored)</span></li>)}</ul> : null}
        {!view.isDeleted ? <ReactionBar reactions={view.reactions} disabled={message.sendState === 'failed'} onToggle={(emoji) => { setReactionStatus(actionFailureMessage(onToggleReaction(message.id, emoji), 'update reaction') ?? ''); }} /> : null}
        {!view.isDeleted && view.refs.length > 0 ? <ul className="gw-msg-row__refs">{view.refs.map((ref, index) => <li key={index}>{ref.status === 'available' && ref.taskId && props.onOpenTask ? <button type="button" onClick={() => props.onOpenTask?.(ref.taskId!)}>{ref.ref.kind === 'approval' ? 'Approval: ' : ref.ref.kind === 'task' ? 'Task: ' : ''}{ref.label}</button> : <span className={ref.status === 'available' ? undefined : 'is-unavailable'}>{ref.label}</span>}</li>)}</ul> : null}
        {!view.isDeleted ? <div className="gw-msg-thread__actions" role="toolbar" aria-label="Message actions"><MessageActions view={view} inThread canPost={thread.canPost} onToggleReaction={onToggleReaction} onToggleSaved={onToggleSaved} onMarkUnread={onMarkUnread} onDelete={onDelete} onEdit={setEditing} /></div> : null}
      </div>
    </article>;
  };

  return <Shell className={shellClass} ref={panelRef as React.Ref<HTMLElement>} tabIndex={-1} role={shellRole} aria-labelledby="gw-msg-thread-title" onKeyDown={onKeyDown}>
    {header}
    <div className="gw-msg-thread__scroll" ref={scrollRef} onScroll={() => {
      const el = scrollRef.current;
      if (el) { following.current = isNearBottom(el.scrollHeight, el.scrollTop, el.clientHeight); setBehind(!following.current); rememberScroll(); }
    }}>
      <div ref={historyRef}>
      {renderRow(thread.root, true)}
      <div className="gw-msg-thread__divider" role="separator" aria-label={threadHeading(thread.replies.length)}><span>{threadHeading(thread.replies.length)}</span></div>
      {thread.replies.map((reply) => renderRow(reply, false))}
      </div>
    </div>
    {behind ? <button className="gw-msg-thread__jump" type="button" onClick={() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; following.current = true; setBehind(false); rememberScroll(); }}>Jump to latest reply</button> : null}
    {reactionStatus ? <p className="gw-msg-thread__status" role="status">{reactionStatus}</p> : null}
    <div className="gw-msg-thread__composer">
      {thread.canPost || editing
        ? <Composer
          conversationId={conversationId}
          threadRootId={thread.root.message.id}
          actor={actor}
          mentionCandidates={mentionCandidates}
          linkOptions={props.linkOptions}
          initialDraft={initialDraft}
          initialDraftRefs={props.initialDraftRefs}
          savedMessageIds={props.savedMessageIds}
          onSendMessage={onSendMessage}
          onSetDraft={onSetDraft}
          onRetry={onRetry}
          onFlush={onFlush}
          doatNotConnected={doatNotConnected}
          canSend={thread.canPost}
          editingMessage={editing}
          onEditMessage={onEditMessage}
          onCancelEdit={() => setEditing(undefined)}
        />
        : <p className="gw-msg-thread__empty" role="status">You can’t reply in this thread.</p>}
    </div>
  </Shell>;
}
