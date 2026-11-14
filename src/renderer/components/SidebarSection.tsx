import React from 'react';
import { Icon } from './Icon.js';
/** Disclosure anatomy follows Home: label, adjacent chevron, reserved actions. */
export function SidebarSection({ id, label, expanded, onToggle, actions, children }: { id: string; label: string; expanded: boolean; onToggle: () => void; actions?: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return <section className="dashboard-sidebar__section"><div className="dashboard-sidebar__section-title sidebar-section-row"><button type="button" className="dashboard-sidebar__section-header sidebar-collapsible-heading" aria-expanded={expanded} aria-controls={id} onClick={onToggle}><span>{label}</span><span className={`sidebar-chevron ${expanded ? 'open' : ''}`} aria-hidden="true"><Icon name="chevron-right" /></span></button>{actions}</div><div id={id} hidden={!expanded}>{children}</div></section>;
}
