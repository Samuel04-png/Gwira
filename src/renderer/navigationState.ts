export type WorkspaceView = 'home' | 'library' | 'dashboard' | 'inbox' | 'my-work' | 'organization' | 'teams' | 'agents' | 'doats' | 'integrations' | 'settings' | 'chat' | 'skills' | 'work-sessions' | 'schedule';

export function viewAfterOpeningThread(_currentView: WorkspaceView): WorkspaceView {
  return 'home';
}
