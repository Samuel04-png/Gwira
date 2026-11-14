import { Icon } from "../../components/Icon.js";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InboxEmptyState } from './InboxEmptyState.js';
import { ShellIcon } from '../../components/Icon.js';
import type { ConversationListItem, MessageView } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import { MessageAvatar } from './MessageFeed.js';
import { avatarInitials, formatTimeLabel, isEditableTarget } from './inboxNavModel.js';
import {
  UNREAD_FILTERS, UNREAD_SORTS, bodySegments, buildUnreadGroups, filterUnreadGroups, isUnreadFilter, isUnreadSort,
  relativeTimeLabel, sortUnreadGroups, unreadFilterCounts, unreadSummary, unreadTotals,
  type UnreadFilter, type UnreadGroup, type UnreadSort
} from './unreadModel.js';
import './unread.css';

const PREFS_KEY = 'gwira.inbox.unread.prefs.v1';
const MESSAGE_PAGE = 40;
const UNDO_MS = 10_000;

function readSortPreference(): UnreadSort {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as { sort?: unknown } | null;
    return isUnreadSort(stored?.sort) ? stored.sort : 'recent';
  } catch { return 'recent'; }
}

function writeSortPreference(sort: UnreadSort): void {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ sort })); } catch { /* preference only */ }
}

export interface UnreadPageProps {
  views: readonly MessageView[];
  conversations: readonly ConversationListItem[];
  /** Organization, workspace and actor identity. Expansion and filters reset when it changes. */
  scopeKey: string;
  onMarkRead: (conversationId: string) => DispatchResult;
  onMarkUnread: (conversationId: string, messageId: string) => DispatchResult;
  onOpenConversation: (conversationId: string) => void;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  onOpenTask: (taskId: string) => void;
}

interface UndoEntry { conversationId: string; messageId: string }
interface Toast { text: string; entries: UndoEntry[] }

export function UnreadPage({ views, conversations, scopeKey, onMarkRead, onMarkUnread, onOpenConversation, onOpenMessage, onOpenTask }: UnreadPageProps): React.ReactElement {
  const allGroups = useMemo(() => buildUnreadGroups(views, conversations), [views, conversations]);
  const [filter, setFilter] = useState<UnreadFilter>('all');
  const [sort, setSort] = useState<UnreadSort>(readSortPreference);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const first = sortUnreadGroups(buildUnreadGroups(views, conversations), readSortPreference())[0];
    return new Set(first ? [first.conversationId] : []);
  });
  const [limits, setLimits] = useState<ReadonlyMap<string, number>>(new Map());
  const [toast, setToast] = useState<Toast>();
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<string | 'page' | undefined>(undefined);
  const counts = useMemo(() => unreadFilterCounts(allGroups), [allGroups]);
  const totals = useMemo(() => unreadTotals(allGroups), [allGroups]);
  const groups = useMemo(() => sortUnreadGroups(filterUnreadGroups(allGroups, filter), sort), [allGroups, filter, sort]);
  const now = useMemo(() => new Date(), [views]);

  useEffect(() => {
    setFilter('all'); setToast(undefined); setError('');
    setExpanded(new Set());
  }, [scopeKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = undefined;
    const node = target === 'page'
      ? rootRef.current?.querySelector<HTMLElement>('[data-unread-page-focus]')
      : rootRef.current?.querySelector<HTMLElement>(`[data-unread-toggle="${CSS.escape(target)}"]`);
    node?.focus();
  }, [groups]);

  const changeSort = (next: UnreadSort): void => { setSort(next); writeSortPreference(next); };
  const toggle = useCallback((id: string): void => {
    setExpanded((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  }, []);

  const neighbourOf = (id: string): string | undefined => {
    const index = groups.findIndex((group) => group.conversationId === id);
    return groups[index + 1]?.conversationId ?? groups[index - 1]?.conversationId;
  };

  const markGroups = (targets: readonly UnreadGroup[], label: string): void => {
    const entries: UndoEntry[] = [];
    let failure = '';
    for (const group of targets) {
      const result = onMarkRead(group.conversationId);
      if (result.ok) entries.push({ conversationId: group.conversationId, messageId: group.firstUnreadMessageId });
      else failure = result.error.message;
    }
    setError(failure);
    if (entries.length) setToast({ text: label, entries });
  };

  const markOne = (group: UnreadGroup): void => {
    pendingFocus.current = neighbourOf(group.conversationId) ?? 'page';
    markGroups([group], `Marked ${group.title} as read`);
  };

  const markAll = (): void => {
    pendingFocus.current = 'page';
    const noun = groups.length === 1 ? 'conversation' : 'conversations';
    markGroups(groups, `Marked ${groups.length} ${noun} as read`);
  };

  const undo = (): void => {
    if (!toast) return;
    let failure = '';
    for (const entry of toast.entries) {
      const result = onMarkUnread(entry.conversationId, entry.messageId);
      if (!result.ok) failure = result.error.message;
    }
    setError(failure);
    setToast(undefined);
  };

  const moveFocus = (from: HTMLElement | null, direction: 1 | -1 | 'first' | 'last'): void => {
    const toggles = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-unread-toggle]') ?? [])];
    if (!toggles.length) return;
    const index = from ? toggles.indexOf(from) : -1;
    const next = direction === 'first' ? toggles[0] : direction === 'last' ? toggles[toggles.length - 1]
      : toggles[Math.max(0, Math.min(toggles.length - 1, (index < 0 ? (direction === 1 ? -1 : toggles.length) : index) + direction))];
    next?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const header = target?.closest<HTMLElement>('[data-unread-toggle]') ?? null;
    const id = header?.dataset.unreadToggle;
    const group = id ? groups.find((item) => item.conversationId === id) : undefined;
    const key = event.key;
    if (key === 'j' || (header && key === 'ArrowDown')) { event.preventDefault(); moveFocus(header, 1); }
    else if (key === 'k' || (header && key === 'ArrowUp')) { event.preventDefault(); moveFocus(header, -1); }
    else if (header && key === 'Home') { event.preventDefault(); moveFocus(header, 'first'); }
    else if (header && key === 'End') { event.preventDefault(); moveFocus(header, 'last'); }
    else if (group && key === 'e') { event.preventDefault(); markOne(group); }
    else if (group && key === 'o') { event.preventDefault(); onOpenConversation(group.conversationId); }
  };

  const filterLabel = UNREAD_FILTERS.find((item) => item.id === filter)!.label;
  const heading = <h2 id="gw-unread-title" tabIndex={-1} data-unread-page-focus>Unread</h2>;

  return <section ref={rootRef} className="gw-unread" aria-labelledby="gw-unread-title" onKeyDown={onKeyDown}>
    <header className="gw-unread__header">
      <div className="gw-unread__titles">
        {heading}
        <p className="gw-unread__summary" aria-live="polite">{unreadSummary(totals)}{totals.mentions > 0 ? <span className="gw-unread__summary-mentions"> · {totals.mentions} {totals.mentions === 1 ? 'mention' : 'mentions'}</span> : null}</p>
      </div>
      <div className="gw-unread__tools">
        <SortMenu sort={sort} onChange={changeSort} />
        <button type="button" className="gw-unread__button" disabled={groups.length === 0} onClick={markAll}>
          <ShellIcon name="inbox-check" /><span>{filter === 'all' ? 'Mark all as read' : `Mark ${filterLabel.toLowerCase()} as read`}</span>
        </button>
      </div>
    </header>
    <div className="gw-unread__filters" role="group" aria-label="Filter unread conversations" onKeyDown={(event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
      {UNREAD_FILTERS.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
        {item.label}{counts[item.id] > 0 ? <span className="gw-unread__filter-count" aria-label={`, ${counts[item.id]} ${counts[item.id] === 1 ? 'conversation' : 'conversations'}`}>{counts[item.id]}</span> : null}
      </button>)}
    </div>
    {error ? <p className="gw-unread__error" role="alert">{error}</p> : null}
    <div className="gw-unread__scroll">
      {allGroups.length === 0 ? <InboxEmptyState icon={<ShellIcon name="inbox-check" />} title="You’re all caught up" description="New unread conversations will appear here." />
      : groups.length === 0 ? <InboxEmptyState title={`No unread ${filterLabel.toLowerCase()}`} description={`${totals.conversations} other ${totals.conversations === 1 ? 'conversation has' : 'conversations have'} unread messages.`} action={{ label: 'Show all', onClick: () => setFilter('all') }} />
      : <ol className="gw-unread__list">
        {groups.map((group) => <UnreadGroupView key={group.conversationId} group={group} now={now}
          open={expanded.has(group.conversationId)} limit={limits.get(group.conversationId) ?? MESSAGE_PAGE}
          onToggle={toggle} onMarkRead={markOne} onOpenConversation={onOpenConversation} onOpenMessage={onOpenMessage} onOpenTask={onOpenTask}
          onShowMore={(id) => setLimits((current) => new Map(current).set(id, (current.get(id) ?? MESSAGE_PAGE) + MESSAGE_PAGE * 2))} />)}
      </ol>}
    </div>
    {toast ? <div className="gw-unread__toast" role="status"><span>{toast.text}</span><button type="button" onClick={undo}>Undo</button></div> : null}
  </section>;
}

function GroupAvatar({ group }: { group: UnreadGroup }): React.ReactElement {
  if (group.kind === 'channels') return <span className="gw-unread__tile is-channel" aria-hidden="true"><ShellIcon name={group.item.conversation.visibility === 'private' ? 'lock' : 'hash'} /></span>;
  if (group.kind === 'groups') return <span className="gw-unread__tile is-group" aria-hidden="true"><ShellIcon name="users" /></span>;
  return <span className={`gw-unread__tile is-person${group.kind === 'doats' ? ' is-doat' : ''}`} aria-hidden="true">{avatarInitials(group.title)}</span>;
}

interface GroupViewProps {
  group: UnreadGroup; now: Date; open: boolean; limit: number;
  onToggle: (id: string) => void; onMarkRead: (group: UnreadGroup) => void;
  onOpenConversation: (id: string) => void; onOpenMessage: (conversationId: string, messageId: string) => void;
  onOpenTask: (taskId: string) => void; onShowMore: (id: string) => void;
}

const UnreadGroupView = React.memo(function UnreadGroupView({ group, now, open, limit, onToggle, onMarkRead, onOpenConversation, onOpenMessage, onOpenTask, onShowMore }: GroupViewProps): React.ReactElement {
  const bodyId = `gw-unread-body-${group.conversationId}`;
  const label = `${group.count} unread ${group.count === 1 ? 'message' : 'messages'}${group.mentionCount ? `, ${group.mentionCount} ${group.mentionCount === 1 ? 'mention' : 'mentions'}` : ''}`;
  const shown = group.messages.slice(0, limit);
  const hidden = group.messages.length - shown.length;
  return <li className={`gw-unread-group${open ? ' is-open' : ''}${group.mentionCount ? ' has-mention' : ''}`}>
    <div className="gw-unread-group__head">
      <button type="button" className="gw-unread-group__toggle" data-unread-toggle={group.conversationId} aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(group.conversationId)}>
        <span className="gw-unread-group__chevron" aria-hidden="true"><ShellIcon name="chevron-down" /></span>
        <GroupAvatar group={group} />
        <span className="gw-unread-group__name">
          <span className="gw-unread-group__title">{group.title}</span>
          <span className="gw-unread-group__type">{group.typeLabel}</span>
        </span>
        {!open ? <span className="gw-unread-group__preview"><strong>{group.preview.author}</strong> {group.preview.text}</span> : <span className="gw-unread-group__preview is-open" />}
        <time className="gw-unread-group__time" dateTime={group.latestAt} title={new Date(group.latestAt).toLocaleString()}>{relativeTimeLabel(group.latestAt, now)}</time>
        {group.mentionCount > 0 ? <span className="gw-unread-group__mentions" aria-hidden="true">@{group.mentionCount}</span> : null}
        <span className="gw-unread-group__count" aria-label={label}>{group.count}</span>
      </button>
      <div className="gw-unread-group__actions">
        <button type="button" className="gw-unread-icon" aria-label={`Open ${group.title}`} title="Open conversation (O)" onClick={() => onOpenConversation(group.conversationId)}><OpenGlyph /></button>
        <button type="button" className="gw-unread-icon" aria-label={`Mark ${group.title} as read`} title="Mark as read (E)" onClick={() => onMarkRead(group)}><ShellIcon name="inbox-check" /></button>
      </div>
    </div>
    {open ? <div className="gw-unread-group__body" id={bodyId} role="region" aria-label={`Unread messages in ${group.title}`}>
      <ol className="gw-unread-messages">
        {shown.map((view) => <UnreadMessage key={view.message.id} view={view} onOpen={onOpenMessage} onOpenTask={onOpenTask} />)}
      </ol>
      <div className="gw-unread-group__foot">
        {hidden > 0 ? <button type="button" className="gw-unread-link" onClick={() => onShowMore(group.conversationId)}>Show {Math.min(hidden, MESSAGE_PAGE * 2)} more of {hidden} remaining</button> : <span className="gw-unread-group__foot-note">Reading does not mark messages as read</span>}
        <span className="gw-unread-group__foot-actions">
          <button type="button" className="gw-unread__button is-quiet" onClick={() => onOpenConversation(group.conversationId)}>Open conversation</button>
          <button type="button" className="gw-unread__button is-primary" onClick={() => onMarkRead(group)}>Mark as read</button>
        </span>
      </div>
    </div> : null}
  </li>;
});

function UnreadMessage({ view, onOpen, onOpenTask }: { view: MessageView; onOpen: (conversationId: string, messageId: string) => void; onOpenTask: (taskId: string) => void }): React.ReactElement {
  const { message } = view;
  const inThread = Boolean(message.threadRootId);
  const segments = bodySegments(message.body, message.mentions);
  const taskRefs = view.refs.flatMap((ref) => ref.status === 'available' && ref.taskId ? [{ taskId: ref.taskId, label: ref.label, kind: ref.ref.kind }] : []);
  return <li className={`gw-unread-msg${view.mentionsActor ? ' is-mention' : ''}${view.author.ref.kind === 'doat' ? ' is-doat' : ''}`} data-message-id={message.id}>
    <MessageAvatar author={view.author.ref} name={view.author.name} />
    <div className="gw-unread-msg__main">
      <div className="gw-unread-msg__meta">
        <strong className="gw-unread-msg__author">{view.author.name}</strong>
        {view.author.ref.kind === 'doat' ? <span className="gw-unread-tag">Doat</span> : null}
        <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{formatTimeLabel(message.createdAt)}</time>
        {inThread ? <span className="gw-unread-tag is-quiet">In thread</span> : null}
        {view.mentionsActor ? <span className="gw-unread-tag is-mention">Mentions you</span> : null}
      </div>
      {message.body ? <p className="gw-unread-msg__text">{segments.map((segment, index) => segment.mention ? <mark key={index}>{segment.text}</mark> : <React.Fragment key={index}>{segment.text}</React.Fragment>)}</p> : null}
      {message.attachments.length > 0 ? <ul className="gw-unread-msg__files">{message.attachments.map((file) => <li key={file.id}>{file.name}</li>)}</ul> : null}
      {taskRefs.length > 0 ? <ul className="gw-unread-msg__refs">{taskRefs.map((ref, index) => <li key={index}>
        <button type="button" onClick={() => onOpenTask(ref.taskId)}><span>{ref.kind === 'approval' ? 'Related approval' : 'Related task'}</span>{ref.label}</button>
      </li>)}</ul> : null}
      {view.reactions.length > 0 ? <ul className="gw-unread-msg__reactions" aria-label="Reactions">{view.reactions.map((reaction) => <li key={reaction.emoji} className={reaction.reactedByActor ? 'is-own' : ''} aria-label={`${reaction.emoji}, ${reaction.count}${reaction.reactedByActor ? ', including yours' : ''}`}>{reaction.emoji}<span>{reaction.count}</span></li>)}</ul> : null}
      {view.replyCount > 0 ? <span className="gw-unread-msg__replies">{view.replyCount} {view.replyCount === 1 ? 'reply' : 'replies'}</span> : null}
    </div>
    <button type="button" className="gw-unread-msg__open" aria-label={`Open message from ${view.author.name} in conversation`} title={inThread ? 'Open thread' : 'Open in conversation'} onClick={() => onOpen(message.conversationId, message.id)}>{inThread ? 'Open thread' : 'Open'}</button>
  </li>;
}

function OpenGlyph(): React.ReactElement { return <Icon name="external" />; }

function SortMenu({ sort, onChange }: { sort: UnreadSort; onChange: (sort: UnreadSort) => void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = UNREAD_SORTS.find((item) => item.id === sort)!;
  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const away = (event: MouseEvent): void => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const close = (): void => { setOpen(false); requestAnimationFrame(() => buttonRef.current?.focus()); };
  return <div className="gw-unread-sort" ref={wrapRef}>
    <button ref={buttonRef} type="button" className="gw-unread__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <SortGlyph /><span>Sort<span className="gw-unread-sort__value">: {current.label}</span></span>
    </button>
    {open ? <div className="gw-unread-sort__menu" role="menu" aria-label="Sort unread conversations" onKeyDown={(event) => {
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role=menuitemradio]')];
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
      else if (event.key === 'Tab') setOpen(false);
    }}>
      {UNREAD_SORTS.map((item) => <button type="button" role="menuitemradio" aria-checked={item.id === sort} key={item.id} onClick={() => { onChange(item.id); close(); }}>
        <span className="gw-unread-sort__check" aria-hidden="true">{item.id === sort ? <Icon name="trace-check" /> : null}</span>{item.label}
      </button>)}
    </div> : null}
  </div>;
}

function SortGlyph(): React.ReactElement { return <Icon name="sort" />; }
