import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { ShellIcon } from '../../components/Icon.js';
import { avatarInitials, formatTimeLabel } from './inboxNavModel.js';
import { approvalStatusLabel, taskStatusLabel } from './contextModel.js';
import { activityKindLabel, activityQueueFocusKey, activityQueueItems, activitySelectionKey, resolveActivitySource, sameActivitySelection, stableActivityQueueItems, type ActivityFilter, type ActivitySelection } from './activityModel.js';
import './activity.css';

export type { ActivityFilter, ActivitySelection } from './activityModel.js';
export interface ActivityQueueProps {
  state: GwiraLocalState;
  compact?: boolean;
  selection?: ActivitySelection;
  onSelect: (selection: ActivitySelection) => void;
  filter: ActivityFilter;
  onFilterChange: (filter: ActivityFilter) => void;
  viewKey?: string;
}
const queueScroll = new Map<string, number>();
const FILTERS: readonly { id: ActivityFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'approvals', label: 'Approvals' }, { id: 'activity', label: 'Activity' }];

export function ActivityQueue({ state, selection, onSelect, filter, onFilterChange, viewKey = state.workspace.id, compact = false }: ActivityQueueProps): React.ReactElement {
  const items = useMemo(() => activityQueueItems(state, filter), [state, filter]);
  const allItems = useMemo(() => activityQueueItems(state), [state]);
  const [focusKey, setFocusKey] = useState<string>();
  const [heldKeys, setHeldKeys] = useState<string[]>();
  const pointerInside = useRef(false);
  const focusInside = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const previousKeys = useRef<string[]>([]);
  const displayedItems = stableActivityQueueItems(items, heldKeys);
  const keys = displayedItems.map((item) => item.key);
  const selectedKey = selection ? activitySelectionKey(selection) : undefined;
  const tabKey = activityQueueFocusKey(keys, focusKey ?? selectedKey);
  const pending = allItems.filter((item) => item.selection.kind === 'approval').length;
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = queueScroll.get(viewKey) ?? 0;
    return () => { queueScroll.set(viewKey, node.scrollTop); if (queueScroll.size > 50) queueScroll.delete(queueScroll.keys().next().value!); };
  }, [viewKey]);
  useEffect(() => {
    const oldIndex = focusKey ? previousKeys.current.indexOf(focusKey) : 0;
    if (focusKey && !keys.includes(focusKey)) {
      const next = activityQueueFocusKey(keys, undefined, oldIndex);
      setFocusKey(next);
      if (focusInside.current || listRef.current?.contains(document.activeElement)) {
        const target = next ? listRef.current?.querySelector<HTMLElement>(`[data-activity-id="${CSS.escape(next)}"]`) : listRef.current;
        target?.focus();
      }
    }
    previousKeys.current = keys;
  }, [items, focusKey]);
  const moveFocus = (event: React.KeyboardEvent): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.activityId : undefined;
    const index = keys.indexOf(active ?? tabKey ?? '');
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : Math.max(0, Math.min(keys.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    const next = keys[nextIndex];
    if (!next) return;
    event.preventDefault(); setFocusKey(next);
    listRef.current?.querySelector<HTMLElement>(`[data-activity-id="${CSS.escape(next)}"]`)?.focus();
  };
  return <section className={`gw-msg-activity gw-activity-queue${compact ? ' gw-activity-queue--compact' : ''}`} aria-label="Needs review">
    {!compact ? <header className="gw-activity-queue__header"><h2>Needs review</h2><span>{pending} pending {pending === 1 ? 'approval' : 'approvals'}</span></header> : null}
    <div className="gw-activity-filters" role="group" aria-label="Filter activity" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
      event.preventDefault(); next?.focus();
    }}>{FILTERS.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => onFilterChange(item.id)}>{item.label}</button>)}</div>
    {selectedKey && !keys.includes(selectedKey) ? <p className="gw-activity-queue__retained" role="status">The selected source is outside this queue.{filter !== 'all' ? <button type="button" onClick={() => onFilterChange('all')}>Show all</button> : null}</p> : null}
    <div className="gw-activity-queue__scroll" ref={listRef} tabIndex={-1} onKeyDown={moveFocus} onScroll={(event) => queueScroll.set(viewKey, event.currentTarget.scrollTop)} onPointerEnter={() => { pointerInside.current = true; setHeldKeys(keys); }} onPointerLeave={() => { pointerInside.current = false; if (!listRef.current?.contains(document.activeElement)) setHeldKeys(undefined); }} onFocusCapture={() => { focusInside.current = true; setHeldKeys((held) => held ?? keys); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { focusInside.current = false; if (!pointerInside.current) setHeldKeys(undefined); } }}>
      {items.length === 0 ? <div className="gw-msg-activity__empty"><h3>{allItems.length ? 'No matching activity' : 'All caught up'}</h3><p>{allItems.length ? 'Choose another filter to see your workspace records.' : 'Task updates and approval requests will appear here.'}</p></div> : <ol className="gw-msg-activity__items">{displayedItems.map((item, index) => <li key={item.key} className={`gw-msg-activity__item is-${item.selection.kind}${sameActivitySelection(selection, item.selection) ? ' is-selected' : ''}`}>
        {(index === 0 || displayedItems[index - 1]?.selection.kind !== item.selection.kind) ? <h3 className="gw-activity-queue__group">{item.selection.kind === 'approval' ? 'Pending approvals' : 'Recent activity'}</h3> : null}
        <button type="button" className="gw-activity-row" data-activity-id={item.key} tabIndex={tabKey === item.key ? 0 : -1} aria-current={sameActivitySelection(selection, item.selection) ? 'true' : undefined} onFocus={() => setFocusKey(item.key)} onClick={() => onSelect(item.selection)}>
          <span className="gw-activity-row__top"><span>{item.label}</span><time dateTime={item.occurredAt} title={new Date(item.occurredAt).toLocaleString()}>{formatTimeLabel(item.occurredAt)}</time></span>
          <span className="gw-activity-row__body"><span className="gw-activity-row__avatar" aria-hidden="true">{item.actorName ? avatarInitials(item.actorName) : <ShellIcon name={item.selection.kind === 'approval' ? 'work' : 'inbox'} />}</span><span className="gw-activity-row__copy"><strong title={item.title}>{item.title}</strong><span>{item.actorName ? `${item.actorName} · ` : ''}{item.preview}</span></span></span>
        </button>
      </li>)}</ol>}
    </div>
  </section>;
}

export interface ActivitySourceProps {
  state: GwiraLocalState;
  selection?: ActivitySelection;
  onOpenTask: (taskId: string) => void;
  onBack?: () => void;
  onClear?: () => void;
}
export function ActivitySource({ state, selection, onOpenTask, onBack, onClear }: ActivitySourceProps): React.ReactElement {
  const source = useMemo(() => resolveActivitySource(state, selection), [state, selection]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selection) headingRef.current?.focus({ preventScroll: true }); }, [selection?.kind, selection?.id]);
  const owner = source.status === 'available' && source.task?.assignee ? source.task.assignee.kind === 'person'
    ? state.people.find((person) => person.id === source.task!.assignee!.id && person.workspaceId === state.workspace.id)?.name
    : state.agents.find((agent) => agent.id === source.task!.assignee!.id && agent.workspaceId === state.workspace.id)?.name : undefined;
  return <section className="gw-activity-source" aria-label="Selected activity source" data-activity-source={selection ? activitySelectionKey(selection) : undefined}>
    {onBack ? <button type="button" className="gw-activity-source__back" onClick={onBack}><ShellIcon name="back" />Back to review</button> : null}
    {source.status !== 'available' ? <div className="gw-activity-source__empty"><span className="gw-activity-source__eyebrow">Needs review</span><h2 ref={headingRef} tabIndex={-1}>{source.status === 'unselected' ? 'Select an item to see its context' : 'Source no longer available'}</h2><p>{source.status === 'unselected' ? 'Review approvals and workspace updates without leaving your queue.' : 'The record was removed or is unavailable in this workspace. Choose another item from the queue.'}</p>{source.status === 'unavailable' && onClear ? <button type="button" onClick={onClear}>Clear selection</button> : null}</div> : <>
      <header className="gw-activity-source__header"><span className="gw-activity-source__eyebrow">{source.selection.kind === 'approval' ? 'Approval request' : 'Workspace activity'}</span><h2 ref={headingRef} tabIndex={-1}>{source.title}</h2><p>{source.actorName ? `${source.actorName} · ` : ''}<time dateTime={source.occurredAt}>{new Date(source.occurredAt).toLocaleString()}</time></p></header>
      <div className="gw-activity-source__scroll">
        <section className="gw-activity-source__record is-source" aria-label="Selected source record"><span className="gw-activity-source__record-label">Selected source</span><h3>{source.approval ? 'Approval' : activityKindLabel(source.event!.kind)}</h3>{source.approval ? <><p role="status" className={`gw-activity-source__status${source.approval.status === 'pending' ? ' is-waiting' : ''}`}>{source.approval.status === 'pending' ? 'Waiting for review' : approvalStatusLabel(source.approval.status)}</p><dl><div><dt>Result reference</dt><dd>{source.approval.resultId}</dd></div>{source.approval.decidedAt ? <div><dt>Decision recorded</dt><dd><time dateTime={source.approval.decidedAt}>{new Date(source.approval.decidedAt).toLocaleString()}</time></dd></div> : null}</dl><p className="gw-activity-source__note">Approval decisions happen in the task workflow.</p></> : <p>{source.event!.summary}</p>}</section>
        {source.task ? <section className="gw-activity-source__record"><span className="gw-activity-source__record-label">Related task</span><h3>{source.task.title}</h3>{source.task.description ? <p className="gw-activity-source__description">{source.task.description}</p> : null}<dl><div><dt>Status</dt><dd>{taskStatusLabel(source.task.status)}</dd></div><div><dt>Priority</dt><dd>{source.task.priority}</dd></div>{owner ? <div><dt>Owner</dt><dd>{owner}</dd></div> : null}{source.project ? <div><dt>Project</dt><dd>{source.project.name}</dd></div> : null}{source.task.dueDate ? <div><dt>Due</dt><dd><time dateTime={source.task.dueDate}>{source.task.dueDate}</time></dd></div> : null}</dl><button type="button" className="gw-activity-source__open" aria-label="Open linked task" onClick={() => onOpenTask(source.task!.id)}>Open task<ShellIcon name="forward" /></button></section> : <p className="gw-activity-source__note">{source.event?.taskId ? 'The linked task is unavailable in this workspace.' : 'This update has no linked task.'}</p>}
      </div>
    </>}
  </section>;
}

/** Legacy wrapper retained for callers outside the integrated Inbox layout. */
export function ActivityFeedView({ state, onOpenTask }: { state: GwiraLocalState; onOpenTask: (taskId: string) => void }): React.ReactElement {
  const [selection, setSelection] = useState<ActivitySelection>();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  return <div className="gw-activity-standalone"><ActivityQueue state={state} selection={selection} onSelect={setSelection} filter={filter} onFilterChange={setFilter} /><ActivitySource state={state} selection={selection} onOpenTask={onOpenTask} /></div>;
}
