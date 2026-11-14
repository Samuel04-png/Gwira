import React, { useState } from 'react';
import type { QueuedRequest } from '../conversationModel.js';
import { Icon } from './Icon.js';
import { CompactActionMenu } from './CompactActionMenu.js';

/** Presentation only. Production mounts this when a durable execution queue is available. */
export function QueuedMessageList({ requests, onEdit, onRemove, onMoveEarlier }: { requests: QueuedRequest[]; onEdit: (id: string, text: string) => void; onRemove: (id: string) => void; onMoveEarlier: (id: string) => void }): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false), [editing, setEditing] = useState<string>(), [text, setText] = useState('');
  const pending = requests.filter(entry => entry.status === 'pending');
  if (!pending.length) return null;
  return <section className="conversation-queue" aria-label="Queued requests">
    {pending.length > 3 ? <button type="button" className="conversation-queue__summary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{pending.length} queued messages<Icon name="chevron-down" /></button> : null}
    <div className="conversation-queue__list">{(pending.length > 3 && !expanded ? pending.slice(0, 1) : pending).map((entry, index) => <div className="conversation-queue__row" key={entry.id}>
      <Icon name="queued" />
      <span className="conversation-queue__preview" title={entry.text}>{entry.text}</span>
      <button type="button" className="conversation-queue__steer" disabled title="The execution provider does not support safe steering. This message stays queued."><Icon name="arrow-right" />Steer</button>
      <CompactActionMenu label={`Actions for queued message ${index + 1}`} actions={[
        { label: 'Edit message', icon: 'drafts', onSelect: () => { setEditing(entry.id); setText(entry.text); } },
        ...(index ? [{ label: 'Move earlier', icon: 'sort-up' as const, onSelect: () => onMoveEarlier(entry.id) }] : []),
        { label: 'Remove from queue', icon: 'trash', onSelect: () => onRemove(entry.id) }
      ]} />
      <button type="button" className="compact-menu-trigger" aria-label={`Remove queued message ${index + 1}`} title="Remove from queue" onClick={() => onRemove(entry.id)}><Icon name="trash" /></button>
      {editing === entry.id ? <form className="conversation-queue__edit" onSubmit={event => { event.preventDefault(); if (text.trim()) { onEdit(entry.id, text); setEditing(undefined); } }}><textarea autoFocus aria-label="Edit queued message" value={text} onChange={event => setText(event.target.value)} /><button type="submit" disabled={!text.trim()}>Save</button><button type="button" onClick={() => setEditing(undefined)}>Cancel</button></form> : null}
    </div>)}</div>
  </section>;
}
