import React, { useRef } from 'react';
import './inboxView.css';

export interface InboxViewListProps {
  label: string;
  children: React.ReactNode;
  /** Called after arrow keys move focus, so a view can let selection follow focus. */
  onFocusRow?: (rowKey: string) => void;
}

export function InboxGroupHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return <li className="gw-inbox-group-heading" role="presentation">{children}</li>;
}

/** A list of InboxRow items. Arrow keys and j/k move focus between rows; Enter opens the focused row. */
export function InboxViewList({ label, children, onFocusRow }: InboxViewListProps): React.ReactElement {
  const ref = useRef<HTMLOListElement>(null);
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    const down = event.key === 'ArrowDown' || event.key === 'j';
    const up = event.key === 'ArrowUp' || event.key === 'k';
    const edge = event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined;
    if (!down && !up && !edge) return;
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>('[data-inbox-row]') ?? [])];
    if (!rows.length) return;
    event.preventDefault();
    const index = rows.indexOf((event.target as HTMLElement).closest<HTMLElement>('[data-inbox-row]') as HTMLElement);
    const next = edge === 'first' ? rows[0] : edge === 'last' ? rows[rows.length - 1] : rows[Math.max(0, Math.min(rows.length - 1, (index < 0 ? (down ? -1 : rows.length) : index) + (down ? 1 : -1)))];
    next?.focus();
    if (next?.dataset.inboxRow) onFocusRow?.(next.dataset.inboxRow);
  };
  return <ol className="gw-inbox-list" aria-label={label} ref={ref} onKeyDown={onKeyDown}>{children}</ol>;
}
