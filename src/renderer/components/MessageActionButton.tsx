import React from 'react';
import { Icon, type IconName } from './Icon.js';
import { SidebarTooltip } from './SidebarTooltip.js';

export function MessageActionButton({label, icon, onClick, disabledReason, pressed, expanded, buttonRef}: {
 label: string; icon: IconName; onClick?: () => void; disabledReason?: string; pressed?: boolean; expanded?: boolean; buttonRef?: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
 const button = <button ref={buttonRef} className="message-action-button" type="button" aria-label={label} disabled={!!disabledReason} aria-pressed={pressed} aria-expanded={expanded} aria-haspopup={expanded !== undefined ? 'menu' : undefined} onClick={onClick}><Icon name={icon}/></button>;
 return <SidebarTooltip placement="bottom" label={disabledReason ?? label} revealOnLabelChange={icon==='trace-copy'||icon==='trace-check'}>{disabledReason ? <span className="message-disabled-action" tabIndex={0} aria-label={`${label}. ${disabledReason}`}>{button}</span> : button}</SidebarTooltip>;
}
