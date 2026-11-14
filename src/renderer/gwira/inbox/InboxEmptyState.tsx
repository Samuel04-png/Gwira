import React from 'react';
import './inboxView.css';

export interface InboxEmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

/** Centred pane empty state: icon, 16px title, 14px secondary line, at most one button. */
export function InboxEmptyState({ title, description, icon, action }: InboxEmptyStateProps): React.ReactElement {
  return <div className="gw-inbox-empty">
    {icon ? <span className="gw-inbox-empty__mark" aria-hidden="true">{icon}</span> : null}
    <h3>{title}</h3>
    {description ? <p>{description}</p> : null}
    {action ? <button type="button" className="gw-inbox-empty__action" onClick={action.onClick}>{action.label}</button> : null}
  </div>;
}
