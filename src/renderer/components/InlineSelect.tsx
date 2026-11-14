import { Icon } from "./Icon.js";
import React, { useEffect, useRef } from 'react';

export function InlineSelect({ id, className = '', value, label, options, open, disabled, menuRef, onOpenChange, onChange }: {
  id: string;
  className?: string;
  value: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  open: boolean;
  disabled: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    root?.querySelector<HTMLButtonElement>('[aria-selected="true"], [role="option"]')?.focus();
    const close = (event: PointerEvent): void => { if (!root?.contains(event.target as Node)) onOpenChange(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return <div ref={rootRef} onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); onOpenChange(false); triggerRef.current?.focus(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }} className={`inline-select ${className} ${open ? 'open' : ''}`} >
    <button ref={triggerRef} type="button" onClick={() => onOpenChange(!open)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={id} title={`${id}: ${label}`}><span>{label}</span><span className="select-chevron" aria-hidden="true"><Icon name="chevron-down" /></span></button>
    {open ? <div className="inline-select-menu" ref={menuRef} role="listbox" aria-label={id}>
      {options.map((option) => <button key={option.value} type="button" className={option.value === value ? 'selected' : ''} role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); onOpenChange(false); triggerRef.current?.focus(); }}><span>{option.value === value ? <Icon name="trace-check" /> : null}</span><strong>{option.label}</strong></button>)}
    </div> : null}
  </div>;
}
