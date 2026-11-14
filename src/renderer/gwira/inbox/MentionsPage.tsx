import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InboxEmptyState } from './InboxEmptyState.js';
import { InboxRow } from './InboxRow.js';
import { InboxGroupHeading, InboxViewList } from './InboxViewList.js';
import { ShellIcon } from '../../components/Icon.js';
import { MessageAvatar } from './MessageFeed.js';
import { isEditableTarget } from './inboxNavModel.js';
import { bodySegments, relativeTimeLabel } from './unreadModel.js';
import {
  MENTION_FILTERS, filterMentions, groupMentions, mentionPlace, mentionTimeLabel, mentionUnreadCount, type MentionFilter
} from './mentionsModel.js';
import type { ConversationListItem, MessageView } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import './mentions.css';

export interface MentionsPageProps {
  /** Messages that mention the current person, newest first. */
  views: readonly MessageView[];
  conversations: readonly ConversationListItem[];
  /** Organization, workspace and actor identity. The filter choice resets when it changes. */
  scopeKey: string;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  /** Advances the read cursor up to this message only; later messages stay unread. */
  onMarkRead: (conversationId: string, seq: number) => DispatchResult;
  onToggleSaved: (messageId: string) => DispatchResult;
  now?: Date;
}

export function MentionsPage({ views, conversations, scopeKey, onOpenMessage, onMarkRead, onToggleSaved, now: nowProp }: MentionsPageProps): React.ReactElement {
  const [choice, setChoice] = useState<MentionFilter>();
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<string | undefined>(undefined);
  const now = useMemo(() => nowProp ?? new Date(), [views, nowProp]);
  const places = useMemo(() => new Map(conversations.map((item) => [item.conversation.id, item] as const)), [conversations]);
  const unread = mentionUnreadCount(views);
  // With nothing unread the page opens on All, unless the person explicitly picked a filter.
  const filter: MentionFilter = choice ?? (unread === 0 ? 'all' : 'unread');
  const visible = useMemo(() => filterMentions(views, filter), [views, filter]);
  const groups = useMemo(() => groupMentions(visible, now), [visible, now]);

  useLayoutEffect(() => { setChoice(undefined); setError(''); }, [scopeKey]);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = undefined;
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-inbox-row="${CSS.escape(target)}"]`);
    (row ?? rootRef.current?.querySelector<HTMLElement>('[data-mentions-focus]'))?.focus();
  }, [views, filter]);

  const markRead = (view: MessageView): void => {
    if (!view.unread) return;
    const index = visible.indexOf(view);
    const own = view.message.id;
    pendingFocus.current = filter === 'all' ? own : (visible[index + 1] ?? visible[index - 1])?.message.id ?? own;
    const result = onMarkRead(view.message.conversationId, view.message.seq);
    setError(result.ok ? '' : result.error.message);
  };
  const toggleSaved = (view: MessageView): void => {
    pendingFocus.current = view.message.id;
    const result = onToggleSaved(view.message.id);
    setError(result.ok ? '' : result.error.message);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key.toLowerCase() !== 'e' || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-inbox-row]')?.dataset.inboxRow;
    const view = id ? visible.find((item) => item.message.id === id) : undefined;
    if (!view) return;
    event.preventDefault();
    markRead(view);
  };

  const summary = views.length === 0 ? 'Messages that @mention you'
    : unread === 0 ? 'You\'re all caught up'
      : `${unread} unread · ${views.length} ${views.length === 1 ? 'mention' : 'mentions'}`;

  return <section ref={rootRef} className="gw-mentions" aria-labelledby="gw-mentions-title" onKeyDown={onKeyDown}>
    <header className="gw-mentions__header">
      <h2 id="gw-mentions-title" tabIndex={-1} data-mentions-focus>Mentions</h2>
      <p className="gw-mentions__summary" aria-live="polite">{summary}</p>
    </header>
    {views.length > 0 ? <div className="gw-mentions__filters" role="group" aria-label="Filter mentions">
      {MENTION_FILTERS.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setChoice(item.id)}>
        {item.label}{item.id === 'unread' && unread > 0 ? <span className="gw-mentions__count" aria-label={`, ${unread}`}>{unread}</span> : null}
      </button>)}
    </div> : null}
    {error ? <p className="gw-mentions__error" role="alert">{error}</p> : null}
    <div className="gw-mentions__scroll">
      {views.length === 0 ? <InboxEmptyState icon={<ShellIcon name="at" />} title="No mentions yet" description="When someone @mentions you, it shows up here." />
        : visible.length === 0 ? <InboxEmptyState title="No unread mentions" description="You're all caught up." action={{ label: 'Show all mentions', onClick: () => setChoice('all') }} />
          : <InboxViewList label="Mentions">
            {groups.map((group) => <React.Fragment key={group.id}>
              <InboxGroupHeading>{group.label}</InboxGroupHeading>
              {group.views.map((view) => <MentionRow key={view.message.id} view={view} place={mentionPlace(places.get(view.message.conversationId))} now={now}
                onOpen={() => onOpenMessage(view.message.conversationId, view.message.id)} onMarkRead={() => markRead(view)} onToggleSaved={() => toggleSaved(view)} />)}
            </React.Fragment>)}
          </InboxViewList>}
    </div>
  </section>;
}

interface MentionRowProps { view: MessageView; place: string; now: Date; onOpen: () => void; onMarkRead: () => void; onToggleSaved: () => void }

function MentionRow({ view, place, now, onOpen, onMarkRead, onToggleSaved }: MentionRowProps): React.ReactElement {
  const { message, author } = view;
  const isDoat = author.ref.kind === 'doat';
  const segments = bodySegments(message.body, message.mentions);
  const body = message.body.trim() ? message.body.replace(/\s+/g, ' ') : 'Linked records';
  return <InboxRow rowKey={message.id} density="compact" unread={view.unread} onOpen={onOpen}
    ariaLabel={`${author.name}${isDoat ? ' (Doat)' : ''} mentioned you in ${place}${view.unread ? ', unread' : ''}: ${body}`}
    avatar={isDoat
      ? <span className="gw-msg-avatar gw-msg-avatar--doat gw-inbox-row__doat-mark"><ShellIcon name="doats" /></span>
      : <MessageAvatar author={author.ref} name={author.name} />}
    title={<>{author.name}{isDoat ? <span className="gw-inbox-row__tag"> Doat</span> : null} mentioned you in {place}</>}
    time={{ iso: message.createdAt, label: mentionTimeLabel(message.createdAt, now, relativeTimeLabel) }}
    preview={message.body.trim() ? segments.map((segment, index) => segment.mention ? <mark key={index} className="gw-inbox-mention">{segment.text}</mark> : <React.Fragment key={index}>{segment.text}</React.Fragment>) : body}
    actions={<>
      {view.unread ? <button type="button" className="gw-inbox-row__action" aria-label={`Mark mention from ${author.name} as read`} title="Mark read (E)" onClick={onMarkRead}><ShellIcon name="trace-check" /></button> : null}
      <button type="button" className={`gw-inbox-row__action${view.savedByActor ? ' is-on' : ''}`} aria-pressed={view.savedByActor} aria-label={`${view.savedByActor ? 'Unsave' : 'Save'} mention from ${author.name}`} title={view.savedByActor ? 'Saved' : 'Save'} onClick={onToggleSaved}><ShellIcon name="bookmark" /></button>
    </>} />;
}
