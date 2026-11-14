import { WORKSPACE_NAVIGATION_ITEMS, workspaceNavigationLabel, type RoutableWorkspaceView, type WorkspaceNavigation } from './navigationTypes.js';

export type WorkspaceDestination =
  | { type: 'launcher' }
  | { type: 'files' }
  | { type: 'file'; rootName: string; rootFingerprint: string; path: string; name: string }
  | { type: 'terminal'; sessionId?: string; label?: string }
  | { type: 'work-sessions' }
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
  workspaceCollapsed?: boolean;
  suspendedWorkspaceTabs?: WorkspaceTab[];
  globalTabs?: WorkspaceTab[];
  workspaceTabs?: WorkspaceTab[];
  activeTabId: string;
  activeGlobalTabId?: string;
  activeWorkspaceTabId?: string;
  recent?: string[];
  closed?: WorkspaceTab[];
}

export const workspaceTabsStorageKey = 'gwira.workspace.tabs.v1';

function isGlobalDestination(destination: WorkspaceDestination): boolean {
  return destination.type === 'view' || destination.type === 'task' || destination.type === 'doat' || destination.type === 'project' || destination.type === 'conversation';
}

function isWorkspaceDestination(destination: WorkspaceDestination): boolean {
  return destination.type === 'launcher' || destination.type === 'files' || destination.type === 'file' || destination.type === 'terminal' || destination.type === 'work-sessions';
}

function getGlobalTabs(state: WorkspaceTabsState): WorkspaceTab[] {
  return state.globalTabs ?? state.tabs.filter((tab) => isGlobalDestination(tab.destination));
}

function getWorkspaceTabs(state: WorkspaceTabsState): WorkspaceTab[] {
  return state.workspaceTabs ?? state.tabs.filter((tab) => isWorkspaceDestination(tab.destination));
}

function buildTabs(state: Partial<Pick<WorkspaceTabsState, 'tabs' | 'globalTabs' | 'workspaceTabs'>>): WorkspaceTab[] {
  const tabs = state.tabs ?? [];
  const globalTabs = state.globalTabs ?? tabs.filter((tab) => isGlobalDestination(tab.destination));
  const workspaceTabs = state.workspaceTabs ?? tabs.filter((tab) => isWorkspaceDestination(tab.destination));
  return [...globalTabs, ...workspaceTabs];
}

function findTabGroup(state: WorkspaceTabsState, tabId: string): 'global' | 'workspace' | undefined {
  if (getGlobalTabs(state).some((tab) => tab.id === tabId)) return 'global';
  if (getWorkspaceTabs(state).some((tab) => tab.id === tabId)) return 'workspace';
  return undefined;
}

function preserveLegacyShape<T extends WorkspaceTabsState>(state: WorkspaceTabsState, next: T): T {
  if (state.globalTabs === undefined && state.workspaceTabs === undefined) {
    const { globalTabs: _globalTabs, workspaceTabs: _workspaceTabs, activeGlobalTabId: _activeGlobalTabId, activeWorkspaceTabId: _activeWorkspaceTabId, ...legacy } = next;
    return legacy as T;
  }
  return next;
}

function normalizeDefaultTabs(): Pick<WorkspaceTabsState, 'globalTabs' | 'workspaceTabs' | 'activeGlobalTabId' | 'activeWorkspaceTabId'> {
  const globalTab: WorkspaceTab = { id: crypto.randomUUID(), destination: { type: 'view', view: 'home' } };
  const workspaceTab: WorkspaceTab = { id: crypto.randomUUID(), destination: { type: 'launcher' } };
  return { globalTabs: [globalTab], workspaceTabs: [workspaceTab], activeGlobalTabId: globalTab.id, activeWorkspaceTabId: workspaceTab.id };
}

export function destinationKey(destination: WorkspaceDestination): string {
  if (destination.type === 'launcher' || destination.type === 'files') return destination.type;
  if (destination.type === 'terminal') return destination.sessionId ? `terminal:${destination.sessionId}` : 'terminal';
  if (destination.type === 'file') return `file:${JSON.stringify([destination.rootFingerprint, destination.path])}`;
  if (destination.type === 'work-sessions') return 'work-sessions';
  if (destination.type === 'task') return `task:${destination.taskId}`;
  if (destination.type === 'doat') return `doat:${destination.doatId}`;
  if (destination.type === 'project') return `project:${destination.projectId}`;
  if (destination.type === 'conversation') return `conversation:${destination.projectId}:${destination.conversationId}`;
  return `view:${destination.view}`;
}

export function destinationView(destination: WorkspaceDestination): WorkspaceNavigation {
  if (destination.type === 'launcher' || destination.type === 'files' || destination.type === 'file' || destination.type === 'terminal') return 'home';
  if (destination.type === 'work-sessions') return 'work-sessions';
  if (destination.type === 'task') return 'my-work';
  if (destination.type === 'doat') return 'doats';
  if (destination.type === 'conversation' || destination.type === 'project') return 'home';
  return destination.view;
}

export function workspaceTabLabel(destination: WorkspaceDestination, lookup: (destination: WorkspaceDestination) => string | undefined): string {
  if (destination.type === 'launcher') return 'New tab';
  if (destination.type === 'files') return 'Files';
  if (destination.type === 'file') return destination.name;
  if (destination.type === 'terminal') return destination.label || 'Terminal';
  if (destination.type === 'work-sessions') return 'Work Sessions';
  const resolved = lookup(destination);
  if (destination.type === 'conversation') {
    const label = readableConversationTitle(resolved);
    if (label) return label;
  } else if (resolved) return resolved;
  return destination.type === 'view' ? workspaceNavigationLabel(destination.view)
    : destination.type === 'task' ? 'Task'
      : destination.type === 'doat' ? 'Doat'
        : destination.type === 'project' ? 'Project' : 'Untitled conversation';
}

function readableConversationTitle(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const candidate = value.trim();
  if (candidate === 'Conversation') return undefined;
  if (!candidate.startsWith('{')) return candidate;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    for (const key of ['title', 'name', 'conversation_name', 'page_name', 'pageTitle']) {
      const label = record[key];
      if (typeof label === 'string' && label.trim() && label.length <= 160) return label.trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function validDestination(value: unknown, isValidEntity: (destination: WorkspaceDestination) => boolean): value is WorkspaceDestination {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceDestination>;
  if (candidate.type === 'launcher' || candidate.type === 'files' || candidate.type === 'work-sessions') return true;
  if (candidate.type === 'terminal') {
    const terminal = candidate as { sessionId?: unknown; label?: unknown };
    return (terminal.sessionId === undefined || typeof terminal.sessionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(terminal.sessionId))
      && (terminal.label === undefined || typeof terminal.label === 'string' && terminal.label.length > 0 && terminal.label.length <= 80);
  }
  if (candidate.type === 'file') return typeof candidate.rootFingerprint === 'string' && /^[a-f0-9]{64}$/.test(candidate.rootFingerprint) && typeof candidate.rootName === 'string' && candidate.rootName.length > 0 && candidate.rootName.length <= 255 && typeof candidate.name === 'string' && candidate.name.length > 0 && candidate.name.length <= 255 && typeof candidate.path === 'string' && candidate.path.length > 0 && candidate.path.length <= 4096 && !candidate.path.startsWith('/') && !candidate.path.includes('\\') && !candidate.path.split('/').some(part => part === '..' || part === '.' || !part);
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
  const defaults = normalizeDefaultTabs();
  const globalTabs = defaults.globalTabs ?? [];
  const workspaceTabs = defaults.workspaceTabs ?? [];
  const state = {
    ...defaults,
    tabs: buildTabs({ globalTabs, workspaceTabs }),
    activeTabId: defaults.activeWorkspaceTabId ?? defaults.activeGlobalTabId ?? globalTabs[0]?.id ?? 'home',
    recent: [],
    closed: []
  };
  return state;
}

export function restoreWorkspaceTabs(
  serialized: string | null,
  isValidEntity: (destination: WorkspaceDestination) => boolean
): WorkspaceTabsState {
  if (!serialized) return createDefaultWorkspaceTabs();
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return createDefaultWorkspaceTabs();
    const value = parsed as {
      tabs?: unknown;
      workspaceCollapsed?: unknown;
      suspendedWorkspaceTabs?: unknown;
      globalTabs?: unknown;
      workspaceTabs?: unknown;
      activeTabId?: unknown;
      activeGlobalTabId?: unknown;
      activeWorkspaceTabId?: unknown;
      recent?: unknown;
      closed?: unknown;
    };

    const fallback = createDefaultWorkspaceTabs();
    let globalTabs: WorkspaceTab[] = [];
    let workspaceTabs: WorkspaceTab[] = [];
    if (Array.isArray(value.globalTabs) || Array.isArray(value.workspaceTabs)) {
      globalTabs = Array.isArray(value.globalTabs) ? value.globalTabs.filter((item): item is WorkspaceTab => !!item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' && validDestination((item as { destination?: unknown }).destination, isValidEntity)) as WorkspaceTab[] : [];
      workspaceTabs = Array.isArray(value.workspaceTabs) ? value.workspaceTabs.filter((item): item is WorkspaceTab => !!item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' && validDestination((item as { destination?: unknown }).destination, isValidEntity)) as WorkspaceTab[] : [];
    } else if (Array.isArray(value.tabs)) {
      const split = value.tabs.reduce<{ globalTabs: WorkspaceTab[]; workspaceTabs: WorkspaceTab[] }>((accumulator, item) => {
        if (!item || typeof item !== 'object') return accumulator;
        const candidate = item as { id?: unknown; destination?: unknown };
        if (typeof candidate.id !== 'string' || !candidate.id || !validDestination(candidate.destination, isValidEntity)) return accumulator;
        const destination = candidate.destination as WorkspaceDestination;
        const tab = { id: candidate.id, destination };
        if (isGlobalDestination(destination)) accumulator.globalTabs.push(tab);
        else if (isWorkspaceDestination(destination)) accumulator.workspaceTabs.push(tab);
        return accumulator;
      }, { globalTabs: [], workspaceTabs: [] });
      globalTabs = split.globalTabs;
      workspaceTabs = split.workspaceTabs;
    }

    const seenTabIds = new Set<string>();
    const removeDuplicateIds = (tabs: WorkspaceTab[]): WorkspaceTab[] => tabs.filter(tab => {
      if (seenTabIds.has(tab.id)) return false;
      seenTabIds.add(tab.id);
      return true;
    });
    globalTabs = removeDuplicateIds(globalTabs);
    workspaceTabs = removeDuplicateIds(workspaceTabs);

    if (!globalTabs.length && !workspaceTabs.length) {
      const legacyTabs = Array.isArray(value.tabs) ? value.tabs : [];
      const deduped: WorkspaceTab[] = [];
      const keys = new Set<string>();
      const ids = new Set<string>();
      for (const item of legacyTabs) {
        if (!item || typeof item !== 'object') continue;
        const candidate = item as { id?: unknown; destination?: unknown };
        if (typeof candidate.id !== 'string' || !candidate.id || !validDestination(candidate.destination, isValidEntity)) continue;
        if (ids.has(candidate.id)) continue;
        ids.add(candidate.id);
        const destination = candidate.destination as WorkspaceDestination;
        const key = destinationKey(destination);
        if (destination.type !== 'launcher' && keys.has(key)) continue;
        keys.add(key);
        deduped.push({ id: candidate.id, destination });
      }
      if (!deduped.length) return fallback;
      const split = deduped.reduce<{ globalTabs: WorkspaceTab[]; workspaceTabs: WorkspaceTab[] }>((accumulator, tab) => {
        if (isGlobalDestination(tab.destination)) accumulator.globalTabs.push(tab);
        else if (isWorkspaceDestination(tab.destination)) accumulator.workspaceTabs.push(tab);
        return accumulator;
      }, { globalTabs: [], workspaceTabs: [] });
      globalTabs = split.globalTabs;
      workspaceTabs = split.workspaceTabs;
    }

    if (!globalTabs.length) globalTabs = [fallback.globalTabs?.[0] ?? { id: crypto.randomUUID(), destination: { type: 'view', view: 'home' } }];
    if (!workspaceTabs.length) workspaceTabs = [fallback.workspaceTabs?.[0] ?? { id: crypto.randomUUID(), destination: { type: 'launcher' } }];

    const activeGlobalTabId = typeof value.activeGlobalTabId === 'string' && globalTabs.some((tab) => tab.id === value.activeGlobalTabId)
      ? value.activeGlobalTabId
      : globalTabs.some((tab) => tab.id === value.activeTabId) ? value.activeTabId as string
        : globalTabs[0]!.id;
    const activeWorkspaceTabId = typeof value.activeWorkspaceTabId === 'string' && workspaceTabs.some((tab) => tab.id === value.activeWorkspaceTabId)
      ? value.activeWorkspaceTabId
      : workspaceTabs.some((tab) => tab.id === value.activeTabId) ? value.activeTabId as string
        : workspaceTabs[0]!.id;

    const recent = Array.isArray(value.recent) ? value.recent.filter((id): id is string => typeof id === 'string' && [...globalTabs, ...workspaceTabs].some(tab => tab.id === id)) : [];
    const closed = Array.isArray(value.closed) ? value.closed.filter((item): item is WorkspaceTab => !!item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' && validDestination((item as { destination?: unknown }).destination, isValidEntity)).slice(0, 20) : [];
    const tabs = buildTabs({ tabs: [], globalTabs, workspaceTabs });
    const suspendedWorkspaceTabs = Array.isArray(value.suspendedWorkspaceTabs) ? value.suspendedWorkspaceTabs.filter((item):item is WorkspaceTab => {
      if(!item || typeof item!=='object')return false;
      const tab=item as WorkspaceTab;
      if(typeof tab.id!=='string'||!tab.id||seenTabIds.has(tab.id)||!validDestination(tab.destination,isValidEntity)||!isWorkspaceDestination(tab.destination)||tab.destination.type==='launcher')return false;
      seenTabIds.add(tab.id);return true;
    }) : [];
    const result = {
      ...(value.workspaceCollapsed===true?{workspaceCollapsed:true}:{}),
      ...(suspendedWorkspaceTabs.length?{suspendedWorkspaceTabs}:{}),
      tabs,
      globalTabs,
      workspaceTabs,
      activeTabId: typeof value.activeTabId === 'string' && tabs.some((tab) => tab.id === value.activeTabId) ? value.activeTabId as string : activeWorkspaceTabId,
      activeGlobalTabId,
      activeWorkspaceTabId,
      recent,
      closed
    };
    if (Array.isArray(value.tabs) && !Array.isArray(value.globalTabs) && !Array.isArray(value.workspaceTabs)) {
      const { globalTabs: _globalTabs, workspaceTabs: _workspaceTabs, activeGlobalTabId: _activeGlobalTabId, activeWorkspaceTabId: _activeWorkspaceTabId, recent: _recent, closed: _closed, ...legacy } = result;
      return legacy;
    }
    return result;
  } catch {
    return createDefaultWorkspaceTabs();
  }
}

export function openWorkspaceTab(
  state: WorkspaceTabsState,
  destination: WorkspaceDestination,
  createId: () => string = () => crypto.randomUUID()
): WorkspaceTabsState {
  const target = isGlobalDestination(destination) ? 'global' : 'workspace';
  const collection = target === 'global' ? getGlobalTabs(state) : getWorkspaceTabs(state);
  const existing = destination.type === 'launcher' ? undefined : collection.find((tab) => destinationKey(tab.destination) === destinationKey(destination));
  if (existing) return selectWorkspaceTab(state, existing.id);
  const tab = { id: createId(), destination };
  const nextState = target === 'global'
    ? { ...state, globalTabs: [...getGlobalTabs(state), tab], activeGlobalTabId: tab.id, activeTabId: tab.id }
    : { ...state, workspaceTabs: [...getWorkspaceTabs(state), tab], activeWorkspaceTabId: tab.id, activeTabId: tab.id };
  return preserveLegacyShape(state, { ...nextState, tabs: buildTabs(nextState) });
}

export function newGlobalTab(state: WorkspaceTabsState, createId: () => string = () => crypto.randomUUID()): WorkspaceTabsState {
  const tab: WorkspaceTab = { id: createId(), destination: { type: 'view', view: 'home' } };
  const next = { ...state, globalTabs: [...getGlobalTabs(state), tab], workspaceTabs: getWorkspaceTabs(state), activeGlobalTabId: tab.id, activeTabId: tab.id };
  return preserveLegacyShape(state, { ...next, tabs: buildTabs(next) });
}

export function navigateGlobalTab(state: WorkspaceTabsState, destination: WorkspaceDestination): WorkspaceTabsState {
  if (!isGlobalDestination(destination)) return state;
  const globalTabs = getGlobalTabs(state);
  const id = state.activeGlobalTabId ?? globalTabs.find(tab => tab.id === state.activeTabId)?.id ?? globalTabs[0]?.id;
  if (!id) return state;
  const next = { ...state, globalTabs: globalTabs.map(tab => tab.id === id ? { ...tab, destination } : tab), workspaceTabs: getWorkspaceTabs(state), activeGlobalTabId: id, activeTabId: id };
  return preserveLegacyShape(state, { ...next, tabs: buildTabs(next) });
}

export function selectWorkspaceTab(state: WorkspaceTabsState, id: string): WorkspaceTabsState {
  const globalTabs = getGlobalTabs(state);
  const workspaceTabs = getWorkspaceTabs(state);
  const globalIndex = globalTabs.findIndex(tab => tab.id === id);
  const workspaceIndex = workspaceTabs.findIndex(tab => tab.id === id);
  if (globalIndex < 0 && workspaceIndex < 0) return state;
  const activeGlobalTabId = globalIndex >= 0 ? id : state.activeGlobalTabId;
  const activeWorkspaceTabId = workspaceIndex >= 0 ? id : state.activeWorkspaceTabId;
  const nextState = {
    ...state,
    globalTabs,
    workspaceTabs,
    activeTabId: id,
    activeGlobalTabId,
    activeWorkspaceTabId,
    recent: [id, ...(state.recent ?? []).filter(item => item !== id)].slice(0, 100)
  };
  return preserveLegacyShape(state, { ...nextState, tabs: buildTabs(nextState) });
}

export function replaceWorkspaceTab(state: WorkspaceTabsState, id: string, destination: WorkspaceDestination): WorkspaceTabsState {
  const target = isGlobalDestination(destination) ? 'global' : 'workspace';
  const collection = target === 'global' ? getGlobalTabs(state) : getWorkspaceTabs(state);
  const existing = collection.find(tab => tab.id !== id && destinationKey(tab.destination) === destinationKey(destination));
  if (existing) {
    const nextState = target === 'global'
      ? { ...state, globalTabs: getGlobalTabs(state).filter(tab => tab.id !== id) }
      : { ...state, workspaceTabs: getWorkspaceTabs(state).filter(tab => tab.id !== id) };
    return selectWorkspaceTab(nextState, existing.id);
  }
  const nextState = target === 'global'
    ? { ...state, globalTabs: getGlobalTabs(state).map(tab => tab.id === id ? { ...tab, destination } : tab) }
    : { ...state, workspaceTabs: getWorkspaceTabs(state).map(tab => tab.id === id ? { ...tab, destination } : tab) };
  return selectWorkspaceTab(nextState, id);
}

export function closeWorkspaceTab(state: WorkspaceTabsState, tabId: string): WorkspaceTabsState {
  const group = findTabGroup(state, tabId);
  if (!group) return state;

  const collection = group === 'global' ? getGlobalTabs(state) : getWorkspaceTabs(state);
  const index = collection.findIndex(tab => tab.id === tabId);
  if (index < 0) return state;

  const closedTab = collection[index]!;
  const remaining = collection.filter(tab => tab.id !== tabId);
  const fallback = group === 'global' ? { id: crypto.randomUUID(), destination: { type: 'view', view: 'home' } as const } : { id: crypto.randomUUID(), destination: { type: 'launcher' } as const };
  const nextCollection = remaining.length ? remaining : [fallback];
  const nextState = group === 'global'
    ? {
        ...state,
        globalTabs: nextCollection,
        activeGlobalTabId: state.activeGlobalTabId === tabId ? (nextCollection[Math.min(index, nextCollection.length - 1)]?.id ?? nextCollection[0]!.id) : state.activeGlobalTabId,
        activeTabId: state.activeTabId === tabId ? (nextCollection[Math.min(index, nextCollection.length - 1)]?.id ?? nextCollection[0]!.id) : state.activeTabId
      }
    : {
        ...state,
        workspaceTabs: nextCollection,
        activeWorkspaceTabId: state.activeWorkspaceTabId === tabId ? (nextCollection[Math.min(index, nextCollection.length - 1)]?.id ?? nextCollection[0]!.id) : state.activeWorkspaceTabId,
        activeTabId: state.activeTabId === tabId ? (nextCollection[Math.min(index, nextCollection.length - 1)]?.id ?? nextCollection[0]!.id) : state.activeTabId
      };

  const recent = (state.recent ?? []).filter(id => id !== tabId && [...(nextState.globalTabs ?? []), ...(nextState.workspaceTabs ?? [])].some(tab => tab.id === id));
  const result = { ...nextState, tabs: buildTabs(nextState), recent, closed: [closedTab, ...(state.closed ?? []).filter(tab => tab.id !== tabId)].slice(0, 20) };
  if (group === 'global') return preserveLegacyShape(state, { ...result, activeGlobalTabId: result.activeGlobalTabId ?? result.globalTabs?.[0]?.id ?? fallback.id });
  return preserveLegacyShape(state, { ...result, activeWorkspaceTabId: result.activeWorkspaceTabId ?? result.workspaceTabs?.[0]?.id ?? fallback.id });
}

export function reopenWorkspaceTab(state: WorkspaceTabsState): WorkspaceTabsState {
  const [tab, ...closed] = state.closed ?? [];
  if (!tab) return state;
  const target = isGlobalDestination(tab.destination) ? 'global' : 'workspace';
  const collection = target === 'global' ? getGlobalTabs(state) : getWorkspaceTabs(state);
  const existing = collection.find(item => destinationKey(item.destination) === destinationKey(tab.destination));
  const nextState = target === 'global'
    ? { ...state, closed, globalTabs: existing ? getGlobalTabs(state) : [...getGlobalTabs(state), tab], activeGlobalTabId: existing?.id ?? tab.id, activeTabId: existing?.id ?? tab.id }
    : { ...state, closed, workspaceTabs: existing ? getWorkspaceTabs(state) : [...getWorkspaceTabs(state), tab], activeWorkspaceTabId: existing?.id ?? tab.id, activeTabId: existing?.id ?? tab.id };
  return preserveLegacyShape(state, { ...nextState, tabs: buildTabs(nextState) });
}

export function reorderWorkspaceTab(state: WorkspaceTabsState, tabId: string, targetId: string): WorkspaceTabsState {
  const group = findTabGroup(state, tabId);
  const targetGroup = findTabGroup(state, targetId);
  if (!group || !targetGroup || group !== targetGroup) return state;
  const collection = group === 'global' ? getGlobalTabs(state) : getWorkspaceTabs(state);
  const from = collection.findIndex((tab) => tab.id === tabId);
  const to = collection.findIndex((tab) => tab.id === targetId);
  if (from < 0 || to < 0 || from === to) return state;
  const nextCollection = [...collection];
  const [tab] = nextCollection.splice(from, 1);
  if (!tab) return state;
  nextCollection.splice(to, 0, tab);
  const nextState = group === 'global'
    ? { ...state, globalTabs: nextCollection }
    : { ...state, workspaceTabs: nextCollection };
  return preserveLegacyShape(state, { ...nextState, tabs: buildTabs(nextState) });
}

/** Hides tool tabs without closing their sessions or altering global destinations. */
export function collapseWorkspaceTools(state:WorkspaceTabsState):WorkspaceTabsState {
 const globalTabs=getGlobalTabs(state), visible=getWorkspaceTabs(state);
 const launcher=visible.find(t=>t.destination.type==='launcher')??{id:crypto.randomUUID(),destination:{type:'launcher'} as WorkspaceDestination};
 const retained=[...(state.suspendedWorkspaceTabs??[]),...visible.filter(t=>t.destination.type!=='launcher')];
 const suspendedWorkspaceTabs=retained.filter((t,i)=>retained.findIndex(x=>x.id===t.id)===i);
 const activeGlobalTabId=state.activeGlobalTabId??globalTabs[0]?.id??launcher.id;
 return {...state,globalTabs,workspaceTabs:[launcher],tabs:[...globalTabs,launcher],activeGlobalTabId,activeWorkspaceTabId:launcher.id,activeTabId:activeGlobalTabId,workspaceCollapsed:true,suspendedWorkspaceTabs};
}
export function reopenWorkspaceTools(state:WorkspaceTabsState):WorkspaceTabsState {
 const launcher=getWorkspaceTabs(state).find(t=>t.destination.type==='launcher');
 return {...(launcher?selectWorkspaceTab(state,launcher.id):openWorkspaceTab(state,{type:'launcher'})),workspaceCollapsed:false};
}
export function resumeWorkspaceTool(state:WorkspaceTabsState,id:string):WorkspaceTabsState {
 const tab=state.suspendedWorkspaceTabs?.find(t=>t.id===id);if(!tab)return state;
 const globalTabs=getGlobalTabs(state),workspaceTabs=[...getWorkspaceTabs(state).filter(t=>t.destination.type!=='launcher'),tab];
 return {...state,globalTabs,workspaceTabs,tabs:[...globalTabs,...workspaceTabs],activeTabId:tab.id,activeWorkspaceTabId:tab.id,workspaceCollapsed:false,suspendedWorkspaceTabs:state.suspendedWorkspaceTabs?.filter(t=>t.id!==id)};
}
