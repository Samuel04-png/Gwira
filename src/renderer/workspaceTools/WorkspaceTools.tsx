import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon.js';
import { NewTabLauncher, workspaceToolRegistry } from '../components/NewTabLauncher.js';
import { WorkspaceFiles } from './WorkspaceFiles.js';
import { WorkspaceTerminal } from './WorkspaceTerminal.js';
import './workspaceTools.css';

type Tool = 'sessions' | 'files' | 'terminal';
type ActiveFile = { rootName: string; rootFingerprint: string; path: string; name: string };

export function WorkspaceTools({
  open,
  sidebarTarget,
  canvasTarget,
  sessions,
  onClose,
  fixedTool,
  activeFile,
  onLaunchTool,
  terminalSessionId,
  terminalInitialCwd,
  onTerminalSessionStarted,
  onNewTerminalSession
}: {
  onLaunchTool?: (id: 'files' | 'terminal' | 'sessions') => void;
  terminalSessionId?: string;
  terminalInitialCwd?: string;
  onTerminalSessionStarted?: (sessionId: string) => void;
  onNewTerminalSession?: (sessionId: string) => void;
  activeFile?: ActiveFile;
  fixedTool?: Tool;
  open: boolean;
  sidebarTarget: HTMLElement | null;
  canvasTarget: HTMLElement | null;
  sessions: React.ReactNode;
  onClose: () => void;
}): React.ReactElement | null {
  const [tool, setTool] = useState<Tool>();
  const [filesCompact, setFilesCompact] = useState(false);
  const activeTool = fixedTool ?? (open ? tool : undefined);

  useEffect(() => setTool(fixedTool), [fixedTool]);

  useLayoutEffect(() => {
    if (activeTool !== 'files' || !sidebarTarget) return;
    const workspace = sidebarTarget.closest('.right-workspace');
    if (!workspace) return;
    const rawThreshold = getComputedStyle(document.documentElement).getPropertyValue('--gw-files-compact-width');
    const compactWidth = Number.parseFloat(rawThreshold) || 610;
    const measure = (): void => setFilesCompact(workspace.getBoundingClientRect().width <= compactWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeTool, sidebarTarget]);

  if (!sidebarTarget) return null;

  return createPortal(
    <section
      className="workspace-tools"
      aria-label="Workspace tools"
      data-files-layout={activeTool === 'files' ? 'true' : undefined}
      data-files-compact={activeTool === 'files' && filesCompact ? 'true' : undefined}
    >
      {activeTool && activeTool !== 'files' && activeTool !== 'sessions' && activeTool !== 'terminal' ? (
        <header>
          <h2>Workspace</h2>
          <button type="button" aria-label="Close workspace tools" onClick={onClose}><Icon name="close" /></button>
        </header>
      ) : null}
      {!fixedTool && tool ? (
        <nav aria-label="Workspace tool selection">
          {workspaceToolRegistry.map(({ id, label, icon }) => (
            <button type="button" key={id} aria-pressed={tool === id} onClick={() => setTool(id)}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
      ) : null}
      <WorkspaceFiles
        active={activeTool === 'files'}
        open={open && activeTool === 'files'}
        compact={filesCompact}
        activeFile={activeFile}
        canvasTarget={canvasTarget}
        onClose={onClose}
      />
      {!activeTool ? (
        <NewTabLauncher onTool={(id) => {
          if (onLaunchTool) onLaunchTool(id);
          else setTool(id);
        }} />
      ) : null}
      {activeTool === 'sessions' ? <div className="workspace-tools__sessions">{sessions}</div> : null}
      {activeTool === 'terminal' ? (
        <WorkspaceTerminal
          sessionId={terminalSessionId}
          initialCwd={terminalInitialCwd}
          onSessionStarted={onTerminalSessionStarted ?? (() => undefined)}
          onNewSession={onNewTerminalSession ?? (() => undefined)}
        />
      ) : null}
    </section>,
    sidebarTarget
  );
}
