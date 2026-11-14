import React from 'react';
import type { WorkspaceNavigation } from './ProjectSidebar.js';

/** Renders one shared route instance per destination view so local navigation state survives tab switches. */
export function WorkspaceShell({ activeView, workspaceRef, chat, skills, special, businessViews = {} }: {
  activeView: WorkspaceNavigation;
  workspaceRef: React.RefObject<HTMLElement | null>;
  chat: React.ReactNode;
  skills: React.ReactNode;
  special?: React.ReactNode;
  businessViews?: Partial<Record<Exclude<WorkspaceNavigation, 'home' | 'chat' | 'skills'>, React.ReactNode>>;
}): React.ReactElement {
  const currentView = activeView === 'chat' ? 'home' : activeView;
  const mountedViews = React.useRef(new Set<WorkspaceNavigation>([currentView]));
  mountedViews.current.add(currentView);
  const views = [...mountedViews.current];
  return <section className="workspace" ref={workspaceRef} data-workspace-view={currentView}>
      <div className="workspace__route" aria-live="off">
      {views.map((view) => {
        const viewContent = view === 'home' || view === 'chat' ? chat : view === 'skills' ? skills : businessViews[view];
        const isChat = view === 'home' || view === 'chat';
        return <div key={view} className={`workspace__view${isChat ? ' workspace__view--chat' : ''}`} hidden={view !== currentView || !!special}>{viewContent ?? chat}</div>;
      })}
      {special ? <div className="workspace__view workspace__view--special">{special}</div> : null}
      </div>
  </section>;
}
