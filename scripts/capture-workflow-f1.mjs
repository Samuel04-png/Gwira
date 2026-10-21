import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
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
  { name: 'unsupported-view-disabled', scenario: 'marketing', view: 'workflow', dashboardView: 'list', selectId: 'humanWork:review' },
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
  { name: 'relationship-inspector', f3: 'relationship' }
];
const shellScenarios = [
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
const measurements = [];
const f2Mode = process.argv.includes('--suite=f2') || process.env.ELECTRON_DASHBOARD_CAPTURE_F2 === '1';
const f3Mode = process.argv.includes('--suite=f3') || process.argv.includes('--suite=shell') || process.env.ELECTRON_WORKSPACE_CAPTURE_F3 === '1';
const shellMode = process.argv.includes('--suite=shell');
const timelineMode = process.argv.includes('--suite=timeline');
const scenarios = timelineMode ? timelineScenarios : shellMode ? shellScenarios : f3Mode ? f3Scenarios : f2Mode ? f2Scenarios : f1Scenarios;
const outputDirectory = process.env.ELECTRON_WORKFLOW_CAPTURE_OUTPUT
  ? path.resolve(root, process.env.ELECTRON_WORKFLOW_CAPTURE_OUTPUT)
  : path.join(root, 'artifacts', 'workflow', timelineMode ? 'timeline' : shellMode ? 'shell' : f3Mode ? 'f3' : f2Mode ? 'f2' : 'f1');
const selectedScenarios = process.env.ELECTRON_WORKFLOW_CAPTURE_ONLY
  ? scenarios.filter((scenario) => scenario.name === process.env.ELECTRON_WORKFLOW_CAPTURE_ONLY)
  : scenarios;
const sizes = [
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
  const deadline = Date.now() + 15_000;
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
  return new Promise((resolve, reject) => {
    const child = spawn(electron, ['.', '--force-device-scale-factor=1', `--user-data-dir=${env.ELECTRON_CAPTURE_PROFILE}`], {
      cwd: root,
      env: { ...process.env, ...env },
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

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gwira-f1-capture-'));
let vite;
try {
  await fs.mkdir(outputDirectory, { recursive: true });
  const port = await freePort();
  const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
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
      if (scenario.fixture) fixtureUrl.searchParams.set('canvasFixture', scenario.fixture);
      const profile = path.join(temporaryDirectory, `profile-${scenario.name}-${size.label}`);
      const capturePath = path.join(outputDirectory, `${scenario.name}-${size.label}.png`);
      const output = await runElectron({
        ELECTRON_RENDERER_URL: fixtureUrl.toString(),
        ELECTRON_WORKFLOW_CAPTURE: '1',
        ELECTRON_WORKFLOW_SELECT_ID: scenario.selectId ?? '',
        ELECTRON_WORKFLOW_SCENARIO: scenario.scenario ?? '',
        ELECTRON_TIMELINE_ACTIONS: scenario.actions ?? '',
        ELECTRON_WORKFLOW_CAPTURE_VIEW: scenario.view ?? 'workflow',
        ELECTRON_WORKFLOW_CAPTURE_DASHBOARD_VIEW: scenario.dashboardView ?? '',
        ELECTRON_WORKFLOW_CAPTURE_TAB: scenario.tab ?? '',
        ELECTRON_WORKFLOW_CAPTURE_TAB_SEQUENCE: scenario.tabSequence ?? '',
        ELECTRON_WORKFLOW_CAPTURE_PANEL: scenario.panel ?? '',
        ELECTRON_WORKFLOW_CAPTURE_KEYBOARD: scenario.keyboard ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_EMPTY: scenario.emptyWorkspace ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_F3: scenario.f3 ? '1' : '0',
        ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO: scenario.f3 ?? '',
        ELECTRON_WORKFLOW_CAPTURE_F3_SEED: scenario.seed === false ? '0' : '1',
        ELECTRON_WORKFLOW_WIDTH: String(size.width),
        ELECTRON_WORKFLOW_HEIGHT: String(size.height),
        ELECTRON_WORKFLOW_CAPTURE_PATH: capturePath,
        ELECTRON_CAPTURE_PROFILE: profile
      });
      const resultLine = output.split('\n').find((line) => line.includes('ELECTRON_WORKFLOW_CAPTURE_RESULT'));
      if (!resultLine) throw new Error(`Missing workflow capture result for ${scenario.name} at ${size.label}`);
      const captureResult = JSON.parse(resultLine.slice(resultLine.indexOf('{')));
      await verifyPng(capturePath, size.width, size.height);
      console.log(`${scenario.name}-${size.label}: ${capturePath}`);
      console.log(resultLine);
      if (!captureResult.nodesFit) throw new Error(`${scenario.name}-${size.label} graph nodes exceed the canvas viewport`);
      if (captureResult.edges !== captureResult.modelEdges) {
        throw new Error(`${scenario.name}-${size.label} rendered ${captureResult.edges} of ${captureResult.modelEdges} modeled edges`);
      }
      if (f2Mode) {
        if (captureResult.activeView !== scenario.view) throw new Error(`${scenario.name}-${size.label} selected ${captureResult.activeView}, expected ${scenario.view}`);
        if (scenario.panel === 'collapsed' ? captureResult.panelVisible : !captureResult.panelVisible) throw new Error(`${scenario.name}-${size.label} panel visibility is incorrect`);
        if (scenario.tab && captureResult.activeContextTab !== scenario.tab) throw new Error(`${scenario.name}-${size.label} selected context tab ${captureResult.activeContextTab}, expected ${scenario.tab}`);
        if (scenario.keyboard && !captureResult.keyboardUnsupportedViewBlocked) throw new Error(`${scenario.name}-${size.label} activated an unsupported Dashboard view with the keyboard`);
        if (scenario.emptyWorkspace && !captureResult.workspaceEmpty) throw new Error(`${scenario.name}-${size.label} did not render the empty workspace state`);
        if (scenario.dashboardView && (!captureResult.unsupportedViewDisabled || captureResult.preview || captureResult.activeView !== 'workflow')) throw new Error(`${scenario.name}-${size.label} allowed an unsupported Dashboard view`);
        if (scenario.panel === 'collapsed' && captureResult.canvasWidth <= captureResult.expandedCanvasWidth) throw new Error(`${scenario.name}-${size.label} did not release panel width back to the workflow canvas`);
        if (scenario.panel === 'collapsed' && captureResult.reopenedContextTab !== scenario.tab) throw new Error(`${scenario.name}-${size.label} did not retain the context tab after reopening`);
        if (scenario.panel === 'collapsed' && scenario.selectId && captureResult.reopenedSelection !== 'Review campaign direction') throw new Error(`${scenario.name}-${size.label} did not retain the selected work item after reopening`);
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
        if (!shell.notifications || !['Back', 'Forward', 'Open a new tab', 'Search Gwira'].every((label) => shell.topbarControls.includes(label))) throw new Error(`${scenario.name}-${size.label} top bar controls are missing: ${shell.topbarControls}`);
        if (scenario.f3 === 'sidebar-collapsed' && !shell.sidebarCollapsed) throw new Error(`${scenario.name}-${size.label} did not collapse the sidebar`);
        if (scenario.f3 === 'task-inspector' && !shell.taskDetails) throw new Error(`${scenario.name}-${size.label} did not open task details`);
        if (!shell.sidebarCollapsed && scenario.name !== 'shell-narrow' && shell.navLabels.length < (/home/.test(scenario.name) ? 1 : 4)) throw new Error(`${scenario.name}-${size.label} sidebar is missing destinations: ${shell.navLabels}`);
      }
      if (f3Mode) {
        if (captureResult.globalTabs < 1) throw new Error(`${scenario.name}-${size.label} did not render workspace tabs`);
        if (scenario.f3 === 'multiple-tabs' && captureResult.globalTabs < 4) throw new Error(`${scenario.name}-${size.label} did not open multiple global tabs`);
        if (scenario.f3 === 'task-tab' && (!captureResult.activeWorkspaceTab.includes('Prepare launch checklist') || captureResult.activeView !== 'my-work')) throw new Error(`${scenario.name}-${size.label} did not open the task destination`);
        if (scenario.f3 === 'team' && (captureResult.inspectorMode !== 'Workspace context' || captureResult.activeContextTab !== 'team')) throw new Error(`${scenario.name}-${size.label} did not show Team context`);
        if (scenario.f3 === 'activity' && captureResult.activeContextTab !== 'activity') throw new Error(`${scenario.name}-${size.label} did not show Activity context`);
        if (scenario.f3 === 'selected-work' && (captureResult.inspectorMode !== 'Inspect work' || !captureResult.selected)) throw new Error(`${scenario.name}-${size.label} did not inspect selected work`);
        if (scenario.f3 === 'collapsed' && captureResult.panelVisible) throw new Error(`${scenario.name}-${size.label} did not collapse the inspector`);
        if (scenario.f3 === 'picker' && !captureResult.destinationPickerOpen) throw new Error(`${scenario.name}-${size.label} did not open the destination picker`);
        if (scenario.f3 === 'empty' && !captureResult.workspaceEmpty) throw new Error(`${scenario.name}-${size.label} did not render an honest empty state`);
        if (scenario.f3 === 'create-work' && !captureResult.createdTask) throw new Error(`${scenario.name}-${size.label} did not create and select a local task`);
        if (scenario.f3 === 'edit-save' && captureResult.selected !== 'Updated capture checklist') throw new Error(`${scenario.name}-${size.label} did not save the edited task`);
        if (scenario.f3 === 'unsaved-switch' && !captureResult.draftSurvivedTabSwitch) throw new Error(`${scenario.name}-${size.label} discarded the edit draft on tab switch`);
        if (scenario.f3 === 'relationship' && captureResult.inspectorMode !== 'Inspect connection') throw new Error(`${scenario.name}-${size.label} did not inspect the selected relationship`);
      }
    }
  }
} catch (error) {
  if (vite?.exitCode === null) vite.kill('SIGTERM');
  if (vite) await new Promise((resolve) => vite.once('close', resolve));
  throw new Error(`${error instanceof Error ? error.message : String(error)}\n${viteOutputForError(vite)}`);
} finally {
  if (measurements.length) await fs.writeFile(path.join(outputDirectory, 'timeline-large-measurements.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), note: 'Actual measurements of the 1,600-task dev fixture. Regression limits are intentionally looser than typical values.', measurements }, null, 2)}\n`);
  if (vite?.exitCode === null) {
    vite.kill('SIGTERM');
    await new Promise((resolve) => vite.once('close', resolve));
  }
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

function viteOutputForError(child) {
  return child ? `Vite PID ${child.pid}` : '';
}
