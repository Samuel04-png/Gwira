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
  const paths = [
    { value: process.env.ELECTRON_WORKFLOW_1280_PATH, width: 1280, height: 800 },
    { value: process.env.ELECTRON_WORKFLOW_1440_PATH, width: 1440, height: 900 }
  ];
  await new Promise((resolve) => setTimeout(resolve, 150));
  const prepared = await window.webContents.executeJavaScript(`(() => {
    const key = 'gwira.local-prototype.v1'; const raw = localStorage.getItem(key);
    if (!raw) return false;
    const state = JSON.parse(raw);
    state.onboarding = { version: 1, currentStep: 'complete', profile: { businessName: 'Workflow capture' }, completedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(state)); return true;
  })()`);
  if (!prepared) throw new Error('Workflow capture failed: local workspace state was unavailable');
  window.webContents.reload();
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    document.querySelector('button[aria-label="Workspace"]')?.click(); await wait(80);
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Dashboard')?.click(); await wait(180);
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_SCENARIO)} === 'marketing') {
      document.querySelector('.gwira-demo-menu summary')?.click(); await wait(25);
      [...document.querySelectorAll('.gwira-demo-menu button')].find((button) => button.textContent?.trim() === 'Marketing Campaign')?.click(); await wait(250);
    }
    const drillId = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_DRILL_ID)};
    if (drillId) { document.querySelector('[data-id="step:' + drillId + '"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await wait(250); }
    return {
      canvas: document.querySelector('[data-testid="workflow-canvas"]') instanceof HTMLElement,
      nodes: document.querySelectorAll('.gwira-graph-node').length,
      objective: document.querySelector('.gwira-workflow-objective strong')?.textContent
    };
  })()`);
  if (!result.canvas || result.nodes === 0) throw new Error('Workflow capture failed: canvas did not mount');
  for (const capture of paths) {
    if (!capture.value) continue;
    window.setSize(capture.width, capture.height);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await fs.writeFile(capture.value, (await window.webContents.capturePage()).toPNG());
  }
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
    const clickRail = (label) => {
      const button = document.querySelector('button[aria-label="' + label + '"]');
      if (!button) throw new Error('Missing rail control: ' + label);
      button.click();
    };
    const setValue = (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Exercise the actual renderer workflow using the mock local Codex binary.
    clickRail('Workspace'); await wait();
    click('Teams'); await wait();
    let form = document.querySelector('.gwira-workspace-form');
    setValue(form.querySelector('input'), 'Test founder');
    setValue(form.querySelectorAll('input')[1], 'Founder');
    form.querySelector('button[type="submit"]').click(); await wait();
    clickRail('More'); await wait(100);
    click('Agents'); await wait();
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
    clickRail('Home');
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
    pinButton.click(); await wait();
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
    clickRail('More');
    await wait(100);
    clickButton('Skills');
    await wait();
    if (document.querySelector('h1')?.textContent !== 'Skills') throw new Error('Skills navigation failed');
    for (const [label, headings, navigation] of [
      ['Dashboard', ['Dashboard', 'Set up Gwira for your business'], 'workspace'],
      ['Inbox', ['Inbox'], 'workspace'], ['My Work', ['My Work'], 'workspace'], ['Views', ['Organization'], 'workspace'], ['Teams', ['Teams'], 'workspace'], ['Doats', ['Doats'], 'workspace'], ['Integrations', ['Integrations'], 'workspace'],
      ['Agents', ['Agents'], 'more'], ['Settings', ['Settings'], 'more']
    ]) {
      if (navigation === 'rail') clickRail(label);
      else if (navigation === 'more') { clickRail('More'); await wait(100); clickButton(label); }
      else { clickRail('Workspace'); await wait(); clickButton(label); }
      await wait();
      if (!headings.includes(document.querySelector('h1')?.textContent || '')) throw new Error(label + ' navigation failed');
      const activeRailLabel = navigation === 'rail' ? label : 'Workspace';
      if (!document.querySelector('button[aria-label="' + activeRailLabel + '"]')?.classList.contains('active')) throw new Error(activeRailLabel + ' rail state failed');
      const page = document.querySelector('.gwira-home, .gwira-inbox, .gwira-my-work, .gwira-workspace-page, .gwira-doat-directory, .gwira-organization-page, .gwira-integrations-page, .gwira-onboarding-page');
      if (!page || page.getBoundingClientRect().height < 300) throw new Error(label + ' did not fill the workspace');
    }
    clickRail('Home'); await wait(); clickButton('Library'); await wait();
    if (document.querySelector('.gwira-library h1')?.textContent !== 'Library') throw new Error('Library route did not open the knowledge hub');
    if (document.querySelector('.gwira-home')) throw new Error('Library incorrectly rendered Dashboard');
    if (!document.querySelector('button[aria-label="Home"]')?.classList.contains('active')) throw new Error('Home Library did not preserve Home context');
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
    clickRail('Workspace'); await wait(); clickButton('Library'); await wait();
    if (!document.querySelector('button[aria-label="Workspace"]')?.classList.contains('active') || document.querySelectorAll('.library-document-title').length !== 9) throw new Error('Workspace Library did not reuse persisted Library data');
    clickRail('Home');
    await wait();
    if (!document.querySelector('textarea') || !document.querySelector('button[aria-label="Home"]')?.classList.contains('active')) throw new Error('Home did not open the working environment');
    clickRail('Workspace');
    await wait();
    const back = document.querySelector('button[aria-label="Back"]');
    const forward = document.querySelector('button[aria-label="Forward"]');
    if (!(back instanceof HTMLButtonElement) || back.disabled) throw new Error('Back navigation did not become available');
    if (!(forward instanceof HTMLButtonElement) || !forward.disabled) throw new Error('Forward navigation should be unavailable before going back');
    back.click();
    await wait();
    if (!document.querySelector('button[aria-label="Home"]')?.classList.contains('active')) throw new Error('Back navigation did not restore Home');
    if (forward.disabled) throw new Error('Forward navigation did not become available');
    forward.click();
    await wait();
    if (!document.querySelector('button[aria-label="Workspace"]')?.classList.contains('active')) throw new Error('Forward navigation did not restore Workspace');
    const collapse = document.querySelector('button[aria-label="Collapse sidebar"]');
    collapse?.click();
    await wait();
    if (!document.querySelector('.gwira-two-layer-sidebar')?.classList.contains('is-collapsed') || !document.querySelector('.gwira-secondary-sidebar[hidden]')) throw new Error('Sidebar did not collapse');
    clickRail('Home');
    await wait();
    document.querySelector('button[aria-label="Expand sidebar"]')?.click();
    await wait();
    clickButton('New work');
    await wait();
    if (!document.querySelector('textarea')) throw new Error('New work navigation failed');
    if (!document.querySelector('button[aria-label="Home"]')?.classList.contains('active')) throw new Error('New work should remain in Home');
    if (document.querySelector('.thread-heading')?.textContent?.includes('New thread')) throw new Error('New work should not show a non-informative thread breadcrumb');
    if (document.querySelector('.new-thread-row')) throw new Error('Permanent project New chat row rendered after navigation');
    return {
      projects: pills.length,
      businessNavigation: true,
      scheduledDisabled: document.querySelector('button[aria-label="Scheduled work unavailable"]')?.disabled === true,
      pipelinesDisabled: [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Pipelines')?.disabled === true
    };
  })()`);
  window.webContents.reload();
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 180));
  const sidebarFavoritePersistedAfterReload = await window.webContents.executeJavaScript(`document.querySelector('.sidebar-favorites .sidebar-shortcut-item') instanceof HTMLElement`);
  if (!sidebarFavoritePersistedAfterReload) throw new Error('Sidebar Favorites did not persist after reload');
  const libraryPersistedAfterReload = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('button[aria-label="Home"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Library')?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return document.querySelectorAll('.library-document-title').length === 9;
  })()`);
  if (!libraryPersistedAfterReload) throw new Error('Library records did not persist after reload');
  window.setSize(1000, 720);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const compactLayout = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('button[aria-label="Workspace"]')?.click();
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
      document.querySelector('button[aria-label="Home"]')?.click();
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
      document.querySelector('button[aria-label="Home"]')?.click();
      await wait();
      document.querySelector('button[aria-label="Workspace"]')?.click();
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
  if (process.env.ELECTRON_SMOKE_TEST === '1') app.exit(1);
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
