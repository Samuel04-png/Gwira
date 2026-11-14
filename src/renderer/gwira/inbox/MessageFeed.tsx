import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FeedView, MessageView } from '../messaging/domain/selectors.js';
import type { Message, ParticipantRef } from '../messaging/domain/types.js';
import { avatarInitials, buildFeedRows, formatTimeLabel, isNearBottom, sendStateLabel } from './inboxNavModel.js';
import { createFeedScrollCache, feedScrollKey, restoredFeedScrollTop } from './feedScrollModel.js';
import './messageFeed.css';

const sessionScrollPositions = createFeedScrollCache();

export interface MessageFeedProps {
  feed: FeedView | undefined;
  renderActions?: (view: MessageView) => React.ReactNode;
  onRetry?: (message: Message) => void;
  onOpenTask?: (taskId: string) => void;
  onReply?: (message: Message) => void;
  highlightedMessageId?: string;
  /** Organization/workspace/actor identity. Only viewport metadata is cached. */
  scrollScopeKey?: string;
  storageScope?: 'local' | 'workspace';
}

export function MessageAvatar({ author, name }: { author: ParticipantRef; name: string }): React.ReactElement {
  return <span className={`gw-msg-avatar gw-msg-avatar--${author.kind}`} data-person-id={author.kind === 'human' ? author.id : undefined} aria-hidden="true">{author.kind === 'system' ? '•' : avatarInitials(name)}</span>;
}

export function MessageFeed({ feed, renderActions, onRetry, onOpenTask, onReply, highlightedMessageId, scrollScopeKey, storageScope = 'local' }: MessageFeedProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const lastKeyRef = useRef<string | undefined>(undefined);
  const lastHighlightRef = useRef<string | undefined>(undefined);
  const lastMessageRef = useRef<string | undefined>(undefined);
  const lastCountRef = useRef(0);
  const instancePositions = useRef(createFeedScrollCache());
  const positions = scrollScopeKey ? sessionScrollPositions : instancePositions.current;
  const [behind, setBehind] = useState(false);
  const rows = useMemo(() => (feed ? buildFeedRows(feed.messages, feed.newMessagesFromSeq) : []), [feed]);
  const conversationId = feed?.conversation.id;
  const key = conversationId ? feedScrollKey(scrollScopeKey ?? '', conversationId) : undefined;
  const count = feed?.messages.length ?? 0;
  const last = feed?.messages[count - 1];
  const liveKeyRef = useRef(key);
  const livePositionsRef = useRef(positions);
  liveKeyRef.current = key;
  livePositionsRef.current = positions;

  const rememberPosition = useCallback((): void => {
    const el = scrollRef.current;
    const currentKey = liveKeyRef.current;
    if (!el || !currentKey) return;
    const top = el.getBoundingClientRect().top;
    const anchor = Array.from(el.querySelectorAll<HTMLElement>('[data-message-id]')).find((row) => row.getBoundingClientRect().bottom > top);
    livePositionsRef.current.set(currentKey, {
      anchorId: anchor?.dataset.messageId,
      anchorOffset: anchor ? anchor.getBoundingClientRect().top - top : 0,
      scrollTop: el.scrollTop,
      followLatest: followRef.current
    });
  }, []);

  const restorePosition = useCallback((): boolean => {
    const el = scrollRef.current;
    const currentKey = liveKeyRef.current;
    const snapshot = currentKey ? livePositionsRef.current.get(currentKey) : undefined;
    if (!el || !snapshot) return false;
    const anchor = snapshot.anchorId ? el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(snapshot.anchorId)}"]`) : undefined;
    const anchorTop = anchor ? anchor.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop : undefined;
    el.scrollTop = restoredFeedScrollTop(snapshot, anchorTop, el.scrollHeight - el.clientHeight);
    followRef.current = snapshot.followLatest;
    setBehind(!snapshot.followLatest);
    return true;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sourceKey = highlightedMessageId && key ? `${key}:${highlightedMessageId}` : undefined;
    const source = highlightedMessageId ? el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(highlightedMessageId)}"]`) : undefined;
    if (source && sourceKey !== lastHighlightRef.current) {
      source.scrollIntoView({ block: 'center' });
      source.focus({ preventScroll: true });
      followRef.current = isNearBottom(el.scrollHeight, el.scrollTop, el.clientHeight);
      setBehind(!followRef.current);
      lastHighlightRef.current = sourceKey;
    } else if (lastKeyRef.current !== key) {
      if (!restorePosition()) {
        const divider = el.querySelector<HTMLElement>('[data-gw-unread-divider]');
        if (divider) { el.scrollTop = Math.max(0, divider.offsetTop - 24); followRef.current = false; setBehind(true); }
        else { el.scrollTop = el.scrollHeight; followRef.current = true; setBehind(false); }
      }
    } else if (last?.message.id !== lastMessageRef.current) {
      if (followRef.current || (count > lastCountRef.current && last?.isOwn)) { el.scrollTop = el.scrollHeight; followRef.current = true; setBehind(false); }
      else { restorePosition(); setBehind(true); }
    }
    if (!highlightedMessageId) lastHighlightRef.current = undefined;
    lastKeyRef.current = key;
    lastMessageRef.current = last?.message.id;
    lastCountRef.current = count;
    rememberPosition();
  }, [key, count, last?.message.id, last?.isOwn, highlightedMessageId, rememberPosition, restorePosition]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const history = historyRef.current;
    if (!scroll || !history || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      restorePosition();
      rememberPosition();
    });
    observer.observe(scroll);
    observer.observe(history);
    return () => observer.disconnect();
  }, [Boolean(feed), rememberPosition, restorePosition]);

  if (!feed) return <div className="gw-msg-feed gw-msg-feed--empty" role="status"><h2>Conversation unavailable</h2><p>It may have been removed or you may not have access.</p></div>;

  const jumpToLatest = (): void => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    followRef.current = true;
    setBehind(false);
    rememberPosition();
  };

  return <div className="gw-msg-feed">
    <div className="gw-msg-feed__scroll" ref={scrollRef} role="log" aria-label={`${feed.title} messages`} tabIndex={0} onScroll={(event) => {
      const el = event.currentTarget;
      followRef.current = isNearBottom(el.scrollHeight, el.scrollTop, el.clientHeight);
      if (followRef.current) setBehind(false);
      rememberPosition();
    }}>
      <div className="gw-msg-feed__history" ref={historyRef}>
        {rows.length === 0 ? <div className="gw-msg-feed__empty"><h2>No messages yet</h2><p>{feed.canPost ? storageScope==='local'?'Write the first message. It will be saved on this device.':'Write the first message to this channel.' : 'Nothing has been posted in this conversation.'}</p></div> : null}
        {rows.map((row) => {
          if (row.kind === 'day') return <div key={row.key} className="gw-msg-day" role="separator"><span>{row.label}</span></div>;
          if (row.kind === 'unread') return <div key={row.key} className="gw-msg-unread" role="separator" data-gw-unread-divider=""><span>New messages</span></div>;
          const first = row.messages[0]!;
          const isSystem = first.message.type !== 'text';
          return <section key={row.key} className={`gw-msg-group${isSystem ? ' gw-msg-group--system' : ''}`}>
            <MessageAvatar author={row.author} name={first.author.name} />
            <div className="gw-msg-group__body">
              <div className="gw-msg-group__head">
                <strong className={`gw-msg-author${first.author.available ? '' : ' is-unavailable'}`}>{first.author.name}</strong>
                {row.author.kind === 'doat' ? <span className="gw-msg-author__kind">Doat</span> : null}
                <time dateTime={first.message.createdAt} title={new Date(first.message.createdAt).toLocaleString()}>{formatTimeLabel(first.message.createdAt)}</time>
              </div>
              {row.messages.map((view, index) => <MessageRow key={view.message.id} view={view} grouped={index > 0} highlighted={highlightedMessageId === view.message.id} renderActions={renderActions} onRetry={onRetry} onOpenTask={onOpenTask} onReply={onReply} />)}
            </div>
          </section>;
        })}
      </div>
    </div>
    {behind ? <button type="button" className="gw-msg-feed__jump" onClick={jumpToLatest}>Jump to latest</button> : null}
  </div>;
}

interface MessageRowProps {
  view: MessageView;
  grouped: boolean;
  highlighted: boolean;
  renderActions: MessageFeedProps['renderActions'];
  onRetry: MessageFeedProps['onRetry'];
  onOpenTask: MessageFeedProps['onOpenTask'];
  onReply: MessageFeedProps['onReply'];
}

function MessageRow({ view, grouped, highlighted, renderActions, onRetry, onOpenTask, onReply }: MessageRowProps): React.ReactElement {
  const { message } = view;
  const state = sendStateLabel(view);
  const actions = view.isDeleted ? null : renderActions?.(view);
  return <article tabIndex={actions || highlighted ? 0 : undefined} aria-label={`Message from ${view.author.name}${highlighted ? ', source message' : ''}`} className={`gw-msg-row${view.unread ? ' is-unread' : ''}${view.mentionsActor ? ' is-mention' : ''}${view.isDeleted ? ' is-deleted' : ''}${highlighted ? ' is-source' : ''}`} data-message-id={message.id}>
    <div className="gw-msg-row__content">
      {grouped ? <time className="gw-msg-row__time" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{formatTimeLabel(message.createdAt)}</time> : null}
      {highlighted ? <span className="gw-msg-row__source-label">Source message</span> : null}
      {view.isDeleted ? <p className="gw-msg-row__text is-deleted">This message was deleted.</p> : message.body ? <p className="gw-msg-row__text">{message.body}</p> : null}
      {!view.isDeleted && message.editedAt ? <span className="gw-msg-row__meta">edited</span> : null}
      {!view.isDeleted && message.attachments.length > 0 ? <ul className="gw-msg-row__attachments">{message.attachments.map((file) => <li key={file.id}><strong>{file.name}</strong><span>Name only · file not stored</span></li>)}</ul> : null}
      {!view.isDeleted && view.refs.length > 0 ? <ul className="gw-msg-row__refs">{view.refs.map((ref, index) => <li key={index}>
        {ref.status === 'available' && ref.taskId && onOpenTask ? <button type="button" onClick={() => onOpenTask(ref.taskId!)}><span className="gw-msg-ref__kind">{ref.ref.kind === 'approval' ? 'Approval' : 'Task'}</span>{ref.label}</button>
          : <span className={ref.status === 'available' ? '' : 'is-unavailable'}>{ref.label}</span>}
      </li>)}</ul> : null}
      {!view.isDeleted && view.reactions.length > 0 ? <ul className="gw-msg-row__reactions" aria-label="Reactions">{view.reactions.map((reaction) => <li key={reaction.emoji} className={reaction.reactedByActor ? 'is-own' : ''} aria-label={`${reaction.emoji}, ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}${reaction.reactedByActor ? ', including yours' : ''}`}>{reaction.emoji} <span>{reaction.count}</span></li>)}</ul> : null}
      {!view.isDeleted && view.replyCount > 0 ? <div className="gw-msg-row__thread-summary">
        {onReply ? <button type="button" className="gw-msg-row__reply" onClick={() => onReply(message)} aria-label={`Open thread with ${view.replyCount} ${view.replyCount === 1 ? 'reply' : 'replies'}`}>{view.replyCount} {view.replyCount === 1 ? 'reply' : 'replies'}</button> : <span className="gw-msg-row__meta">{view.replyCount} {view.replyCount === 1 ? 'reply' : 'replies'}</span>}
        {view.lastReplyAt ? <time dateTime={view.lastReplyAt} title={new Date(view.lastReplyAt).toLocaleString()}>Last reply {formatTimeLabel(view.lastReplyAt)}</time> : null}
      </div> : null}
      {state?.failed && view.isOwn ? <span className="gw-msg-row__state is-failed">Not saved on this device{onRetry ? <> · <button type="button" onClick={() => onRetry(message)}>Retry</button></> : null}</span> : null}
    </div>
    {actions ? <div className="gw-msg-row__actions" role="toolbar" aria-label="Message actions">{actions}</div> : null}
  </article>;
}
