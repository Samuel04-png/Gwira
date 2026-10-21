export type WorkspaceNavigation = 'home' | 'library' | 'dashboard' | 'inbox' | 'my-work' | 'organization' | 'teams' | 'agents' | 'doats' | 'integrations' | 'settings' | 'chat' | 'skills';
export type RoutableWorkspaceView = Exclude<WorkspaceNavigation, 'chat'>;

export type NavigationIconKey = 'home' | 'dashboard' | 'inbox' | 'work' | 'library' | 'views' | 'teams' | 'doats' | 'agents' | 'integrations' | 'settings' | 'skills';
export type NavigationGroup = 'primary' | 'workspace' | 'footer';

export interface WorkspaceRoute {
  view: RoutableWorkspaceView;
  label: string;
  icon: NavigationIconKey;
  group: NavigationGroup;
}

/** The single route registry: the sidebar, tab picker and tab labels all derive from this list. */
export const WORKSPACE_ROUTES: ReadonlyArray<WorkspaceRoute> = [
  { view: 'home', label: 'Home', icon: 'home', group: 'primary' },
  { view: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'primary' },
  { view: 'inbox', label: 'Inbox', icon: 'inbox', group: 'primary' },
  { view: 'my-work', label: 'My Work', icon: 'work', group: 'primary' },
  { view: 'library', label: 'Library', icon: 'library', group: 'primary' },
  { view: 'organization', label: 'Views', icon: 'views', group: 'workspace' },
  { view: 'teams', label: 'Teams', icon: 'teams', group: 'workspace' },
  { view: 'doats', label: 'Doats', icon: 'doats', group: 'workspace' },
  { view: 'agents', label: 'Coding agents', icon: 'agents', group: 'workspace' },
  { view: 'skills', label: 'Skills', icon: 'skills', group: 'workspace' },
  { view: 'integrations', label: 'Integrations', icon: 'integrations', group: 'footer' },
  { view: 'settings', label: 'Settings', icon: 'settings', group: 'footer' }
];

export const WORKSPACE_NAVIGATION_ITEMS: ReadonlyArray<{ view: RoutableWorkspaceView; label: string }> = WORKSPACE_ROUTES.map(({ view, label }) => ({ view, label }));

export function routesInGroup(group: NavigationGroup): WorkspaceRoute[] {
  return WORKSPACE_ROUTES.filter((route) => route.group === group);
}

export function workspaceNavigationLabel(view: WorkspaceNavigation): string {
  return WORKSPACE_ROUTES.find((item) => item.view === view)?.label ?? 'Home';
}
