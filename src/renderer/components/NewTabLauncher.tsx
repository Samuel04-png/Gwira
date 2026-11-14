import React from 'react';
import { Icon, type IconName } from './Icon.js';

export type WorkspaceLauncherTool = 'sessions' | 'files' | 'terminal';
export const workspaceToolRegistry: ReadonlyArray<{ id: WorkspaceLauncherTool; label: string; icon: IconName }> = [
  { id: 'sessions', label: 'Work Sessions', icon: 'clock' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' }
];

/** Shared landing view for a new tab and the right Workspace panel. */
export function NewTabLauncher({ onTool,retainedTools=[],onResumeTool,disabledTools={} }: { onTool: (id: WorkspaceLauncherTool) => void;retainedTools?:{id:string;label:string}[];onResumeTool?:(id:string)=>void;disabledTools?:Partial<Record<WorkspaceLauncherTool,string>> }): React.ReactElement {
  return <section className="new-tab-launcher" data-testid="new-tab-launcher" aria-labelledby="launcher-tools">
    <h1 id="launcher-tools">Tools</h1>
    <div className="new-tab-launcher__tools">
      {workspaceToolRegistry.map(tool => <button type="button" key={tool.id} disabled={!!disabledTools[tool.id]} title={disabledTools[tool.id]} onClick={() => onTool(tool.id)}><Icon name={tool.icon} size={16}/><span>{tool.label}</span></button>)}
    </div>
    {retainedTools.length ? <section className="new-tab-launcher__retained"><h2>Retained tools</h2><p>Restore a previous tool. While Gwira is open, terminal processes keep running until their tab is closed.</p>{retainedTools.map(tool=><button type="button" key={tool.id} onClick={()=>onResumeTool?.(tool.id)}>Restore {tool.label}</button>)}</section> : null}
  </section>;
}
