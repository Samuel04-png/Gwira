import { Icon } from "./Icon.js";
import { GwiraLogo } from './GwiraLogo.js';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { projectSelectorRows } from '../projectSelector.js';
import type { ProjectEntry } from '../projects.js';
import { FolderIcon, FolderPlusIcon } from './Icon.js';

export function Welcome({ projectName, open, onToggle, codingProject, unavailableReason }: { projectName: string; open: boolean; onToggle: (button: HTMLButtonElement) => void; codingProject: boolean; unavailableReason?:string }): React.ReactElement {
  return <section className="welcome"><span className="conversation-brand" data-mascot-state="idle" aria-hidden="true"><GwiraLogo size="canvas" /></span><h1>What should we work on in <button className={open ? 'project-select open' : 'project-select'} type="button" disabled={!!unavailableReason} title={unavailableReason} onClick={(event) => onToggle(event.currentTarget)} aria-label={`Choose conversation project, current context ${projectName}`}><span>{projectName || 'your workspace'}?</span><span className="select-chevron" aria-hidden="true"><Icon name="chevron-down" /></span></button></h1></section>;
}

export function ProjectSelectorPopover({ activeProjectId, position, projects, onSelect, onClose, onAddProject }: {
  activeProjectId?: string;
  position?: { top: number; left: number };
  projects: ProjectEntry[];
  onSelect: (project: ProjectEntry) => void;
  onClose: () => void;
  onAddProject: () => void;
}): React.ReactElement {
  const rows = projectSelectorRows(projects, activeProjectId);
  const panel = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState(position);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      const gap = Number.parseFloat(getComputedStyle(element).getPropertyValue('--gw-space-2'));
      setBounds({ top: Math.max(gap, Math.min(position?.top ?? rect.top, window.innerHeight - rect.height - gap)), left: Math.max(gap, Math.min(position?.left ?? rect.left, window.innerWidth - rect.width - gap)) });
      element.querySelector<HTMLButtonElement>('.active, button')?.focus();
    }
    return () => { if (element?.contains(document.activeElement) || document.activeElement === document.body) previous?.focus(); };
  }, [position]);
  return <div className="project-selector-layer" onPointerDown={onClose}>
    <div className="project-selector-popover" ref={panel} role="dialog" aria-label="Conversation project" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button') ?? []); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    }} style={bounds ? { '--gw-project-anchor-y': `${bounds.top}px`, '--gw-project-anchor-x': `${bounds.left}px` } as React.CSSProperties : undefined} onPointerDown={(event) => event.stopPropagation()}>
      <div className="project-selector-title">Select your project</div>
      {rows.map((project) => <button className={project.active ? 'project-selector-row active' : 'project-selector-row'} type="button" key={project.id} onClick={() => onSelect(project)}><FolderIcon className="folder-icon" /><strong>{project.name}</strong>{project.active ? <span className="project-selector-check"><Icon name="trace-check" /></span> : null}</button>)}
      <div className="project-selector-divider" />
      <button className="project-selector-row add" type="button" onClick={onAddProject}><FolderPlusIcon className="project-selector-add-icon" /><strong>Add new project</strong></button>
    </div>
  </div>;
}
