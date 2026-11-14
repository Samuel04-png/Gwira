import React from 'react';
import type { ReactionSummary } from '../messaging/domain/selectors.js';
import { orderReactions, reactionLabel, reactionPickerLabel, REACTION_EMOJIS } from './threadsModel.js';
import './threads.css';

export interface ReactionBarProps {
  reactions: readonly ReactionSummary[];
  onToggle: (emoji: string) => void;
  /** When false, chips are shown read-only (not buttons). */
  disabled?: boolean;
}

/** Existing reactions as toggle chips; counts carry accessible labels. */
export function ReactionBar({ reactions, onToggle, disabled = false }: ReactionBarProps): React.ReactElement | null {
  if (reactions.length === 0) return null;
  return <ul className="gw-msg-reactionbar" aria-label="Reactions">
    {orderReactions(reactions).map((reaction) => <li key={reaction.emoji}>
      <button type="button" className={`gw-msg-reactionbar__chip${reaction.reactedByActor ? ' is-own' : ''}`} aria-pressed={reaction.reactedByActor} aria-label={reactionLabel(reaction)} disabled={disabled} onClick={() => onToggle(reaction.emoji)}>
        <span aria-hidden="true">{reaction.emoji} {reaction.count}</span>
      </button>
    </li>)}
  </ul>;
}

export interface ReactionPickerProps {
  reactions: readonly ReactionSummary[];
  onToggle: (emoji: string) => void;
}

export function ReactionPicker({ reactions, onToggle }: ReactionPickerProps): React.ReactElement {
  return <div className="gw-msg-reactionpicker" role="group" aria-label="Choose a reaction" onKeyDown={(event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!buttons.length || current < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>
    {REACTION_EMOJIS.map((emoji) => {
      const active = reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByActor);
      return <button key={emoji} type="button" className={`gw-msg-action${active ? ' is-active' : ''}`} aria-pressed={active} aria-label={reactionPickerLabel(emoji, active)} onClick={() => onToggle(emoji)}>
        <span aria-hidden="true">{emoji}</span>
      </button>;
    })}
  </div>;
}
