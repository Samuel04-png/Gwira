import { ItemTitle } from '../../components/ItemTitle.js';
import React from 'react';
import './inboxView.css';

export interface InboxRowProps {
  rowKey: string;
  avatar: React.ReactNode;
  title: React.ReactNode;
  /** Small line above the title (for example the parent conversation). The time aligns right on it. */
  eyebrow?: React.ReactNode;
  preview?: React.ReactNode;
  /** Optional last line (participants, counts). */
  meta?: React.ReactNode;
  time?: { iso: string; label: string };
  selected?: boolean;
  unread?: boolean;
  /** 'compact' is the 56px list row; 'rich' keeps the multi-line layout used by Threads. */
  density?: 'compact' | 'rich';
  tabStop?: boolean;
  ariaLabel?: string;
  titleClassName?: string;
  /** Extra class on the row button, for view-specific density (for example a 3-line preview). */
  rowClassName?: string;
  /** Hover/focus toolbar. Rendered next to the row button, never inside it. */
  actions?: React.ReactNode;
  onOpen: () => void;
}

export function InboxRow(props: InboxRowProps): React.ReactElement {
  const { density = 'compact', selected, unread } = props;
  const time = props.time ? <time dateTime={props.time.iso} title={new Date(props.time.iso).toLocaleString()}>{props.time.label}</time> : null;
  return <li className="gw-inbox-row-item">
    <button type="button" className={`gw-inbox-row is-${density}${selected ? ' is-selected' : ''}${unread ? ' is-unread' : ''}${props.rowClassName ? ` ${props.rowClassName}` : ''}`} data-inbox-row={props.rowKey}
      tabIndex={props.tabStop === false ? -1 : 0} aria-current={selected ? 'true' : undefined} aria-label={props.ariaLabel} onClick={props.onOpen}>
      <span className="gw-inbox-row__avatar" aria-hidden="true">{props.avatar}</span>
      <span className="gw-inbox-row__main">
        {props.eyebrow ? <span className="gw-inbox-row__top"><span className="gw-inbox-row__eyebrow">{props.eyebrow}</span>{time}</span> : null}
        <span className="gw-inbox-row__titleline">
          <span className={`gw-inbox-row__title${props.titleClassName ? ` ${props.titleClassName}` : ''}`}>{typeof props.title === 'string' ? <ItemTitle text={props.title} /> : props.title}</span>
          {!props.eyebrow ? time : null}
        </span>
        {props.preview ? <span className="gw-inbox-row__preview">{props.preview}</span> : null}
        {props.meta ? <span className="gw-inbox-row__meta">{props.meta}</span> : null}
      </span>
    </button>
    {props.actions ? <span className="gw-inbox-row__actions">{props.actions}</span> : null}
  </li>;
}
