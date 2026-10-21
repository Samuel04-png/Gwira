export type WorkspaceView = 'home' | 'library' | 'dashboard' | 'inbox' | 'my-work' | 'organization' | 'teams' | 'agents' | 'doats' | 'integrations' | 'settings' | 'chat' | 'skills';

export function viewAfterOpeningThread(_currentView: WorkspaceView): WorkspaceView {
  return 'home';
}
