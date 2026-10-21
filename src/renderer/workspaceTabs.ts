import { WORKSPACE_NAVIGATION_ITEMS, workspaceNavigationLabel, type RoutableWorkspaceView, type WorkspaceNavigation } from './navigationTypes.js';

export type WorkspaceDestination =
  | { type: 'view'; view: RoutableWorkspaceView }
  | { type: 'task'; taskId: string }
  | { type: 'doat'; doatId: string }
  | { type: 'project'; projectId: string }
  | { type: 'conversation'; projectId: string; conversationId: string };

export interface WorkspaceTab {
  id: string;
  destination: WorkspaceDestination;
}

export interface WorkspaceTabsState {
  tabs: WorkspaceTab[];
  activeTabId: string;
}

export const workspaceTabsStorageKey = 'gwira.workspace.tabs.v1';

export function destinationKey(destination: WorkspaceDestination): string {
  if (destination.type === 'task') return `task:${destination.taskId}`;
  if (destination.type === 'doat') return `doat:${destination.doatId}`;
  if (destination.type === 'project') return `project:${destination.projectId}`;
  if (destination.type === 'conversation') return `conversation:${destination.projectId}:${destination.conversationId}`;
  return `view:${destination.view}`;
}

export function destinationView(destination: WorkspaceDestination): WorkspaceNavigation {
  if (destination.type === 'task') return 'my-work';
  if (destination.type === 'doat') return 'doats';
  if (destination.type === 'conversation' || destination.type === 'project') return 'home';
  return destination.view;
}

export function workspaceTabLabel(destination: WorkspaceDestination, lookup: (destination: WorkspaceDestination) => string | undefined): string {
  return lookup(destination) ?? (destination.type === 'view' ? workspaceNavigationLabel(destination.view) : destination.type === 'task' ? 'Task' : destination.type === 'doat' ? 'Doat' : destination.type === 'project' ? 'Project' : 'Conversation');
}

function validDestination(value: unknown, isValidEntity: (destination: WorkspaceDestination) => boolean): value is WorkspaceDestination {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceDestination>;
  if (candidate.type === 'view' && typeof candidate.view === 'string' && WORKSPACE_NAVIGATION_ITEMS.some((item) => item.view === candidate.view)) return true;
  if (candidate.type === 'task' && typeof candidate.taskId === 'string' && candidate.taskId.length > 0) {
    return isValidEntity({ type: 'task', taskId: candidate.taskId });
  }
  if (candidate.type === 'doat' && typeof candidate.doatId === 'string' && candidate.doatId.length > 0) {
    return isValidEntity({ type: 'doat', doatId: candidate.doatId });
  }
  if (candidate.type === 'project' && typeof candidate.projectId === 'string' && candidate.projectId.length > 0) {
    return isValidEntity({ type: 'project', projectId: candidate.projectId });
  }
  if (candidate.type === 'conversation' && typeof candidate.projectId === 'string' && typeof candidate.conversationId === 'string' && candidate.projectId && candidate.conversationId) {
    return isValidEntity({ type: 'conversation', projectId: candidate.projectId, conversationId: candidate.conversationId });
  }
  return false;
}

export function createDefaultWorkspaceTabs(): WorkspaceTabsState {
  const tab: WorkspaceTab = { id: crypto.randomUUID(), destination: { type: 'view', view: 'home' } };
  return { tabs: [tab], activeTabId: tab.id };
}

export function restoreWorkspaceTabs(
  serialized: string | null,
  isValidEntity: (destination: WorkspaceDestination) => boolean
): WorkspaceTabsState {
  if (!serialized) return createDefaultWorkspaceTabs();
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return createDefaultWorkspaceTabs();
    const value = parsed as { tabs?: unknown; activeTabId?: unknown };
    if (!Array.isArray(value.tabs)) return createDefaultWorkspaceTabs();
    const tabs: WorkspaceTab[] = [];
    const keys = new Set<string>();
    for (const item of value.tabs) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as { id?: unknown; destination?: unknown };
      if (typeof candidate.id !== 'string' || !candidate.id || !validDestination(candidate.destination, isValidEntity)) continue;
      const destination = candidate.destination;
      const key = destinationKey(destination);
      if (keys.has(key)) continue;
      keys.add(key);
      tabs.push({ id: candidate.id, destination });
    }
    if (!tabs.length) return createDefaultWorkspaceTabs();
    const activeTabId = tabs.some((tab) => tab.id === value.activeTabId) ? value.activeTabId as string : tabs[0]!.id;
    return { tabs, activeTabId };
  } catch {
    return createDefaultWorkspaceTabs();
  }
}

export function openWorkspaceTab(
  state: WorkspaceTabsState,
  destination: WorkspaceDestination,
  createId: () => string = () => crypto.randomUUID()
): WorkspaceTabsState {
  const existing = state.tabs.find((tab) => destinationKey(tab.destination) === destinationKey(destination));
  if (existing) return { ...state, activeTabId: existing.id };
  const tab = { id: createId(), destination };
  return { tabs: [...state.tabs, tab], activeTabId: tab.id };
}

export function closeWorkspaceTab(state: WorkspaceTabsState, tabId: string): WorkspaceTabsState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (!tabs.length) return createDefaultWorkspaceTabs();
  const activeTabId = state.activeTabId === tabId
    ? tabs[Math.max(0, Math.min(index - 1, tabs.length - 1))]!.id
    : state.activeTabId;
  return { tabs, activeTabId };
}

export function reorderWorkspaceTab(state: WorkspaceTabsState, tabId: string, targetId: string): WorkspaceTabsState {
  const from = state.tabs.findIndex((tab) => tab.id === tabId);
  const to = state.tabs.findIndex((tab) => tab.id === targetId);
  if (from < 0 || to < 0 || from === to) return state;
  const tabs = [...state.tabs];
  const [tab] = tabs.splice(from, 1);
  if (!tab) return state;
  tabs.splice(to, 0, tab);
  return { ...state, tabs };
}
