import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon.js';

export interface CompactAction { destructive?: boolean; label: string; icon?: IconName; description?: string; disabled?: boolean; reason?: string; checked?: boolean; checkType?:'checkbox'; keepOpen?:boolean; onSelect: () => void }
/** Shared anchored menu for navigation and composer actions. */
export function CompactActionMenu({ label, icon = 'more', actions, className = '', contextRequest, triggerText }: { triggerText?:string; contextRequest?: { x: number; y: number; nonce: number }; label: string; icon?: IconName; actions: CompactAction[]; className?: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [contextPosition, setContextPosition] = useState<{x:number;y:number}>();
  useEffect(() => { if (contextRequest) { setContextPosition(contextRequest); setOpen(true); } }, [contextRequest]);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const close = (restore = true): void => { setOpen(false); if (restore) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const rect = trigger.current.getBoundingClientRect(), box = menu.current.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(menu.current).getPropertyValue('--gw-space-2'));
    const left = contextPosition?.x ?? rect.right - box.width, top = contextPosition?.y ?? rect.bottom + gap;
    setPosition({ left: Math.max(gap, Math.min(left, innerWidth - box.width - gap)), top: Math.max(gap, Math.min(top + box.height <= innerHeight - gap ? top : (contextPosition?.y ?? rect.top) - box.height - gap, innerHeight - box.height - gap)) });
    menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open, contextPosition]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent): void => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false); };
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
    const reposition = (): void => close(false);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key, true); window.addEventListener('resize', reposition);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', reposition); };
  }, [open]);
  return <><button ref={trigger} type="button" className={`compact-menu-trigger ${className}`} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { setContextPosition(undefined); setOpen(!open); }}><Icon name={icon} />{triggerText}</button>{open ? createPortal(<div ref={menu} className="compact-action-menu gw-sidebar-overlay" style={position} role="menu" aria-label={label} onKeyDown={event => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
    if (event.key === 'Tab') close(false);
  }}>{actions.map(action => <button key={action.label} className={action.destructive?'is-destructive':undefined} type="button" role={action.checked === undefined ? 'menuitem' : action.checkType==='checkbox'?'menuitemcheckbox':'menuitemradio'} aria-checked={action.checked} disabled={action.disabled} title={action.reason} onClick={() => { if(!action.keepOpen)close(); action.onSelect(); }}>{action.icon ? <Icon name={action.icon} /> : null}<span>{action.label}{action.description ? <small>{action.description}</small> : null}</span>{action.checked ? <Icon name="trace-check" /> : null}{action.disabled && action.reason ? <small className="compact-action-menu__reason">{action.reason}</small> : null}</button>)}</div>, document.body) : null}</>;
}
