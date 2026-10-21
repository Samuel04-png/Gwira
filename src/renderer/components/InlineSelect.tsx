import React from 'react';

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
  return <div className={`inline-select ${className} ${open ? 'open' : ''}`} ref={open ? menuRef : undefined}>
    <button type="button" onClick={() => onOpenChange(!open)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={id}><span>{label}</span><span className="select-chevron" aria-hidden="true" /></button>
    {open ? <div className="inline-select-menu" role="listbox">
      {options.map((option) => <button key={option.value} type="button" className={option.value === value ? 'selected' : ''} role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); onOpenChange(false); }}><span>{option.value === value ? '✓' : ''}</span><strong>{option.label}</strong></button>)}
    </div> : null}
  </div>;
}
