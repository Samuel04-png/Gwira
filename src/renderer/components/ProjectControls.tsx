import React from 'react';
import { projectSelectorRows } from '../projectSelector.js';
import type { ProjectEntry } from '../projects.js';
import { FolderIcon, FolderPlusIcon } from './Icons.js';

export function Welcome({ projectName, open, onToggle, codingProject }: { projectName: string; open: boolean; onToggle: (button: HTMLButtonElement) => void; codingProject: boolean }): React.ReactElement {
  return <section className="welcome"><div className="codex-mark">›_</div><h1>{codingProject ? 'Let’s build' : 'What would you like to get done?'}</h1><button className={open ? 'project-select open' : 'project-select'} type="button" onClick={(event) => onToggle(event.currentTarget)}><span>{projectName}</span><span className="select-chevron" aria-hidden="true" /></button></section>;
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
  return <div className="project-selector-layer" onPointerDown={onClose}>
    <div className="project-selector-popover" style={position} onPointerDown={(event) => event.stopPropagation()}>
      <div className="project-selector-title">Select your project</div>
      {rows.map((project) => <button className={project.active ? 'project-selector-row active' : 'project-selector-row'} type="button" key={project.id} onClick={() => onSelect(project)}><FolderIcon className="folder-icon" /><strong>{project.name}</strong>{project.active ? <span className="project-selector-check">✓</span> : null}</button>)}
      <div className="project-selector-divider" />
      <button className="project-selector-row add" type="button" onClick={onAddProject}><FolderPlusIcon className="project-selector-add-icon" /><strong>Add new project</strong></button>
    </div>
  </div>;
}
