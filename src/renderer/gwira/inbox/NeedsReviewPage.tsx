import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InboxEmptyState } from './InboxEmptyState.js';
import { InboxRow } from './InboxRow.js';
import { InboxGroupHeading, InboxViewList } from './InboxViewList.js';
import { ShellIcon } from '../../components/Icon.js';
import { MessageAvatar } from './MessageFeed.js';
import { relativeTimeLabel } from './unreadModel.js';
import { formatDayLabel, formatTimeLabel } from './inboxNavModel.js';
import { taskStatusLabel } from './contextModel.js';
import { REVIEW_FILTERS, STALE_TITLE, filterReview, groupReview, resolveReviewSource, reviewAgeLabel, reviewEntries, withStaleEntries, type LinkedMessage, type ReviewEntry, type ReviewFilter, type ReviewPerson, type ReviewSource } from './needsReviewModel.js';
import type { GwiraLocalState, Task } from '../domain/types.js';
import './needsReview.css';

export interface NeedsReviewPageProps {
  state: GwiraLocalState;
  /** Latest message that references each task or approval, keyed `task:<id>` / `approval:<id>`. */
  linkedMessages: ReadonlyMap<string, LinkedMessage>;
  /** Conversation display names by id; a missing id means the conversation is unavailable. */
  conversationTitles: ReadonlyMap<string, string>;
  /** Selection below this width uses list, then detail. */
  masterDetail: boolean;
  onOpenTask: (taskId: string) => void;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  now?: Date;
}

/** Mount with a key that changes with workspace and actor: the selection and the stale set are per visit. */
export function NeedsReviewPage({ state, linkedMessages, ...props }: NeedsReviewPageProps): React.ReactElement {
  const entries = useMemo(() => reviewEntries(state), [state]);
  return <NeedsReviewPresentation {...props} entries={entries} resolveSource={entry => resolveReviewSource(state, entry, linkedMessages)} />;
}

export function NeedsReviewPresentation({ entries:live, resolveSource, conversationTitles, masterDetail, onOpenTask, onOpenMessage, approvalContent, now:nowProp }: Omit<NeedsReviewPageProps, 'state' | 'linkedMessages'> & {
  entries: readonly ReviewEntry[];
  resolveSource: (entry:ReviewEntry|undefined) => ReviewSource;
  approvalContent?: (approvalId:string) => React.ReactNode;
}): React.ReactElement {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  const seen = useRef(new Map<string, ReviewEntry>());
  const rootRef = useRef<HTMLElement>(null);
  const all = withStaleEntries(live, seen.current);
  useEffect(() => { for (const entry of live) seen.current.set(entry.key, entry); }, [live]);

  const now = useMemo(() => nowProp ?? new Date(), [live, nowProp]);
  const visible = filterReview(all, filter);
  const groups = groupReview(visible);
  const selected = all.find((entry) => entry.key === selectedKey);
  const source = resolveSource(selected);
  const waiting = live.filter((entry) => entry.kind === 'approval').length;
  const showList = !masterDetail || !detailOpen || !selected;
  const showDetail = !masterDetail || (detailOpen && Boolean(selected));

  const choose = (entry: ReviewEntry): void => {
    setSelectedKey(entry.key);
    if (masterDetail) setDetailOpen(true);
  };
  const back = (): void => {
    setDetailOpen(false);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-inbox-row="${CSS.escape(selectedKey ?? '')}"]`)?.focus());
  };

  if (all.length === 0) {
    return <section ref={rootRef} className="gw-review is-empty" aria-labelledby="gw-review-title">
      <h2 id="gw-review-title" className="gw-review__sr">Needs review</h2>
      <InboxEmptyState icon={<ShellIcon name="review" />} title="All caught up" description="Approval requests and task updates appear here." />
    </section>;
  }

  return <section ref={rootRef} className={`gw-review${masterDetail ? ' is-master-detail' : ''}`} aria-labelledby="gw-review-title">
    {!showList ? <h2 id="gw-review-title" className="gw-review__sr">Needs review</h2> : null}
    {showList ? <div className="gw-review__list-pane">
      <header className="gw-review__header">
        <h2 id="gw-review-title" tabIndex={-1}>Needs review</h2>
        <p className="gw-review__summary" aria-live="polite">{waiting > 0 ? `${waiting} ${waiting === 1 ? 'approval' : 'approvals'} waiting on you` : 'Nothing is waiting on you'}</p>
        <div className="gw-review__filters" role="group" aria-label="Filter review items">
          {REVIEW_FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        </div>
      </header>
      <div className="gw-review__list">
        {groups.length === 0
          ? <InboxEmptyState icon={<ShellIcon name="review" />} title="No matching items" description="Choose another filter to see your review items." action={{ label: 'Show all items', onClick: () => setFilter('all') }} />
          : <InboxViewList label="Needs review">
            {groups.map((group) => <React.Fragment key={group.id}>
              <InboxGroupHeading>{group.label}</InboxGroupHeading>
              {group.entries.map((entry) => <ReviewRow key={entry.key} entry={entry} now={now} selected={entry.key === selectedKey} onOpen={() => choose(entry)} />)}
            </React.Fragment>)}
          </InboxViewList>}
      </div>
    </div> : null}
    {showDetail ? <div className="gw-review__detail">
      {source.status === 'unselected'
        ? <div className="gw-review__placeholder">Select an item to see its source.</div>
        : <ReviewSourcePane source={source} now={now} conversationTitles={conversationTitles} onBack={masterDetail ? back : undefined} onOpenTask={onOpenTask} onOpenMessage={onOpenMessage} approvalContent={approvalContent} />}
    </div> : null}
  </section>;
}

function sentenceCase(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(); }

function ReviewAvatar({ person }: { person: ReviewPerson }): React.ReactElement {
  return person.isDoat
    ? <span className="gw-msg-avatar gw-msg-avatar--doat gw-inbox-row__doat-mark"><ShellIcon name="doats" /></span>
    : <MessageAvatar author={{ kind: 'human', id: person.id ?? person.name }} name={person.name} />;
}

function StatusGlyph({ status }: { status: Task['status'] | 'waiting' }): React.ReactElement {
  return <span className="gw-review__glyph" data-status={status} aria-hidden="true"><ShellIcon name={status === 'done' ? 'review' : status === 'blocked' ? 'blocked' : status === 'in_review' || status === 'waiting' ? 'waiting' : status === 'in_progress' ? 'running' : 'pending'} /></span>;
}

function ReviewRow({ entry, now, selected, onOpen }: { entry: ReviewEntry; now: Date; selected: boolean; onOpen: () => void }): React.ReactElement {
  if (entry.stale) {
    return <InboxRow rowKey={entry.key} density="compact" rowClassName="is-stale" selected={selected} onOpen={onOpen} ariaLabel={`${STALE_TITLE}: ${entry.title}`}
      avatar={<ReviewAvatar person={entry.requester} />} title={STALE_TITLE} preview={entry.title} />;
  }
  if (entry.kind === 'approval') {
    return <InboxRow rowKey={entry.key} density="compact" selected={selected} onOpen={onOpen} ariaLabel={`${entry.title}, waiting, ${reviewAgeLabel(entry.at, now)}. ${entry.preview}`}
      avatar={<ReviewAvatar person={entry.requester} />}
      title={entry.title}
      preview={<><span className="gw-review__waiting"><StatusGlyph status="waiting" />Waiting</span> {entry.preview}</>}
      time={{ iso: entry.at, label: reviewAgeLabel(entry.at, now) }} />;
  }
  return <InboxRow rowKey={entry.key} density="compact" selected={selected} onOpen={onOpen} ariaLabel={`${entry.title}${entry.taskTitle ? `, task ${entry.taskTitle}` : ''}`}
    avatar={<ReviewAvatar person={entry.requester} />}
    title={entry.title}
    preview={entry.taskTitle && entry.taskStatus ? <span className="gw-review__chip"><StatusGlyph status={entry.taskStatus} /><span className="gw-review__chip-label">{entry.taskTitle}</span><span className="gw-review__chip-status"> · {taskStatusLabel(entry.taskStatus)}</span></span> : entry.preview}
    time={{ iso: entry.at, label: relativeTimeLabel(entry.at, now) }} />;
}

function ReviewSourcePane({ source, now, conversationTitles, onBack, onOpenTask, onOpenMessage, approvalContent }: {
  source: Exclude<ReturnType<typeof resolveReviewSource>, { status: 'unselected' }>;
  now: Date;
  conversationTitles: ReadonlyMap<string, string>;
  onBack?: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  approvalContent?: (approvalId:string) => React.ReactNode;
}): React.ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const entry = source.entry;
  useEffect(() => { if (onBack) headingRef.current?.focus(); }, [entry.key]);
  const back = onBack ? <button type="button" className="gw-review__back" onClick={onBack}><ShellIcon name="back" />Back to list</button> : null;

  if (source.status === 'stale') {
    return <article className="gw-review__source" aria-label="Selected review item">
      {back}
      <header className="gw-review__source-header"><span className="gw-review__eyebrow">Needs review</span><h3 ref={headingRef} tabIndex={-1}>{STALE_TITLE}</h3>
        <p>The task was removed or the request was already resolved. This item leaves the list when you go to another view.</p></header>
      <p className="gw-review__was">{entry.title}</p>
    </article>;
  }

  const task = source.task;
  const message = source.message;
  const place = message ? conversationTitles.get(message.conversationId) : undefined;
  return <article className="gw-review__source" aria-label="Selected review item" data-review-source={entry.key}>
    {back}
    <header className="gw-review__source-header">
      <span className="gw-review__eyebrow">{entry.kind === 'approval' ? 'Approval request' : 'Update'}</span>
      <h3 ref={headingRef} tabIndex={-1}>{entry.title}</h3>
      <p className="gw-review__byline"><ReviewAvatar person={entry.requester} />
        <span>{entry.requester.name}{entry.requester.isDoat ? <span className="gw-review__tag"> Doat</span> : null}</span>
        <span aria-hidden="true">·</span><time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>{formatDayLabel(entry.at, now)}, {formatTimeLabel(entry.at)}</time>
        <span className="gw-review__age">({reviewAgeLabel(entry.at, now)} ago)</span></p>
    </header>
    {entry.kind === 'approval' ? <p className="gw-review__waiting-line" role="status"><StatusGlyph status="waiting" />{approvalContent?'Waiting for your review.':'Waiting for your review. Decisions are made in the task.'}</p> : null}
    {entry.kind==='approval'&&approvalContent?approvalContent(entry.id):null}
    {task ? <section className="gw-review__block" aria-label="Task summary">
      <h4>Task</h4>
      {task.description ? <p className="gw-review__task-description">{task.description}</p> : null}
      <dl className="gw-review__facts">
        <div><dt>Status</dt><dd><StatusGlyph status={task.status} />{sentenceCase(taskStatusLabel(task.status))}</dd></div>
        <div><dt>Owner</dt><dd>{source.owner ? <>{source.owner.name}{source.owner.isDoat ? <span className="gw-review__tag"> Doat</span> : null}</> : 'Unassigned'}</dd></div>
        <div><dt>Priority</dt><dd>{sentenceCase(task.priority)}</dd></div>
        <div><dt>Due</dt><dd>{task.dueDate ? <time dateTime={task.dueDate}>{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time> : 'No due date'}</dd></div>
        {source.project ? <div><dt>Project</dt><dd>{source.project.name}</dd></div> : null}
      </dl>
    </section> : !approvalContent ? <p className="gw-review__note">This update is not linked to a task.</p> : null}
    {!approvalContent ? <section className="gw-review__block" aria-label="Linked conversation message">
      <h4>Conversation</h4>
      {message ? <>
        <blockquote className="gw-review__quote"><p>{message.body}</p></blockquote>
        {place ? <button type="button" className="gw-review__link" onClick={() => onOpenMessage(message.conversationId, message.messageId)}>Open message in {place}<ShellIcon name="forward" /></button>
          : <p className="gw-review__note">Conversation unavailable</p>}
      </> : <p className="gw-review__note">No conversation message is linked to this item.</p>}
    </section> : null}
    {task&&!approvalContent ? <div className="gw-review__actions"><button type="button" className="gw-review__open" aria-label="Open task" onClick={() => onOpenTask(task.id)}>Open task<ShellIcon name="forward" /></button></div> : null}
  </article>;
}
