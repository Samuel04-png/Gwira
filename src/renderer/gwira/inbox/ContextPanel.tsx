import React, { useMemo } from 'react';
import type { FeedView } from '../messaging/domain/selectors.js';
import type { MessagingScope, MessagingWork, MessagingState } from '../messaging/domain/types.js';
import { EntityRefCard } from './EntityRefCard.js';
import { buildContextModel } from './contextModel.js';
import { avatarInitials } from './inboxNavModel.js';
import { ShellIcon } from '../../components/Icon.js';
import './context.css';

export interface ContextPanelProps {
  /** The authorized feed for the selected conversation; undefined when no conversation is selected or readable. */
  feed: FeedView | undefined;
  /** Current workspace records only; refs are resolved against this read-only state. */
  work: MessagingWork;
  scope: MessagingScope;
  /** Optional messaging snapshot used only for the current actor's saved count. */
  messagingState?: Pick<MessagingState, 'organizationId' | 'workspaceId' | 'saved' | 'messages' | 'selfPersonId'>;
  onOpenTask?: (taskId: string) => void;
  onClose?: () => void;
}

export function ContextPanel({ feed, work, scope, messagingState, onOpenTask, onClose }: ContextPanelProps): React.ReactElement {
  const model = useMemo(() => buildContextModel(feed, work, scope, messagingState), [feed, work, scope, messagingState]);
  if (!model) return <aside className="gw-msg-ctx" aria-label="Conversation context"><p className="gw-msg-ctx__empty">Conversation context is unavailable.</p></aside>;

  const kindLabel = model.kind === 'dm' ? 'Direct message' : model.kind === 'group' ? 'Group' : model.visibility === 'private' ? 'Private channel' : 'Channel';
  return <aside className="gw-msg-ctx" aria-label="Conversation context">
    <header className="gw-msg-ctx__header"><h2>Details</h2>{onClose ? <button className="gw-msg-action gw-msg-action--label" type="button" aria-label="Close conversation details" onClick={onClose}>Close</button> : null}</header>
    <div className="gw-msg-ctx__summary">
      <span className="gw-msg-ctx__identity" aria-hidden="true">{model.kind === 'channel' ? '#' : model.kind === 'group' ? <ShellIcon name="teams" /> : avatarInitials(model.title)}</span>
      <p className="gw-msg-ctx__conversation-title">{model.title}</p>
      <span className="gw-msg-ctx__meta">{kindLabel}</span>
      {model.topic ? <p className="gw-msg-ctx__topic">{model.topic}</p> : null}
    </div>

    <section className="gw-msg-ctx__section" aria-labelledby="gw-msg-ctx-members-heading">
      <h3 id="gw-msg-ctx-members-heading">Members <span>({model.members.length})</span></h3>
      {model.members.length === 0 ? <p className="gw-msg-ctx__empty">No members available.</p> : <ul className="gw-msg-ctx__members">
        {model.members.map((member) => <li key={member.key} className={`gw-msg-ctx__member${member.kind === 'doat' ? ' is-doat' : ''}${member.available ? '' : ' is-unavailable'}`}>
          <span className="gw-msg-ctx__avatar" aria-hidden="true">{member.available ? avatarInitials(member.name) : '?'}</span>
          <span className="gw-msg-ctx__member-info">
            <strong title={member.name}>{member.name}</strong>
            <span>{member.kind === 'doat' ? 'Doat' : 'Human'}{member.role ? ` · ${member.role}` : ''}</span>
          </span>
        </li>)}
      </ul>}
    </section>

    <section className="gw-msg-ctx__section" aria-labelledby="gw-msg-ctx-links-heading">
      <h3 id="gw-msg-ctx-links-heading">Linked records</h3>
      {model.entities.length === 0 ? <p className="gw-msg-ctx__empty">No linked records.</p> : <ul className="gw-msg-ctx__entities">
        {model.entities.map((entity) => <li key={entity.key}><EntityRefCard entity={entity} onOpenTask={onOpenTask} /></li>)}
      </ul>}
    </section>

    {model.savedCount !== undefined ? <section className="gw-msg-ctx__section gw-msg-ctx__saved" aria-label="Saved messages">
      <span>Saved messages</span><strong>{model.savedCount}</strong>
    </section> : null}
    {model.members.some((member) => member.kind === 'doat') || model.entities.some((entity) => entity.kind === 'doat_run' && entity.available) ? <p className="gw-msg-ctx__disclaimer">Links point to existing records only; a task link is not completion, and Doat references do not establish execution.</p> : null}
  </aside>;
}
