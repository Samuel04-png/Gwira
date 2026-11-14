import React from 'react';
import type { ParticipantView } from '../messaging/domain/selectors.js';
import { filterMentionCandidates } from './composerModel.js';

export interface MentionPickerProps {
  candidates: readonly ParticipantView[];
  id: string;
  query: string;
  activeIndex: number;
  onSelect: (candidate: ParticipantView) => void;
  onActiveChange: (index: number) => void;
}

export function MentionPicker({ candidates, id, query, activeIndex, onSelect, onActiveChange }: MentionPickerProps): React.ReactElement | null {
  const matches = filterMentionCandidates(candidates, query);
  if (matches.length === 0) return null;
  return <div id={id} className="gw-msg-mention-picker" role="listbox" aria-label="Conversation members">
    {matches.map((candidate, index) => <button
      id={`${id}-${candidate.ref.kind}-${candidate.ref.id}`}
      className="gw-msg-mention-option"
      type="button"
      role="option"
      aria-selected={index === activeIndex}
      key={`${candidate.ref.kind}:${candidate.ref.id}`}
      onMouseEnter={() => onActiveChange(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(candidate)}
      title={`Mention ${candidate.name}`}
    >
      <span className={`gw-msg-mention-avatar${candidate.ref.kind === 'doat' ? ' is-doat' : ''}`} aria-hidden="true">{candidate.name.slice(0, 1).toLocaleUpperCase()}</span>
      <span className="gw-msg-mention-name">{candidate.name}</span>
      <span className="gw-msg-mention-kind">{candidate.ref.kind === 'doat' ? 'Doat' : 'Person'}</span>
    </button>)}
  </div>;
}
