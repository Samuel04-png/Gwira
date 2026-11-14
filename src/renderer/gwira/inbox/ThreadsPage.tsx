import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShellIcon } from '../../components/Icon.js';
import type { ComposerLinkOption } from './composerModel.js';
import { ThreadPanel } from './ThreadPanel.js';
import type { ThreadPanelProps } from './ThreadPanel.js';
import { MessageAvatar } from './MessageFeed.js';
import { avatarInitials } from './inboxNavModel.js';
import { relativeTimeLabel } from './unreadModel.js';
import {
  THREAD_FILTERS, filterThreads, isThreadFilter, replyCountLabel, resolveSelection, stepSelection, threadFilterCounts,
  threadKeyId, threadPreview, threadTitle, type ThreadFilter, type ThreadKey
} from './threadsPageModel.js';
import type { ParticipantView, ThreadSummary, ThreadView } from '../messaging/domain/selectors.js';
import type { EntityRef, Id } from '../messaging/domain/types.js';
import { InboxEmptyState } from './InboxEmptyState.js';
import { InboxRow } from './InboxRow.js';
import { InboxViewList } from './InboxViewList.js';
import './threadsPage.css';

const PREFS_KEY = 'gwira.inbox.threads.prefs.v1';

function readFilterPreference(): ThreadFilter {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as { filter?: unknown } | null;
    return isThreadFilter(stored?.filter) ? stored.filter : 'all';
  } catch { return 'all'; }
}

export interface ThreadsPageProps {
  summaries: readonly ThreadSummary[];
  titles: ReadonlyMap<string, string>;
  scopeKey: string;
  selected: ThreadKey | undefined;
  onSelect: (key: ThreadKey | undefined) => void;
  /** Only meaningful in master/detail layout. */
  masterDetail: boolean;
  detailOpen: boolean;
  onDetailOpenChange: (open: boolean) => void;
  getThread: (key: ThreadKey) => ThreadView | undefined;
  getMentionCandidates: (conversationId: Id) => readonly ParticipantView[];
  getDraft: (key: ThreadKey) => { body: string; refs: readonly EntityRef[] };
  linkOptions: readonly ComposerLinkOption[];
  onOpenConversation: (key: ThreadKey) => void;
  panel: Pick<ThreadPanelProps, 'actor' | 'savedMessageIds' | 'onSendMessage' | 'onSetDraft' | 'onRetry' | 'onFlush' | 'onEditMessage' | 'onToggleReaction' | 'onToggleSaved' | 'onMarkUnread' | 'onDelete' | 'onOpenTask'>;
  now?: Date;
}

export function ThreadsPage(props: ThreadsPageProps): React.ReactElement {
  const { summaries, titles, selected, onSelect, masterDetail, detailOpen, onDetailOpenChange } = props;
  const [filter, setFilter] = useState<ThreadFilter>(readFilterPreference);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => threadFilterCounts(summaries), [summaries]);
  const visible = useMemo(() => filterThreads(summaries, titles, filter, query), [summaries, titles, filter, query]);
  const now = useMemo(() => props.now ?? new Date(), [summaries, props.now]);
  const active = masterDetail ? (detailOpen ? selected : undefined) : resolveSelection(visible, selected);
  const activeSummary = active ? summaries.find((item) => item.rootId === active.rootId && item.conversationId === active.conversationId) : undefined;

  useEffect(() => { setQuery(''); }, [props.scopeKey]);
  // A thread that vanished (for example its last reply was deleted) must not leave the narrow layout stranded on the detail pane.
  useEffect(() => { if (masterDetail && detailOpen && !activeSummary) onDetailOpenChange(false); }, [masterDetail, detailOpen, Boolean(activeSummary)]);
  // Wide layouts always show a discussion; keep the shared selection in sync with what is displayed.
  useEffect(() => {
    if (masterDetail) return;
    if (active && (!selected || selected.rootId !== active.rootId)) onSelect(active);
  }, [masterDetail, active?.rootId, selected?.rootId]);

  const changeFilter = (next: ThreadFilter): void => {
    setFilter(next);
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ filter: next })); } catch { /* preference only */ }
  };

  const choose = (key: ThreadKey, focusDetail = false): void => {
    onSelect(key);
    if (masterDetail) onDetailOpenChange(true);
    if (focusDetail || masterDetail) requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('.gw-msg-thread')?.focus());
  };

  const onFocusRow = (rowKey: string): void => {
    if (masterDetail) return;
    const next = visible.find((item) => threadKeyId(item) === rowKey);
    if (next) onSelect({ conversationId: next.conversationId, rootId: next.rootId });
  };

  const unreadTotal = summaries.reduce((sum, item) => sum + item.unreadReplies, 0);
  const showList = !masterDetail || !detailOpen;
  const showDetail = !masterDetail || detailOpen;

  // Keep the global Inbox j/k destination shortcuts from firing while reading a discussion.
  const onDetailKeyDown = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    if ((event.key === 'j' || event.key === 'k' || event.key === 'u') && !event.metaKey && !event.ctrlKey && !event.altKey && !target.closest('input, textarea, [contenteditable], [role="textbox"]')) event.preventDefault();
  };
  return <section ref={rootRef} className={`gw-threads${masterDetail ? ' is-master-detail' : ''}`} aria-labelledby="gw-threads-title">
    {showList ? <div className="gw-threads__list-pane">
      <header className="gw-threads__header">
        <h2 id="gw-threads-title">Threads</h2>
        <p className="gw-threads__summary" aria-live="polite">{summaries.length === 0 ? 'Discussions you start or reply to' : `${summaries.length} ${summaries.length === 1 ? 'thread' : 'threads'}${unreadTotal ? ` · ${unreadTotal} unread ${unreadTotal === 1 ? 'reply' : 'replies'}` : ''}`}</p>
      </header>
      {summaries.length > 0 ? <>
        <div className="gw-threads__filters" role="group" aria-label="Filter threads">
          {THREAD_FILTERS.map((item) => <button type="button" key={item.id} title={item.hint} aria-pressed={filter === item.id} onClick={() => changeFilter(item.id)}>
            {item.label}{item.id !== 'all' && counts[item.id] > 0 ? <span className="gw-threads__count" aria-label={`, ${counts[item.id]}`}>{counts[item.id]}</span> : null}
          </button>)}
        </div>
        <label className="gw-threads__search"><ShellIcon name="search" /><input type="search" aria-label="Search threads" placeholder="Search threads" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </> : null}
      <div className="gw-threads__list" ref={listRef}>
        {summaries.length === 0 ? <InboxEmptyState icon={<ShellIcon name="threads" />} title="No threads yet" description="When you start a thread or reply in one, the discussion appears here." />
          : visible.length === 0 ? <InboxEmptyState title="No matching threads" description={query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing in this filter right now.'} action={{ label: 'Show all threads', onClick: () => { setQuery(''); changeFilter('all'); } }} />
            : <InboxViewList label="Threads" onFocusRow={onFocusRow}>
              {visible.map((summary) => <ThreadRow key={threadKeyId(summary)} summary={summary} title={titles.get(summary.conversationId) ?? 'Conversation'} now={now}
                selected={Boolean(active && active.rootId === summary.rootId && active.conversationId === summary.conversationId)}
                onChoose={() => choose({ conversationId: summary.conversationId, rootId: summary.rootId })} />)}
            </InboxViewList>}
      </div>
    </div> : null}
    {showDetail ? <div className="gw-threads__detail" onKeyDown={onDetailKeyDown}>
      {activeSummary && active
        ? <ThreadPanel key={threadKeyId(active)} variant="page" thread={props.getThread(active)} conversationId={active.conversationId}
          conversationTitle={titles.get(active.conversationId)} mentionCandidates={props.getMentionCandidates(active.conversationId)}
          initialDraft={props.getDraft(active).body} initialDraftRefs={props.getDraft(active).refs} linkOptions={props.linkOptions}
          onClose={() => undefined} onOpenConversation={() => props.onOpenConversation(active)}
          onBack={masterDetail ? () => { onDetailOpenChange(false); requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-thread-key="${CSS.escape(threadKeyId(active))}"]`)?.focus()); } : undefined}
          scrollScopeKey={props.scopeKey} {...props.panel} />
        : <div className="gw-threads__placeholder">{summaries.length ? 'Select a thread to read the discussion.' : 'Your discussions will open here.'}</div>}
    </div> : null}
  </section>;
}

function Stack({ people }: { people: readonly ParticipantView[] }): React.ReactElement {
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  return <span className="gw-threads__stack" aria-hidden="true">
    {shown.map((person, index) => <span key={index} className={`gw-threads__stack-avatar is-${person.ref.kind}`}>{avatarInitials(person.name)}</span>)}
    {extra > 0 ? <span className="gw-threads__stack-more">+{extra}</span> : null}
  </span>;
}

function ThreadRow({ summary, title, selected, now, onChoose }: { summary: ThreadSummary; title: string; selected: boolean; now: Date; onChoose: () => void }): React.ReactElement {
  const preview = threadPreview(summary);
  const unread = summary.unreadReplies;
  const names = summary.participants.map((person) => person.name).join(', ');
  const label = `${threadTitle(summary)}, in ${title}, ${replyCountLabel(summary.replyCount)}${unread ? `, ${unread} unread` : ''}`;
  return <InboxRow rowKey={threadKeyId(summary)} density="rich" selected={selected} unread={unread > 0} ariaLabel={label} onOpen={onChoose}
    avatar={<MessageAvatar author={summary.root.message.author} name={summary.root.author.name} />}
    eyebrow={title} time={{ iso: summary.lastActivityAt, label: relativeTimeLabel(summary.lastActivityAt, now) }}
    title={threadTitle(summary)} titleClassName={summary.root.isDeleted ? 'is-deleted' : undefined}
    preview={preview ? <><strong>{preview.author}</strong> {preview.text}</> : undefined}
    meta={<span className="gw-threads__meta" title={names}>
      <Stack people={summary.participants} />
      <span>{replyCountLabel(summary.replyCount)}</span>
      {unread > 0 ? <span className="gw-threads__new-badge" aria-hidden="true">{unread} new</span> : null}
    </span>} />;
}
