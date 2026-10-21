import { app, BrowserWindow, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc } from './ipc.js';
import { CodexExecManager } from './codexExecManager.js';
import { listCodexHistories } from './codexHistory.js';
import { SessionStore } from './sessionStore.js';
import { buildMainWindowOptions } from './windowOptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

const sessions = new SessionStore();
const codexManager = new CodexExecManager(sessions);

registerIpc(codexManager, sessions);

async function createWindow(): Promise<void> {
  const window = new BrowserWindow(buildMainWindowOptions(path.join(__dirname, '../preload/index.js')));
  if (process.env.ELECTRON_WORKFLOW_CAPTURE === '1') {
    const width = Number(process.env.ELECTRON_WORKFLOW_WIDTH);
    const height = Number(process.env.ELECTRON_WORKFLOW_HEIGHT);
    if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) window.setContentSize(width, height);
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
  } else {
    await window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  if (process.env.ELECTRON_SMOKE_TEST === '1') await runSmokeTest(window);
  if (process.env.ELECTRON_NODE_GALLERY_CAPTURE === '1') await runNodeGalleryCapture(window);
  if (process.env.ELECTRON_WORKFLOW_CAPTURE === '1') await runWorkflowCapture(window);
  if (process.env.ELECTRON_HISTORY_BENCHMARK === '1') await runHistoryBenchmark(window);
  if (process.env.ELECTRON_AGENT_LIFECYCLE_TEST === '1') await runAgentLifecycleTest(window);
}

async function runWorkflowCapture(window: BrowserWindow): Promise<void> {
  const capturePath = process.env.ELECTRON_WORKFLOW_CAPTURE_PATH;
  await new Promise((resolve) => setTimeout(resolve, 150));
  const prepared = await window.webContents.executeJavaScript(`(() => {
    const key = 'gwira.local-prototype.v1'; const raw = localStorage.getItem(key);
    if (!raw) return false;
    const state = JSON.parse(raw);
    state.onboarding = { version: 1, currentStep: 'complete', profile: { businessName: 'Workflow capture' }, completedAt: new Date().toISOString() };
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_F3)} === '1' && ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_F3_SEED)} !== '0') {
      const now = new Date().toISOString();
      const personId = '11111111-1111-4111-8111-111111111111';
      state.people = [...(state.people ?? []).filter((person) => person.id !== personId), { id: personId, workspaceId: state.workspace.id, name: 'Capture Operator', role: 'Operations', createdAt: now }];
      state.tasks = [...(state.tasks ?? []).filter((task) => !task.id.startsWith('f3-capture-')), {
        id: '22222222-2222-4222-8222-222222222222', workspaceId: state.workspace.id, title: 'Prepare launch brief', description: 'Record the launch goals and review requirements.', status: 'todo', priority: 'medium', assignee: { kind: 'person', id: personId }, createdAt: now, updatedAt: now
      }, {
        id: '33333333-3333-4333-8333-333333333333', workspaceId: state.workspace.id, title: 'Prepare launch checklist', description: 'Document the launch-readiness checks for this workspace.', status: 'todo', priority: 'high', dueDate: '2026-11-15', assignee: { kind: 'person', id: personId }, dependsOnTaskIds: ['22222222-2222-4222-8222-222222222222'], createdAt: now, updatedAt: now
      }];
    }
    localStorage.setItem(key, JSON.stringify(state)); return true;
  })()`);
  if (!prepared) throw new Error('Workflow capture failed: local workspace state was unavailable');
  window.webContents.reload();
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    document.querySelector('button[data-navigation-view="dashboard"]')?.click(); await wait(80);
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Dashboard')?.click(); await wait(180);
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_SCENARIO)} === 'marketing') {
      document.querySelector('.gwira-demo-menu summary')?.click(); await wait(25);
      [...document.querySelectorAll('.gwira-demo-menu button')].find((button) => button.textContent?.trim() === 'Marketing Campaign')?.click(); await wait(250);
    }
    const selectId = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_SELECT_ID)};
    if (selectId) {
      const node = [...document.querySelectorAll('.react-flow__node')].find((entry) => entry.getAttribute('data-id') === selectId);
      if (!node) throw new Error('Workflow capture failed: selected graph node was not found: ' + selectId);
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(120);
    }
    const tabSequence = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_TAB_SEQUENCE)}.split(',').filter(Boolean);
    for (const tabId of tabSequence) {
      const panelTab = document.querySelector('#context-tab-' + tabId);
      if (!panelTab) throw new Error('Dashboard capture failed: context tab was not found: ' + tabId);
      panelTab.click(); await wait(60);
    }
    let keyboardUnsupportedViewBlocked = false;
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_KEYBOARD)} === '1') {
      const workflowTab = document.querySelector('[data-dashboard-view="workflow"][role="tab"]');
      workflowTab?.focus();
      workflowTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await wait(50);
      const timelineTab = document.querySelector('[data-dashboard-view="timeline"][role="tab"]');
      keyboardUnsupportedViewBlocked = Boolean(timelineTab instanceof HTMLButtonElement && timelineTab.disabled && workflowTab?.getAttribute('aria-selected') === 'true' && timelineTab.getAttribute('aria-selected') !== 'true');
    }
    const requestedView = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_VIEW || 'workflow')};
    const requestedDashboardView = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_DASHBOARD_VIEW || '')};
    const dashboardViewToAttempt = requestedDashboardView || requestedView;
    if (dashboardViewToAttempt !== 'workflow') {
      const viewTab = document.querySelector('[data-dashboard-view="' + dashboardViewToAttempt + '"][role="tab"]');
      if (!viewTab) throw new Error('Dashboard capture failed: requested view tab was not found: ' + dashboardViewToAttempt);
      viewTab.click(); await wait(120);
    }
    for (const action of ${JSON.stringify(process.env.ELECTRON_TIMELINE_ACTIONS ?? '')}.split(';').filter(Boolean)) {
      const [kind, value] = action.split(':');
      if (kind === 'zoom') document.querySelectorAll('.gwira-timeline__zoom button').forEach((button) => { if (button.textContent === value) button.click(); });
      if (kind === 'select') document.querySelector('.gwira-timeline [data-task-id="' + value + '"]')?.click();
      if (kind === 'collapse') document.querySelectorAll('.gwira-timeline__row.is-group button').forEach((button, index) => { if (String(index) === value) button.click(); });
      const tl = document.querySelector('.gwira-timeline');
      const tlScroller = tl?.querySelector('.gwira-timeline__scroller');
      const tlCorner = () => tl?.querySelector('.gwira-timeline__corner')?.getBoundingClientRect().width ?? 0;
      if (kind === 'resize') {
        const handle = tl?.querySelector('.gwira-timeline__resizer');
        const box = handle?.getBoundingClientRect();
        if (handle && box) {
          const before = tlCorner();
          const fire = (type, clientX) => handle.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX, clientY: box.top + 4 }));
          fire('pointerdown', box.left + 4); fire('pointermove', box.left + 4 + Number(value)); fire('pointerup', box.left + 4 + Number(value));
          await wait(120);
          window.__timelineChecks = { ...window.__timelineChecks, resize: { before, after: tlCorner() } };
        }
      }
      if (kind === 'resizekey') {
        const handle = tl?.querySelector('.gwira-timeline__resizer');
        const before = tlCorner();
        handle?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        await wait(120);
        window.__timelineChecks = { ...window.__timelineChecks, resizeKey: { before, after: tlCorner() } };
      }
      if (kind === 'scrollaway' && tlScroller) {
        tlScroller.scrollLeft = tlScroller.scrollWidth; await wait(250);
        window.__timelineChecks = { ...window.__timelineChecks, returnShown: Boolean(tl.querySelector('.gwira-timeline__return')), leftBefore: tlScroller.scrollLeft };
      }
      if (kind === 'back') {
        tl?.querySelector('.gwira-timeline__return')?.click(); await wait(900);
        window.__timelineChecks = { ...window.__timelineChecks, returnShownAfter: Boolean(tl?.querySelector('.gwira-timeline__return')), leftAfter: tlScroller?.scrollLeft };
      }
      if (kind === 'key' && tlScroller) { tlScroller.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })); await wait(400); window.__timelineChecks = { ...window.__timelineChecks, zoomAfterKey: tl.getAttribute('data-timeline-zoom') }; }
      if (kind === 'hover') {
        const target = tl?.querySelector('[data-task-id="' + value + '"]');
        const box = target?.getBoundingClientRect();
        target?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: (box?.left ?? 0) + 40, clientY: (box?.top ?? 0) + 10 }));
        await wait(150);
        const tip = document.querySelector('.gwira-timeline-tip');
        const tipBox = tip?.getBoundingClientRect();
        window.__timelineChecks = { ...window.__timelineChecks, tooltip: tip?.textContent ?? '', tooltipInside: Boolean(tipBox && tipBox.left >= 0 && tipBox.right <= window.innerWidth && tipBox.bottom <= window.innerHeight) };
      }
      if (kind === 'group') {
        const select = tl?.querySelector('select[aria-label="Group by"]');
        if (select) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value); select.dispatchEvent(new Event('change', { bubbles: true })); await wait(250); }
      }
      if (kind === 'link') { tl?.querySelector('[data-link-id="' + value.replace(/"/g, '') + '"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(150); }
      if (kind === 'linkkey') {
        const link = tl?.querySelector('[data-link-id="' + value + '"]');
        link?.focus();
        link?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wait(150);
        window.__timelineChecks = { ...window.__timelineChecks, linkKeyboard: { focused: document.activeElement === link, pressed: link?.getAttribute('aria-pressed'), tabbable: link?.getAttribute('tabindex') } };
      }
      if (kind === 'linkaction') {
        const before = document.querySelector('.gwira-timeline__dependency') !== null;
        [...document.querySelectorAll('.gwira-timeline__dependency-actions button')].find((button) => button.textContent === value)?.click();
        await wait(250);
        window.__timelineChecks = { ...window.__timelineChecks, linkAction: { value, stripBefore: before, stripAfter: document.querySelector('.gwira-timeline__dependency') !== null, selectedRow: document.querySelector('.gwira-timeline__row.is-selected [data-task-id]')?.getAttribute('data-task-id') ?? null } };
      }
      if (kind === 'inspector' && tl) {
        const toggle = document.querySelector('[data-testid="context-panel-toggle"]');
        const before = Math.round(tl.getBoundingClientRect().width);
        const expandedBefore = toggle?.getAttribute('aria-expanded');
        toggle?.click(); await wait(400);
        window.__timelineChecks = { ...window.__timelineChecks, inspector: { before, after: Math.round(tl.getBoundingClientRect().width), expandedBefore, expandedAfter: toggle?.getAttribute('aria-expanded'), nameWidth: Math.round(tl.querySelector('.gwira-timeline__corner')?.getBoundingClientRect().width ?? 0) } };
      }
      if (kind === 'selector') {
        const menu = document.querySelector('.gwira-demo-menu');
        menu?.setAttribute('open', '');
        const entries = [...document.querySelectorAll('.gwira-demo-menu [role="menuitemradio"]')];
        const picked = entries.find((entry) => entry.getAttribute('data-fixture') === value || entry.textContent === value);
        picked?.click(); await wait(500);
        window.__timelineChecks = { ...window.__timelineChecks, selector: { found: Boolean(picked), entries: entries.map((entry) => entry.textContent), label: document.querySelector('.gwira-demo-menu summary')?.textContent ?? null } };
      }
      if (kind === 'filter' && tl) {
        const [key, filterValue] = value.split('=');
        const filterButton = tl.querySelector('.gwira-timeline__filter > button');
        if (!tl.querySelector('.gwira-timeline__popover')) filterButton?.click();
        await wait(150);
        const select = [...tl.querySelectorAll('.gwira-timeline__popover label')].find((label) => label.textContent?.startsWith(key))?.querySelector('select');
        if (select) {
          const option = [...select.options].find((entry) => entry.textContent === filterValue || entry.value === filterValue);
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option ? option.value : filterValue);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await wait(300);
        const pop = tl.querySelector('.gwira-timeline__popover')?.getBoundingClientRect();
        const rootBox = tl.getBoundingClientRect();
        window.__timelineChecks = { ...window.__timelineChecks, filter: { popoverInside: Boolean(pop && pop.left >= Math.max(rootBox.left, 0) - 1 && pop.right <= Math.min(rootBox.right, window.innerWidth) + 1 && pop.bottom <= window.innerHeight), popover: pop ? [Math.round(pop.left), Math.round(pop.right), Math.round(pop.bottom)] : null, strip: tl.querySelector('.gwira-timeline__filters')?.textContent ?? null, chips: tl.querySelectorAll('.gwira-timeline__chip').length, warning: tl.querySelector('[data-testid="timeline-hidden-attention"]')?.textContent ?? null } };
      }
      if (kind === 'clearfilters' && tl) {
        tl.querySelector('.gwira-timeline__clear')?.click(); await wait(300);
        window.__timelineChecks = { ...window.__timelineChecks, cleared: { strip: tl.querySelector('.gwira-timeline__filters') !== null, chips: tl.querySelectorAll('.gwira-timeline__chip').length } };
      }
      if (kind === 'removechip' && tl) {
        tl.querySelector('.gwira-timeline__chip')?.click(); await wait(300);
        window.__timelineChecks = { ...window.__timelineChecks, chipRemoved: { chips: tl.querySelectorAll('.gwira-timeline__chip').length } };
      }
      if (kind === 'hidedetails' && tl) {
        const before = Math.round(tl.getBoundingClientRect().width);
        const button = tl.querySelector('[data-testid="timeline-hide-inspector"]');
        const visible = Boolean(button && getComputedStyle(button).display !== 'none');
        if (visible) button.click();
        await wait(400);
        window.__timelineChecks = { ...window.__timelineChecks, inspector: { before, after: Math.round(tl.getBoundingClientRect().width), expandedBefore: 'true', expandedAfter: document.querySelector('[data-testid="context-panel-toggle"]')?.getAttribute('aria-expanded'), buttonVisible: visible, nameWidth: Math.round(tl.querySelector('.gwira-timeline__corner')?.getBoundingClientRect().width ?? 0) } };
      }
      if (kind === 'selectfar' && tl && tlScroller) {
        const first = tl.querySelector('[data-timeline-row]');
        first?.focus();
        first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        await wait(500);
        const target = document.activeElement;
        const id = target instanceof HTMLElement ? target.dataset.taskId ?? null : null;
        target?.click(); await wait(300);
        tlScroller.scrollTop = 0; await wait(400);
        const atTop = tl.querySelectorAll('.gwira-timeline__row').length;
        tlScroller.scrollTop = tlScroller.scrollHeight; await wait(500);
        const row = id ? tl.querySelector('[data-task-id="' + id + '"]')?.closest('.gwira-timeline__row') : null;
        window.__timelineChecks = { ...window.__timelineChecks, selectFar: { id, selectedAfterScroll: row?.classList.contains('is-selected') ?? false, selectedCount: tl.querySelectorAll('.gwira-timeline__row.is-selected').length, atTopRendered: atTop } };
      }
      if (kind === 'rowkey' && tl && tlScroller) {
        const first = tl.querySelector('[data-timeline-row]');
        first?.focus();
        first?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        await wait(500);
        const active = document.activeElement;
        window.__timelineChecks = { ...window.__timelineChecks, rowKey: { key: value, activeIndex: active instanceof HTMLElement && active.dataset.rowIndex !== undefined ? Number(active.dataset.rowIndex) : null, total: Number(tl.querySelector('[role="grid"]')?.getAttribute('aria-rowcount')), rendered: tl.querySelectorAll('.gwira-timeline__row').length } };
      }
      if (kind === 'measure' && tl && tlScroller) {
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));
        const zoomMs = [];
        for (const label of ['Day', 'Month', 'Week']) {
          const t0 = performance.now();
          [...tl.querySelectorAll('.gwira-timeline__zoom button')].find((button) => button.textContent === label)?.click();
          await frame(); await frame();
          zoomMs.push(Math.round(performance.now() - t0));
        }
        const deltas = [];
        let last = await frame();
        for (let step = 0; step < 60; step += 1) {
          tlScroller.scrollTop = step * 90; tlScroller.scrollLeft = step * 40;
          const now = await frame(); deltas.push(now - last); last = now;
        }
        window.__timelineChecks = { ...window.__timelineChecks, measure: { domNodes: tl.querySelectorAll('*').length, rows: tl.querySelectorAll('.gwira-timeline__row').length, zoomMs, avgFrameMs: Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length * 10) / 10, worstFrameMs: Math.round(Math.max(...deltas)) } };
      }
      await wait(250);
    }
    const requestedPanelTab = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_TAB)};
    if (requestedPanelTab) {
      const panelTab = document.querySelector('#context-tab-' + requestedPanelTab);
      if (!panelTab) throw new Error('Dashboard capture failed: requested context tab was not found: ' + requestedPanelTab);
      panelTab.click(); await wait(100);
    }
    const toggle = document.querySelector('[data-testid="context-panel-toggle"]');
    if (toggle?.getAttribute('aria-expanded') === 'false' && !window.__timelineChecks?.inspector) {
      toggle.click();
      await wait(180);
    }
    const expandedCanvasWidth = document.querySelector('.gwira-workflow-canvas__interaction')?.getBoundingClientRect().width ?? 0;
    let reopenedContextTab;
    let reopenedSelection;
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_PANEL)} === 'collapsed') {
      if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click();
      await wait(180);
      if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
      await wait(180);
      reopenedContextTab = document.querySelector('#gwira-workflow-panel [role="tab"][aria-selected="true"]')?.id.replace('context-tab-', '');
      reopenedSelection = document.querySelector('.gwira-workflow-panel__header > div > span')?.textContent;
      if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click();
      await wait(180);
    }
    let activeWorkspaceTab = '';
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_F3)} === '1') {
      const chooseDestination = async (label) => {
        document.querySelector('[aria-label="Open a new tab"]')?.click(); await wait(60);
        const choice = [...document.querySelectorAll('.global-popover--picker [role="option"]')].find((button) => button.querySelector('strong')?.textContent?.trim() === label);
        if (!choice) throw new Error('F3 capture failed: destination not found: ' + label);
        choice.click(); await wait(180);
      };
      const chooseDashboardTab = () => {
        const button = [...document.querySelectorAll('.global-tab__select')].find((item) => item.textContent?.trim() === 'Dashboard');
        if (!button) throw new Error('F3 capture failed: Dashboard tab is missing');
        button.click();
      };
      const scenario = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO)};
      if (scenario === 'multiple-tabs') {
        await chooseDestination('Inbox');
        await chooseDestination('My Work');
        await chooseDestination('Dashboard');
      } else if (scenario === 'task-tab') {
        await chooseDestination('Prepare launch checklist');
      } else if (scenario === 'team') {
        document.querySelector('#context-tab-team')?.click(); await wait(80);
      } else if (scenario === 'activity') {
        document.querySelector('#context-tab-activity')?.click(); await wait(80);
      } else if (scenario === 'selected-work' || scenario === 'collapsed' || scenario === 'edit-save' || scenario === 'unsaved-switch' || scenario === 'relationship') {
        chooseDashboardTab();
        await wait(180);
        if (scenario === 'relationship') {
          const edge = document.querySelector('.react-flow__edge');
          if (!edge) throw new Error('F3 capture failed: expected a recorded relationship edge');
          edge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(140);
        } else {
          const node = document.querySelector('.react-flow__node[data-id="humanWork:33333333-3333-4333-8333-333333333333"]');
          if (!node) throw new Error('F3 capture failed: seeded human work node is missing');
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(140);
          if (scenario === 'collapsed') {
            document.querySelector('[data-testid="context-panel-toggle"]')?.click(); await wait(120);
          }
          if (scenario === 'edit-save' || scenario === 'unsaved-switch') {
            [...document.querySelectorAll('#gwira-workflow-panel button')].find((button) => button.textContent?.trim() === 'Edit')?.click(); await wait(80);
            const title = document.querySelector('.gwira-inspector-form input');
            if (!(title instanceof HTMLInputElement)) throw new Error('F3 capture failed: task edit form did not open');
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setValue?.call(title, scenario === 'edit-save' ? 'Updated capture checklist' : 'Draft survives switching tabs');
            title.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(60);
            if (scenario === 'edit-save') {
              [...document.querySelectorAll('.gwira-inspector-form button')].find((button) => button.textContent?.trim() === 'Save changes')?.click();
              await wait(180);
            } else {
              await chooseDestination('Inbox');
              chooseDashboardTab(); await wait(100);
            }
          }
        }
      } else if (scenario.startsWith('nav-')) {
        document.querySelector('button[data-navigation-view="' + scenario.slice(4) + '"]')?.click(); await wait(240);
      } else if (scenario === 'home' || scenario === 'home-expanded' || scenario === 'home-collapsed' || scenario === 'tab-home' || scenario === 'tab-dashboard') {
        document.querySelector('button[data-navigation-view="home"]')?.click(); await wait(240);
        if (scenario === 'home-expanded') {
          for (const toggle of document.querySelectorAll('.gwira-secondary-sidebar .projects-header-toggle[aria-expanded="false"], .gwira-secondary-sidebar .sidebar-collapsible-heading[aria-expanded="false"]')) { toggle.click(); await wait(60); }
        }
        if (scenario === 'home-collapsed') { document.querySelector('button[aria-label="Collapse sidebar"]')?.click(); await wait(180); }
        const pickTab = (name) => [...document.querySelectorAll('.global-topbar [role="tab"]')].find((tab) => tab.textContent?.trim() === name)?.click();
        if (scenario === 'tab-home') { pickTab('Dashboard'); await wait(200); pickTab('Home'); await wait(240); }
        if (scenario === 'tab-dashboard') { pickTab('Dashboard'); await wait(240); }
      } else if (scenario === 'sidebar-collapsed') {
        document.querySelector('button[aria-label="Collapse sidebar"]')?.click(); await wait(180);
      } else if (scenario === 'task-inspector') {
        document.querySelector('button[data-navigation-view="my-work"]')?.click(); await wait(220);
        document.querySelector('.gwira-task-card')?.click(); await wait(180);
      } else if (scenario === 'more-menu') {
        document.querySelector('button[aria-label="More"]')?.click(); await wait(120);
      } else if (scenario === 'notifications') {
        document.querySelector('button[aria-label^="Notifications"]')?.click(); await wait(100);
      } else if (scenario === 'picker') {
        document.querySelector('[aria-label="Open a new tab"]')?.click(); await wait(80);
      } else if (scenario === 'create-work') {
        document.querySelector('.gwira-dashboard-add > button')?.click(); await wait(60);
        [...document.querySelectorAll('.gwira-dashboard-add__menu [role="menuitem"]')].find((button) => button.textContent?.trim() === 'Human work')?.click(); await wait(100);
        const title = document.querySelector('.gwira-inspector-form input');
        const owner = document.querySelector('.gwira-inspector-form select');
        if (!(title instanceof HTMLInputElement) || !(owner instanceof HTMLSelectElement)) throw new Error('F3 capture failed: create form did not open');
        const setTitle = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setTitle?.call(title, 'Capture: new local task');
        title.dispatchEvent(new Event('input', { bubbles: true }));
        const setOwner = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setOwner?.call(owner, 'person:11111111-1111-4111-8111-111111111111');
        owner.dispatchEvent(new Event('change', { bubbles: true }));
        [...document.querySelectorAll('.gwira-inspector-form button')].find((button) => button.textContent?.trim() === 'Create work')?.click();
        await wait(240);
      }
      activeWorkspaceTab = document.querySelector('.global-tab.is-active .global-tab__select')?.textContent?.trim() ?? '';
    }
    await wait(100);
    const modelEdges = Number(document.querySelector('.gwira-workflow-canvas__interaction')?.getAttribute('data-edge-count') ?? 0);
    for (let attempt = 0; attempt < 20 && document.querySelectorAll('.react-flow__edge').length !== modelEdges; attempt += 1) await wait(50);
    const interaction = document.querySelector('.gwira-workflow-canvas__interaction');
    const interactionBounds = interaction?.getBoundingClientRect();
    const nodesFit = interactionBounds ? [...document.querySelectorAll('.react-flow__node')].every((node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.top >= interactionBounds.top - 1 && bounds.left >= interactionBounds.left - 1
        && bounds.bottom <= interactionBounds.bottom + 1 && bounds.right <= interactionBounds.right + 1;
    }) : document.querySelectorAll('.react-flow__node').length === 0;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return {
      canvas: document.querySelector('[data-testid="workflow-canvas"]') instanceof HTMLElement,
      nodes: document.querySelectorAll('.gwira-work-node').length,
      edges: document.querySelectorAll('.react-flow__edge').length,
      modelEdges,
      nodesFit,
      timeline: (() => {
        const root = document.querySelector('.gwira-timeline');
        if (!root) return undefined;
        const scroller = root.querySelector('.gwira-timeline__scroller');
        const panel = document.querySelector('#gwira-workflow-panel');
        const scrollerBounds = scroller?.getBoundingClientRect();
        const panelBounds = panel instanceof HTMLElement && !panel.hidden ? panel.getBoundingClientRect() : undefined;
        return {
          rows: root.querySelectorAll('.gwira-timeline__row:not(.is-group)').length,
          groups: root.querySelectorAll('.gwira-timeline__row.is-group').length,
          bars: root.querySelectorAll('.gwira-timeline__bar').length,
          markers: root.querySelectorAll('.gwira-timeline__marker').length,
          empty: Boolean(root.querySelector('.gwira-timeline__empty')),
          selectedRows: root.querySelectorAll('.gwira-timeline__row.is-selected').length,
          zoom: root.getAttribute('data-timeline-zoom'),
          overlapsPanel: Boolean(scrollerBounds && panelBounds && scrollerBounds.right > panelBounds.left + 1),
          nameWidth: Math.round(root.querySelector('.gwira-timeline__corner')?.getBoundingClientRect().width ?? 0),
          rootWidth: Math.round(root.getBoundingClientRect().width),
          stickyUpperOk: (() => { const corner = root.querySelector('.gwira-timeline__corner'); const edge = corner?.getBoundingClientRect().right ?? 0; const limit = scrollerBounds?.right ?? 0; return [...root.querySelectorAll('.gwira-timeline__tier:not(.is-lower) b')].some((label) => { const box = label.getBoundingClientRect(); return box.left >= edge - 1 && box.left < limit; }); })(),
          toolbarHeight: Math.round(root.querySelector('.gwira-timeline__toolbar')?.getBoundingClientRect().height ?? 0),
          scrollerHeight: Math.round(scrollerBounds?.height ?? 0),
          horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
          fixtureLabel: Boolean(root.querySelector('.gwira-timeline__source')),
          heading: (() => { const h1 = document.querySelector('[data-testid="dashboard-title"]'); return h1 ? { text: h1.textContent, clipped: h1.scrollHeight > h1.clientHeight + 1 || h1.scrollWidth > h1.clientWidth + 1, lines: Math.round(h1.getBoundingClientRect().height / 20) } : null; })(),
          toolbarRows: new Set([...root.querySelectorAll('.gwira-timeline__toolbar > *')].filter((node) => node.getBoundingClientRect().height > 0).map((node) => { const box = node.getBoundingClientRect(); return Math.round((box.top + box.height / 2) / 14); })).size,
          toolbarOverflow: (() => { const bar = root.querySelector('.gwira-timeline__toolbar'); return bar ? bar.scrollWidth > bar.clientWidth + 1 : false; })(),
          titles: [...root.querySelectorAll('.gwira-timeline__row [data-task-id] .gwira-timeline__title')].map((node) => node.textContent),
          undrawnLegend: root.querySelector('.gwira-timeline__legend')?.textContent ?? '',
          dependencyWarning: root.parentElement?.querySelector('.gwira-timeline__dependency-warning')?.textContent ?? root.querySelector('.gwira-timeline__dependency-warning')?.textContent ?? null,
          unscheduledCount: root.querySelector('.gwira-timeline__row.is-unscheduled .gwira-timeline__count')?.textContent ?? null,
          links: root.querySelectorAll('[data-link-id]').length,
          conflictLinks: root.querySelectorAll('.gwira-timeline__link.is-conflict').length,
          relatedLinks: root.querySelectorAll('.gwira-timeline__link.is-related').length,
          activeLink: root.querySelector('.gwira-timeline__link.is-active')?.getAttribute('data-link-id') ?? null,
          dependencyStrip: root.querySelector('.gwira-timeline__dependency')?.textContent ?? null,
          plannedBands: root.querySelectorAll('.gwira-timeline__planned').length,
          loadSegments: root.querySelectorAll('.gwira-timeline__load').length,
          parallelLabels: [...root.querySelectorAll('.gwira-timeline__parallel')].map((node) => node.textContent),
          linkLayerInside: (() => { const svg = root.querySelector('.gwira-timeline__links'); const body = root.querySelector('.gwira-timeline__body'); if (!svg || !body) return true; const a = svg.getBoundingClientRect(); const b = body.getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; })(),
          checks: window.__timelineChecks ?? {},
          workflowCanvas: Boolean(document.querySelector('[data-testid="workflow-canvas"]'))
        };
      })(),
      nodeBounds: interactionBounds ? {
        canvas: { top: interactionBounds.top, right: interactionBounds.right, bottom: interactionBounds.bottom, left: interactionBounds.left },
        nodes: [...document.querySelectorAll('.react-flow__node')].map((node) => {
          const bounds = node.getBoundingClientRect();
          return { id: node.getAttribute('data-id'), top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
        })
      } : undefined,
      empty: document.querySelector('[data-testid="workflow-empty"]') instanceof HTMLElement,
      workspaceEmpty: document.querySelector('[data-testid="dashboard-empty-composer"]') instanceof HTMLElement,
      objective: document.querySelector('.gwira-dashboard-header__objective h1')?.textContent ?? document.querySelector('.gwira-workflow-objective strong')?.textContent,
      selected: document.querySelector('.gwira-workflow-panel__header > div > span')?.textContent,
      activeView: document.querySelector('.workspace__view:not([hidden]) .gwira-dashboard')?.getAttribute('data-dashboard-view') ?? document.querySelector('.workspace')?.getAttribute('data-workspace-view'),
      activeRoute: document.querySelector('.workspace')?.getAttribute('data-workspace-view'),
      activeWorkspaceTab,
      globalTabs: document.querySelectorAll('.global-tab').length,
      destinationPickerOpen: document.querySelector('.global-popover--picker') instanceof HTMLElement,
      inspectorMode: document.querySelector('#gwira-workflow-panel .gwira-workflow-panel__header h2')?.textContent?.trim(),
      activeContextTab: document.querySelector('#gwira-workflow-panel [role="tab"][aria-selected="true"]')?.id.replace('context-tab-', ''),
      panelVisible: (() => { const panel = document.querySelector('#gwira-workflow-panel'); return panel instanceof HTMLElement && !panel.hidden && panel.getBoundingClientRect().width > 0; })(),
      panelWidth: document.querySelector('#gwira-workflow-panel')?.getBoundingClientRect().width ?? 0,
      canvasWidth: document.querySelector('.gwira-workflow-canvas__interaction')?.getBoundingClientRect().width ?? 0,
      unsupportedViewDisabled: (() => {
        const button = requestedDashboardView ? document.querySelector('[data-dashboard-view="' + requestedDashboardView + '"][role="tab"]') : undefined;
        return button instanceof HTMLButtonElement && button.disabled;
      })(),
      shell: (() => {
        const box = (selector) => { const bounds = document.querySelector(selector)?.getBoundingClientRect(); return bounds ? { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right } : null; };
        return {
          topbars: document.querySelectorAll('.global-topbar').length,
          sidebars: document.querySelectorAll('.gwira-two-layer-sidebar').length,
          legacyTabbars: document.querySelectorAll('.workspace-tabbar, .window-toolbar, .gwira-sidebar-rail').length,
          topbar: box('.global-topbar'), sidebar: box('.gwira-two-layer-sidebar'), workspace: box('.workspace'), taskDetails: box('.gwira-task-details'),
          sidebarCollapsed: document.querySelector('.gwira-two-layer-sidebar')?.classList.contains('is-collapsed') === true,
          topbarControls: ['Back', 'Forward', 'Collapse sidebar', 'Expand sidebar', 'Open a new tab', 'Search Gwira', 'Collapse context panel', 'Expand context panel'].filter((label) => document.querySelector('.global-topbar [aria-label="' + label + '"]')),
          notifications: document.querySelector('.global-topbar [aria-label^="Notifications"]') instanceof HTMLElement,
          navLabels: [...document.querySelectorAll('.gwira-secondary-sidebar [data-navigation-view]')].map((item) => item.textContent?.trim())
        };
      })(),
      layoutBounds: Object.fromEntries(['.shell', '.global-topbar', '.workspace', '.workspace__route', '.workspace__view:not([hidden])', '.gwira-dashboard', '.gwira-dashboard__main', '.gwira-workflow-body', '.gwira-workflow-canvas__interaction'].map((selector) => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return [selector, bounds ? { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left } : null];
      })),
      expandedCanvasWidth,
      reopenedContextTab,
      reopenedSelection,
      keyboardUnsupportedViewBlocked,
      preview: document.querySelector('[data-testid="dashboard-view-preview"]') instanceof HTMLElement,
      createdTask: (() => { try { return JSON.parse(localStorage.getItem('gwira.local-prototype.v1') ?? '{}').tasks?.some((task) => task.title === 'Capture: new local task') ?? false; } catch { return false; } })(),
      draftSurvivedTabSwitch: document.querySelector('.gwira-inspector-form input')?.value === 'Draft survives switching tabs'
    };
  })()`);
  const emptyFixture = new URL(rendererDevUrl ?? 'http://127.0.0.1').searchParams.get('canvasFixture') === 'empty';
  const f3Scenario = process.env.ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO;
  const expectedView = f3Scenario === 'task-tab' || f3Scenario === 'task-inspector' ? 'my-work' : f3Scenario?.startsWith('nav-') ? f3Scenario.slice(4) : f3Scenario && ['home', 'home-expanded', 'home-collapsed', 'tab-home'].includes(f3Scenario) ? 'home' : process.env.ELECTRON_WORKFLOW_CAPTURE_VIEW || 'workflow';
  const emptyWorkspace = process.env.ELECTRON_WORKFLOW_CAPTURE_EMPTY === '1' || f3Scenario === 'empty';
  if (expectedView === 'workflow') {
    if (emptyWorkspace ? !result.workspaceEmpty || result.nodes !== 0 : !result.canvas || (emptyFixture ? !result.empty || result.nodes !== 0 : result.nodes === 0)) {
      throw new Error(`Workflow capture failed: expected graph/empty state did not mount (${JSON.stringify({ canvas: result.canvas, empty: result.empty, workspaceEmpty: result.workspaceEmpty, nodes: result.nodes, activeView: result.activeView })})`);
    }
  } else if (expectedView !== 'timeline' && expectedView !== 'my-work' && expectedView !== 'home' && !f3Scenario?.startsWith('nav-') && !result.preview) {
    throw new Error(`Dashboard capture failed: ${expectedView} did not render an explicit preview state`);
  }
  if (!capturePath) throw new Error('Workflow capture failed: screenshot destination was not configured');
  if (expectedView === 'workflow' && !result.nodesFit) throw new Error(`Workflow capture failed: graph nodes exceed the canvas viewport (${JSON.stringify({ nodeBounds: result.nodeBounds, layoutBounds: result.layoutBounds })})`);
  if (expectedView === 'timeline') {
    if (!result.timeline) throw new Error('Timeline capture failed: Timeline did not mount');
    if (result.timeline.workflowCanvas) throw new Error('Timeline capture failed: the Workflow canvas is still mounted');
    if (result.timeline.overlapsPanel) throw new Error('Timeline capture failed: the schedule overlaps the inspector');
  }
  if (process.env.ELECTRON_WORKFLOW_SELECT_ID && !result.selected) throw new Error('Workflow capture failed: selected work inspector did not open');
  if (result.activeView !== expectedView) throw new Error(`Dashboard capture failed: active view was ${result.activeView}, expected ${expectedView}`);
  if (!f3Scenario && !result.timeline?.checks?.inspector && (process.env.ELECTRON_WORKFLOW_CAPTURE_PANEL === 'collapsed' ? result.panelVisible : !result.panelVisible)) {
    throw new Error(`Dashboard capture failed: context panel visibility did not match ${process.env.ELECTRON_WORKFLOW_CAPTURE_PANEL ?? 'expanded'}`);
  }
  if (process.env.ELECTRON_WORKFLOW_CAPTURE_TAB && result.activeContextTab !== process.env.ELECTRON_WORKFLOW_CAPTURE_TAB) {
    throw new Error(`Dashboard capture failed: selected context tab was ${result.activeContextTab}, expected ${process.env.ELECTRON_WORKFLOW_CAPTURE_TAB}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  console.log(`ELECTRON_WORKFLOW_CAPTURE_RESULT ${JSON.stringify(result)}`);
  app.exit(0);
}


async function runNodeGalleryCapture(window: BrowserWindow): Promise<void> {
  const paths = [
    { value: process.env.ELECTRON_NODE_GALLERY_1280_PATH, width: 1280, height: 800 },
    { value: process.env.ELECTRON_NODE_GALLERY_1440_PATH, width: 1440, height: 900 },
    { value: process.env.ELECTRON_NODE_GALLERY_MIN_PATH, width: 980, height: 680 }
  ];
  const isGallery = await window.webContents.executeJavaScript(`document.querySelector('[data-testid="node-gallery"]') instanceof HTMLElement`);
  if (!isGallery) throw new Error('Node gallery capture failed: /dev/nodes was not mounted');
  const nodeCount = await window.webContents.executeJavaScript(`document.querySelectorAll('.gwira-graph-node').length`);
  if (nodeCount !== 0) throw new Error(`Node gallery capture failed: gallery must not mount graph nodes, received ${nodeCount}`);
  if (process.env.ELECTRON_NODE_GALLERY_ZOOM === '200') {
    await window.webContents.executeJavaScript(`document.querySelector('.gwira-node-gallery__zoom button:last-child')?.click()`);
  }
  for (const capture of paths) {
    if (!capture.value) continue;
    window.setSize(capture.width, capture.height);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.writeFile(capture.value, (await window.webContents.capturePage()).toPNG());
  }
  console.log('ELECTRON_NODE_GALLERY_CAPTURE_RESULT');
  app.exit(0);
}

async function prepareBenchmarkProjects(window: BrowserWindow): Promise<string[]> {
  const projectPaths = (process.env.ELECTRON_BENCHMARK_PROJECTS || '').split(path.delimiter).filter(Boolean);
  const projectState = {
    projects: projectPaths.map((projectPath, index) => ({ id: projectPath, path: projectPath, name: `Benchmark Project ${index + 1}` })),
    activeProjectId: projectPaths[0]
  };
  await window.webContents.executeJavaScript(`localStorage.setItem('codex-desktop.projects.v1', ${JSON.stringify(JSON.stringify(projectState))}); location.reload();`);
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 150));
  return projectPaths;
}

async function runHistoryBenchmark(window: BrowserWindow): Promise<void> {
  const projectPaths = await prepareBenchmarkProjects(window);
  await window.webContents.executeJavaScript(`(async () => {
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'New chat')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
  })()`);
  const mainBefore = process.memoryUsage();
  const startedAt = performance.now();
  const result = await window.webContents.executeJavaScript(`(async () => {
    const projects = ${JSON.stringify(projectPaths)};
    const heap = () => performance.memory ? performance.memory.usedJSHeapSize : undefined;
    const rendererBefore = heap();
    const loadStart = performance.now();
    const concurrent = await Promise.all(projects.map((project) => window.codexDesktop.listHistories(project)));
    const initialLoadMs = performance.now() - loadStart;
    const refreshStart = performance.now();
    for (let round = 0; round < 8; round += 1) {
      await Promise.all(projects.map((project) => window.codexDesktop.listHistories(project)));
    }
    const repeatedRefreshMs = performance.now() - refreshStart;
    const history = concurrent.find((entries) => entries.length > 0)?.[0];
    if (!history) throw new Error('Synthetic history was not found');
    const resumeStart = performance.now();
    const session = await window.codexDesktop.resumeSession({ cwd: history.cwd, codexConversationId: history.id, title: history.title, filePath: history.filePath });
    const restored = await window.codexDesktop.getSession(session.id);
    const resumeMs = performance.now() - resumeStart;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      rendererBefore,
      rendererAfter: heap(),
      initialLoadMs,
      repeatedRefreshMs,
      resumeMs,
      loadedHistories: concurrent.reduce((total, entries) => total + entries.length, 0),
      restoredMessages: restored?.messages.length || 0,
      responsive: document.querySelector('textarea') !== null
    };
  })()`);
  global.gc?.();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mainAfter = process.memoryUsage();
  console.log(`ELECTRON_HISTORY_BENCHMARK_RESULT ${JSON.stringify({ ...result, elapsedMs: performance.now() - startedAt, mainBeforeHeap: mainBefore.heapUsed, mainAfterHeap: mainAfter.heapUsed, mainPeakRss: Math.max(mainBefore.rss, mainAfter.rss) })}`);
  app.exit(0);
}

async function runAgentLifecycleTest(window: BrowserWindow): Promise<void> {
  const projectPaths = await prepareBenchmarkProjects(window);
  const project = projectPaths[0];
  const result = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
    const click = (label) => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
      if (!button) throw new Error('Missing button: ' + label);
      button.click();
    };
    const clickNavigation = async (view) => {
      let button = document.querySelector(':is(.gwira-secondary-sidebar, .gwira-primary-rail) button[data-navigation-view="' + view + '"]');
      if (!button) {
        // Secondary destinations live in the rail's More menu.
        if (!document.querySelector('.gwira-more-menu')) { document.querySelector('button[aria-label="More"]')?.click(); await new Promise((resolve) => setTimeout(resolve, 60)); }
        button = document.querySelector('.gwira-more-menu button[data-navigation-view="' + view + '"]');
      }
      if (!button) throw new Error('Missing navigation destination: ' + view + ' menu=' + !!document.querySelector('.gwira-more-menu') + ' items=' + [...document.querySelectorAll('.gwira-more-menu button')].map((b) => b.textContent).join(','));
      button.click();
    };
    const setValue = (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Exercise the actual renderer workflow using the mock local Codex binary.
    click('Teams'); await wait();
    let form = document.querySelector('.gwira-workspace-form');
    setValue(form.querySelector('input'), 'Test founder');
    setValue(form.querySelectorAll('input')[1], 'Founder');
    form.querySelector('button[type="submit"]').click(); await wait();
    await clickNavigation('agents'); await wait();
    form = document.querySelector('.gwira-workspace-form');
    setValue(form.querySelector('input'), 'Test coding agent');
    form.querySelector('button[type="submit"]').click(); await wait();
    click('My Work'); await wait();
    click('Link Benchmark Project 1'); await wait();
    click('New task'); await wait();
    form = document.querySelector('.gwira-task-form');
    setValue(form.querySelector('input'), 'Mock coding workflow');
    const projectSelect = [...form.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Project'))?.querySelector('select');
    const assigneeSelect = [...form.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Assignee'))?.querySelector('select');
    setValue(projectSelect, projectSelect.options[1].value);
    setValue(assigneeSelect, assigneeSelect.options[2].value);
    form.querySelector('button[type="submit"]').click(); await wait();
    document.querySelector('.gwira-task-card').click(); await wait();
    click('Run coding task');
    let approvalReady = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await wait(30);
      if ([...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Approve')) { approvalReady = true; break; }
    }
    if (!approvalReady) throw new Error('Coding task did not reach approval');
    click('Approve'); await wait();
    const workflowDone = [...document.querySelectorAll('.gwira-my-work__column')].some((column) => column.querySelector('h2')?.textContent?.includes('done') && column.textContent?.includes('Mock coding workflow'));
    const events = [];
    const exits = [];
    const removeOutput = window.codexDesktop.onOutput((event) => events.push(event));
    const removeExit = window.codexDesktop.onExit((event) => exits.push(event));
    await clickNavigation('home');
    await new Promise((resolve) => setTimeout(resolve, 25));
    click('New work');
    await new Promise((resolve) => setTimeout(resolve, 25));
    const permissionButton = document.querySelector('button[aria-label="permission"]');
    permissionButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const fullAccessButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Full access'));
    fullAccessButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const fullAccessConfirmation = document.querySelector('#full-access-title')?.textContent === 'Enable Full Access?';
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Keep workspace write')?.click();
    const session = await window.codexDesktop.startSession({ cwd: ${JSON.stringify(project)} });
    await window.codexDesktop.sendInput({ sessionId: session.id, input: 'simple task' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const finished = await window.codexDesktop.getSession(session.id);
    let persisted = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      persisted = await window.codexDesktop.listHistories(${JSON.stringify(project)});
      if (persisted.some((history) => history.id === finished.codexConversationId)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const resumed = await window.codexDesktop.resumeSession({ cwd: ${JSON.stringify(project)}, codexConversationId: finished.codexConversationId, title: 'simple task' });
    await window.codexDesktop.sendInput({ sessionId: resumed.id, input: 'slow task' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await window.codexDesktop.stopSession({ sessionId: resumed.id });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stopped = await window.codexDesktop.getSession(resumed.id);
    const failed = await window.codexDesktop.startSession({ cwd: ${JSON.stringify(project)} });
    await window.codexDesktop.sendInput({ sessionId: failed.id, input: 'fail task' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const failedSession = await window.codexDesktop.getSession(failed.id);
    removeOutput();
    removeExit();
    return {
      defaultPermission: session.permissionMode,
      fullAccessConfirmation,
      streamed: events.some((event) => event.role === 'codex'),
      conversationId: finished.codexConversationId,
      persisted: persisted.some((history) => history.id === finished.codexConversationId),
      persistedHistoryCount: persisted.length,
      resumed: Boolean(resumed.codexConversationId),
      stoppedStatus: stopped?.status,
      errorStatus: failedSession?.status,
      errorText: failedSession?.error,
      exitCount: exits.length,
      workflowDone
    };
  })()`);
  const mainHistories = await listCodexHistories();
  console.log(`ELECTRON_AGENT_LIFECYCLE_RESULT ${JSON.stringify({ ...result, mainHistoryCount: mainHistories.length, mainHistoryCwds: mainHistories.map((history) => history.cwd) })}`);
  app.exit(0);
}

async function runSmokeTest(window: BrowserWindow): Promise<void> {
  const projectPaths = (process.env.ELECTRON_SMOKE_PROJECTS || '').split(path.delimiter).filter(Boolean);
  const projectState = {
    projects: projectPaths.map((projectPath, index) => ({ id: projectPath, path: projectPath, name: `Smoke Project ${index + 1}` })),
    activeProjectId: projectPaths[0]
  };
  await window.webContents.executeJavaScript(`localStorage.setItem('codex-desktop.projects.v1', ${JSON.stringify(JSON.stringify(projectState))}); location.reload();`);
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
    const clickButton = (label) => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
      if (!button) throw new Error('Missing button: ' + label);
      button.click();
    };
    const clickNavigation = async (view) => {
      let button = document.querySelector(':is(.gwira-secondary-sidebar, .gwira-primary-rail) button[data-navigation-view="' + view + '"]');
      if (!button) {
        // Secondary destinations live in the rail's More menu.
        if (!document.querySelector('.gwira-more-menu')) { document.querySelector('button[aria-label="More"]')?.click(); await new Promise((resolve) => setTimeout(resolve, 60)); }
        button = document.querySelector('.gwira-more-menu button[data-navigation-view="' + view + '"]');
      }
      if (!button) throw new Error('Missing navigation destination: ' + view + ' menu=' + !!document.querySelector('.gwira-more-menu') + ' items=' + [...document.querySelectorAll('.gwira-more-menu button')].map((b) => b.textContent).join(','));
      button.click();
    };
    const clickRail = (label) => {
      const button = document.querySelector('button[aria-label="' + label + '"]');
      if (!button) throw new Error('Missing rail control: ' + label);
      button.click();
    };
    await wait(500);
    if (document.querySelector('.sidebar-recent .sidebar-shortcut-item')) throw new Error('Recent section should start collapsed');
    const recentHeading = document.querySelector('.sidebar-recent .sidebar-collapsible-heading');
    recentHeading?.click(); await wait();
    if (document.querySelectorAll('.sidebar-recent .sidebar-shortcut-item').length < 2) throw new Error('Sidebar Recent did not populate from history');
    if (![...document.querySelectorAll('.sidebar-recent .sidebar-item-title')].some((item) => item.textContent === 'Untitled conversation')) throw new Error('Sidebar did not sanitize malformed history titles');
    recentHeading?.click(); await wait();
    if (document.querySelector('.sidebar-recent .sidebar-shortcut-item')) throw new Error('Recent section did not collapse');
    recentHeading?.click(); await wait();
    const projectHeader = document.querySelector('.projects-header');
    const projectsHeading = document.querySelector('.projects-header-toggle');
    const projectHeaderActions = document.querySelector('.projects-header-actions');
    if (!(projectHeader instanceof HTMLElement) || !(projectsHeading instanceof HTMLButtonElement) || !(projectHeaderActions instanceof HTMLElement)) throw new Error('Projects header is not a unified row');
    if (!projectHeader.contains(projectsHeading) || !projectHeader.contains(projectHeaderActions)) throw new Error('Projects header controls are not grouped in one container');
    if (getComputedStyle(projectHeaderActions).opacity !== '0') throw new Error('Projects header actions must be hidden by default');
    projectsHeading?.click(); await wait();
    document.querySelector('button[aria-label="Projects section options"]')?.click(); await wait();
    [...document.querySelectorAll('.sidebar-context-menu button')].find((button) => button.textContent?.includes('Sort chats by'))?.click(); await wait();
    clickButton('Name'); await wait();
    const pinButton = document.querySelector('.history-thread .pin-thread-button');
    if (!(pinButton instanceof HTMLButtonElement)) throw new Error('Sidebar history pin control is missing');
    pinButton.click(); await wait();
    if (!document.querySelector('.sidebar-favorites .sidebar-shortcut-item')) throw new Error('Pinned history did not appear in Favorites');
    document.querySelector('button[aria-label="Pinned options"]')?.click(); await wait();
    if (!document.querySelector('.sidebar-context-menu')?.textContent?.includes('Manual order')) throw new Error('Pinned options menu did not open');
    clickButton('Manual order'); await wait();
    const unpinButton = document.querySelector('.sidebar-favorites .pin-thread-button');
    if (!(unpinButton instanceof HTMLButtonElement)) throw new Error('Favorite unpin control is missing');
    unpinButton.click(); await wait();
    if (document.querySelector('.sidebar-favorites')) throw new Error('Unpinned item remained in Favorites');
    const repinButton = document.querySelector('.sidebar-recent .pin-thread-button');
    if (!(repinButton instanceof HTMLButtonElement)) throw new Error('Recent history pin control disappeared after unpinning');
    repinButton.click(); await wait();
    if (!document.querySelector('.sidebar-favorites .sidebar-shortcut-item')) throw new Error('Repinned history did not return to Favorites');
    document.querySelector('.sidebar-recent .sidebar-shortcut-item')?.click(); await wait();
    if (!document.querySelector('textarea')) throw new Error('Recent item did not open its conversation');
    const pills = [...document.querySelectorAll('.project-pill')];
    if (pills.length !== 2) throw new Error('Expected two smoke projects');
    if (pills.some((pill) => pill.querySelector('.disclosure'))) throw new Error('Project rows still render disclosure chevrons');
    if (pills.some((pill) => !pill.querySelector('.folder-icon'))) throw new Error('Project rows are missing folder state icons');
    const addProject = document.querySelector('button[aria-label="Add project"]');
    if (!(addProject instanceof HTMLButtonElement)) throw new Error('Projects heading add control is missing');
    if ([...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Add project')) throw new Error('Duplicate bottom Add project control is still rendered');
    addProject.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (document.querySelectorAll('.project-pill').length !== 3) throw new Error('Project creation did not add the selected directory');
    const projectPills = [...document.querySelectorAll('.project-pill')];
    projectPills[1].click();
    await wait();
    if (document.querySelector('.new-thread-row')) throw new Error('Projects must not render permanent New chat rows');
    const projectNewChat = projectPills[1].querySelector('.project-new-chat-button');
    if (!(projectNewChat instanceof HTMLButtonElement)) throw new Error('Project New chat control is missing');
    projectNewChat.click();
    await wait();
    if (!document.querySelectorAll('.project-pill')[1].classList.contains('active')) throw new Error('Project switching did not activate the selected project');
    await clickNavigation('skills');
    await wait();
    if (document.querySelector('.workspace__view:not([hidden]) h1')?.textContent !== 'Skills') throw new Error('Skills navigation failed');
    for (const [view, label, headings] of [
      ['dashboard', 'Dashboard', ['Workflows for My workspace']],
      ['inbox', 'Inbox', ['Inbox']], ['my-work', 'My Work', ['My Work']], ['organization', 'Views', ['Organization']],
      ['teams', 'Teams', ['Teams']], ['doats', 'Doats', ['Doats']], ['agents', 'Coding agents', ['Agents']],
      ['integrations', 'Integrations', ['Integrations']], ['settings', 'Settings', ['Settings']]
    ]) {
      await clickNavigation(view);
      await wait();
      if (!headings.includes(document.querySelector('.workspace__view:not([hidden]) h1')?.textContent || '')) throw new Error(label + ' navigation failed');
      if (!(document.querySelector('.gwira-secondary-sidebar button[data-navigation-view="' + view + '"]') ?? document.querySelector('button[aria-label="Workspace"]'))?.classList.contains('active')) throw new Error(label + ' navigation state failed');
      const page = document.querySelector('.workspace__view:not([hidden]) .gwira-dashboard, .workspace__view:not([hidden]) .gwira-home, .workspace__view:not([hidden]) .gwira-inbox, .workspace__view:not([hidden]) .gwira-my-work, .workspace__view:not([hidden]) .gwira-workspace-page, .workspace__view:not([hidden]) .gwira-doat-directory, .workspace__view:not([hidden]) .gwira-organization-page, .workspace__view:not([hidden]) .gwira-integrations-page, .workspace__view:not([hidden]) .gwira-onboarding-page');
      if (!page || page.getBoundingClientRect().height < 300) throw new Error(label + ' did not fill the workspace');
    }
    await clickNavigation('home'); await wait(); clickButton('Library'); await wait();
    if (document.querySelector('.gwira-library h1')?.textContent !== 'Library') throw new Error('Library route did not open the knowledge hub');
    if (document.querySelector('.gwira-home')) throw new Error('Library incorrectly rendered Dashboard');
    if (!document.querySelector('button[data-navigation-view="library"]')?.classList.contains('active')) throw new Error('Library destination did not stay selected');
    const libraryHeading = document.querySelector('.gwira-library h1');
    if (!(libraryHeading instanceof HTMLElement) || libraryHeading.getBoundingClientRect().top < 0 || libraryHeading.getBoundingClientRect().height < 20) throw new Error('Library heading is clipped');
    if (document.querySelector('.gwira-library')?.getBoundingClientRect().height < 300) throw new Error('Library did not fill the workspace');
    const firstLibraryDocument = document.querySelector('.library-document-title');
    if (!(firstLibraryDocument instanceof HTMLButtonElement)) throw new Error('Library sample document is missing');
    firstLibraryDocument.click(); await wait();
    if (!document.querySelector('.gwira-document')) throw new Error('Library document view did not open');
    clickButton('← Library'); await wait();
    if (!document.querySelector('.gwira-library')) throw new Error('Library document view did not return to hub');
    const createPrimary = document.querySelector('.library-create-primary');
    if (!(createPrimary instanceof HTMLButtonElement) || !document.querySelector('.library-create-toggle')) throw new Error('Library Create split button is missing');
    createPrimary.click(); await wait();
    if (!document.querySelector('.gwira-document')) throw new Error('Create did not create a document');
    clickButton('← Library'); await wait();
    document.querySelector('button[aria-label="Create options"]')?.click(); await wait(); clickButton('New folder'); await wait();
    document.querySelector('button[aria-label="Create options"]')?.click(); await wait(); clickButton('Upload files'); await wait();
    clickButton('Folders'); await wait();
    if (!document.querySelector('.library-table-wrap')?.textContent?.includes('Untitled folder')) throw new Error('Folder creation or Folder tab failed');
    clickButton('All'); await wait();
    const filterButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '☷ Filters');
    filterButton?.click(); await wait();
    if (!document.querySelector('.library-filter-menu')) throw new Error('Library filter menu did not open');
    [...document.querySelectorAll('.library-filter-options label')].find((label) => label.textContent?.trim() === 'Favorites')?.querySelector('input')?.click(); await wait();
    clickButton('Apply'); await wait();
    if (!document.querySelector('.library-filter-chips')?.textContent?.includes('Favorites')) throw new Error('Library filters failed');
    const search = document.querySelector('input[aria-label="Search library"]');
    if (!(search instanceof HTMLInputElement)) throw new Error('Library search input is missing');
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(search, 'no such document'); search.dispatchEvent(new Event('input', { bubbles: true })); await wait();
    if (!document.querySelector('.library-empty')?.textContent?.includes('No matching documents.')) throw new Error('Library search empty state failed');
    clickButton('Clear filters'); await wait();
    const sort = document.querySelector('button[aria-label="Sort library"]');
    if (!(sort instanceof HTMLButtonElement)) throw new Error('Library sort control is missing');
    sort.click(); await wait();
    if (!document.querySelector('.library-sort-menu') || document.querySelector('.library-filter-menu')) throw new Error('Library menus did not coordinate');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await wait();
    if (!(document.activeElement instanceof HTMLButtonElement) || document.activeElement.textContent?.trim() !== 'Name A–Z') throw new Error('Library sort keyboard navigation failed');
    clickButton('Name A–Z'); await wait();
    if (!sort.textContent?.includes('Name A–Z')) throw new Error('Library sorting failed');
    document.querySelector('button[aria-label="Create options"]')?.click(); await wait();
    if (!document.querySelector('.library-create-menu')) throw new Error('Create menu did not open');
    document.querySelector('button[aria-label="Sort library"]')?.click(); await wait();
    if (document.querySelector('.library-create-menu')) throw new Error('Create and Sort menus opened together');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await wait();
    if (document.querySelector('.library-sort-menu')) throw new Error('Outside click did not close Library menu');
    document.querySelector('button[aria-label="Sort library"]')?.click(); await wait();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
    if (document.querySelector('.library-sort-menu')) throw new Error('Escape did not close Library menu');
    await clickNavigation('library'); await wait();
    if (!document.querySelector('button[data-navigation-view="library"]')?.classList.contains('active') || document.querySelectorAll('.library-document-title').length !== 9) throw new Error('Library did not reuse persisted records');
    await clickNavigation('home');
    await wait();
    if (!document.querySelector('textarea') || !document.querySelector('button[data-navigation-view="home"]')?.classList.contains('active')) throw new Error('Home did not open the working environment');
    await clickNavigation('dashboard');
    await wait();
    const back = document.querySelector('button[aria-label="Back"]');
    const forward = document.querySelector('button[aria-label="Forward"]');
    if (!(back instanceof HTMLButtonElement) || back.disabled) throw new Error('Back navigation did not become available');
    if (!(forward instanceof HTMLButtonElement) || !forward.disabled) throw new Error('Forward navigation should be unavailable before going back');
    back.click();
    await wait();
    if (!document.querySelector('button[data-navigation-view="home"]')?.classList.contains('active')) throw new Error('Back navigation did not restore Home');
    if (forward.disabled) throw new Error('Forward navigation did not become available');
    forward.click();
    await wait();
    if (!document.querySelector('button[data-navigation-view="dashboard"]')?.classList.contains('active')) throw new Error('Forward navigation did not restore Dashboard');
    const collapse = document.querySelector('button[aria-label="Collapse sidebar"]');
    collapse?.click();
    await wait();
    if (!document.querySelector('.gwira-two-layer-sidebar')?.classList.contains('is-collapsed') || !document.querySelector('.gwira-secondary-sidebar[hidden]')) throw new Error('Sidebar did not collapse');
    await clickNavigation('home');
    await wait();
    document.querySelector('button[aria-label="Expand sidebar"]')?.click();
    await wait();
    clickButton('New work');
    await wait();
    if (!document.querySelector('textarea')) throw new Error('New work navigation failed');
    if (!document.querySelector('button[data-navigation-view="home"]')?.classList.contains('active')) throw new Error('New work should remain in Home');
    if (document.querySelector('.thread-heading')?.textContent?.includes('New thread')) throw new Error('New work should not show a non-informative thread breadcrumb');
    if (document.querySelector('.new-thread-row')) throw new Error('Permanent project New chat row rendered after navigation');
    return {
      projects: pills.length,
      businessNavigation: true,
      workspaceNavigationCount: document.querySelectorAll('.gwira-secondary-sidebar [data-navigation-view]').length,
      newWorkAvailable: [...document.querySelectorAll('.gwira-secondary-sidebar button')].some((item) => item.textContent?.includes('New work'))
    };
  })()`);
  const savedSidebarFavorites = await window.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('gwira.sidebar.favorites.v1') || '{}')`);
  if (!Object.values(savedSidebarFavorites).some((value) => value === true)) throw new Error('Sidebar Favorites were not saved before reload');
  window.webContents.reload();
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  const sidebarFavoritePersistedAfterReload = await window.webContents.executeJavaScript(`(async () => {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      if (document.querySelector('.sidebar-favorites .sidebar-shortcut-item') instanceof HTMLElement) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  })()`);
  if (!sidebarFavoritePersistedAfterReload) throw new Error('Sidebar Favorites did not persist after reload');
  const libraryPersistedAfterReload = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('button[data-navigation-view="home"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Library')?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return document.querySelectorAll('.library-document-title').length === 9;
  })()`);
  if (!libraryPersistedAfterReload) throw new Error('Library records did not persist after reload');
  window.setSize(1000, 720);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const compactLayout = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('button[data-navigation-view="library"]')?.click();
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Library')?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const grid = document.querySelector('.library-collection-grid');
    if (!(grid instanceof HTMLElement)) return false;
    const firstTop = grid.children[0]?.getBoundingClientRect().top;
    const thirdTop = grid.children[2]?.getBoundingClientRect().top;
    const fourthTop = grid.children[3]?.getBoundingClientRect().top;
    return typeof firstTop === 'number' && typeof thirdTop === 'number' && typeof fourthTop === 'number' && Math.abs(thirdTop - firstTop) < 1 && fourthTop > firstTop && document.querySelector('.library-table-wrap') instanceof HTMLElement;
  })()`);
  if (!compactLayout) throw new Error('Library compact-width layout failed');
  window.setSize(1280, 840);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const projectHeaderDefaultScreenshotPath = process.env.ELECTRON_SMOKE_PROJECT_HEADER_DEFAULT_SCREENSHOT_PATH;
  const projectHeaderHoverScreenshotPath = process.env.ELECTRON_SMOKE_PROJECT_HEADER_HOVER_SCREENSHOT_PATH;
  if (projectHeaderDefaultScreenshotPath || projectHeaderHoverScreenshotPath) {
    await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('button[data-navigation-view="home"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
    })()`);
    if (projectHeaderDefaultScreenshotPath) await fs.writeFile(projectHeaderDefaultScreenshotPath, (await window.webContents.capturePage()).toPNG());
    if (projectHeaderHoverScreenshotPath) {
      const headerBounds = await window.webContents.executeJavaScript(`(() => { const header = document.querySelector('.projects-header'); if (!(header instanceof HTMLElement)) return undefined; const rect = header.getBoundingClientRect(); return { x: rect.left + Math.min(20, rect.width / 2), y: rect.top + rect.height / 2, scale: window.devicePixelRatio }; })()`);
      if (!headerBounds) throw new Error('Projects header was unavailable for hover capture');
      window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(headerBounds.x), y: Math.round(headerBounds.y) });
      await new Promise((resolve) => setTimeout(resolve, 120));
      let headerHoverVisible = await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.projects-header-actions')).opacity === '1'`);
      if (!headerHoverVisible && headerBounds.scale > 1) {
        window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(headerBounds.x * headerBounds.scale), y: Math.round(headerBounds.y * headerBounds.scale) });
        await new Promise((resolve) => setTimeout(resolve, 120));
        headerHoverVisible = await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.projects-header-actions')).opacity === '1'`);
      }
      // Synthetic pointer input does not set :hover on every Electron display
      // backend. Focus-within is the matching accessible state for this row.
      if (!headerHoverVisible) {
        await window.webContents.executeJavaScript(`document.querySelector('.projects-header-toggle')?.focus()`);
        await new Promise((resolve) => setTimeout(resolve, 180));
        headerHoverVisible = await window.webContents.executeJavaScript(`Number.parseFloat(getComputedStyle(document.querySelector('.projects-header-actions')).opacity) > .99`);
      }
      if (!headerHoverVisible) throw new Error('Projects header actions did not appear on hover');
      await fs.writeFile(projectHeaderHoverScreenshotPath, (await window.webContents.capturePage()).toPNG());
    }
  }
  const dashboardScreenshotPath = process.env.ELECTRON_SMOKE_DASHBOARD_SCREENSHOT_PATH;
  if (dashboardScreenshotPath) {
    const dashboardStatePrepared = await window.webContents.executeJavaScript(`(() => {
      const key = 'gwira.local-prototype.v1'; const raw = localStorage.getItem(key);
      if (!raw) return false;
      const state = JSON.parse(raw);
      state.onboarding = { ...state.onboarding, currentStep: 'complete', completedAt: state.onboarding.completedAt ?? new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(state)); return true;
    })()`);
    if (!dashboardStatePrepared) throw new Error('Dashboard screenshot capture failed: local Gwira state was unavailable');
    window.webContents.reload();
    await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
    await window.webContents.executeJavaScript(`(async () => {
      const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector('button[data-navigation-view="home"]')?.click();
      await wait();
      document.querySelector('button[data-navigation-view="dashboard"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!document.querySelector('.gwira-dashboard')) throw new Error('Dashboard screenshot capture failed: Dashboard page is not mounted');
      if (!(document.querySelector('button[aria-current="page"]')?.textContent?.includes('Dashboard'))) throw new Error('Dashboard screenshot capture failed: Dashboard navigation is not active');
      if (!(document.querySelector('textarea[aria-label="Ask Gwira anything"]') instanceof HTMLTextAreaElement)) throw new Error('Dashboard screenshot capture failed: empty Dashboard composer is missing');
      if (document.querySelector('.gwira-workflow-panel')) throw new Error('Dashboard screenshot capture failed: empty Dashboard panel should be hidden');
    })()`);
    await fs.writeFile(dashboardScreenshotPath, (await window.webContents.capturePage()).toPNG());
  }
  const screenshotPath = process.env.ELECTRON_SMOKE_SCREENSHOT_PATH;
  if (screenshotPath) {
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Pinned options"]')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 60));
    await fs.writeFile(screenshotPath, (await window.webContents.capturePage()).toPNG());
  }
  console.log(`ELECTRON_SMOKE_RESULT ${JSON.stringify(result)}`);
  app.exit(0);
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('Failed to create Codex Desktop window:', error);
  if (process.env.ELECTRON_SMOKE_TEST === '1' || process.env.ELECTRON_WORKFLOW_CAPTURE === '1') app.exit(1);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
