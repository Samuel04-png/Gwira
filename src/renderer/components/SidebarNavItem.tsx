import React from 'react';
import { NavigationIcon, navigationIconRegistry } from './Icon.js';
import { SidebarTooltip } from './SidebarTooltip.js';

/** Shared rail interaction; route ownership stays with ProjectSidebar. */
export function SidebarNavItem({ label, tooltip = label, icon, active = false, disabled = false, view, expanded, popup = true, onClick, onKeyDown }: {
  label: string; tooltip?: string; icon: keyof typeof navigationIconRegistry;
  active?: boolean; disabled?: boolean; view?: string; expanded?: boolean; popup?: boolean;
  onClick?: () => void; onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
}): React.ReactElement {
  return <SidebarTooltip label={tooltip} className="gw-rail-item">
    <button type="button" className={active ? 'active' : ''} aria-label={label} disabled={disabled}
      aria-current={active ? view ? 'page' : 'true' : undefined} data-navigation-view={view}
      aria-expanded={expanded} aria-haspopup={expanded !== undefined && popup ? 'menu' : undefined}
      onKeyDown={onKeyDown} onClick={onClick}>
      <NavigationIcon name={icon} active={active} size={20} className="rail-icon" />
    </button>
  </SidebarTooltip>;
}
