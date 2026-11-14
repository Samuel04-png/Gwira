import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f1Scenarios = [
  { name: 'connected', fixture: 'connected' },
  { name: 'disconnected', fixture: 'disconnected' },
  { name: 'empty', fixture: 'empty' },
  { name: 'selected-human', fixture: 'connected', selectId: 'humanWork:review' },
  { name: 'selected-doat', fixture: 'connected', selectId: 'doatWork:content' },
  { name: 'approval-waiting', fixture: 'approval-waiting', selectId: 'approval:campaign-approval' }
];
const f2Scenarios = [
  { name: 'team-expanded', scenario: 'marketing', view: 'workflow', tab: 'team', tabSequence: 'activity,team', keyboard: true },
  { name: 'activity-expanded', scenario: 'marketing', view: 'workflow', tab: 'activity' },
  { name: 'panel-collapsed', scenario: 'marketing', view: 'workflow', selectId: 'humanWork:review', panel: 'collapsed' },
  { name: 'selected-node', scenario: 'marketing', view: 'workflow', selectId: 'humanWork:review' },
  { name: 'dashboard-calendar-enabled', scenario: 'marketing', view: 'calendar', dashboardView: 'calendar' },
  { name: 'dashboard-board-enabled', scenario: 'marketing', view: 'board', dashboardView: 'board' },
  { name: 'empty-workspace', view: 'workflow', emptyWorkspace: true }
];
const f3Scenarios = [
  { name: 'multiple-global-tabs', f3: 'multiple-tabs' },
  { name: 'task-destination-tab', f3: 'task-tab' },
  { name: 'dashboard-team-context', f3: 'team' },
  { name: 'dashboard-activity-context', f3: 'activity' },
  { name: 'selected-work-inspector', f3: 'selected-work' },
  { name: 'inspector-collapsed', f3: 'collapsed' },
  { name: 'new-tab-picker', f3: 'picker' },
  { name: 'empty-workspace-state', f3: 'empty', seed: false },
  { name: 'create-work-record', f3: 'create-work' },
  { name: 'edit-save-work', f3: 'edit-save' },
  { name: 'unsaved-tab-switch', f3: 'unsaved-switch' },
  { name: 'relationship-inspector', f3: 'relationship' },
  { name: 'work-sessions-narrow', f3: 'workspace-sessions', workspaceWidth: 260, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'work-sessions-default', f3: 'workspace-sessions', workspaceWidth: 340, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'work-sessions-medium', f3: 'workspace-sessions', workspaceWidth: 480, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'work-sessions-wide', f3: 'workspace-sessions', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'work-sessions-empty', f3: 'workspace-sessions', workspaceWidth: 260, sessionState: 'empty', seed: false, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'work-sessions-selected', f3: 'workspace-sessions', workspaceWidth: 650, sessionState: 'selected', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'workspace-topbar-open', f3: 'workspace-topbar-open', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'workspace-topbar-collapsed', f3: 'workspace-topbar-collapsed', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'workspace-topbar-reopened', f3: 'workspace-topbar-reopened', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'workspace-topbar-maximized', f3: 'workspace-topbar-collapsed', maximized: true, sizes: [{ width: 1280, height: 800, label: 'maximized' }] },
  { name: 'terminal-idle-narrow', f3: 'terminal-idle', workspaceWidth: 260, sizes: [{ width: 900, height: 700, label: '900x700' }, { width: 780, height: 640, label: '780x640' }] },
  { name: 'terminal-idle-default', f3: 'terminal-idle', workspaceWidth: 340, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'terminal-idle-wide', f3: 'terminal-idle', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-default', f3: 'files-tree', filesRoot: 'sample', globalDestination: 'Dashboard', workspaceWidth: 340, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'files-compare-wide', f3: 'files-text', filesRoot: 'sample', globalDestination: 'Dashboard', workspaceWidth: 340, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-wide', f3: 'files-tree', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-compact', f3: 'files-tree', filesRoot: 'sample', workspaceWidth: 260, sizes: [{ width: 900, height: 700, label: '900x700' }, { width: 780, height: 640, label: '780x640' }] },
  { name: 'files-narrow-selected', f3: 'files-narrow-selected', filesRoot: 'sample', workspaceWidth: 340, sizes: [{ width: 780, height: 640, label: '780x640' }] },
  { name: 'files-nested', f3: 'files-nested', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-markdown-preview', f3: 'files-markdown-preview', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-markdown-source', f3: 'files-markdown-source', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-split-resized', f3: 'files-split-resized', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-split-compact', f3: 'files-text', filesRoot: 'sample', workspaceWidth: 480, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'files-code', f3: 'files-code', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-image', f3: 'files-image', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-text', f3: 'files-text', filesRoot: 'sample', workspaceWidth: 480, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'files-pdf', f3: 'files-pdf', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-unsupported', f3: 'files-unsupported', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-search', f3: 'files-search', filesRoot: 'sample', workspaceWidth: 340, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'files-empty', f3: 'files-empty', filesRoot: 'empty', workspaceWidth: 340, seed: false, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'files-overflow', f3: 'files-overflow', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-focus', f3: 'files-focus', filesRoot: 'sample', workspaceWidth: 340, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'files-hover', f3: 'files-hover', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'files-state', f3: 'files-state', filesRoot: 'sample', workspaceWidth: 650, sizes: [{ width: 1440, height: 900, label: '1440x900' }] }
];
const shellScenarios = [
  { name: 'shell-navigation-sessions', f3: 'navigation-sessions' },
  { name: 'shell-dashboard-team', f3: 'team' },
  { name: 'shell-dashboard-selected-node', f3: 'selected-work' },
  { name: 'shell-inbox', f3: 'nav-inbox' },
  { name: 'shell-my-work', f3: 'nav-my-work' },
  { name: 'shell-library', f3: 'nav-library' },
  { name: 'shell-task-inspector', f3: 'task-inspector' },
  { name: 'shell-sidebar-collapsed', f3: 'sidebar-collapsed' },
  { name: 'shell-multiple-tabs', f3: 'multiple-tabs' },
  { name: 'shell-new-tab-picker', f3: 'picker' },
  { name: 'shell-notifications', f3: 'notifications' },
  { name: 'shell-more-menu', f3: 'more-menu' },
  { name: 'shell-home', f3: 'home' },
  { name: 'shell-home-expanded', f3: 'home-expanded' },
  { name: 'shell-home-collapsed', f3: 'home-collapsed' },
  { name: 'shell-tab-home', f3: 'tab-home' },
  { name: 'shell-tab-dashboard', f3: 'tab-dashboard' },
  { name: 'shell-narrow', f3: 'team', sizes: [{ width: 900, height: 700, label: '900x700' }, { width: 780, height: 640, label: '780x640' }] }
];
const timelineScenarios = [
  { name: 'timeline-default', fixture: 'timeline', view: 'timeline', expect: { bars: true } },
  { name: 'timeline-week', fixture: 'timeline', view: 'timeline', actions: 'zoom:Week', expect: { zoom: 'week' } },
  { name: 'timeline-day', fixture: 'timeline', view: 'timeline', actions: 'zoom:Day', expect: { zoom: 'day' } },
  { name: 'timeline-month', fixture: 'timeline', view: 'timeline', actions: 'zoom:Month', expect: { zoom: 'month' } },
  { name: 'timeline-selected', fixture: 'timeline', view: 'timeline', actions: 'select:tl-approve', expect: { selected: true } },
  { name: 'timeline-collapsed-group', fixture: 'timeline', view: 'timeline', actions: 'collapse:0', expect: {} },
  { name: 'timeline-empty-workspace', view: 'timeline', emptyWorkspace: true, expect: { empty: true } },
  { name: 'timeline-workflow-unaffected', fixture: 'connected', view: 'workflow', expect: {} },
  { name: 'timeline-narrow', fixture: 'timeline', view: 'timeline', expect: { noOverflow: true }, sizes: [{ width: 900, height: 700, label: '900x700' }, { width: 780, height: 640, label: '780x640' }] },
  { name: 'timeline-resize-column', fixture: 'timeline', view: 'timeline', actions: 'resize:-100;resizekey:ArrowRight', expect: { resized: true } },
  { name: 'timeline-return-to-tasks', fixture: 'timeline', view: 'timeline', actions: 'scrollaway;back', expect: { returnFlow: true } },
  { name: 'timeline-keyboard-zoom', fixture: 'timeline', view: 'timeline', actions: 'key:+', expect: { zoom: 'day' } },
  { name: 'timeline-owner-groups', fixture: 'timeline', view: 'timeline', actions: 'group:owner', expect: { owners: true } },
  { name: 'timeline-dependencies', fixture: 'timeline', view: 'timeline', actions: 'group:none;zoom:Week', expect: { links: true } },
  { name: 'timeline-dependency-selected', fixture: 'timeline', view: 'timeline', actions: 'group:none;link:tl-research->tl-review', expect: { linkSelected: 'tl-research->tl-review' } },
  { name: 'timeline-dependency-keyboard', fixture: 'timeline', view: 'timeline', actions: 'group:none;linkkey:tl-review->tl-content', expect: { linkKeyboard: true } },
  { name: 'timeline-dependency-navigate', fixture: 'timeline', view: 'timeline', actions: 'group:none;link:tl-research->tl-review;linkaction:Select predecessor', expect: { linkNavigate: 'tl-research' } },
  { name: 'timeline-dependency-close', fixture: 'timeline', view: 'timeline', actions: 'group:none;link:tl-research->tl-review;linkaction:Close', expect: { linkClosed: true } },
  { name: 'timeline-task-links', fixture: 'timeline', view: 'timeline', actions: 'group:none;select:tl-review', expect: { related: true } },
  { name: 'timeline-dependencies-narrow', fixture: 'timeline', view: 'timeline', actions: 'group:none;link:tl-research->tl-review', expect: { links: true, noOverflow: true }, sizes: [{ width: 900, height: 700, label: '900x700' }, { width: 780, height: 640, label: '780x640' }] },
  { name: 'timeline-large-render', fixture: 'timeline-large', view: 'timeline', actions: 'group:owner', expect: {} },
  { name: 'timeline-large-keyboard', fixture: 'timeline-large', view: 'timeline', actions: 'group:owner;rowkey:End', expect: { virtualEnd: true } },
  { name: 'timeline-small-measure', fixture: 'timeline', view: 'timeline', actions: 'measure', expect: { baseline: true } },
  { name: 'timeline-large-measure', fixture: 'timeline-large', view: 'timeline', actions: 'group:owner;measure', expect: { measured: true } },
  { name: 'timeline-real-workspace', f3: 'team', view: 'timeline', expect: { real: true } },
  { name: 'timeline-inspector-collapse', fixture: 'timeline', view: 'timeline', actions: 'group:none;inspector', expect: { inspectorCollapse: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }, { width: 780, height: 640, label: '780x640' }] },
  { name: 'timeline-large-select-far', fixture: 'timeline-large', view: 'timeline', actions: 'group:owner;selectfar', expect: { selectFar: true } },
  { name: 'timeline-selector-fixture', f3: 'team', view: 'timeline', actions: 'selector:timeline', expect: { selectorFixture: true } },
  { name: 'timeline-filter-owner', fixture: 'timeline', view: 'timeline', actions: 'group:none;filter:Owner=Chipo Zulu', expect: { filterStrip: true }, sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'timeline-filter-clear', fixture: 'timeline', view: 'timeline', actions: 'group:none;filter:Owner=Chipo Zulu;filter:Status=working;removechip;clearfilters', expect: { filterCleared: true } },
  { name: 'timeline-hide-details', fixture: 'timeline', view: 'timeline', actions: 'group:none;select:tl-approve;hidedetails', expect: { hideDetails: true }, sizes: [{ width: 900, height: 700, label: '900x700' }] },
  { name: 'timeline-ordinary-window', fixture: 'timeline', view: 'timeline', actions: 'group:none', expect: { ordinary: true }, sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'timeline-tooltip', fixture: 'timeline', view: 'timeline', actions: 'hover:tl-content', expect: { tooltip: true } }
];
const listScenarios = [
  { name: 'list-default', fixture: 'timeline', view: 'list', expect: { tasks: true }, sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'list-grouped', fixture: 'timeline', view: 'list', actions: 'listgroup:status', expect: { groups: true } },
  { name: 'list-group-keyboard', fixture: 'timeline', view: 'list', actions: 'listgroup:status;listgrouparrows', expect: { groupKeyboard: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'list-filtered', fixture: 'timeline', view: 'list', actions: 'listfilter:Status=waiting', expect: { filtered: true } },
  { name: 'list-no-results', fixture: 'timeline', view: 'list', actions: 'listsearch:no matching task;listfilter:Status=waiting', expect: { noResults: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'list-sort', fixture: 'timeline', view: 'list', actions: 'listsort:dueDate', expect: { sortBy: 'dueDate' }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'list-row-heights', fixture: 'timeline', view: 'list', actions: 'listrowheights:44,48,52', expect: { rowHeights: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'list-selected', fixture: 'timeline', view: 'list', actions: 'listselect:tl-approve', expect: { selected: true } },
  { name: 'list-keyboard-selection', fixture: 'timeline', view: 'list', actions: 'listkeyselect:Enter', expect: { selected: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'list-empty', fixture: 'empty', view: 'list', emptyWorkspace: true, expect: { empty: true } },
  { name: 'list-narrow-inspector', fixture: 'timeline', view: 'list', actions: 'listselect:tl-approve', expect: { compact: true, inspectorOpen: true }, sizes: [{ width: 900, height: 700, label: '900x700' }] },
  { name: 'list-virtual-keyboard', fixture: 'timeline-large', view: 'list', actions: 'listkey:End', expect: { virtual: true } }
];
const calendarBoardScenarios = [
  { name: 'calendar-default', fixture: 'timeline', view: 'calendar', expect: { tasks: true }, sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'calendar-week', fixture: 'timeline', view: 'calendar', actions: 'calview:week', expect: { week: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-filtered', fixture: 'timeline', view: 'calendar', actions: 'calfilter:Status=waiting', expect: { filtered: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'calendar-filter-clear', fixture: 'timeline', view: 'calendar', actions: 'calfilter:Status=waiting;calclear', expect: { filterClear: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-filter-search-combined', fixture: 'timeline', view: 'calendar', actions: 'calfilter:Status=waiting;calsearch:Approve final campaign', expect: { combined: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-selected', fixture: 'timeline', view: 'calendar', actions: 'calselect:tl-content', expect: { selected: true, selectedTask: 'tl-content' }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-selection-recovery', fixture: 'timeline', view: 'calendar', actions: 'calselect:tl-content;calfilter:Status=waiting;calrecover', expect: { recovery: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-keyboard', fixture: 'timeline', view: 'calendar', actions: 'caldaykey:ArrowRight', expect: { keyboard: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-narrow-inspector', fixture: 'timeline', view: 'calendar', actions: 'calhidedetails', expect: { agenda: true, hideInspector: true }, sizes: [{ width: 900, height: 700, label: '900x700' }] },
  { name: 'calendar-empty', fixture: 'empty', view: 'calendar', expect: { empty: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-no-results', fixture: 'timeline', view: 'calendar', actions: 'calsearch:no matching task', expect: { noResults: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-inspector-collapsed', fixture: 'timeline', view: 'calendar', panel: 'collapsed', expect: { panelCollapsed: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'calendar-real-workspace', f3: 'team', view: 'calendar', panel: 'collapsed', expect: { real: true, panelCollapsed: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-default', fixture: 'timeline', view: 'board', expect: { columns: true, tasks: true }, sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'board-filtered', fixture: 'timeline', view: 'board', actions: 'boardfilter:Status=waiting', expect: { filtered: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'board-filter-clear', fixture: 'timeline', view: 'board', actions: 'boardfilter:Status=waiting;boardclear', expect: { filterClear: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-filter-search-combined', fixture: 'timeline', view: 'board', actions: 'boardfilter:Status=waiting;boardsearch:Approve final campaign', expect: { combined: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-selected', fixture: 'timeline', view: 'board', actions: 'boardselect:tl-approve', expect: { selected: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-selection-recovery', fixture: 'timeline', view: 'board', actions: 'boardselect:tl-content;boardfilter:Status=waiting;boardrecover', expect: { recovery: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-keyboard', fixture: 'timeline', view: 'board', actions: 'boardkey:ArrowRight', expect: { keyboard: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-collapsed-column', fixture: 'timeline', view: 'board', actions: 'boardcollapse:working', expect: { collapsed: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-empty', fixture: 'empty', view: 'board', expect: { empty: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-no-results', fixture: 'timeline', view: 'board', actions: 'boardsearch:no matching task', expect: { noResults: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-inspector-collapsed', fixture: 'timeline', view: 'board', panel: 'collapsed', expect: { panelCollapsed: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'board-real-workspace', f3: 'team', view: 'board', expect: { real: true }, sizes: [{ width: 1280, height: 800, label: '1280x800' }] }
];
const inboxScenarios = [
  { name: 'empty-first-run', inbox: 'empty', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'activity-feed', inbox: 'activity', sizes: [{ width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'local-conversation', inbox: 'conversation', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'threads-page', inbox: 'threads', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'unread-page', inbox: 'unread', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'mentions-page', inbox: 'mentions', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'needs-review-page', inbox: 'needs-review', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'needs-review-empty', inbox: 'review-empty', sizes: [{ width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'drafts-page', inbox: 'drafts', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'saved-page', inbox: 'saved', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'create-dialog', inbox: 'dialog', sizes: [{ width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'functional-interactions', inbox: 'functional', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'thread-open', inbox: 'thread', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'context-panel', inbox: 'context', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'narrow-drawer', inbox: 'drawer', sizes: [{ width: 900, height: 700, label: '900x700' }] },
  { name: 'narrow-zoom-200', inbox: 'drawer', zoomFactor: 2, sizes: [{ width: 900, height: 700, label: '900x700-200pct' }] },
  { name: 'xss-text', inbox: 'xss', sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'failed-send-retry', inbox: 'failed-retry', sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'populated-conversation', inbox: 'showcase', sizes: [{ width: 1440, height: 900, label: '1440x900' }, { width: 1280, height: 800, label: '1280x800' }, { width: 900, height: 700, label: '900x700' }] },
  { name: 'channel-conversation', inbox: 'channel', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'group-conversation', inbox: 'group', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'search-source', inbox: 'search', sizes: [{ width: 1440, height: 900, label: '1440x900' }] },
  { name: 'multiline-composer', inbox: 'multiline', sizes: [{ width: 1280, height: 800, label: '1280x800' }] },
  { name: 'linked-failure-zoom', inbox: 'stress', zoomFactor: 2, sizes: [{ width: 900, height: 700, label: '900x700-200pct' }] },
  { name: 'long-navigation', inbox: 'overflow', sizes: [{ width: 1440, height: 900, label: '1440x900' }] }
];
const measurements = [];
const f2Mode = process.argv.includes('--suite=f2') || process.env.ELECTRON_DASHBOARD_CAPTURE_F2 === '1';
const filesMode = process.argv.includes('--suite=files') || process.env.ELECTRON_FILES_CAPTURE === '1';
const f3Mode = filesMode || process.argv.includes('--suite=f3') || process.argv.includes('--suite=shell') || process.env.ELECTRON_WORKSPACE_CAPTURE_F3 === '1';
const shellMode = process.argv.includes('--suite=shell');
const timelineMode = process.argv.includes('--suite=timeline');
const listMode = process.argv.includes('--suite=list');
const boardOnlyMode = process.argv.includes('--suite=board');
const calendarBoardMode = process.argv.includes('--suite=calendar-board') || boardOnlyMode;
const inboxMode = process.argv.includes('--suite=inbox');
const scenarios = filesMode ? f3Scenarios.filter((scenario) => scenario.f3?.startsWith('files-')) : inboxMode ? inboxScenarios : calendarBoardMode ? (boardOnlyMode ? calendarBoardScenarios.filter(s=>s.name.startsWith('board-')) : calendarBoardScenarios) : timelineMode ? timelineScenarios : listMode ? listScenarios : shellMode ? shellScenarios : f3Mode ? f3Scenarios : f2Mode ? f2Scenarios : f1Scenarios;
const outputDirectory = process.env.ELECTRON_WORKFLOW_CAPTURE_OUTPUT
  ? path.resolve(root, process.env.ELECTRON_WORKFLOW_CAPTURE_OUTPUT)
  : path.join(root, 'artifacts', 'workflow', inboxMode ? 'inbox' : filesMode ? 'polish/files-refinement' : calendarBoardMode ? 'calendar-board' : listMode ? 'list' : timelineMode ? 'timeline' : shellMode ? 'shell' : f3Mode ? 'f3' : f2Mode ? 'f2' : 'f1');
const selectedScenarios = process.env.ELECTRON_WORKFLOW_CAPTURE_ONLY
  ? scenarios.filter((scenario) => process.env.ELECTRON_WORKFLOW_CAPTURE_ONLY.split(',').includes(scenario.name))
  : scenarios;
const sizes = process.env.ELECTRON_WORKFLOW_CAPTURE_SIZE === '780x640' ? [
  { width: 780, height: 640, label: '780x640' }
] : process.env.ELECTRON_WORKFLOW_CAPTURE_SIZE === '900x700' ? [
  { width: 900, height: 700, label: '900x700' }
] : [
  { width: 1280, height: 800, label: '1280x800' },
  { width: 1440, height: 900, label: '1440x900' }
];

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited before ready with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${url}`);
}

function runElectron(env) {
  const electron = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  const childEnv = { ...process.env, ...env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve, reject) => {
    const child = spawn(electron, ['.', '--force-device-scale-factor=1', `--user-data-dir=${env.ELECTRON_CAPTURE_PROFILE}`], {
      cwd: root,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const collect = (chunk) => { output += chunk.toString(); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Workflow capture timed out\n${output}`));
    }, Number(process.env.ELECTRON_WORKFLOW_CAPTURE_TIMEOUT_MS) || 20_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && output.includes('ELECTRON_WORKFLOW_CAPTURE_RESULT')) resolve(output);
      else reject(new Error(`Workflow capture failed with code ${code}\n${output}`));
    });
  });
}

async function verifyPng(file, width, height) {
  const image = await fs.readFile(file);
  if (image.length < 24 || image.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`Invalid PNG screenshot: ${file}`);
  if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) {
    throw new Error(`Screenshot ${file} is ${image.readUInt32BE(16)}x${image.readUInt32BE(20)}, expected ${width}x${height}`);
  }
}

const temporaryDirectory = path.join(root, 'artifacts', 'workflow', filesMode ? '.capture-temp-files-redesign' : '.capture-temp');
await fs.rm(temporaryDirectory, { recursive: true, force: true });
await fs.mkdir(temporaryDirectory, { recursive: true });
async function seedFilesFixtures() {
  const filesRoot = path.join(temporaryDirectory, 'files');
  const sampleRoot = path.join(filesRoot, 'sample');
  const emptyRoot = path.join(filesRoot, 'empty');
  await fs.mkdir(path.join(sampleRoot, 'nested', 'level'), { recursive: true });
  await fs.mkdir(emptyRoot, { recursive: true });
  await fs.writeFile(path.join(sampleRoot, 'readme.txt'), 'Gwira Files preview fixture.\nThis text is local test data.\n');
  await fs.writeFile(path.join(sampleRoot, 'guide.md'), '# Files preview\n\nA **readable** Markdown preview with _emphasis_ and a [safe external link](https://example.com).\n\n- Expand folders\n- Keep the explorer visible\n\n| Pane | Behavior |\n| --- | --- |\n| Preview | Read only |\n| Explorer | Stays open |\n\n```ts\nconst files = true;\n```\n');
  await fs.writeFile(path.join(sampleRoot, 'example.ts'), 'const files = true;\nfunction preview() { return files; }\n');
  await fs.writeFile(path.join(sampleRoot, 'nested', 'level', 'needle-match.md'), '# Search fixture\nA nested result for the Files search capture.');
  await fs.writeFile(path.join(sampleRoot, 'nested', 'level', 'notes.txt'), 'Nested notes for tree expansion.');
  await fs.writeFile(path.join(sampleRoot, 'unsupported.bin'), Buffer.from([0, 1, 2, 3, 255]));
  await fs.copyFile(path.join(root, 'src/renderer/assets/gwira-logo.png'), path.join(sampleRoot, 'gwira-logo.png'));
  const stream = 'BT /F1 18 Tf 40 100 Td (Gwira Files Preview) Tj ET';
  const pdfObjects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, object] of pdfObjects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${pdfObjects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${pdfObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  await fs.writeFile(path.join(sampleRoot, 'overview.pdf'), pdf, 'binary');
  await fs.writeFile(path.join(sampleRoot, `${'long-file-name-'.repeat(8)}overflow-check.txt`), 'Long name fixture.');
  await Promise.all(Array.from({ length: 60 }, (_, index) =>
    fs.writeFile(path.join(sampleRoot, `overflow-${String(index + 1).padStart(3, '0')}.txt`), `Overflow fixture ${index + 1}.`)));
}
if (filesMode) await seedFilesFixtures();
let vite;
try {
  await fs.mkdir(outputDirectory, { recursive: true });
  const port = await freePort();
  const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteEntry, '--configLoader', 'runner', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl, vite);
  console.log(`Vite ready at ${baseUrl}`);

  if (process.env.ELECTRON_WORKFLOW_CAPTURE_ONLY && selectedScenarios.length === 0) throw new Error(`Unknown workflow capture scenario: ${process.env.ELECTRON_WORKFLOW_CAPTURE_ONLY}`);
  for (const scenario of selectedScenarios) {
    for (const size of scenario.sizes ?? sizes) {
      const fixtureUrl = new URL(baseUrl);
      if (inboxMode) fixtureUrl.searchParams.set('devTools', '1');
      if (scenario.inbox === 'showcase' || scenario.inbox === 'unread' || scenario.inbox === 'threads' || scenario.inbox === 'mentions' || scenario.inbox === 'saved' || scenario.inbox === 'drafts' || scenario.inbox === 'needs-review') fixtureUrl.searchParams.set('sampleData', '1');
      if (scenario.fixture) fixtureUrl.searchParams.set('canvasFixture', scenario.fixture);
      const profile = path.join(temporaryDirectory, `profile-${scenario.name}-${size.label}`);
      const capturePath = path.join(outputDirectory, `${scenario.name}-${size.label}.png`);
      const output = await runElectron({
        ELECTRON_RENDERER_URL: fixtureUrl.toString(),
        ELECTRON_WORKFLOW_CAPTURE: '1',
        ELECTRON_WORKFLOW_CAPTURE_SUITE: scenario.inbox ? 'inbox' : '',
        ELECTRON_WORKFLOW_INBOX_SCENARIO: scenario.inbox ?? '',
        ELECTRON_WORKFLOW_ZOOM_FACTOR: String(scenario.zoomFactor ?? 1),
        ELECTRON_WORKFLOW_SELECT_ID: scenario.selectId ?? '',
        ELECTRON_WORKFLOW_SCENARIO: scenario.scenario ?? '',
        ELECTRON_TIMELINE_ACTIONS: scenario.actions ?? '',
        ELECTRON_LIST_CAPTURE: listMode || calendarBoardMode ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_VIEW: scenario.view ?? 'workflow',
        ELECTRON_WORKFLOW_CAPTURE_DASHBOARD_VIEW: scenario.dashboardView ?? '',
        ELECTRON_WORKFLOW_CAPTURE_TAB: scenario.tab ?? '',
        ELECTRON_WORKFLOW_CAPTURE_TAB_SEQUENCE: scenario.tabSequence ?? '',
        ELECTRON_WORKFLOW_CAPTURE_PANEL: scenario.panel ?? '',
        ELECTRON_WORKFLOW_CAPTURE_KEYBOARD: scenario.keyboard ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_EMPTY: scenario.emptyWorkspace ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_F3: scenario.f3 ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO: scenario.f3 ?? '',
        ELECTRON_WORKFLOW_CAPTURE_MAXIMIZED: scenario.maximized ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_F3_SEED: scenario.seed === false ? '0' : '1',
        ELECTRON_WORKFLOW_CAPTURE_WORKSPACE_WIDTH: scenario.workspaceWidth ?? '',
        ELECTRON_WORKFLOW_CAPTURE_WORK_SESSION_STATE: scenario.sessionState ?? '',
        ELECTRON_WORKFLOW_CAPTURE_FILES_ROOT: filesMode ? path.join(temporaryDirectory, 'files', scenario.filesRoot ?? 'sample') : '',
        ELECTRON_WORKFLOW_CAPTURE_FILES_GLOBAL_DESTINATION: scenario.globalDestination ?? 'Inbox',
        ELECTRON_WORKFLOW_WIDTH: String(size.width),
        ELECTRON_WORKFLOW_HEIGHT: String(size.height),
        ELECTRON_WORKFLOW_CAPTURE_PATH: capturePath,
        ELECTRON_CAPTURE_PROFILE: profile
      });
      await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      const resultLine = output.split('\n').find((line) => line.includes('ELECTRON_WORKFLOW_CAPTURE_RESULT'));
      if (!resultLine) throw new Error(`Missing workflow capture result for ${scenario.name} at ${size.label}`);
      const captureResult = JSON.parse(resultLine.slice(resultLine.indexOf('{')));
      const captureWidth = scenario.maximized ? captureResult.workspaceTopbarLayout?.topbar?.width : size.width;
      const captureHeight = scenario.maximized ? captureResult.layoutBounds?.['.shell']?.bottom : size.height;
      await verifyPng(capturePath, captureWidth, captureHeight);
      console.log(`${scenario.name}-${size.label}: ${capturePath}`);
      console.log(resultLine);
      if (inboxMode) {
        if (!captureResult.inbox) throw new Error(`${scenario.name}-${size.label} did not return Inbox assertions`);
        const checks = captureResult.inbox;
        if (!checks.honesty || !checks.buttonNames || !checks.buttonHandlers || !checks.noHorizontalOverflow || checks.consoleIssues?.length) throw new Error(`${scenario.name}-${size.label} Inbox integrity failed: ${JSON.stringify(checks)}`);
        if (scenario.inbox === 'activity' && !(checks.activityPreserved && checks.taskNavigation)) throw new Error(`${scenario.name}-${size.label} approval feed order/content/task navigation failed: ${JSON.stringify(checks)}`);
        if (scenario.inbox === 'review-empty' && !checks.reviewEmptyOnly) throw new Error(`${scenario.name}-${size.label} Needs review empty state must show once and without the no-conversations hint: ${JSON.stringify(checks)}`);
        if (scenario.inbox === 'empty' && !checks.emptyState) throw new Error(`${scenario.name}-${size.label} first-run empty state failed: ${JSON.stringify(checks)}`);
        if (scenario.inbox === 'showcase' && !checks.sampleLoaded) throw new Error(`${scenario.name}-${size.label} isolated Inbox sample data did not load`);
        if (scenario.inbox === 'xss' && !checks.xssEscaped) throw new Error(`${scenario.name}-${size.label} message body was not escaped: ${JSON.stringify(checks)}`);
        if (scenario.inbox === 'failed-retry' && !checks.retryWorked) throw new Error(`${scenario.name}-${size.label} failed-send retry did not recover: ${JSON.stringify(checks)}`);
        if (scenario.inbox === 'drawer' && !(checks.drawerOpen && checks.drawerEscapeFocus)) throw new Error(`${scenario.name}-${size.label} context drawer did not open: ${JSON.stringify(checks)}`);
      } else if (!captureResult.nodesFit && scenario.f3 !== 'picker') throw new Error(`${scenario.name}-${size.label} graph nodes exceed the canvas viewport`);
      if (scenario.f3 === 'terminal-idle' && !(captureResult.terminalCapture?.activeGlobal === 'Inbox'
        && captureResult.terminalCapture.activeWorkspaceTab === 'Terminal'
        && captureResult.terminalCapture.startLabel === 'Start Terminal'
        && captureResult.terminalCapture.tabCountStable
        && captureResult.terminalCapture.workspaceWidth === String(scenario.workspaceWidth))) {
        throw new Error(`${scenario.name}-${size.label} terminal idle or independent-tab state failed: ${JSON.stringify(captureResult.terminalCapture)}`);
      }
      if (captureResult.edges !== captureResult.modelEdges) {
        throw new Error(`${scenario.name}-${size.label} rendered ${captureResult.edges} of ${captureResult.modelEdges} modeled edges`);
      }
      if (f2Mode) {
        if (captureResult.activeView !== scenario.view) throw new Error(`${scenario.name}-${size.label} selected ${captureResult.activeView}, expected ${scenario.view}`);
        if (scenario.panel === 'collapsed' ? captureResult.panelVisible : !captureResult.panelVisible) throw new Error(`${scenario.name}-${size.label} panel visibility is incorrect`);
        if (scenario.tab && captureResult.activeContextTab !== scenario.tab) throw new Error(`${scenario.name}-${size.label} selected context tab ${captureResult.activeContextTab}, expected ${scenario.tab}`);
        if (scenario.keyboard && !captureResult.keyboardViewNavigationWorks) throw new Error(`${scenario.name}-${size.label} did not navigate Dashboard tabs with the keyboard`);
        if (scenario.emptyWorkspace && !captureResult.workspaceEmpty) throw new Error(`${scenario.name}-${size.label} did not render the empty workspace state`);
        if (scenario.dashboardView && (captureResult.unsupportedViewDisabled || captureResult.preview || captureResult.activeView !== scenario.dashboardView)) throw new Error(`${scenario.name}-${size.label} did not activate the available ${scenario.dashboardView} Dashboard view`);
        if (scenario.panel === 'collapsed' && captureResult.canvasWidth <= captureResult.expandedCanvasWidth) throw new Error(`${scenario.name}-${size.label} did not release panel width back to the workflow canvas`);
        if (scenario.panel === 'collapsed' && captureResult.reopenedContextTab !== scenario.tab) throw new Error(`${scenario.name}-${size.label} did not retain the context tab after reopening`);
        if (scenario.panel === 'collapsed' && scenario.selectId && captureResult.reopenedSelection !== 'Review campaign direction') throw new Error(`${scenario.name}-${size.label} did not retain the selected work item after reopening`);
      }
      if (listMode) {
        const list = captureResult.list;
        const want = scenario.expect ?? {};
        if (!list || captureResult.activeView !== 'list') throw new Error(`${scenario.name}-${size.label} did not mount the List tab`);
        if (want.tasks && list.tasks < 1) throw new Error(`${scenario.name}-${size.label} rendered no task rows`);
        if (want.groups && list.groups < 2) throw new Error(`${scenario.name}-${size.label} rendered no grouped sections`);
        if (want.groupKeyboard && !(list.groupKeyboard?.collapsed && list.groupKeyboard?.expanded)) throw new Error(`${scenario.name}-${size.label} group keyboard controls failed: ${JSON.stringify(list.groupKeyboard)}`);
        if (want.filtered && !(list.filteredCount > 0 && list.filteredCount < list.total && list.filterStrip)) throw new Error(`${scenario.name}-${size.label} did not filter and expose active filters`);
        if (want.noResults && !(list.empty && list.searchClear && list.filterClear && list.resetAll)) throw new Error(`${scenario.name}-${size.label} did not show combined search/filter empty-state recovery`);
        if (want.sortBy && list.sortBy !== want.sortBy) throw new Error(`${scenario.name}-${size.label} did not sort by ${want.sortBy}`);
        if (want.rowHeights && String(list.rowHeights) !== '44,48,52') throw new Error(`${scenario.name}-${size.label} row heights did not apply: ${JSON.stringify(list.rowHeights)}`);
        if (want.selected && (!captureResult.selected || list.selectedRows !== 1)) throw new Error(`${scenario.name}-${size.label} did not select a task in the existing inspector`);
        if (want.empty && !list.empty) throw new Error(`${scenario.name}-${size.label} did not render the empty List state`);
        if (want.compact && !['compact','minimal'].includes(list.layout)) throw new Error(`${scenario.name}-${size.label} did not use compact grid rows`);
        if (want.inspectorOpen && !list.inspectorVisible) throw new Error(`${scenario.name}-${size.label} did not keep the task inspector visible`);
        if (want.inspectorHidden && list.inspectorVisible) throw new Error(`${scenario.name}-${size.label} did not hide the inspector`);
        if (want.virtual && !(list.total >= 1600 && list.renderedRows < 200 && list.keyboardReachedEnd)) throw new Error(`${scenario.name}-${size.label} virtual keyboard navigation failed: ${JSON.stringify(list)}`);
      }
      if (calendarBoardMode) {
        const want = scenario.expect ?? {};
        if (scenario.view === 'calendar') {
          const calendar = captureResult.calendar;
          if (!calendar || captureResult.activeView !== 'calendar') throw new Error(`${scenario.name}-${size.label} did not mount Calendar`);
          if (want.tasks && calendar.total < 1) throw new Error(`${scenario.name}-${size.label} rendered no Calendar tasks`);
          if (want.grid && !(calendar.view === 'month' && calendar.dateButtons === 42)) throw new Error(`${scenario.name}-${size.label} did not render a six-week month grid: ${JSON.stringify(calendar)}`);
          if (scenario.name === 'calendar-default' && calendar.layout !== (calendar.bounds.width < 720 ? 'compact' : 'grid')) throw new Error(`${scenario.name}-${size.label} did not choose the responsive layout for its pane width: ${JSON.stringify(calendar)}`);
          if (want.week && calendar.view !== 'week') throw new Error(`${scenario.name}-${size.label} did not switch to week view`);
          if (want.filtered && !(calendar.shown > 0 && calendar.shown < calendar.total && calendar.activeFilters === 1 && calendar.filterStrip && calendar.checks.filter?.popoverInside)) throw new Error(`${scenario.name}-${size.label} filter interaction failed: ${JSON.stringify(calendar)}`);
          if (want.filterClear && !(calendar.activeFilters === 0 && calendar.checks.clear?.chips === 0 && !calendar.checks.clear?.strip)) throw new Error(`${scenario.name}-${size.label} Clear all did not clear Calendar filters`);
          if (want.combined && !(calendar.shown === 1 && calendar.activeFilters === 1)) throw new Error(`${scenario.name}-${size.label} search and filter did not combine: ${JSON.stringify(calendar)}`);
          if (want.selected && !(calendar.selectedTask === (want.selectedTask ?? 'tl-approve') && captureResult.selected)) throw new Error(`${scenario.name}-${size.label} did not open the selected task inspector`);
          if (want.recovery && !(calendar.selectedTask === 'tl-content' && calendar.checks.recovery?.before && !calendar.checks.recovery?.after && calendar.activeFilters === 0)) throw new Error(`${scenario.name}-${size.label} selected-task recovery failed: ${JSON.stringify(calendar)}`);
          if (want.keyboard && !(Number(calendar.checks.keyboard?.after) === Number(calendar.checks.keyboard?.before) + 1)) throw new Error(`${scenario.name}-${size.label} date-grid keyboard navigation failed: ${JSON.stringify(calendar.checks.keyboard)}`);
          if (want.agenda && !(calendar.layout === 'compact' && calendar.checks.hideInspector?.opened && calendar.checks.hideInspector?.visible && calendar.checks.hideInspector?.expanded === 'false')) throw new Error(`${scenario.name}-${size.label} narrow agenda/inspector toggle failed: ${JSON.stringify(calendar)}`);
          if (want.empty && !(calendar.emptyText === 'No work scheduled yet.' && calendar.total === 0)) throw new Error(`${scenario.name}-${size.label} did not show Calendar's empty-data state`);
          if (want.noResults && !(calendar.emptyText === 'No matching tasks' && calendar.shown === 0 && calendar.total > 0)) throw new Error(`${scenario.name}-${size.label} did not show Calendar's no-results state`);
          if (want.real && !(calendar.total === 2 && calendar.taskTitles.includes('Prepare launch brief') && calendar.unscheduled === 1)) throw new Error(`${scenario.name}-${size.label} did not project the real local task records: ${JSON.stringify(calendar)}`);
        } else {
          const board = captureResult.board;
          if (!board || captureResult.activeView !== 'board') throw new Error(`${scenario.name}-${size.label} did not mount Board`);
          if (want.columns && (board.columns !== 7 || board.statuses.join(',') !== 'default,working,waiting,blocked,failed,paused,completed')) throw new Error(`${scenario.name}-${size.label} did not retain all canonical status columns: ${JSON.stringify(board.statuses)}`);
          if (want.tasks && board.total < 1) throw new Error(`${scenario.name}-${size.label} rendered no Board tasks`);
          if (want.filtered && !(board.shown > 0 && board.shown < board.total && board.activeFilters === 1 && board.filterStrip && board.checks.filter?.popoverInside)) throw new Error(`${scenario.name}-${size.label} filter interaction failed: ${JSON.stringify(board)}`);
          if (want.filterClear && !(board.activeFilters === 0 && board.checks.clear?.chips === 0 && !board.checks.clear?.strip)) throw new Error(`${scenario.name}-${size.label} Clear all did not clear Board filters`);
          if (want.combined && !(board.shown === 1 && board.activeFilters === 1)) throw new Error(`${scenario.name}-${size.label} search and filter did not combine: ${JSON.stringify(board)}`);
          if (want.selected && !(board.selectedTask === 'tl-approve' && captureResult.selected)) throw new Error(`${scenario.name}-${size.label} did not open the selected task inspector`);
          if (want.recovery && !(board.selectedTask === 'tl-content' && board.checks.recovery?.before && !board.checks.recovery?.after && board.activeFilters === 0)) throw new Error(`${scenario.name}-${size.label} selected-task recovery failed: ${JSON.stringify(board)}`);
          if (want.keyboard && !(board.checks.keyboard?.target && board.checks.keyboard.target !== board.checks.keyboard.before)) throw new Error(`${scenario.name}-${size.label} Board keyboard navigation failed: ${JSON.stringify(board.checks.keyboard)}`);
          if (want.collapsed && board.collapsed !== 1) throw new Error(`${scenario.name}-${size.label} failed to collapse one Board column: ${JSON.stringify(board)}`);
          if (want.empty && !(board.emptyText === 'No tasks recorded' && board.total === 0 && board.columns === 7)) throw new Error(`${scenario.name}-${size.label} did not show Board's empty-data state`);
          if (want.noResults && !(board.emptyText === 'No matching tasks' && board.shown === 0 && board.total > 0)) throw new Error(`${scenario.name}-${size.label} did not show Board's no-results state`);
          if (want.real && !(board.total === 2 && board.taskTitles.includes('Prepare launch checklist') && board.taskTitles.includes('Prepare launch brief') && board.draggableCards === 2)) throw new Error(`${scenario.name}-${size.label} did not project real local task records with guarded drag affordances: ${JSON.stringify(board)}`);
        }
        if (want.panelCollapsed && captureResult.panelVisible) throw new Error(`${scenario.name}-${size.label} inspector should be collapsed`);
      }
      if (timelineMode) {
        const timeline = captureResult.timeline;
        const want = scenario.expect ?? {};
        if (scenario.view === 'workflow') { if (timeline || !captureResult.canvas) throw new Error(`${scenario.name}-${size.label} Workflow tab was changed by Timeline`); }
        else {
          if (want.bars && !(timeline.bars > 0 && timeline.markers > 0)) throw new Error(`${scenario.name}-${size.label} rendered no bars or markers`);
          if (want.zoom && timeline.zoom !== want.zoom) throw new Error(`${scenario.name}-${size.label} zoom was ${timeline.zoom}`);
          if (want.selected && (!captureResult.selected || timeline.selectedRows !== 1)) throw new Error(`${scenario.name}-${size.label} did not select a task in the inspector`);
          if (want.empty && !timeline.empty) throw new Error(`${scenario.name}-${size.label} did not show the empty state`);
          if (!want.empty && !timeline.empty && !timeline.stickyUpperOk) throw new Error(`${scenario.name}-${size.label} sticky month label is not pinned beside the task column`);
          if (want.noOverflow && (timeline.horizontalOverflow || timeline.overlapsPanel || timeline.scrollerHeight < 120)) throw new Error(`${scenario.name}-${size.label} narrow layout overflows or leaves no room for rows: ${JSON.stringify({ overflow: timeline.horizontalOverflow, panel: timeline.overlapsPanel, height: timeline.scrollerHeight })}`);
          const checks = timeline.checks ?? {};
          const fail = (message) => { throw new Error(`${scenario.name}-${size.label} ${message}`); };
          if (want.owners && !(timeline.groups > 3 && timeline.parallelLabels.some((label) => /×[2-9]/.test(label)) && timeline.loadSegments > 0)) fail(`owner groups lack the parallel-work strip: ${JSON.stringify(timeline.parallelLabels)}`);
          if (want.links && !(timeline.links >= 5 && timeline.conflictLinks >= 0 && timeline.linkLayerInside)) fail(`dependency links missing or outside the grid: ${timeline.links}`);
          if (want.related && timeline.relatedLinks < 2) fail(`selecting a task did not emphasise its links: ${timeline.relatedLinks}`);
          if (want.linkSelected && !(timeline.activeLink === want.linkSelected && timeline.dependencyStrip?.includes('waits for') && timeline.dependencyStrip.includes('not rescheduled automatically'))) fail(`dependency inspection missing: ${timeline.activeLink} ${timeline.dependencyStrip}`);
          if (want.linkKeyboard && !(checks.linkKeyboard?.pressed === 'true' && checks.linkKeyboard.tabbable === '0' && timeline.dependencyStrip)) fail(`dependency keyboard selection failed: ${JSON.stringify(checks.linkKeyboard)}`);
          if (want.linkNavigate && !(checks.linkAction?.selectedRow === want.linkNavigate && checks.linkAction.stripAfter === false)) fail(`select predecessor failed: ${JSON.stringify(checks.linkAction)}`);
          if (want.linkClosed && !(checks.linkAction?.stripBefore === true && checks.linkAction.stripAfter === false)) fail(`closing the dependency strip failed: ${JSON.stringify(checks.linkAction)}`);
          if (want.virtualEnd && !(checks.rowKey && checks.rowKey.activeIndex === checks.rowKey.total - 1 && checks.rowKey.rendered < 200)) fail(`virtual End key did not reach the last row with a bounded DOM: ${JSON.stringify(checks.rowKey)}`);
          if (want.real && !(!timeline.fixtureLabel && timeline.titles.includes('Prepare launch checklist') && timeline.unscheduledCount === '1' && timeline.links === 0 && timeline.conflictLinks === 0 && /Dependencies \(1 not drawn/.test(timeline.undrawnLegend))) fail(`real workspace timeline wrong: ${JSON.stringify({ label: timeline.fixtureLabel, titles: timeline.titles, unscheduled: timeline.unscheduledCount, links: timeline.links })}`);
          if (want.inspectorCollapse && !(checks.inspector && checks.inspector.expandedBefore === 'true' && checks.inspector.expandedAfter === 'false' && checks.inspector.after > checks.inspector.before + 150)) fail(`collapsing the inspector did not give the Timeline room: ${JSON.stringify(checks.inspector)}`);
          if (want.selectFar && !(checks.selectFar && checks.selectFar.id && checks.selectFar.selectedAfterScroll && checks.selectFar.selectedCount === 1 && checks.selectFar.atTopRendered < 200)) fail(`virtual selection was not preserved: ${JSON.stringify(checks.selectFar)}`);
          if (want.selectorFixture && !(checks.selector?.found && checks.selector.entries.some((entry) => /Timeline fixture/.test(entry)) && /Fixture/.test(checks.selector.label) && timeline.fixtureLabel && timeline.titles.includes('Brief regional managers') && timeline.titles.includes('Research promotion ideas'))) fail(`selector did not load the Timeline fixture: ${JSON.stringify(checks.selector)}`);
          if (want.filterStrip && !(checks.filter?.popoverInside && /Showing \d+ of \d+ tasks/.test(checks.filter.strip ?? '') && checks.filter.chips === 1 && /Clear all/.test(checks.filter.strip) && checks.filter.warning)) fail(`filter strip or popover wrong: ${JSON.stringify(checks.filter)}`);
          if (want.filterCleared && !(checks.chipRemoved?.chips === 1 && checks.cleared?.strip === false && checks.cleared.chips === 0)) fail(`filters were not clearable: ${JSON.stringify([checks.chipRemoved, checks.cleared])}`);
          if (want.hideDetails && !(checks.inspector?.buttonVisible && checks.inspector.expandedAfter === 'false' && checks.inspector.after > checks.inspector.before + 150)) fail(`hide details did not reclaim space: ${JSON.stringify(checks.inspector)}`);
          // At 900px the pane is ~236px wide with the inspector open: the heading wraps to two lines and keeps its full-title tooltip; Hide details reclaims the space.
          if (want.ordinary && ((timeline.heading?.clipped && size.width >= 1280) || timeline.toolbarOverflow || timeline.toolbarRows > 3 || timeline.horizontalOverflow)) fail(`ordinary window layout defect: ${JSON.stringify([timeline.heading, timeline.toolbarRows, timeline.toolbarOverflow])}`);
          if (want.baseline) console.log(`BASELINE ${size.label} ${JSON.stringify(checks.measure)}`);
          if (want.measured) {
            if (!checks.measure) fail('no measurement');
            // Actual numbers are always recorded; the limits below only catch a return to unwindowed rendering (about 20k nodes, 1.7 s zoom, 620 ms frames).
            measurements.push({ size: size.label, ...checks.measure });
            console.log(`MEASURE ${size.label} ${JSON.stringify(checks.measure)}`);
            const limits = { domNodes: 15000, zoomMs: 250, avgFrameMs: 100 };
            if (!(checks.measure.domNodes < limits.domNodes && checks.measure.zoomMs.every((ms) => ms < limits.zoomMs) && checks.measure.avgFrameMs < limits.avgFrameMs)) fail(`large dataset exceeds regression limits ${JSON.stringify(limits)}: ${JSON.stringify(checks.measure)}`);
          }
          if (want.resized && !(checks.resize && checks.resize.after <= checks.resize.before - 80)) throw new Error(`${scenario.name}-${size.label} pointer resize did not narrow the task column: ${JSON.stringify(checks.resize)}`);
          if (want.resized && !(checks.resizeKey && checks.resizeKey.after > checks.resizeKey.before)) throw new Error(`${scenario.name}-${size.label} keyboard resize did not widen the task column: ${JSON.stringify(checks.resizeKey)}`);
          if (want.returnFlow && !(checks.returnShown === true && checks.returnShownAfter === false)) throw new Error(`${scenario.name}-${size.label} back-to-tasks flow failed: ${JSON.stringify(checks)}`);
          if (want.tooltip && !(checks.tooltip && checks.tooltip.includes('Draft promotion content') && checks.tooltipInside)) throw new Error(`${scenario.name}-${size.label} tooltip missing or clipped: ${JSON.stringify(checks)}`);
        }
        const shell = captureResult.shell;
        if (shell && (shell.topbars !== 1 || shell.sidebars !== 1)) throw new Error(`${scenario.name}-${size.label} shell chrome changed`);
      }
      if (shellMode) {
        const shell = captureResult.shell;
        if (shell.topbars !== 1 || shell.sidebars !== 1 || shell.legacyTabbars !== 0) throw new Error(`${scenario.name}-${size.label} rendered ${shell.topbars} top bars / ${shell.sidebars} sidebars / ${shell.legacyTabbars} legacy chrome`);
        if (shell.topbar.top !== 0 || shell.topbar.bottom > 40) throw new Error(`${scenario.name}-${size.label} top bar is not pinned to the top: ${JSON.stringify(shell.topbar)}`);
        if (shell.sidebar.top < shell.topbar.bottom || shell.workspace.top < shell.topbar.bottom) throw new Error(`${scenario.name}-${size.label} sidebar or page overlaps the top bar`);
        if (shell.taskDetails && shell.taskDetails.top < shell.topbar.bottom) throw new Error(`${scenario.name}-${size.label} task details overlap the top bar`);
        if (!shell.notifications || !['Back', 'Forward', 'Open a new global tab', 'Open a new workspace tab', 'Workspace tools', 'Gwira Chat'].every((label) => shell.topbarControls.includes(label))) throw new Error(`${scenario.name}-${size.label} top bar controls are missing: ${shell.topbarControls}`);
        if (scenario.f3 === 'sidebar-collapsed' && !shell.sidebarCollapsed) throw new Error(`${scenario.name}-${size.label} did not collapse the sidebar`);
        if (scenario.f3 === 'task-inspector' && !shell.taskDetails) throw new Error(`${scenario.name}-${size.label} did not open task details`);
        if (!shell.sidebarCollapsed && scenario.name !== 'shell-narrow' && scenario.name !== 'shell-library' && shell.navLabels.length < (/home/.test(scenario.name) ? 1 : 4)) throw new Error(`${scenario.name}-${size.label} sidebar is missing destinations: ${shell.navLabels}`);
      }
      if (f3Mode) {
        if (captureResult.globalTabs < 1) throw new Error(`${scenario.name}-${size.label} did not render workspace tabs`);
        if (scenario.f3 === 'multiple-tabs' && captureResult.globalTabs < 4) throw new Error(`${scenario.name}-${size.label} did not open multiple global tabs`);
        if (scenario.f3 === 'task-tab' && (!captureResult.activeWorkspaceTab.includes('Prepare launch checklist') || captureResult.activeView !== 'my-work')) throw new Error(`${scenario.name}-${size.label} did not open the task destination`);
        if (scenario.f3 === 'team' && (captureResult.inspectorMode !== 'Workspace context' || captureResult.activeContextTab !== 'team')) throw new Error(`${scenario.name}-${size.label} did not show Team context`);
        if (scenario.f3 === 'activity' && captureResult.activeContextTab !== 'activity') throw new Error(`${scenario.name}-${size.label} did not show Activity context`);
        if (scenario.f3 === 'selected-work' && (captureResult.inspectorMode !== 'Inspect work' || !captureResult.selected)) throw new Error(`${scenario.name}-${size.label} did not inspect selected work`);
        if (scenario.f3 === 'collapsed' && captureResult.panelVisible) throw new Error(`${scenario.name}-${size.label} did not collapse the inspector`);
        if (scenario.f3 === 'picker' && (!captureResult.destinationPickerOpen || captureResult.activeRoute !== 'dashboard' || captureResult.nodes < 1)) throw new Error(`${scenario.name}-${size.label} did not preserve the dashboard alongside the new tab launcher`);
        if (scenario.f3 === 'empty' && !captureResult.workspaceEmpty) throw new Error(`${scenario.name}-${size.label} did not render an honest empty state`);
        if (scenario.f3 === 'create-work' && !captureResult.createdTask) throw new Error(`${scenario.name}-${size.label} did not create and select a local task`);
        if (scenario.f3 === 'edit-save' && captureResult.selected !== 'Updated capture checklist') throw new Error(`${scenario.name}-${size.label} did not save the edited task`);
        if (scenario.f3 === 'unsaved-switch' && !captureResult.draftSurvivedTabSwitch) throw new Error(`${scenario.name}-${size.label} discarded the edit draft on tab switch`);
        if (scenario.f3 === 'relationship' && captureResult.inspectorMode !== 'Inspect connection') throw new Error(`${scenario.name}-${size.label} did not inspect the selected relationship`);
        if (scenario.f3 === 'workspace-sessions' && (!captureResult.workspaceSessionsPanel || captureResult.workspaceSessionsTab !== 'Work Sessions' || captureResult.workspaceSessionsToolTabs !== 1 || !captureResult.workspaceSessionsStableTab || !captureResult.workspaceSessionsReused || !captureResult.workspaceSessionsCloseFallback || captureResult.workspaceSessionsRoute !== 'inbox' || captureResult.activeRoute !== 'inbox')) {
          throw new Error(`${scenario.name}-${size.label} did not preserve the Inbox while replacing/reusing the Work Sessions tab: ${JSON.stringify(captureResult)}`);
        }
        if (scenario.f3 === 'workspace-sessions' && captureResult.workspaceSessionsWidth !== String(scenario.workspaceWidth)) {
          throw new Error(`${scenario.name}-${size.label} did not apply the requested Workspace width: ${captureResult.workspaceSessionsWidth}`);
        }
        if (scenario.f3?.startsWith('workspace-topbar-')) {
          const layout = captureResult.workspaceTopbarLayout;
          if (!layout || !captureResult.workspaceTopbarGlobalTabsUnchanged || Math.abs(layout.actions.right - layout.topbar.right) > 1) {
            throw new Error(`${scenario.name}-${size.label} shifted right-side controls or changed global tabs: ${JSON.stringify(layout)}`);
          }
          const shouldBeOpen = scenario.f3 !== 'workspace-topbar-collapsed';
          if (layout.open !== shouldBeOpen) throw new Error(`${scenario.name}-${size.label} has the wrong Workspace state: ${JSON.stringify(layout)}`);
          if (shouldBeOpen && (!layout.workspaceTabs
            || Math.abs(layout.divider.left - layout.rightWorkspace.left) > 1
            || layout.topbar.width >= 1100 && Math.abs(layout.divider.left - layout.content.right) > 1)) {
            throw new Error(`${scenario.name}-${size.label} Workspace tabs or divider alignment is incorrect: ${JSON.stringify(layout)}`);
          }
          if (!shouldBeOpen && (layout.workspaceTabs || Math.abs(layout.globalRegion.right - layout.actions.left) > 1 || Math.abs(layout.workspaceRegion.width - layout.actions.width) > 1)) {
            throw new Error(`${scenario.name}-${size.label} reserved collapsed Workspace width: ${JSON.stringify(layout)}`);
          }
          if (scenario.f3 === 'workspace-topbar-reopened' && !captureResult.workspaceWidthRestored) {
            throw new Error(`${scenario.name}-${size.label} did not restore the Workspace width after reopening`);
          }
          if (scenario.maximized && (!captureResult.windowMaximized || !captureResult.windowRestored)) {
            throw new Error(`${scenario.name}-${size.label} did not maximize and restore the Electron window: ${JSON.stringify(captureResult)}`);
          }
        }
        if (scenario.sessionState === 'empty' && !captureResult.workspaceSessionsEmpty) throw new Error(`${scenario.name}-${size.label} did not show the empty Work Sessions state`);
        if (scenario.sessionState === 'selected' && !captureResult.workspaceSessionsSelected) throw new Error(`${scenario.name}-${size.label} did not select a real Work Session`);
        if (scenario.f3?.startsWith('files-')) {
          const files = captureResult.filesCapture;
          const globalDestination = scenario.globalDestination ?? 'Inbox';
          if (!files || files.activeGlobal !== globalDestination || files.activeWorkspaceTab !== 'Files' || files.globalView !== globalDestination.toLowerCase().replaceAll(' ', '-')) {
            throw new Error(`${scenario.name}-${size.label} did not keep Files independent from the ${globalDestination} canvas: ${JSON.stringify(files)}`);
          }
          if (!files.openedInExistingTab || !files.selectionKeepsTabCount) throw new Error(`${scenario.name}-${size.label} changed Workspace tabs while opening Files or selecting an item`);
          if (files.workspaceWidth !== String(scenario.workspaceWidth)) throw new Error(`${scenario.name}-${size.label} Workspace width was ${files.workspaceWidth}, expected ${scenario.workspaceWidth}`);
          if (!files.horizontalOverflow) throw new Error(`${scenario.name}-${size.label} Files content overflows horizontally`);
          if (scenario.f3 === 'files-image' && !files.imagePreview) throw new Error(`${scenario.name}-${size.label} image preview did not render`);
          if (scenario.f3 === 'files-text' && !files.textPreview) throw new Error(`${scenario.name}-${size.label} text preview did not render`);
          if (scenario.f3 === 'files-pdf' && !files.pdfPreview) throw new Error(`${scenario.name}-${size.label} PDF preview did not render`);
          if (scenario.f3 === 'files-unsupported' && !files.unsupportedPreview) throw new Error(`${scenario.name}-${size.label} unsupported-file state did not render`);
          if (scenario.f3 === 'files-search' && !files.searchMatch) throw new Error(`${scenario.name}-${size.label} recursive search did not return its nested match`);
          if (scenario.f3 === 'files-empty' && !files.emptyFolder) throw new Error(`${scenario.name}-${size.label} empty folder did not render its empty state`);
          if (scenario.f3 === 'files-overflow' && files.overflowRows < 50) throw new Error(`${scenario.name}-${size.label} did not render 50+ file rows`);
          if (scenario.f3 === 'files-focus' && !files.focusIndicator) throw new Error(`${scenario.name}-${size.label} search field did not retain its visible focus indicator`);
          if (scenario.f3 === 'files-hover' && !(captureResult.filesHoverConfirmed || captureResult.filesHoverFallback)) throw new Error(`${scenario.name}-${size.label} file row did not reveal its hover/focus action state`);
          if (scenario.f3 === 'files-narrow-selected' && !(files.explorerStayedOpenAfterSelection && files.selectedFile === 'readme.txt')) throw new Error(`${scenario.name}-${size.label} selecting a file dismissed or lost the compact explorer`);
          if (scenario.f3 === 'files-nested' && !files.nestedExpanded) throw new Error(`${scenario.name}-${size.label} did not preserve the expanded nested file tree`);
          if (scenario.f3 === 'files-markdown-preview' && !(files.markdownPreview && files.markdownTable)) throw new Error(`${scenario.name}-${size.label} Markdown preview did not render formatted content and a table`);
          if (scenario.f3 === 'files-markdown-source' && !files.markdownSource) throw new Error(`${scenario.name}-${size.label} Markdown Source mode did not show the original text`);
          if (scenario.f3 === 'files-code' && !files.codeLineNumbers) throw new Error(`${scenario.name}-${size.label} code preview did not render line numbers`);
          if (scenario.f3 === 'files-split-resized' && !(captureResult.filesCapture.splitMoved && captureResult.filesCapture.splitAligned)) throw new Error(`${scenario.name}-${size.label} the internal Files divider did not resize in alignment`);
          if (scenario.f3 === 'files-state' && !(files.filesTabs === 1 && files.workSessionTabs === 1 && files.workspaceTabs === 2 && files.selectedFile === 'readme.txt' && files.retainedTabPosition === files.initialTabPosition)) {
            throw new Error(`${scenario.name}-${size.label} tool switching duplicated or lost the selected Files tab: ${JSON.stringify(files)}`);
          }
        }
      }
    }
  }
} catch (error) {
  if (vite?.exitCode === null) vite.kill('SIGTERM');
  if (vite && vite.exitCode === null && vite.signalCode === null) await new Promise((resolve) => vite.once('close', resolve));
  throw new Error(`${error instanceof Error ? error.message : String(error)}\n${viteOutputForError(vite)}`);
} finally {
  if (measurements.length) await fs.writeFile(path.join(outputDirectory, 'timeline-large-measurements.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), note: 'Actual measurements of the 1,600-task dev fixture. Regression limits are intentionally looser than typical values.', measurements }, null, 2)}\n`);
  if (vite?.exitCode === null && vite.signalCode === null) {
    vite.kill('SIGTERM');
    await new Promise((resolve) => vite.once('close', resolve));
  }
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

function viteOutputForError(child) {
  return child ? `Vite PID ${child.pid}` : '';
}
