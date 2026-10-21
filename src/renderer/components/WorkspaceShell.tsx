import React from 'react';
import type { WorkspaceNavigation } from './ProjectSidebar.js';

/**
 * Keeps the current two supported renderer destinations isolated from the
 * application controller. Future Gwira destinations must supply a real data
 * contract before they are added here.
 */
export function WorkspaceShell({ activeView, workspaceRef, chat, skills, businessViews = {} }: {
  activeView: WorkspaceNavigation;
  workspaceRef: React.RefObject<HTMLElement | null>;
  chat: React.ReactNode;
  skills: React.ReactNode;
  businessViews?: Partial<Record<Exclude<WorkspaceNavigation, 'home' | 'chat' | 'skills'>, React.ReactNode>>;
}): React.ReactElement {
  const content = activeView === 'home' || activeView === 'chat' ? chat : activeView === 'skills' ? skills : businessViews[activeView];
  return <section className="workspace" ref={workspaceRef}>{content ?? chat}</section>;
}
