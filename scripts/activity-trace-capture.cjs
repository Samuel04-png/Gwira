const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

app.setPath('userData', process.env.ACTIVITY_TRACE_PROFILE);
// Read-only startup fixtures. There are no execution, mutation or private-history handlers.
for (const channel of ['list-models', 'list-skills', 'list-history-projects', 'list-histories', 'list-project-files']) ipcMain.handle(`codex:${channel}`, () => []);
ipcMain.handle('codex:get-bootstrap-status', () => ({ installed: true, platform: process.platform, missing: [], canInstall: false }));
ipcMain.handle('codex:list-git-branches', () => ({ branches: [] }));
const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const width = Number(process.env.ACTIVITY_TRACE_WIDTH);
  const height = Number(process.env.ACTIVITY_TRACE_HEIGHT);
  const window = new BrowserWindow({ width, height, titleBarStyle: 'hiddenInset', webPreferences: { preload: path.join(process.cwd(), 'dist/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  window.setContentSize(width, height);
  const issues = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error' || event.level === 'warning') { issues.push(event.message); console.error(event.message); } });
  await window.loadURL(process.env.ACTIVITY_TRACE_URL);
  window.focus();
  window.webContents.focus();
  await wait(700);
  const scenario = process.env.ACTIVITY_TRACE_SCENARIO;
  const stage = process.env.ACTIVITY_TRACE_STAGE;
  const prefix = path.join(process.env.ACTIVITY_TRACE_DIRECTORY, `${scenario}-${stage}-${width}x${height}`);
  const capture = async (suffix = '') => fs.writeFile(`${prefix}${suffix}.png`, (await window.webContents.capturePage()).toPNG());
  if (stage.startsWith('composer-')) {
    await window.webContents.executeJavaScript(`document.querySelector('.composer-panel > textarea').focus()`);
    await capture('-focused-empty');
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 't' });
    window.webContents.sendInputEvent({ type: 'char', keyCode: 't' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 't' });
    await wait(40);
    await window.webContents.insertText('yping');
    await wait();
    const typing = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.composer-panel > textarea');
      const style = getComputedStyle(input);
      return { value: input.value, focused: document.activeElement === input, focusVisible: input.matches(':focus-visible'), outline: style.outlineStyle, outlineWidth: style.outlineWidth, selected: input.selectionStart !== input.selectionEnd };
    })()`);
    if (typing.value !== 'typing' || !typing.focused || !typing.focusVisible || typing.selected) throw new Error('Composer typing did not retain normal caret focus: ' + JSON.stringify(typing));
    if (stage === 'composer-after' && typing.outline !== 'none') throw new Error('Composer still has an inner focus outline: ' + JSON.stringify(typing));
    await capture('-typing');
    await window.webContents.insertText('\nA second line');
    await wait();
    await capture('-multiline');
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await wait();
    const button = await window.webContents.executeJavaScript(`(() => { const target = document.activeElement; const style = getComputedStyle(target); return { tag: target.tagName, outline: style.outlineStyle, outlineWidth: style.outlineWidth }; })()`);
    if (button.tag !== 'BUTTON' || button.outline === 'none' || button.outlineWidth === '0px') throw new Error('Keyboard focus indicator was lost on composer buttons');
    await capture('-button-focus');
    console.log(JSON.stringify({ scenario: 'composer-focus', stage, width, height, typing, button, path: prefix + '-typing.png', issues }));
    app.exit(0);
    return;
  }
  await window.webContents.executeJavaScript(`document.querySelector('.content').scrollTop = 0`);
  await capture();
  const baseline = await window.webContents.executeJavaScript(`({ fixture: document.querySelector('[data-activity-trace-fixture]')?.textContent, text: document.querySelector('.transcript')?.innerText, composerVisible: document.querySelector('.composer-panel').getBoundingClientRect().bottom <= innerHeight })`);
  if (!baseline.fixture || !baseline.composerVisible) throw new Error(`Fixture or composer unavailable: ${JSON.stringify(baseline)}`);
  const checks = {};
  if (stage !== 'before') {
    checks.collapsed = await window.webContents.executeJavaScript(`(() => {
      const trace = document.querySelector('[data-trace-run]');
      if (!trace) throw new Error('Execution trace did not mount');
      const text = trace.innerText;
      if (/Ran \\/bin|2026-10-24T|models_manager|sed -n|rg -n/.test(text)) throw new Error('Raw diagnostics leaked into collapsed trace');
      if (${JSON.stringify(scenario)} === 'finished' && (!text.includes('Worked for 35m · 28 steps') || trace.querySelectorAll('.trace-step').length)) throw new Error('Finished run did not collapse to its 28-step summary: ' + text);
      if (${JSON.stringify(scenario)} === 'live' && trace.querySelectorAll('.trace-step').length !== 1) throw new Error('Live run should show only its current step');
      if (${JSON.stringify(scenario)} === 'background' && (trace.querySelectorAll('.trace-step').length !== 1 || !text.includes('×2') || trace.querySelector('.trace-summary'))) throw new Error('Background errors did not fold into one muted row: ' + text);
      return { text, rows: trace.querySelectorAll('.trace-step').length };
    })()`);
    const summary = await window.webContents.executeJavaScript(`(() => { window.__traceKeys = []; for (const type of ['keydown', 'keypress', 'keyup', 'click']) document.addEventListener(type, (event) => window.__traceKeys.push([type, event.key, event.target.className])); const button = document.querySelector('.trace-summary'); if (!button) return false; button.focus(); return true; })()`);
    if (summary) {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      await wait();
      checks.summaryKeyboard = await window.webContents.executeJavaScript(`document.querySelector('.trace-summary').getAttribute('aria-expanded') === 'true'`);
      if (!checks.summaryKeyboard) throw new Error('Enter did not expand run summary: ' + await window.webContents.executeJavaScript(`JSON.stringify({active: document.activeElement?.outerHTML, keys: window.__traceKeys})`));
      await capture('-steps');
    }
    await window.webContents.executeJavaScript(`(() => { const buttons = [...document.querySelectorAll('.trace-step__button')]; buttons.at(-1)?.focus(); })()`);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
    window.webContents.sendInputEvent({ type: 'char', keyCode: ' ' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
    await wait();
    checks.detailKeyboard = await window.webContents.executeJavaScript(`document.activeElement?.getAttribute('aria-expanded') === 'true'`);
    if (!checks.detailKeyboard) throw new Error('Space did not expand step detail');
    await capture('-detail');
    checks.details = await window.webContents.executeJavaScript(`(() => {
      const detail = document.querySelector('.trace-detail');
      const pre = detail.querySelector('pre');
      const style = getComputedStyle(pre);
      const rows = [...document.querySelectorAll('.trace-step__button')];
      return { rowHeights: rows.map((row) => row.getBoundingClientRect().height), fontSize: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight, noOverflow: pre.scrollWidth <= pre.clientWidth + 1, linesRendered: pre.textContent.split('\\n').length, nodes: document.querySelectorAll('.transcript *').length, composerVisible: document.querySelector('.composer-panel').getBoundingClientRect().bottom <= innerHeight };
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Copy command and output"]').click()`);
    await wait();
    const copied = clipboard.readText();
    checks.copy = { length: copied.length, full600Lines: copied.includes('Verification output line 600:'), rawCommand: copied.startsWith('Ran ') || copied.startsWith('Error') || copied.startsWith('2026-') };
    if (!copied || (scenario === 'finished' && !checks.copy.full600Lines)) throw new Error('Copy omitted raw output');
    const showAll = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('.trace-detail__more'); button?.click(); return !!button; })()`);
    if (showAll) { await wait(); await capture('-all-lines'); }
    checks.end = await window.webContents.executeJavaScript(`(() => {
      const pre = document.querySelector('.trace-detail pre');
      const began = performance.now();
      for (let index = 0; index < 100; index++) pre.scrollTop = index % 2 ? pre.scrollHeight : 0;
      const scrollMs = performance.now() - began;
      return { scrollMs, allLines: pre.textContent.split('\\n').length, noOverflow: pre.scrollWidth <= pre.clientWidth + 1, composerVisible: document.querySelector('.composer-panel').getBoundingClientRect().bottom <= innerHeight };
    })()`);
    // Verify focus by native Tab, and record the focus ring separately.
    await window.webContents.executeJavaScript(`document.querySelector('.trace-step__button').focus()`);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await wait();
    checks.tab = await window.webContents.executeJavaScript(`document.activeElement?.getAttribute('aria-label') === 'Copy command and output' || document.activeElement?.classList.contains('trace-step__button')`);
    if (!checks.tab) throw new Error('Tab did not reach the next trace control');
    await capture('-focus');
    // A reduced-motion capture verifies the spinner becomes a static full ring.
    if (scenario === 'live' || scenario === 'states') {
      await window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await window.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      await wait(50);
      checks.reducedMotion = await window.webContents.executeJavaScript(`(() => { const style = getComputedStyle(document.querySelector('.trace-glyph.is-running'), '::before'); return style.animationName === 'none' && style.borderRightColor === style.borderLeftColor && style.transform === 'none'; })()`);
      if (!checks.reducedMotion) throw new Error('Reduced motion did not stop the spinner: ' + await window.webContents.executeJavaScript(`(() => { const style = getComputedStyle(document.querySelector('.trace-glyph.is-running'), '::before'); return JSON.stringify({media: matchMedia('(prefers-reduced-motion: reduce)').matches, animation: style.animationName, right: style.borderRightColor, left: style.borderLeftColor, transform: style.transform}); })()`));
      await capture('-reduced-motion');
      window.webContents.debugger.detach();
    }
  }
  const unexpected = issues.filter((issue) => !issue.startsWith('%cElectron Security Warning'));
  if (unexpected.length) throw new Error(`Renderer errors: ${unexpected.join('; ')}`);
  console.log(JSON.stringify({ scenario, stage, path: `${prefix}.png`, checks, issues }));
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
