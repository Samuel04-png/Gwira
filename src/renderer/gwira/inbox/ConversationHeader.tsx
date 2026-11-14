import React from 'react';
import type { FeedView } from '../messaging/domain/selectors.js';
import { avatarInitials, conversationKindLabel, memberCountLabel } from './inboxNavModel.js';
import { ShellIcon } from '../../components/Icon.js';
import './messageFeed.css';

export interface ConversationHeaderProps {
  feed: Pick<FeedView, 'conversation' | 'title' | 'members' | 'canPost' | 'doatNotConnected'>;
  onBack?: () => void;
  /** Implemented header actions, such as the existing Details toggle. */
  actions?: React.ReactNode;
  sampleData?: boolean;
  /** Focuses the existing scoped message search; omit to hide this action. */
  onSearch?: () => void;
  storageScope?: 'local' | 'workspace';
  memberCount?: number;
}

export function ConversationHeader({ feed, onBack, actions, onSearch, sampleData = false, storageScope = 'local', memberCount }: ConversationHeaderProps): React.ReactElement {
  const { conversation } = feed;
  const doatDm = conversation.kind === 'dm' && feed.members.some((member) => member.ref.kind === 'doat');
  return <header className="gw-msg-header">
    {onBack ? <button type="button" className="gw-msg-header__back" onClick={onBack} aria-label="Back to conversations"><ShellIcon name="back" /></button> : null}
    <span className={`gw-msg-header__identity${doatDm ? ' is-doat' : ''}`} aria-hidden="true">
      {conversation.kind === 'channel' ? '#' : conversation.kind === 'group' ? <ShellIcon name="teams" /> : avatarInitials(feed.title)}
    </span>
    <div className="gw-msg-header__main">
      <h1 className="gw-msg-header__title" title={feed.title}>{feed.title || 'Conversation'}</h1>
      <p className="gw-msg-header__meta">
        <span>{doatDm ? 'Doat conversation' : conversationKindLabel(conversation.kind, conversation.visibility)}</span>
        <span aria-hidden="true">·</span><span>{memberCountLabel(memberCount ?? feed.members.length)}</span>
        {conversation.topic ? <><span aria-hidden="true">·</span><span className="gw-msg-header__topic" title={conversation.topic}>{conversation.topic}</span></> : null}
        {conversation.archivedAt ? <><span aria-hidden="true">·</span><span>Archived</span></> : null}
        {!feed.canPost && !conversation.archivedAt ? <><span aria-hidden="true">·</span><span>Read only</span></> : null}
      </p>
    </div>
    <div className="gw-msg-header__actions">
      <span className="gw-msg-header__note" title={storageScope==='local'?'Messages stay on this device and are not sent to other people.':'Messages are shared with authorized channel members.'}>{storageScope==='local'?'On this device only':'Workspace channel'}</span>
      {sampleData ? <span className="gw-msg-header__note is-sample">Sample data</span> : null}
      {onSearch ? <button type="button" className="gw-msg-header__search" onClick={onSearch} aria-label="Search this conversation" title="Search this conversation"><ShellIcon name="search" /></button> : null}
      {actions}
    </div>
  </header>;
}
