import { describe, expect, it } from 'vitest';
import { WORKSPACE_NAVIGATION_ITEMS } from '../src/renderer/navigationTypes.js';
import {
  closeWorkspaceTab,
  createDefaultWorkspaceTabs,
  destinationKey,
  navigateGlobalTab,
  newGlobalTab,
  openWorkspaceTab,
  reorderWorkspaceTab,
  restoreWorkspaceTabs,
  selectWorkspaceTab,
  replaceWorkspaceTab,
  reopenWorkspaceTab,
  workspaceTabLabel
} from '../src/renderer/workspaceTabs.js';

describe('workspace tabs', () => {
  it('navigates only the active global tab and creates neutral tabs explicitly', () => {
    const initial = createDefaultWorkspaceTabs();
    const firstId = initial.activeGlobalTabId!;
    let state = navigateGlobalTab(initial, { type: 'view', view: 'library' });
    expect(state.globalTabs).toHaveLength(1);
    state = newGlobalTab(state, () => 'second');
    expect(state.globalTabs?.map(tab => tab.destination)).toEqual([{type:'view',view:'library'}, {type:'view',view:'home'}]);
    state = navigateGlobalTab(state, { type: 'view', view: 'library' });
    expect(state.globalTabs).toHaveLength(2);
    expect(state.globalTabs?.every(tab => tab.destination.type === 'view' && tab.destination.view === 'library')).toBe(true);
    state = navigateGlobalTab(selectWorkspaceTab(state, firstId), { type: 'view', view: 'dashboard' });
    expect(state.globalTabs?.[1]?.destination).toEqual({type:'view',view:'library'});
    expect(restoreWorkspaceTabs(JSON.stringify(state), () => true).globalTabs).toEqual(state.globalTabs);
  });
  it('uses the shared navigation registry for routable tab labels', () => {
    const views = WORKSPACE_NAVIGATION_ITEMS.map((item) => item.view);
    expect(new Set(views).size).toBe(views.length);
    for (const item of WORKSPACE_NAVIGATION_ITEMS) {
      expect(workspaceTabLabel({ type: 'view', view: item.view }, () => undefined)).toBe(item.label);
    }
    expect(restoreWorkspaceTabs(JSON.stringify({
      tabs: [{ id: 'chat-tab', destination: { type: 'view', view: 'chat' } }],
      activeTabId: 'chat-tab'
    }), () => true).tabs[0]?.destination).toEqual({ type: 'view', view: 'home' });
  });

  it('opens a destination once and switches to its existing tab', () => {
    const first = createDefaultWorkspaceTabs();
    const dashboard = openWorkspaceTab(first, { type: 'view', view: 'dashboard' }, () => 'dashboard-tab');
    const duplicate = openWorkspaceTab(dashboard, { type: 'view', view: 'dashboard' }, () => 'unused');
    expect(duplicate.globalTabs).toHaveLength(2);
    expect(duplicate.workspaceTabs).toHaveLength(1);
    expect(duplicate.activeGlobalTabId).toBe('dashboard-tab');
    expect(duplicate.activeTabId).toBe('dashboard-tab');
  });

  it('keeps tab ids separate from resource ids and restores only valid destinations', () => {
    const serialized = JSON.stringify({
      tabs: [
        { id: 'resource-tab', destination: { type: 'task', taskId: 'task-1' } },
        { id: 'stale-tab', destination: { type: 'task', taskId: 'deleted' } }
      ],
      activeTabId: 'resource-tab'
    });
    const restored = restoreWorkspaceTabs(serialized, (destination) => destination.type === 'task' && destination.taskId === 'task-1');
    const restoredTask = restored.tabs.find(tab => tab.id === 'resource-tab');
    expect(restoredTask?.destination).toEqual({ type: 'task', taskId: 'task-1' });
    expect(restored.tabs.some(tab => tab.destination.type === 'launcher')).toBe(true);
    expect(destinationKey(restoredTask!.destination)).toBe('task:task-1');
  });

  it('activates a neighbor when the active tab closes and provides a launcher when all close', () => {
    const tabs = createDefaultWorkspaceTabs();
    const next = openWorkspaceTab(tabs, { type: 'view', view: 'dashboard' }, () => 'dashboard-tab');
    const closed = closeWorkspaceTab(next, 'dashboard-tab');
    expect(closed.activeGlobalTabId).toBe(tabs.activeGlobalTabId);
    expect(closed.activeWorkspaceTabId).toBe(tabs.activeWorkspaceTabId);
    expect(closeWorkspaceTab(closed, tabs.activeWorkspaceTabId!).workspaceTabs?.[0]?.destination).toEqual({ type: 'launcher' });
  });

  it('creates independent launchers and transforms one without leaving it behind', () => {
    const home = createDefaultWorkspaceTabs();
    const one = openWorkspaceTab(home, { type: 'launcher' }, () => 'one');
    const two = openWorkspaceTab(one, { type: 'launcher' }, () => 'two');
    const files = replaceWorkspaceTab(two, 'two', { type: 'files' });
    expect(files.workspaceTabs?.map(tab => tab.id)).toEqual([home.activeWorkspaceTabId, 'one', 'two']);
    expect(files.workspaceTabs?.[2]?.destination.type).toBe('files');
    expect(replaceWorkspaceTab(files, 'one', { type: 'files' }).workspaceTabs).toHaveLength(2);
  });

  it('replaces the active workspace launcher with Work Sessions without changing the global tab', () => {
    const home = createDefaultWorkspaceTabs();
    const inbox = openWorkspaceTab(home, { type: 'view', view: 'inbox' }, () => 'inbox');
    const launcherId = inbox.activeWorkspaceTabId!;
    const selectedLauncher = selectWorkspaceTab(inbox, launcherId);
    const sessions = replaceWorkspaceTab(selectedLauncher, launcherId, { type: 'work-sessions' });

    expect(sessions.activeGlobalTabId).toBe('inbox');
    expect(sessions.globalTabs?.find(tab => tab.id === 'inbox')?.destination).toEqual({ type: 'view', view: 'inbox' });
    expect(sessions.workspaceTabs?.map(tab => tab.id)).toEqual([launcherId]);
    expect(sessions.workspaceTabs?.[0]?.destination).toEqual({ type: 'work-sessions' });
    expect(workspaceTabLabel({ type: 'work-sessions' }, () => undefined)).toBe('Work Sessions');
  });

  it('reuses an existing Work Sessions tab when replacing another launcher', () => {
    const home = createDefaultWorkspaceTabs();
    const sessions = replaceWorkspaceTab(home, home.activeWorkspaceTabId!, { type: 'work-sessions' });
    const launcher = openWorkspaceTab(sessions, { type: 'launcher' }, () => 'new-launcher');
    const reused = replaceWorkspaceTab(launcher, launcher.activeWorkspaceTabId!, { type: 'work-sessions' });

    expect(reused.workspaceTabs).toHaveLength(1);
    expect(reused.workspaceTabs?.[0]?.id).toBe(sessions.activeWorkspaceTabId);
    expect(reused.activeWorkspaceTabId).toBe(sessions.activeWorkspaceTabId);
  });

  it('keeps each terminal session in its own Workspace tab and restores its label', () => {
    const firstId = '00000000-0000-4000-8000-000000000001';
    const secondId = '00000000-0000-4000-8000-000000000002';
    const initial = createDefaultWorkspaceTabs();
    const first = openWorkspaceTab(initial, { type: 'terminal', sessionId: firstId, label: 'Terminal' }, () => 'terminal-one');
    const second = openWorkspaceTab(first, { type: 'terminal', sessionId: secondId, label: 'Terminal 2' }, () => 'terminal-two');
    const reused = openWorkspaceTab(second, { type: 'terminal', sessionId: firstId, label: 'Terminal' }, () => 'unused');
    const restored = restoreWorkspaceTabs(JSON.stringify(second), () => true);

    expect(second.workspaceTabs?.filter(tab => tab.destination.type === 'terminal')).toHaveLength(2);
    expect(reused.activeWorkspaceTabId).toBe('terminal-one');
    expect(restored.workspaceTabs?.find(tab => tab.id === 'terminal-two')?.destination)
      .toEqual({ type: 'terminal', sessionId: secondId, label: 'Terminal 2' });
    expect(workspaceTabLabel({ type: 'terminal', sessionId: secondId, label: 'Terminal 2' }, () => undefined)).toBe('Terminal 2');
  });

  it('rejects invalid persisted terminal session identifiers', () => {
    const restored = restoreWorkspaceTabs(JSON.stringify({
      tabs: [{ id: 'terminal-invalid', destination: { type: 'terminal', sessionId: '../../shell' } }],
      activeTabId: 'terminal-invalid'
    }), () => true);

    expect(restored.workspaceTabs?.some(tab => tab.id === 'terminal-invalid')).toBe(false);
    expect(restored.workspaceTabs?.[0]?.destination.type).toBe('launcher');
  });

  it('restores recently closed tabs and selects the most recently active survivor', () => {
    const home = createDefaultWorkspaceTabs();
    const a = openWorkspaceTab(home, { type: 'files' }, () => 'files');
    const b = openWorkspaceTab(a, { type: 'terminal' }, () => 'terminal');
    const visited = selectWorkspaceTab(selectWorkspaceTab(b, home.activeTabId), 'terminal');
    const closed = closeWorkspaceTab(visited, 'terminal');
    expect(closed.activeWorkspaceTabId).toBe('files');
    const restored = restoreWorkspaceTabs(JSON.stringify(closed), () => true);
    const reopened = reopenWorkspaceTab(restored);
    expect(reopened.activeWorkspaceTabId).toBe('terminal');
    expect(reopened.workspaceTabs?.find(tab => tab.id === 'terminal')?.destination.type).toBe('terminal');
  });

  it('restores safe file descriptors without granting filesystem access', () => {
    const file = { type: 'file' as const, rootName: 'Workspace', rootFingerprint: 'a'.repeat(64), path: 'src/notes.txt', name: 'notes.txt' };
    const first = openWorkspaceTab(createDefaultWorkspaceTabs(), file, () => 'document');
    expect(restoreWorkspaceTabs(JSON.stringify(first), () => true).tabs.find(tab => tab.id === 'document')?.destination).toEqual(file);
    const otherRoot = openWorkspaceTab(first, { ...file, rootFingerprint: 'b'.repeat(64) }, () => 'other-document');
    expect(otherRoot.tabs.filter(tab => tab.destination.type === 'file')).toHaveLength(2);
    const unsafe = { tabs: [{ id: 'unsafe', destination: { ...file, path: '../secret' } }], activeTabId: 'unsafe' };
    expect(restoreWorkspaceTabs(JSON.stringify(unsafe), () => true).tabs[0]?.destination.type).toBe('view');
  });

  it('rejects duplicate tab IDs during restoration', () => {
    const serialized = JSON.stringify({ tabs: [{id:'same',destination:{type:'launcher'}},{id:'same',destination:{type:'launcher'}}], activeTabId:'same' });
    expect(restoreWorkspaceTabs(serialized, () => true).tabs.filter(tab => tab.destination.type === 'launcher')).toEqual([{ id: 'same', destination: { type: 'launcher' } }]);
  });

  it('reorders tabs without changing resource identity', () => {
    const first = createDefaultWorkspaceTabs();
    const second = openWorkspaceTab(first, { type: 'view', view: 'dashboard' }, () => 'dashboard-tab');
    expect(reorderWorkspaceTab(second, first.activeGlobalTabId!, 'dashboard-tab').globalTabs?.map((tab) => tab.id))
      .toEqual(['dashboard-tab', first.activeGlobalTabId]);
  });

  it('keeps project and conversation destinations distinct from the Home view', () => {
    const home = createDefaultWorkspaceTabs();
    const project = openWorkspaceTab(home, { type: 'project', projectId: 'project-1' }, () => 'project-tab');
    const conversation = openWorkspaceTab(project, { type: 'conversation', projectId: 'project-1', conversationId: 'thread-1' }, () => 'conversation-tab');
    expect(conversation.globalTabs?.map((tab) => tab.id)).toEqual([home.activeGlobalTabId, 'project-tab', 'conversation-tab']);
    expect(destinationKey(conversation.globalTabs![2]!.destination)).toBe('conversation:project-1:thread-1');
  });
});
