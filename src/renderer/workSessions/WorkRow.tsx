import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';
import { CompactActionMenu, type CompactAction } from '../components/CompactActionMenu.js';
import type { WorkSessionView } from './model.js';
import { relativeTime } from '../gwira/dashboard/workflowPanelModel.js';
export function WorkAvatar({ row }: { row: WorkSessionView }): React.ReactElement {
  return <span className={`work-avatar is-${row.workerKind ?? 'agent'}`} aria-hidden="true">{row.workerKind === 'person' ? row.owner.trim().split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase() : <Icon name={row.workerKind === 'doat' ? 'doats' : 'agents'} />}</span>;
}
export function WorkStatus({ row }: { row: WorkSessionView }): React.ReactElement {
  const icon = row.group === 'working' ? 'running' : row.group === 'review' || row.group === 'waiting' ? 'waiting' : row.group === 'attention' ? 'failed' : row.group === 'assigned' ? 'work' : row.status === 'Stopped' ? 'stop' : 'trace-check';
  return <span title={row.status} className={`work-sessions__status is-${row.group}${row.status === 'Stopped' ? ' is-stopped' : ''}`}><Icon name={icon} /><span>{row.status}</span></span>;
}
export function WorkRow({ row, selected, unread, workspaceContext, onSelect, onPrimary, actions }: { row: WorkSessionView; selected: boolean; unread?:boolean; workspaceContext?: boolean; onSelect: () => void; onPrimary: () => void; actions: CompactAction[] }): React.ReactElement {
  const [context, setContext] = useState<{x:number;y:number;nonce:number}>();
  const primary = row.approvals.some(approval => approval.status === 'pending') ? 'Review approval' : row.workerKind === 'person' ? 'Message employee' : 'Give instruction';
  return <div className={`work-sessions__row-wrap${selected ? ' is-selected' : ''}`} onKeyDown={event => { if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setContext({ x: rect.right, y: rect.top, nonce: Date.now() }); } }} onContextMenu={event => { event.preventDefault(); setContext({ x: event.clientX, y: event.clientY, nonce: Date.now() }); }}>
    <button type="button" className="work-sessions__row" data-work-row={row.id} aria-current={selected ? 'true' : undefined} onClick={onSelect} title={`${row.owner}: ${row.title}`} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const rows = [...event.currentTarget.closest('.work-sessions__list')!.querySelectorAll<HTMLButtonElement>('[data-work-row]')], index = rows.indexOf(event.currentTarget);
      rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    }}><WorkAvatar row={row} /><span className="work-row__identity"><strong>{workspaceContext ? row.title : row.owner}{unread?<i className="desktop-unread-dot" aria-label="Unread update"/>:null}</strong><span className="work-row__title">{workspaceContext ? row.project ? `${row.project} · ${row.owner}` : row.owner : row.title}</span></span><span className="work-row__metadata"><WorkStatus row={row} /><time dateTime={row.updatedAt} title={row.updatedAt}>{relativeTime(row.updatedAt)}</time></span></button>
    <div className="work-sessions__row-options"><button type="button" aria-label={`${primary}: ${row.title}`} title={primary} onClick={onPrimary}><Icon name={primary === 'Review approval' ? 'review' : 'threads'} /></button><CompactActionMenu label={`Options for ${row.title}`} actions={actions} contextRequest={context} /></div>
  </div>;
}
