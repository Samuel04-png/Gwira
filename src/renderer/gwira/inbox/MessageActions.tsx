import { Icon } from "../../components/Icon.js";
import React, { useEffect, useRef, useState } from 'react';
import type { MessageView } from '../messaging/domain/selectors.js';
import type { Message } from '../messaging/domain/types.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import { ReactionPicker } from './ReactionBar.js';
import { actionFailureMessage, copyableText, messageActionFlags } from './threadsModel.js';
import './threads.css';

export interface MessageActionsProps {
  view: MessageView;
  /** True when rendered inside the thread panel (hides reply / mark unread). */
  inThread?: boolean;
  /** False when the conversation is read-only for the actor (e.g. archived); hides reply. */
  canPost?: boolean;
  onToggleReaction: (messageId: string, emoji: string) => DispatchResult;
  onToggleSaved: (messageId: string) => DispatchResult;
  onMarkUnread: (conversationId: string, messageId: string) => DispatchResult;
  onDelete: (messageId: string) => DispatchResult;
  /** Opens the thread panel for a root message. */
  onReply?: (rootMessage: Message) => void;
  /** Starts editing; the host passes the message to Composer's editingMessage. */
  onEdit?: (message: Message) => void;
}

/** Toolbar for MessageFeed.renderActions and ThreadPanel rows. */
export function MessageActions({ view, inThread = false, canPost, onToggleReaction, onToggleSaved, onMarkUnread, onDelete, onReply, onEdit }: MessageActionsProps): React.ReactElement | null {
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const actionsRef = useRef<HTMLDivElement>(null);
  const reactionTrigger = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const { message } = view;
  const flags = messageActionFlags(view, { inThread, canPost });

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (picker) requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLButtonElement>('.gw-msg-reactionpicker button')?.focus());
    else if (confirmDelete) requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLButtonElement>('[aria-label="Confirm delete message"]')?.focus());
  }, [picker, confirmDelete]);

  const closePicker = (): void => {
    setPicker(false);
    requestAnimationFrame(() => reactionTrigger.current?.focus());
  };
  const closeDelete = (): void => {
    setConfirmDelete(false);
    requestAnimationFrame(() => deleteTrigger.current?.focus());
  };

  const announce = (text: string): void => {
    setStatus(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 4000);
  };
  const run = (result: DispatchResult, verb: string, okText?: string): void => {
    const failure = actionFailureMessage(result, verb);
    if (failure) announce(failure);
    else if (okText) announce(okText);
  };
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(copyableText(view));
      announce('Message text copied');
    } catch {
      announce('Could not copy: clipboard is unavailable');
    }
  };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape' && (picker || confirmDelete)) {
      event.preventDefault();
      event.stopPropagation();
      if (picker) closePicker();
      else closeDelete();
    }
  };

  if (!flags.react && !flags.reply && !flags.save && !flags.edit && !flags.remove && !flags.copy && !flags.markUnread) return null;

  return <div ref={actionsRef} className="gw-msg-actions" onKeyDown={onKeyDown}>
    {flags.react ? <button ref={reactionTrigger} type="button" className={`gw-msg-action gw-msg-action--label${picker ? ' is-active' : ''}`} aria-label="Add reaction" aria-haspopup="true" aria-expanded={picker} onClick={() => { setPicker((open) => !open); setConfirmDelete(false); }}>React</button> : null}
    {picker ? <ReactionPicker reactions={view.reactions} onToggle={(emoji) => { run(onToggleReaction(message.id, emoji), 'update reaction'); closePicker(); }} /> : null}
    {flags.reply && onReply ? <button type="button" className="gw-msg-action" aria-label={view.replyCount > 0 ? `Reply in thread (${view.replyCount} so far)` : 'Reply in thread'} onClick={() => onReply(message)}><Icon name="threads" className="gw-msg-action__icon" /></button> : null}
    {flags.save ? <button type="button" className={`gw-msg-action${view.savedByActor ? ' is-active' : ''}`} aria-pressed={view.savedByActor} aria-label={view.savedByActor ? 'Remove from saved' : 'Save message'} onClick={() => run(onToggleSaved(message.id), 'update saved', view.savedByActor ? 'Removed from saved' : 'Saved')}><Icon name="bookmark" className="gw-msg-action__icon" /></button> : null}
    {flags.copy ? <button type="button" className="gw-msg-action gw-msg-action--label" aria-label="Copy message text" onClick={() => { void copy(); }}>Copy</button> : null}
    {flags.markUnread ? <button type="button" className="gw-msg-action gw-msg-action--label" aria-label="Mark unread from here" onClick={() => run(onMarkUnread(message.conversationId, message.id), 'mark unread', 'Marked unread from this message')}>Unread</button> : null}
    {flags.edit && onEdit ? <button type="button" className="gw-msg-action gw-msg-action--label" aria-label="Edit message" onClick={() => onEdit(message)}>Edit</button> : null}
    {flags.remove && !confirmDelete ? <button ref={deleteTrigger} type="button" className="gw-msg-action gw-msg-action--danger" aria-label="Delete message" onClick={() => { setConfirmDelete(true); setPicker(false); }}><Icon name="trash" /></button> : null}
    {flags.remove && confirmDelete ? <span className="gw-msg-confirm" role="group" aria-label="Confirm delete">
      <span>Delete?</span>
      <button type="button" className="gw-msg-action gw-msg-action--danger" aria-label="Confirm delete message" onClick={() => { run(onDelete(message.id), 'delete message'); setConfirmDelete(false); }}>Delete</button>
      <button type="button" className="gw-msg-action" aria-label="Cancel delete" onClick={closeDelete}>Cancel</button>
    </span> : null}
    <span className="gw-msg-actions__status" role="status" aria-live="polite">{status}</span>
  </div>;
}
