import React, { useEffect, useRef, useState } from 'react';
import { ShellIcon } from './Icon.js';

export function ComposerAddMenu({ disabled, onFiles, onProject, onSkills }: { disabled: boolean; onFiles: () => void; onProject: (button: HTMLButtonElement) => void; onSkills: () => void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent): void => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', outside); return () => window.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = (): void => { setOpen(false); trigger.current?.focus(); };
  return <div className="conversation-add" ref={root} onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}><button type="button" ref={trigger} aria-label="Attach files" title="Add files or context" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((value) => !value)}><ShellIcon name="plus" /></button>
    {open ? <div className="conversation-add__menu" role="menu" aria-label="Add conversation context"><span>Add context</span><button type="button" role="menuitem" onClick={() => { close(); onFiles(); }}><ShellIcon name="attachment" /><div>Files<small>Choose files from your computer</small></div></button><button type="button" role="menuitem" onClick={() => { close(); if (trigger.current) onProject(trigger.current); }}><ShellIcon name="folder" /><div>Project context<small>Choose a configured source folder</small></div></button><button type="button" role="menuitem" onClick={() => { close(); onSkills(); }}><ShellIcon name="skills" /><div>Skills<small>Use an installed skill</small></div></button></div> : null}
  </div>;
}
