import { describe, expect, it } from 'vitest';
import { WORKSPACE_NAVIGATION_ITEMS } from '../src/renderer/navigationTypes.js';
import {
  closeWorkspaceTab,
  createDefaultWorkspaceTabs,
  destinationKey,
  openWorkspaceTab,
  reorderWorkspaceTab,
  restoreWorkspaceTabs,
  workspaceTabLabel
} from '../src/renderer/workspaceTabs.js';

describe('workspace tabs', () => {
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
    expect(duplicate.tabs).toHaveLength(2);
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
    expect(restored.tabs).toEqual([{ id: 'resource-tab', destination: { type: 'task', taskId: 'task-1' } }]);
    expect(destinationKey(restored.tabs[0]!.destination)).toBe('task:task-1');
  });

  it('activates a neighbor when the active tab closes and provides a home tab when all close', () => {
    const tabs = createDefaultWorkspaceTabs();
    const next = openWorkspaceTab(tabs, { type: 'view', view: 'dashboard' }, () => 'dashboard-tab');
    const closed = closeWorkspaceTab(next, 'dashboard-tab');
    expect(closed.activeTabId).toBe(tabs.activeTabId);
    expect(closeWorkspaceTab(closed, tabs.activeTabId).tabs[0]?.destination).toEqual({ type: 'view', view: 'home' });
  });

  it('reorders tabs without changing resource identity', () => {
    const first = createDefaultWorkspaceTabs();
    const second = openWorkspaceTab(first, { type: 'view', view: 'dashboard' }, () => 'dashboard-tab');
    expect(reorderWorkspaceTab(second, first.activeTabId, 'dashboard-tab').tabs.map((tab) => tab.id))
      .toEqual(['dashboard-tab', first.activeTabId]);
  });

  it('keeps project and conversation destinations distinct from the Home view', () => {
    const home = createDefaultWorkspaceTabs();
    const project = openWorkspaceTab(home, { type: 'project', projectId: 'project-1' }, () => 'project-tab');
    const conversation = openWorkspaceTab(project, { type: 'conversation', projectId: 'project-1', conversationId: 'thread-1' }, () => 'conversation-tab');
    expect(conversation.tabs.map((tab) => tab.id)).toEqual([home.activeTabId, 'project-tab', 'conversation-tab']);
    expect(destinationKey(conversation.tabs[2]!.destination)).toBe('conversation:project-1:thread-1');
  });
});
