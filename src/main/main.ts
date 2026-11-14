import {registerAccountIpc,handleAccountOrganizationLink} from './auth/runtime.js';
import {ExecutionContext} from './auth/executionContext.js';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc } from './ipc.js';
import { CodexExecManager } from './codexExecManager.js';
import { listCodexHistories } from './codexHistory.js';
import { SessionStore } from './sessionStore.js';
import { buildMainWindowOptions } from './windowOptions.js';

import { ScheduleService } from './gwira/core/scheduleService.js';
import type { ScheduleCommand } from '../shared/schedules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDevUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;

// Preserve the existing profile (including explicit --user-data-dir overrides).
const existingUserDataPath = app.getPath('userData');
const legacyPackagedProfile = path.join(app.getPath('appData'), 'Codex Desktop');
const hasExplicitProfile = process.argv.some((argument) => argument === '--user-data-dir' || argument.startsWith('--user-data-dir='));
const userDataPath = app.isPackaged && !hasExplicitProfile && !existsSync(existingUserDataPath) && existsSync(legacyPackagedProfile)
  ? legacyPackagedProfile
  : existingUserDataPath;
app.setName('Gwira');
app.setPath('userData', userDataPath);

const primaryInstance=!app.isPackaged||app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
const sessions = new SessionStore();
const codexManager = new CodexExecManager(sessions);
const executionContext = new ExecutionContext();

registerIpc(codexManager, sessions, executionContext);
registerAccountIpc(executionContext);
app.on('open-url',(event,url)=>{event.preventDefault();handleAccountOrganizationLink(url);});
app.on('second-instance',(_event,argv)=>{for(const value of argv)if(value.startsWith('gwira:'))handleAccountOrganizationLink(value);const window=BrowserWindow.getAllWindows()[0];if(window){if(window.isMinimized())window.restore();window.focus();}});
for(const value of process.argv)if(value.startsWith('gwira:'))handleAccountOrganizationLink(value);

async function createWindow(): Promise<void> {
  const window = new BrowserWindow(buildMainWindowOptions(path.join(__dirname, '../preload/index.js')));
  if (process.env.ELECTRON_WORKFLOW_CAPTURE === '1') {
    const width = Number(process.env.ELECTRON_WORKFLOW_WIDTH);
    const height = Number(process.env.ELECTRON_WORKFLOW_HEIGHT);
    if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) window.setContentSize(width, height);
  }

  window.webContents.on('will-navigate',(event,url)=>{let trusted=false;try{trusted=rendererDevUrl?new URL(url).origin===new URL(rendererDevUrl).origin:new URL(url).protocol==='file:'&&fileURLToPath(url)===path.join(__dirname,'../renderer/index.html');}catch{}if(!trusted)event.preventDefault();});
  window.webContents.setWindowOpenHandler(({ url }) => {
    try{const target=new URL(url);if(['https:','mailto:'].includes(target.protocol))void shell.openExternal(target.href);}catch{}
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

async function runInboxCapture(window: BrowserWindow, capturePath: string | undefined): Promise<Record<string, unknown>> {
  if (!rendererDevUrl) throw new Error('Inbox capture fixtures require the development renderer and an isolated capture profile.');
  const zoomFactor = Number(process.env.ELECTRON_WORKFLOW_ZOOM_FACTOR) || 1;
  window.webContents.setZoomFactor(zoomFactor);
  await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const scenario = process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO ?? 'empty';
  const result = await window.webContents.executeJavaScript(`(async () => {
    try {
    const consoleIssues = [];
    for (const level of ['warn', 'error']) { const original = console[level].bind(console); console[level] = (...args) => { consoleIssues.push(level + ': ' + args.map(String).join(' ')); original(...args); }; }
    window.addEventListener('error', (event) => consoleIssues.push('error: ' + event.message));
    window.addEventListener('unhandledrejection', (event) => consoleIssues.push('rejection: ' + String(event.reason)));
    const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const findButton = (label, root = document) => [...root.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label || button.textContent?.trim() === label);
    const setValue = (element, value) => {
      const prototype = element && Object.getPrototypeOf(element);
      const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter || !['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) throw new Error('Capture form control is unavailable: ' + (element?.outerHTML ?? 'not found'));
      setter.call(element, value);
      const event = element.ownerDocument.createEvent('Event');
      event.initEvent(element.tagName === 'SELECT' ? 'change' : 'input', true, false);
      element.dispatchEvent(event);
    };
    const selectConversationType = async (dialog, label) => {
      const type = [...dialog.querySelectorAll('.gw-inbox-type-tabs button')].find((button) => button.textContent?.trim() === label);
      if (!(type instanceof HTMLButtonElement)) throw new Error('Conversation type option missing: ' + label);
      type.click(); await wait(40);
    };
    const selectCaptureTeammate = async (dialog) => {
      const participant = [...dialog.querySelectorAll('.gw-inbox-person-option')].find((button) => button.textContent?.includes('Capture Teammate'));
      if (!(participant instanceof HTMLButtonElement)) throw new Error('Capture teammate is not available in the conversation picker');
      participant.click(); await wait(40);
    };
    const submitConversation = async (dialog, kind) => {
      const label = kind === 'dm' ? 'Start direct message' : kind === 'group' ? 'Create group' : 'Create channel';
      const submit = findButton(label, dialog);
      if (!(submit instanceof HTMLButtonElement) || submit.disabled) throw new Error('Conversation submit action unavailable: ' + label);
      submit.click(); await wait(160);
    };
    const activateInbox = async () => {
      if (!document.querySelector('[data-testid="inbox-workspace"]')) {
        document.querySelector('button[data-navigation-view="dashboard"]')?.click(); await wait(300);
        const inboxNavigation = [...document.querySelectorAll('button[data-navigation-view="inbox"]')].at(-1);
        inboxNavigation?.click(); await wait(350);
      }
      if (!document.querySelector('[data-testid="inbox-workspace"]')) throw new Error('Inbox capture could not mount InboxPage; route=' + document.querySelector('.workspace')?.getAttribute('data-workspace-view') + '; navigation=' + [...document.querySelectorAll('[data-navigation-view]')].map((button) => button.getAttribute('data-navigation-view') + ':' + (button.textContent ?? '').trim()).join(','));
    };
    const makeConversation = async (body) => {
      findButton('New conversation')?.click(); await wait(80);
      const dialog = document.querySelector('[role="dialog"]');
      if (!(dialog instanceof HTMLElement)) throw new Error('Inbox create dialog did not open');
      await selectConversationType(dialog, 'Direct message');
      await selectCaptureTeammate(dialog);
      await submitConversation(dialog, 'dm');
      await wait(140);
      const conversationButton = document.querySelector('.gw-msg-nav__conversation-row[data-nav-id]');
      if (!(conversationButton instanceof HTMLButtonElement)) throw new Error('Inbox could not create a direct message through its UI');
      conversationButton.click(); await wait(180);
      if (body !== undefined) {
        const textarea = document.querySelector('[aria-label="Write a message"]');
        if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Inbox message composer is unavailable');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, body); textarea.dispatchEvent(new Event('input', { bubbles: true })); await wait(40);
        findButton('Send')?.click(); await wait(350);
      }
    };
    await activateInbox();
    const workspace = document.querySelector('[data-testid="inbox-workspace"]');
    if (!(workspace instanceof HTMLElement)) throw new Error('Inbox workspace missing');
    let xssEscaped = true;
    let retryWorked = true;
    let activityPreserved = true;
    let taskNavigation = true;
    let drawerOpen = true;
    let drawerEscapeFocus = true;
    if (${JSON.stringify(scenario)} === 'activity') {
      document.querySelector('[data-nav-id="needs-review"]')?.click(); await wait(120);
      const rows = [...document.querySelectorAll('.gw-review .gw-inbox-row')];
      activityPreserved = rows.length >= 2 && rows[0]?.textContent?.includes('Waiting') && rows.some((row) => row.textContent?.includes('Review the launch brief'));
      rows[0]?.click(); await wait(150);
      activityPreserved = activityPreserved && Boolean(document.querySelector('[data-review-source]')?.textContent?.includes('Review the launch brief')) && !document.querySelector('.gw-review__source')?.textContent?.match(/Approve\b.*button/);
    }
    if (['conversation', 'dialog', 'thread', 'context', 'drawer', 'xss', 'failed-retry', 'functional', 'channel', 'group', 'search', 'multiline', 'stress', 'overflow'].includes(${JSON.stringify(scenario)})) {
      let payload;
      if (${JSON.stringify(scenario)} === 'xss') payload = '<img src=x onerror=window.__inboxXss=1>';
      else if (${JSON.stringify(scenario)} === 'failed-retry') payload = 'This message is retried after a local storage failure.';
      else payload = 'A locally saved message from the selected actor.';
      await makeConversation(undefined);
      if (${JSON.stringify(scenario)} === 'failed-retry') {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) { if (String(key).startsWith('gwira.messaging.local.v1')) throw new Error('capture quota failure'); return originalSetItem.call(this, key, value); };
        const textarea = document.querySelector('[aria-label="Write a message"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, payload); textarea.dispatchEvent(new Event('input', { bubbles: true })); await wait(30);
        findButton('Send')?.click(); await wait(180);
        const failedVisible = [...document.querySelectorAll('.gw-msg-retry-button')].some((button) => button.getClientRects().length > 0);
        const failedText = document.querySelector('.gw-msg-composer')?.textContent ?? '';
        Storage.prototype.setItem = originalSetItem;
        retryWorked = failedVisible && /Not durably saved/i.test(failedText) && findButton('Send')?.disabled === true && textarea.disabled === true && document.querySelector('[data-message-id]')?.textContent?.includes(payload) === true;
      } else {
        const textarea = document.querySelector('[aria-label="Write a message"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, payload); textarea.dispatchEvent(new Event('input', { bubbles: true })); await wait(30);
        findButton('Send')?.click(); await wait(350);
        if (${JSON.stringify(scenario)} === 'xss') {
          const row = [...document.querySelectorAll('[data-message-id]')].find((item) => item.textContent?.includes(payload));
          xssEscaped = Boolean(row && !row.querySelector('img') && row.querySelector('.gw-msg-row__text')?.textContent === payload && !window.__inboxXss);
        }
      }
      if (${JSON.stringify(scenario)} === 'thread') {
        const reply = document.querySelector('[aria-label^="Reply in thread"]');
        if (!(reply instanceof HTMLButtonElement)) throw new Error('Message thread action missing');
        reply.closest('.gw-msg-row')?.focus(); await wait(40); reply.focus(); reply.click(); await wait(180);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(100);
        if (document.querySelector('.gw-msg-thread') || document.activeElement !== reply) throw new Error('Thread Escape did not close and restore focus');
        reply.click(); await wait(100);
      }
      if (${JSON.stringify(scenario)} === 'drawer') {
        const details = findButton('Open conversation details');
        details?.focus(); details?.click(); await wait(180);
        const opened = Boolean(document.querySelector('.gw-inbox-side.is-drawer .gw-msg-ctx')) && workspace.getAttribute('data-layout') === 'master-detail';
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(160);
        drawerEscapeFocus = !document.querySelector('.gw-inbox-side.is-drawer') && document.activeElement === details;
        details?.focus(); details?.click(); await wait(120);
        drawerOpen = opened && Boolean(document.querySelector('.gw-inbox-side.is-drawer .gw-msg-ctx'));
      }
      if (${JSON.stringify(scenario)} === 'context') {
        findButton('Open conversation details')?.click(); await wait(160);
        drawerOpen = Boolean(document.querySelector('.gw-msg-ctx'));
      }
    }
    if (${JSON.stringify(scenario)} === 'functional') {
      const require = (condition, label) => { if (!condition) throw new Error('Inbox interaction: ' + label); };
      const input = (label, value) => { const node = document.querySelector('[aria-label="' + label + '"]'); require(Boolean(node), label + ' exists'); const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); };
      const opener = findButton('New conversation');
      opener.focus(); opener.click(); await wait();
      document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
      require(!document.querySelector('[role="dialog"]') && document.activeElement === opener, 'dialog Escape restores focus');
      findButton('Link record')?.click(); await wait();
      const choices = [...document.querySelectorAll('.gw-msg-link-picker li button')];
      require(choices.length >= 2, 'real task and approval choices');
      choices[0].click(); await wait(); choices[1].click(); await wait(); findButton('Done')?.click(); await wait();
      input('Write a message', 'Linked launch records'); await wait(); findButton('Send')?.click(); await wait(180);
      require(document.querySelectorAll('.gw-msg-row__refs button').length >= 2, 'task and approval refs render');
      const row = [...document.querySelectorAll('.gw-msg-row')].at(-1);
      row.focus(); await wait();
      findButton('Save message', row)?.click(); await wait();
      require(Boolean(findButton('Remove from saved', row)), 'save toggles for local actor');
      findButton('Add reaction', row)?.click(); await wait();
      const reaction = row.querySelector('.gw-msg-reactionpicker button'); require(Boolean(reaction), 'reaction picker opens'); reaction.click(); await wait();
      require(Boolean(row.querySelector('.gw-msg-row__reactions')), 'reaction persists');
      findButton('Reply in thread', row)?.click(); await wait();
      const thread = document.querySelector('.gw-msg-thread'); require(Boolean(thread), 'thread opens');
      input('Write a thread reply', '@Capture Teammate Thanks for reviewing'); await wait();
      findButton('Send', thread)?.click(); await wait(160);
      require(thread.querySelectorAll('[data-message-id]').length === 2, 'thread reply saved');
      findButton('Close thread', thread)?.click(); await wait();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true })); await wait();
      require(document.activeElement?.getAttribute('aria-label') === 'Search messages', 'Ctrl+F focuses message search');
      input('Search messages', 'has:task'); await wait();
      require(document.querySelectorAll('.gw-msg-search__hit').length === 1 && document.querySelector('.gw-msg-search__snippet')?.textContent?.includes('Linked launch records'), 'filter-only search has snippet');
      input('Search messages', ''); await wait();
      input('Write a message', 'Recovered actor draft'); await wait(600);
      const actor = document.querySelector('[aria-label="Local actor choice"]');
      const originalActor = actor.value;
      setValue(actor, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); await wait(120);
      require(document.querySelector('[aria-label="Write a message"]')?.value !== 'Recovered actor draft', 'draft does not leak across local actors');
      [...document.querySelectorAll('.gw-msg-nav__utility')].find((button) => button.querySelector('.gw-msg-nav__title')?.textContent === 'Mentions')?.click(); await wait();
      const mentionHit = document.querySelector('.gw-mentions .gw-inbox-row'); require(Boolean(mentionHit), 'thread mention is listed'); mentionHit.click(); await wait();
      require(document.querySelector('.gw-msg-thread__scroll')?.textContent?.includes('@Capture Teammate Thanks for reviewing'), 'mention opens its actual thread');
      findButton('Close thread')?.click(); await wait();
      setValue(document.querySelector('[aria-label="Local actor choice"]'), originalActor); await wait(120);
      require(document.querySelector('[aria-label="Write a message"]')?.value === 'Recovered actor draft', 'actor draft restored');
      findButton('Link record')?.click(); await wait(); document.querySelector('.gw-msg-link-picker li button')?.click(); await wait(); findButton('Done')?.click(); await wait(600);
      [...document.querySelectorAll('.gw-msg-nav__utility')].find((button) => button.querySelector('.gw-msg-nav__title')?.textContent === 'Saved')?.click(); await wait();
      const savedHit = document.querySelector('.gw-inbox-collection li button'); require(Boolean(savedHit), 'saved message is listed'); savedHit.click(); await wait();
      require(document.querySelector('[aria-label="Write a message"]')?.value === 'Recovered actor draft', 'saved-message navigation keeps draft');
      findButton('Open conversation details')?.click(); await wait();
      findButton('Close conversation details')?.click(); await wait();
      require(document.activeElement?.getAttribute('aria-label') === 'Open conversation details', 'drawer Close restores focus');
      const originalNavId = document.querySelector('.gw-msg-nav__row[data-nav-id][aria-current="page"]')?.getAttribute('data-nav-id');
      opener.click(); await wait();
      const create = document.querySelector('[role="dialog"]');
      await selectConversationType(create, 'Channel');
      input('Channel name', 'Launch planning'); await wait(); await submitConversation(create, 'channel');
      require(document.querySelector('.gw-msg-header__title')?.textContent === '#Launch planning', 'channel creation');
      opener.click(); await wait();
      const groupDialog = document.querySelector('[role="dialog"]');
      await selectConversationType(groupDialog, 'Group');
      input('Group name', 'Launch reviewers'); await wait(); await selectCaptureTeammate(groupDialog); await submitConversation(groupDialog, 'group');
      require(document.querySelector('.gw-msg-header__title')?.textContent === 'Launch reviewers', 'group creation');
      document.querySelector('[data-nav-id="' + originalNavId + '"]')?.click(); await wait();
      require(document.querySelector('[aria-label="Write a message"]')?.value === 'Recovered actor draft', 'draft recovered after conversation switch');
      require(document.querySelector('.gw-msg-linked-count')?.textContent?.trim() === '1 linked', 'draft record link recovered after conversation switch');
    }
    let redesignedInteractions = true;
    if (${JSON.stringify(scenario)} === 'showcase') {
      const require = (condition, label) => { if (!condition) throw new Error('Inbox showcase: ' + label); };
      await wait(120);
      const sampleConversation = document.querySelector('[data-nav-id="inbox-sample-channel-launch"]');
      require(sampleConversation instanceof HTMLButtonElement, 'isolated sample conversations loaded');
      require(Boolean(document.querySelector('.gw-inbox-sample-indicator')) && document.querySelectorAll('.gw-msg-nav__conversation-row').length >= 6, 'sample chip and populated navigation rendered');
      sampleConversation.click(); await wait(100);
    } else if (['channel', 'group', 'search', 'multiline', 'stress', 'overflow'].includes(${JSON.stringify(scenario)})) {
      const require = (condition, label) => { if (!condition) throw new Error('Inbox Part2: ' + label); };
      const post = async (text, label = 'Write a message') => {
        const input = document.querySelector('[aria-label="' + label + '"]')
          ?? (label === 'Write a message'
            ? document.querySelector('.gw-msg-composer textarea')
            : document.querySelector('.gw-msg-thread textarea'));
        require(input instanceof HTMLTextAreaElement, label + ' available');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true })); await wait(30);
        const root = input.closest('.gw-msg-composer'); findButton('Send', root)?.click(); await wait(70);
      };
      const create = async (kind, name) => {
        findButton('New conversation')?.click(); await wait(40);
        const dialog = document.querySelector('.gw-inbox-dialog');
        if (!(dialog instanceof HTMLElement)) throw new Error('Inbox create dialog did not open');
        await selectConversationType(dialog, kind === 'group' ? 'Group' : 'Channel');
        setValue(dialog.querySelector('.gw-inbox-dialog input:not([type="search"])'), name); await wait(30);
        if (kind === 'group') await selectCaptureTeammate(dialog);
        await submitConversation(dialog, kind);
      };
      if (${JSON.stringify(scenario)} === 'group') await create('group', 'Launch reviewers');
      else if (${JSON.stringify(scenario)} !== 'stress') await create('channel', 'launch-planning');
      if (${JSON.stringify(scenario)} !== 'stress' && ${JSON.stringify(scenario)} !== 'overflow') {
        await post('The launch brief is ready for review. I have linked the task so the decision stays with the work.');
        await post('The checklist covers scope, owners, and the approval required before the next step.');
        const actor = document.querySelector('[aria-label="Local actor choice"]');
        setValue(actor, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); await wait(80);
        await post('Thanks. I will review the checklist and record any changes in the task.');
        await post('Please keep the approved brief attached to this discussion for the next review.');
        setValue(actor, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); await wait(80);
        const input = document.querySelector('[aria-label="Write a message"]');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'I have added the review record below.'); input.dispatchEvent(new Event('input', { bubbles: true })); await wait(30);
        findButton('Link record')?.click(); await wait(30); document.querySelector('.gw-msg-link-picker li button')?.click(); await wait(30); findButton('Done')?.click(); await wait(30); findButton('Send')?.click(); await wait(80);
        const row = [...document.querySelectorAll('.gw-msg-row')].at(-1); row?.focus();
        findButton('Add reaction', row)?.click(); await wait(30); row?.querySelector('.gw-msg-reactionpicker button')?.click(); await wait(50);
        const reply = [...row.querySelectorAll('button')].find((button) => button.getAttribute('aria-label')?.startsWith('Reply in thread')); reply?.click(); await wait(80);
        await post('I will keep review notes in this thread.', 'Write a thread reply');
        findButton('Close thread')?.click(); await wait(60);
        require(Boolean(document.querySelector('.gw-msg-row__reply')), 'direct reply link rendered');
        document.querySelector('.gw-msg-row__reply')?.focus(); document.querySelector('.gw-msg-row__reply')?.click(); await wait(60);
        require(Boolean(document.querySelector('.gw-msg-thread')), 'reply count opens thread');
        findButton('Close thread')?.click(); await wait(60);
        if (${JSON.stringify(scenario)} === 'search') {
          findButton('Search this conversation')?.click(); await wait(80);
          const search = document.querySelector('input[aria-label="Search messages"]'); require(search?.value === '' && document.querySelector('.gw-msg-nav__search-scope')?.textContent?.includes('launch-planning'), 'header search has friendly conversation scope');
          require(document.querySelectorAll('.gw-msg-search__hit').length >= 5, 'source results available');
          document.querySelector('.gw-msg-search__hit')?.click(); await wait(80);
          require(Boolean(document.querySelector('[data-message-id].is-source')), 'selected source highlighted');
        }
        if (${JSON.stringify(scenario)} === 'multiline') {
          const input = document.querySelector('[aria-label="Write a message"]');
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Review notes for the next handoff:\\n1. Check the linked task.\\n2. Record the decision in the approval workflow.\\n3. Keep follow-up discussion in the thread.'); input.dispatchEvent(new Event('input', { bubbles: true })); await wait(100);
        }
      } else if (${JSON.stringify(scenario)} === 'overflow') {
        for (let index = 0; index < 50; index++) await create('channel', 'capture-channel-' + String(index + 1).padStart(2, '0') + '-long-name-for-overflow');
        require(document.querySelectorAll('.gw-msg-nav__row[data-nav-id]').length >= 51, '50+ conversation rows reachable');
        const heading = document.querySelector('[data-nav-id="section:channels"]');
        if (heading) { heading.click(); await wait(); heading.click(); await wait(); }
      } else {
        findButton('Link record')?.click(); await wait(40);
        for (let index = 0; index < 10; index++) { document.querySelectorAll('.gw-msg-link-picker li button')[index]?.click(); await wait(20); }
        findButton('Done')?.click(); await wait(40);
        require(document.querySelector('.gw-msg-linked-count')?.textContent?.includes('10 linked'), 'ten links in bounded disclosure');
        const textarea = document.querySelector('[aria-label="Write a message"]');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Capture fixture: this multiline message retains ten long record links while a save fails.\\nThe input and recovery controls must remain accessible.'); textarea.dispatchEvent(new Event('input', { bubbles: true })); await wait(80);
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) { if (String(key).startsWith('gwira.messaging.local.v1')) throw new Error('capture quota failure'); return original.call(this, key, value); };
        findButton('Send')?.click(); await wait(100); Storage.prototype.setItem = original;
        require(Boolean(document.querySelector('.gw-msg-retry-button')) && textarea.disabled, 'failed message recovery lock');
        const retry = document.querySelector('.gw-msg-retry-button'); const rect = retry.getBoundingClientRect();
        require(rect.bottom <= innerHeight + 1 && rect.top >= 0, 'Retry remains within viewport ' + JSON.stringify({ rect: rect.toJSON(), viewport: innerHeight, composer: textarea.closest('.gw-msg-composer').getBoundingClientRect().toJSON(), main: textarea.closest('.gw-inbox-main').getBoundingClientRect().toJSON() }));
        findButton('10 linked')?.click(); await wait(60);
        const refs = document.querySelector('.gw-msg-selected-refs'); require(Boolean(refs) && refs.getBoundingClientRect().top >= 0, 'ten-link disclosure remains in pane');
        findButton('Done', refs)?.click(); await wait(60);
      }
      const badge = document.querySelector('.gw-inbox-local-badge'); if (badge) badge.textContent = 'Capture fixture · this device';
      const input = document.querySelector('[aria-label="Write a message"]');
      if (input) { const rect = input.getBoundingClientRect(); require(rect.bottom <= innerHeight + 1 && rect.top >= 0 && rect.height >= 20, 'composer input visible'); }
      redesignedInteractions = true;
    }
    const visibleButtons = [...document.querySelectorAll('button')].filter((button) => button instanceof HTMLElement && button.getClientRects().length > 0 && getComputedStyle(button).visibility !== 'hidden');
    const unnamedButtons = visibleButtons.filter((button) => !(button.getAttribute('aria-label')?.trim() || button.getAttribute('title')?.trim() || button.getAttribute('aria-labelledby')?.trim() || button.textContent?.trim()));
    const noHandlerButtons = visibleButtons.filter((button) => {
      const key = Object.keys(button).find((name) => name.startsWith('__reactProps$'));
      const props = key ? button[key] : undefined;
      const formKey = button.form && Object.keys(button.form).find((name) => name.startsWith('__reactProps$'));
      const formProps = formKey && button.form ? button.form[formKey] : undefined;
      return !button.disabled && typeof props?.onClick !== 'function' && !(button.type === 'submit' && typeof formProps?.onSubmit === 'function');
    });
    const layoutNodes = [workspace, ...workspace.querySelectorAll('.gw-inbox-layout, .gw-inbox-master, .gw-inbox-main, .gw-inbox-side, .gw-msg-feed__scroll')];
    const overflow = layoutNodes.filter((element) => element instanceof HTMLElement && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1).map((element) => String(element.className || element.tagName) + ':' + element.scrollWidth + '/' + element.clientWidth);
    const overflowDetails = [...workspace.querySelectorAll('*')].filter((element) => element instanceof HTMLElement && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1).map((element) => ({ tag: element.tagName, className: String(element.className || ''), client: element.clientWidth, scroll: element.scrollWidth, text: element.textContent?.trim().slice(0, 40) }));
    const workspaceRight = workspace.getBoundingClientRect().right;
    const spill = [...workspace.querySelectorAll('*')].filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0 && !element.closest('.gw-inbox-side:not(.is-drawer):not(.is-thread), .is-hidden') && element.getBoundingClientRect().right > workspaceRight + 1 && element.getBoundingClientRect().width > 0).slice(0, 12).map((element) => String(element.tagName) + '.' + String(element.className || '').slice(0, 50) + ':' + Math.round(element.getBoundingClientRect().right - workspaceRight));
    const honestyText = workspace.textContent ?? '';
    const honesty = !/\\b(delivered|seen|typing|online)\\b/i.test(honestyText)
      && !/fake reply|sample chat|demo employee/i.test(honestyText);
    const activeAuthors = [...document.querySelectorAll('.gw-msg-author')].map((node) => node.textContent?.trim());
    const sampleAuthors = ['Avery Chen', 'Mina Torres', 'Jordan Lee', 'Sam Rivera'];
    const noSimulatedAuthors = ['showcase', 'unread', 'threads', 'mentions', 'saved', 'drafts', 'needs-review'].includes(${JSON.stringify(scenario)})
      ? activeAuthors.every((name) => sampleAuthors.includes(name))
      : activeAuthors.every((name) => name === 'Capture Operator' || name === 'Capture Teammate');
    const emptyState = (() => {
      const firstRun = document.querySelector('.gw-inbox-first-run');
      if (firstRun && findButton('New conversation')) return true;
      const navBlank = workspace.querySelector('.gw-msg-nav__blank');
      const start = workspace.querySelector('.gw-msg-nav__start');
      if (navBlank && /No conversations yet/i.test(navBlank.textContent ?? '') && start instanceof HTMLButtonElement) return true;
      const caughtUp = workspace.querySelector('.gw-review.is-empty .gw-inbox-empty h3');
      return Boolean(caughtUp && /All caught up/i.test(caughtUp.textContent ?? ''));
    })();
    return {
      inbox: {
        scenario: ${JSON.stringify(scenario)}, layout: workspace.getAttribute('data-layout'), width: workspace.clientWidth, height: workspace.clientHeight,
        honesty: honesty && noSimulatedAuthors, buttonNames: unnamedButtons.length === 0, buttonHandlers: noHandlerButtons.length === 0,
        unnamedButtons: unnamedButtons.map((button) => button.outerHTML.slice(0, 180)), noHandlerButtons: noHandlerButtons.map((button) => button.outerHTML.slice(0, 180)),
        consoleIssues, noHorizontalOverflow: overflow.length === 0, overflow, overflowDetails, spill, activityPreserved, taskNavigation, emptyState, reviewEmptyOnly: Boolean(workspace.querySelector('.gw-review.is-empty .gw-inbox-empty h3')) && !workspace.querySelector('.gw-msg-nav__blank') && workspace.querySelectorAll('.gw-inbox-empty').length === 1, xssEscaped, retryWorked, drawerOpen, drawerEscapeFocus, activeElement: document.activeElement instanceof HTMLElement ? { tag: document.activeElement.tagName, label: document.activeElement.getAttribute('aria-label'), text: document.activeElement.tagName === 'BODY' ? undefined : document.activeElement.textContent?.trim().slice(0, 160) } : null, masterClass: workspace.querySelector('.gw-inbox-master')?.className, mainClass: workspace.querySelector('.gw-inbox-main')?.className, layoutRect: (() => { const node = workspace.querySelector('.gw-inbox-layout'); const rect = node?.getBoundingClientRect(); return rect ? { width: rect.width, height: rect.height, display: getComputedStyle(node).display, widthStyle: getComputedStyle(node).width } : null; })(), mainRect: (() => { const node = workspace.querySelector('.gw-inbox-main'); const rect = node?.getBoundingClientRect(); return rect ? { width: rect.width, height: rect.height, display: getComputedStyle(node).display, position: getComputedStyle(node).position, widthStyle: getComputedStyle(node).width, flex: getComputedStyle(node).flex, left: getComputedStyle(node).left, right: getComputedStyle(node).right, parent: { width: node.parentElement?.clientWidth, display: node.parentElement ? getComputedStyle(node.parentElement).display : null } } : null; })(), feedRect: (() => { const rect = workspace.querySelector('.gw-msg-feed__scroll')?.getBoundingClientRect(); return rect ? { width: rect.width, height: rect.height } : null; })(),
        redesignedInteractions, messageCount: document.querySelectorAll('[data-message-id]').length, activityOrder: [...document.querySelectorAll('.gw-msg-activity__items > li')].map((row) => row.className),
        sampleLoaded: Boolean(workspace.querySelector('.gw-inbox-sample-indicator')) && workspace.querySelectorAll('.gw-msg-nav__conversation-row').length >= 6,
        sidebarMetrics: (() => {
          const nav = workspace.querySelector('.gw-msg-nav');
          const measure = (selector) => {
            const node = nav?.querySelector(selector);
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return { width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, padding: style.padding };
          };
          return {
            navigator: measure('.gw-msg-nav'),
            row: measure('.gw-msg-nav__conversation-row'),
            sectionHeading: measure('.gw-msg-nav__heading > button'),
            name: measure('.gw-msg-nav__conversation-row .gw-msg-nav__title'),
            badge: measure('.gw-msg-badge'),
            avatar: measure('.gw-msg-nav__avatar'),
            channelIcon: measure('.gw-msg-nav__glyph')
          };
        })(),
        zoomFactor: ${zoomFactor}, cssViewport: { width: innerWidth, height: innerHeight }, buttonCount: visibleButtons.length
      }
    };
    } catch (error) { throw new Error(error?.stack ?? String(error)); }
  })()`).catch(async (error: unknown) => {
    if (capturePath) await fs.writeFile(capturePath.replace(/\.png$/, '-failed.png'), (await window.webContents.capturePage()).toPNG());
    throw error;
  });
  if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'activity' && capturePath) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
    const taskNavigation = await window.webContents.executeJavaScript(`(async () => {
      const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector('.gw-review .gw-inbox-row')?.click(); await wait(150);
      const taskButton = document.querySelector('[aria-label="Open task"]');
      taskButton?.click(); await wait(450);
      const tabs = [...document.querySelectorAll('.global-tab.is-active, .global-tab[aria-selected="true"]')].map((tab) => tab.textContent ?? '').join(' ');
      return Boolean(taskButton && document.querySelector('.workspace')?.getAttribute('data-workspace-view') === 'my-work' && tabs.includes('Review the launch brief'));
    })()`);
    (result as { inbox: { taskNavigation: boolean } }).inbox.taskNavigation = taskNavigation;
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'failed-retry' && capturePath) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
    const retryWorked = await window.webContents.executeJavaScript(`(async () => {
      const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
      const retry = document.querySelector('.gw-msg-row__state.is-failed');
      retry?.click(); await wait(400);
      return Boolean(retry && !document.querySelector('.gw-msg-retry-button') && document.querySelector('[aria-label="Write a message"]')?.disabled === false && document.querySelector('[aria-label="Write a message"]')?.value === '' && document.querySelector('[data-message-id]')?.textContent?.includes('This message is retried after a local storage failure.'));
    })()`);
    (result as { inbox: { retryWorked: boolean } }).inbox.retryWorked = retryWorked && (result as { inbox: { retryWorked: boolean } }).inbox.retryWorked;
    await fs.writeFile(capturePath.replace(/\.png$/, '-retried.png'), (await window.webContents.capturePage()).toPNG());
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'dialog' && capturePath) {
    const shot = async (suffix: string): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, 250)); await fs.writeFile(capturePath.replace(/\.png$/, `-${suffix}.png`), (await window.webContents.capturePage()).toPNG()); };
    const run = (body: string): Promise<unknown> => window.webContents.executeJavaScript(`(async () => { const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms)); const click = (label) => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label)?.click(); ${body} })()`);
    await run(`click('New conversation'); await wait(300); click('Channel'); await wait(120);`);
    await shot('channel-empty');
    await run(`const i = document.querySelector('[aria-label="Channel name"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'launch planning'); i.dispatchEvent(new Event('input', { bubbles: true })); await wait();`);
    await shot('channel-filled');
    await run(`click('Group'); await wait(200); document.querySelector('.gw-inbox-person-option')?.click(); await wait();`);
    await shot('group');
    await run(`click('Direct message'); await wait(200);`);
    await shot('dm');
    await run(`click('Cancel'); await wait(200); document.querySelector('[data-nav-id="needs-review"]')?.click(); await wait(300);`);
    await shot('needs-review');
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'threads' && capturePath) {
    const shot = async (suffix: string): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, 250)); await fs.writeFile(capturePath.replace(/\.png$/, `-${suffix}.png`), (await window.webContents.capturePage()).toPNG()); };
    const run = (body: string): Promise<unknown> => window.webContents.executeJavaScript(`(async () => { const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms)); const click = (label) => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label)?.click(); ${body} })()`);
    await run(`document.querySelector('[data-nav-id="threads"]')?.click(); await wait(400);`);
    await shot('list');
    await run(`document.querySelector('.gw-inbox-row')?.click(); await wait(300);`);
    await shot('selected');
    await run(`document.querySelector('.gw-threads__filters button:nth-child(2)')?.click(); await wait(250);`);
    await shot('unread-filter');
    await run(`document.querySelector('.gw-msg-thread__header.is-page button')?.textContent?.includes('Threads') && document.querySelector('.gw-msg-thread__header.is-page button').click(); await wait(200); document.querySelector('.gw-threads__filters button:nth-child(1)')?.click(); await wait(150); const rows = [...document.querySelectorAll('.gw-inbox-row')]; (rows.find((r) => /customer-notes/.test(r.textContent)) ?? rows[1])?.click(); await wait(300);`);
    await shot('linked-task');
    await run(`document.querySelector('.gw-msg-thread__header.is-page button')?.textContent?.includes('Threads') && document.querySelector('.gw-msg-thread__header.is-page button').click(); await wait(200); const rows = [...document.querySelectorAll('.gw-inbox-row')]; (rows.find((r) => /design-crit/.test(r.textContent)))?.click(); await wait(300);`);
    await shot('attachment');
    await run(`const t = document.querySelector('.gw-msg-thread textarea, .gw-msg-thread [contenteditable], .gw-msg-thread [role=textbox]'); t?.focus(); await wait(200);`);
    await shot('composer');
    await run(`document.querySelector('.gw-msg-thread__header.is-page button')?.textContent?.includes('Threads') && document.querySelector('.gw-msg-thread__header.is-page button').click(); await wait(200); const input = document.querySelector('.gw-threads__search input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'zzzz'); input.dispatchEvent(new Event('input', { bubbles: true })); await wait(250);`);
    await shot('empty-filter');
    await run(`document.querySelector('.gw-inbox-empty__action')?.click(); await wait(150); document.querySelector('.gw-threads__search input')?.focus(); await wait(100);`);
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'unread' && capturePath) {
    const shot = async (suffix: string): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, 250)); await fs.writeFile(capturePath.replace(/\.png$/, `-${suffix}.png`), (await window.webContents.capturePage()).toPNG()); };
    const run = (body: string): Promise<unknown> => window.webContents.executeJavaScript(`(async () => { const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms)); const click = (label) => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label)?.click(); ${body} })()`);
    await run(`document.querySelector('[data-nav-id="unread"]')?.click(); await wait(300);`);
    await shot('populated');
    await run(`document.querySelectorAll('[data-unread-toggle]').forEach((b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); }); await wait(250);`);
    await shot('expanded');
    await run(`click('Channels'); await wait(250);`);
    await shot('channels');
    await run(`click('Direct messages'); await wait(250);`);
    await shot('dms');
    await run(`click('Doats'); await wait(250);`);
    await shot('doats');
    await run(`click('All'); await wait(150); document.querySelector('.gw-unread-group__toggle')?.focus(); await wait(150);`);
    await shot('focus');
    await run(`click('Mark all as read'); await wait(300);`);
    await shot('marked');
    await run(`click('Undo'); await wait(300);`);
    await shot('undone');
    await run(`click('Mark all as read'); await wait(1400);`);
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'mentions' && capturePath) {
    const shot = async (suffix: string, delay = 250): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, delay)); await fs.writeFile(capturePath.replace(/\.png$/, `-${suffix}.png`), (await window.webContents.capturePage()).toPNG()); };
    const run = (body: string): Promise<unknown> => window.webContents.executeJavaScript(`(async () => { const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms)); const require = (condition, label) => { if (!condition) throw new Error('Mentions: ' + label); }; const rows = () => [...document.querySelectorAll('.gw-mentions .gw-inbox-row')]; ${body} })()`);
    await run(`document.querySelector('[data-nav-id="mentions"]')?.click(); await wait(400); require(document.querySelector('[data-nav-id="mentions"]')?.getAttribute('aria-current') === 'page', 'nav selected'); require(rows().length === 2, 'default filter shows the 2 unread mentions; got ' + rows().length + ' | ' + (document.querySelector('.gw-inbox-main, main')?.textContent ?? '').slice(0, 300)); require(document.querySelectorAll('.gw-mentions .gw-inbox-row.is-unread').length === 2, 'unread rows flagged');`);
    await shot('unread-default');
    await run(`[...document.querySelectorAll('.gw-mentions__filters button')].find((b) => b.textContent.startsWith('All')).click(); await wait(250); require(rows().length === 5, 'All shows 5 mentions'); require([...document.querySelectorAll('.gw-inbox-group-heading')].map((h) => h.textContent).join() === 'Today,Yesterday,Earlier', '3 groups'); rows()[3].focus(); await wait(150);`);
    await shot('all-groups');
    await run(`const first = rows()[0]; window.__mentionId = first.getAttribute('data-inbox-row'); require(/mentioned you in/.test(first.textContent), 'title phrasing'); require(first.querySelector('.gw-inbox-mention'), 'mention highlighted in preview'); first.click(); await wait(500); const marked = document.querySelector('.gw-msg-row.is-source, .gw-msg-thread__row.is-source'); require(marked && marked.getAttribute('data-message-id') === window.__mentionId, 'exact message highlighted');`);
    await shot('opened-flash', 100);
    await shot('opened-lasting', 2300);
    await run(`document.querySelector('[data-nav-id="mentions"]')?.click(); await wait(400); require(rows().length === 1, 'opened mention became read, 1 unread left'); rows()[0].focus(); await wait(100); rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })); await wait(400); require(rows().length === 5, 'caught up switches to All'); require(document.querySelector('.gw-mentions__summary').textContent === "You're all caught up", 'caught-up line'); require(document.querySelectorAll('.gw-mentions .gw-inbox-row.is-unread').length === 0, 'no unread rows left');`);
    await shot('caught-up');
    await run(`const select = document.querySelector('[aria-label="Local actor choice"]'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, '00000000-0000-4000-8000-000000000102'); select.dispatchEvent(new Event('change', { bubbles: true })); await wait(400); require(document.querySelector('.gw-inbox-empty h3')?.textContent === 'No mentions yet', 'empty state'); require(!document.querySelector('.gw-inbox-empty button'), 'empty state has no button');`);
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'needs-review' && capturePath) {
    const shot = async (suffix: string, delay = 250): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, delay)); await fs.writeFile(capturePath.replace(/\.png$/, `-${suffix}.png`), (await window.webContents.capturePage()).toPNG()); };
    const run = (body: string): Promise<unknown> => window.webContents.executeJavaScript(`(async () => { const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms)); const require = (condition, label) => { if (!condition) throw new Error('Needs review: ' + label); }; const rows = () => [...document.querySelectorAll('.gw-review .gw-inbox-row')]; const navWidth = () => document.querySelector('.gw-msg-nav').getBoundingClientRect().width; const list = async () => { document.querySelector('.gw-review__back')?.click(); await wait(200); }; const goReview = async () => { document.querySelector('[data-nav-id="needs-review"]')?.click(); await wait(300); await list(); }; ${body} })()`);
    await run(`const before = navWidth(); await goReview(); require(Math.abs(navWidth() - before) < 0.5, 'navigator width changed ' + before + ' -> ' + navWidth()); window.__navWidth = before;
      require(rows().length === 4, '4 items; got ' + rows().length);
      require([...document.querySelectorAll('.gw-inbox-group-heading')].map((h) => h.textContent).join() === 'Waiting on you,Updates', 'groups');
      require(!/Approve\\b/.test([...document.querySelectorAll('.gw-review__open, .gw-review button')].filter((b) => /^Approve$|^Reject$/.test(b.textContent.trim())).map((b) => b.textContent).join()), 'no approve/reject buttons');
      const badge = document.querySelector('[data-nav-id="needs-review"] .gw-msg-badge'); require(badge && getComputedStyle(badge).color === 'rgb(154, 91, 0)', 'amber badge: ' + (badge && getComputedStyle(badge).color));`);
    await shot('populated');
    await run(`rows()[0].focus(); await wait(150);`);
    await shot('hover-focus');
    for (const [index, name] of ['approval-1', 'approval-2', 'update-1', 'update-2'].entries()) {
      await run(`await list(); rows()[${index}].click(); await wait(300); const pane = document.querySelector('[data-review-source]'); require(pane, 'source pane for ${name}'); require(!pane.querySelector('input, textarea, select, [contenteditable]'), 'pane is read-only'); ${index < 2 ? "require(pane.textContent.includes('Waiting'), 'waiting line');" : ''} require(pane.querySelector('.gw-review__open'), 'Open task button'); require(!/Approve$|Reject$/.test(pane.querySelector('.gw-review__open').textContent), 'no decision button');`);
      await shot(name);
    }
    await run(`await list(); document.querySelectorAll('.gw-review__filters button')[1].click(); await wait(200); require(rows().length === 2, 'approvals filter'); document.querySelectorAll('.gw-review__filters button')[2].click(); await wait(200); require(rows().length === 2 && !rows()[0].textContent.includes('Waiting'), 'activity filter'); document.querySelectorAll('.gw-review__filters button')[0].click(); await wait(150);`);
    await shot('activity-filter');
    await run(`await list(); rows()[0].click(); await wait(250); const link = document.querySelector('.gw-review__link'); require(link, 'linked message link'); link.click(); await wait(600); require(document.querySelector('.gw-msg-row.is-highlighted, [data-message-id].is-highlighted, [data-message-id="inbox-sample-message-3-2"]'), 'opened the linked message');`);
    await shot('linked-message');
    await run(`await goReview(); require(Math.abs(navWidth() - window.__navWidth) < 0.5, 'navigator width stable on return'); rows()[0].click(); await wait(250); window.dispatchEvent(new CustomEvent('gwira:dev-resolve-sample-approval', { detail: 'inbox-sample-approval-copy' })); await wait(400); require(document.querySelector('[data-review-source]') === null && /No longer needs review/.test(document.querySelector('.gw-review__source').textContent), 'stale pane'); require(!document.querySelector('.gw-review__open'), 'no open task for stale');`);
    await shot('stale');
    await run(`await list(); require(rows().find((r) => /No longer needs review/.test(r.textContent)), 'stale row');`);
    await shot('stale-list');
    await run(`document.querySelector('[data-nav-id="unread"]')?.click(); await wait(250); await goReview(); require(!rows().some((r) => /No longer needs review/.test(r.textContent)), 'stale gone after leaving'); require(rows().length === 3, '3 left after leaving; got ' + rows().length);`);
    await shot('after-leaving');
    await run(`const nav = document.querySelector('[data-nav-id="needs-review"] .gw-msg-badge'); require(nav && nav.textContent.trim() === '1', 'badge count 1; got ' + (nav && nav.textContent));`);
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'drafts' && capturePath) {
    const shot = async (suffix: string, delay = 250): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, delay)); await fs.writeFile(capturePath.replace(/\.png$/, `-${suffix}.png`), (await window.webContents.capturePage()).toPNG()); };
    const run = (body: string): Promise<unknown> => window.webContents.executeJavaScript(`(async () => { const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms)); const require = (condition, label) => { if (!condition) throw new Error('Drafts: ' + label); }; const rows = () => [...document.querySelectorAll('.gw-drafts .gw-inbox-row')]; const goDrafts = async () => { document.querySelector('[data-nav-id="drafts"]')?.click(); await wait(350); }; const actor = async (id) => { const select = document.querySelector('[aria-label="Local actor choice"]'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, id); select.dispatchEvent(new Event('change', { bubbles: true })); await wait(450); }; ${body} })()`);
    await run(`await goDrafts(); require(document.querySelector('[data-nav-id="drafts"]')?.getAttribute('aria-current') === 'page', 'nav selected'); require(rows().length === 4, '4 items; got ' + rows().length); require([...document.querySelectorAll('.gw-inbox-group-heading')].map((h) => h.textContent).join() === 'Failed to send,Drafts', 'groups ' + [...document.querySelectorAll('.gw-inbox-group-heading')].map((h) => h.textContent).join()); require(document.querySelector('.gw-drafts__failed-glyph .gw-icon')?.getAttribute('aria-hidden') === 'true', 'registered failure icon'); require(rows()[0].classList.contains('is-failed') && rows()[0].textContent.includes('Not saved'), 'failed row first with reason'); require(/^Edited /.test(rows()[1].querySelector('time').textContent), 'edited time'); require(document.querySelector('[data-nav-id="drafts"]').textContent.includes('4'), 'nav count 4');`);
    await shot('populated');
    await run(`rows()[2].focus(); await wait(120);`);
    await shot('hover-focus');
    await run(`rows()[1].click(); await wait(500); const ta = document.querySelector('.gw-inbox-main textarea.gw-msg-textarea'); require(ta && document.activeElement === ta, 'composer focused'); require(ta.value.length > 0, 'draft restored: ' + ta.value);  window.__draftText = ta.value;`);
    await shot('resumed-channel');
    await run(`await goDrafts(); const thread = rows().find((r) => /Thread in/.test(r.textContent)); require(thread, 'thread draft row'); thread.click(); await wait(600); const ta = document.querySelector('.gw-inbox-side textarea.gw-msg-textarea'); require(ta && document.activeElement === ta, 'thread composer focused'); require(/fold the hero/.test(ta.value), 'thread draft restored');`);
    await shot('resumed-thread');
    await run(`await goDrafts(); const before = rows().length; rows()[2].focus(); [...document.querySelectorAll('.gw-drafts button[title="Discard"]')][1].click(); await wait(300); require(rows().length === before - 1, 'discard removed one'); require(document.querySelector('.gw-drafts__toast'), 'undo toast');`);
    await shot('discarded');
    await run(`[...document.querySelectorAll('.gw-drafts__toast button')].find((b) => b.textContent === 'Undo').click(); await wait(300); require(rows().length === 4, 'undo restored'); require(!document.querySelector('.gw-drafts__toast'), 'toast closed');`);
    await run(`const failed = rows()[0]; const countBefore = document.querySelectorAll('.gw-msg-row').length; failed.parentElement.querySelector('.gw-drafts__text-action').click(); await wait(400); require(rows().length === 3, 'retry removes failed row'); require(![...document.querySelectorAll('.gw-drafts__failed-glyph')].length, 'failed group gone');`);
    await shot('retried');
    await run(`document.querySelector('[data-nav-id="inbox-sample-channel-launch"], [data-nav-id="inbox-sample-first"]'); const nav = [...document.querySelectorAll('[data-nav-id]')].find((n) => /launch-planning/.test(n.textContent)); nav.click(); await wait(500); const bodies = [...document.querySelectorAll('.gw-msg-row')].filter((r) => /Resend|storage|notes/i.test(r.textContent)); require(document.querySelectorAll('.gw-msg-retry-button').length === 0, 'no leftover retry control');`);
    await run(`await actor('00000000-0000-4000-8000-000000000102'); await goDrafts(); require(document.querySelector('.gw-inbox-empty h3')?.textContent === 'No drafts', 'other actor sees no drafts (no leak)'); require(!document.querySelector('.gw-inbox-empty button'), 'no button');`);
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO === 'saved' && capturePath) {
    const shot = async (suffix: string, delay = 250): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, delay)); await fs.writeFile(capturePath.replace(/\.png$/, `-${suffix}.png`), (await window.webContents.capturePage()).toPNG()); };
    const run = (body: string): Promise<unknown> => window.webContents.executeJavaScript(`(async () => { const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms)); const require = (condition, label) => { if (!condition) throw new Error('Saved: ' + label); }; const rows = () => [...document.querySelectorAll('.gw-saved .gw-inbox-row')]; const until = async (test) => { for (let i = 0; i < 30 && !test(); i++) await wait(100); }; const mode = (label) => [...document.querySelectorAll('.gw-saved__modes button')].find((b) => b.textContent === label).click(); ${body} })()`);
    await run(`document.querySelector('[data-nav-id="saved"]')?.click(); await wait(400); require(document.querySelector('[data-nav-id="saved"]')?.getAttribute('aria-current') === 'page', 'nav selected'); require(rows().length === 6, 'six saved rows by date; got ' + rows().length); require(document.querySelectorAll('.gw-saved-chip').length >= 2, 'record chips shown');`);
    await shot('date');
    await run(`mode('Conversation'); await wait(250); require(rows().length === 6, 'six saved rows by conversation'); require(document.querySelectorAll('.gw-inbox-group-heading').length === 3, 'three conversation groups');`);
    await shot('conversation');
    await run(`rows()[0].focus(); await wait(120);`);
    await shot('focus');
    await run(`const first = rows()[0]; first.closest('li').querySelector('.gw-inbox-row__action').click(); await wait(250); require(rows().length === 5, 'unsave removes the row'); require(document.querySelector('.gw-saved__toast'), 'undo toast shown');`);
    await shot('unsaved');
    await run(`document.querySelector('.gw-saved__toast button').click(); await wait(300); require(rows().length === 6, 'undo restores the row'); require(!document.querySelector('.gw-saved__toast'), 'toast closed');`);
    await run(`rows()[0].closest('li').querySelector('.gw-inbox-row__action').click(); await wait(5400); require(!document.querySelector('.gw-saved__toast'), 'toast expires after 5 seconds'); require(rows().length === 5, 'stays unsaved');`);
    await run(`const before = rows()[0]; const id = before.getAttribute('data-inbox-row'); before.click(); await until(() => document.querySelector('.is-source')); const marked = document.querySelector('.is-source'); require(marked, 'opened message is highlighted'); require(marked.getAttribute('data-message-id') === id, 'exact saved message highlighted');`);
    await shot('opened');
    await run(`const url = new URL(location.href); url.searchParams.set('sampleData', 'keep'); history.replaceState(null, '', url); await wait(600);`);
    const loaded = new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
    window.webContents.reload();
    await loaded;
    await run(`await wait(600);`);
    // The page may rewrite its own storage while unloading, so re-apply the fixture until the reloaded page reflects it.
    for (let attempt = 0; attempt < 4; attempt++) {
      await run(`const inbox = [...document.querySelectorAll('button[data-navigation-view="inbox"]')].at(-1); inbox?.click(); await wait(300); document.querySelector('[data-nav-id="saved"]')?.click(); await wait(500);`);
      await run(`const key = Object.keys(localStorage).find((k) => k.startsWith('gwira.inbox.dev-sample.v1:') && !k.includes('recovery')); require(key, 'sample storage found'); const data = JSON.parse(localStorage.getItem(key)); const room = 'inbox-sample-channel-customer'; data.conversations = data.conversations.map((c) => c.id === room ? { ...c, visibility: 'private' } : c); data.memberships = data.memberships.map((m) => m.conversationId === room && m.participant.id === data.selfPersonId ? { ...m, leftAt: new Date().toISOString() } : m); localStorage.setItem(key, JSON.stringify(data));`);
      const loadedAfterPatch = new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
      window.webContents.reload();
      await loadedAfterPatch;
      const applied = await run(`await wait(900); return JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('gwira.inbox.dev-sample.v1:') && !k.includes('recovery'))) ?? '{}').memberships?.some((m) => m.conversationId === 'inbox-sample-channel-customer' && m.leftAt) === true;`);
      if (applied) break;
    }
    await run(`await wait(500); const inbox = [...document.querySelectorAll('button[data-navigation-view="inbox"]')].at(-1); inbox?.click(); await wait(400); document.querySelector('[data-nav-id="saved"]')?.click(); await until(() => rows().some((r) => /Conversation unavailable/.test(r.textContent))); const gone = rows().filter((r) => /Conversation unavailable/.test(r.textContent)); require(gone.length > 0, 'unavailable rows shown; ' + JSON.stringify({ keys: Object.keys(localStorage).filter((k) => k.includes('messaging')), left: (JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('gwira.inbox.dev-sample.v1:') && !k.includes('recovery'))) ?? '{}').memberships ?? []).filter((m) => m.leftAt).length, titles: rows().map((r) => r.textContent.slice(0, 40)), url: location.search })); require(gone.every((r) => r.closest('li').querySelectorAll('.gw-inbox-row__action').length === 1), 'unsave is the only action'); const before = document.querySelector('.is-source'); gone[0].click(); await wait(300); require(document.querySelector('[data-nav-id="saved"]')?.getAttribute('aria-current') === 'page', 'unavailable row does not navigate');`);
    await shot('unavailable');
    await run(`mode('Conversation'); await wait(250); require([...document.querySelectorAll('.gw-inbox-group-heading')].at(-1).textContent === 'Conversation unavailable', 'unavailable group last');`);
    await shot('unavailable-grouped');
    await run(`for (let i = 0; i < 10 && rows().length; i++) { rows()[0].closest('li').querySelector('.gw-inbox-row__action').click(); await wait(120); } await wait(300); require(document.querySelector('.gw-inbox-empty h3')?.textContent === 'Nothing saved yet', 'empty state'); require(!document.querySelector('.gw-inbox-empty button'), 'empty state has no button');`);
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (scenario === 'functional' && capturePath) {
    const selectedId = await window.webContents.executeJavaScript(`document.querySelector('.gw-msg-nav__row[data-nav-id][aria-current="page"]')?.getAttribute('data-nav-id')`);
    const loaded = new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
    window.webContents.reload();
    await loaded;
    const recovered = await window.webContents.executeJavaScript(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const inbox = [...document.querySelectorAll('button[data-navigation-view="inbox"]')].at(-1); inbox?.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Back to conversations')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      document.querySelector('[data-nav-id="' + ${JSON.stringify(selectedId)} + '"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      return document.querySelector('[aria-label="Write a message"]')?.value === 'Recovered actor draft'
        && document.querySelector('.gw-msg-linked-count')?.textContent?.trim() === '1 linked'
        && document.querySelectorAll('.gw-msg-row').length === 2;
    })()`);
    if (!recovered) throw new Error('Inbox message and linked-draft reload recovery failed');
    (result as Record<string, unknown>).reloadRecovery = true;
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  } else if (capturePath) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  }
  return result as Record<string, unknown>;
}

async function chooseLocalForCapture(window:BrowserWindow):Promise<void>{
 // Capture/smoke harnesses explicitly enter their isolated local profile; production has no local auth button.
 await window.webContents.executeJavaScript(`window.codexDesktop.account.command({type:'local'})`);
 await window.webContents.executeJavaScript(`(async()=>{for(let i=0;i<100;i++){if(document.querySelector('.shell'))return;await new Promise(r=>setTimeout(r,50));}throw Error('Local workspace did not open after explicit local choice');})()`);
}

async function runWorkflowCapture(window: BrowserWindow): Promise<void> {
  await chooseLocalForCapture(window);
  const capturePath = process.env.ELECTRON_WORKFLOW_CAPTURE_PATH;
  const maximizeCaptureWindow = process.env.ELECTRON_WORKFLOW_CAPTURE_MAXIMIZED === '1';
  const initialContentBounds = window.getContentBounds();
  if (maximizeCaptureWindow && !window.isMaximized()) {
    const maximized = new Promise<void>((resolve) => window.once('maximize', () => resolve()));
    window.maximize();
    await maximized;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
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
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_SUITE)} === 'inbox') {
      const now = new Date().toISOString();
      const personId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const teammateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const taskId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const inboxScenario = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO)};
      state.onboarding = { ...(state.onboarding ?? {}), version: 1, currentStep: 'complete', completedAt: state.onboarding?.completedAt ?? now };
      state.people = [...(state.people ?? []).filter((person) => ![personId, teammateId].includes(person.id)),
        { id: personId, workspaceId: state.workspace.id, name: 'Capture Operator', role: 'Operations', createdAt: now },
        { id: teammateId, workspaceId: state.workspace.id, name: 'Capture Teammate', role: 'Operations', createdAt: now }];
      state.tasks = (state.tasks ?? []).filter((task) => task.id !== taskId);
      state.approvals = (state.approvals ?? []).filter((approval) => approval.id !== 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
      state.activity = (state.activity ?? []).filter((event) => event.id !== 'ffffffff-ffff-4fff-8fff-ffffffffffff');
      if (['activity', 'functional', 'showcase', 'unread', 'threads', 'mentions', 'saved', 'drafts', 'needs-review', 'channel', 'group', 'search', 'multiline', 'stress', 'overflow'].includes(inboxScenario)) {
        state.tasks.push({ id: taskId, workspaceId: state.workspace.id, title: 'Review the launch brief', description: 'Confirm the local approval feed entry.', status: 'in_review', priority: 'high', assignee: { kind: 'person', id: personId }, createdAt: now, updatedAt: now });
        state.approvals.push({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', taskId, resultId: 'result-capture-1', requestedBy: { kind: 'person', id: personId }, status: 'pending', createdAt: now });
        state.activity.push({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', workspaceId: state.workspace.id, kind: 'task_created', occurredAt: new Date(Date.now() - 60_000).toISOString(), actor: { kind: 'person', id: personId }, taskId, summary: 'Review the launch brief' });
      }
    }
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_SUITE)} === 'inbox' && ${JSON.stringify(process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO)} === 'stress') {
      for (let index = 0; index < 10; index++) state.tasks.push({ id: 'd0000000-0000-4000-8000-' + String(index).padStart(12, '0'), workspaceId: state.workspace.id, title: 'Capture fixture: verify the long linked record title and its review requirements ' + (index + 1), status: 'todo', priority: 'medium', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  })()`);
  if (!prepared) throw new Error('Workflow capture failed: local workspace state was unavailable');
  window.webContents.reload();
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  await chooseLocalForCapture(window);
  if (process.env.ELECTRON_WORKFLOW_CAPTURE_SUITE === 'inbox') {
    const result = await runInboxCapture(window, capturePath);
    console.log(`ELECTRON_WORKFLOW_CAPTURE_RESULT ${JSON.stringify(result)}`);
    app.exit(0);
    return;
  }
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
    let keyboardViewNavigationWorks = false;
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_KEYBOARD)} === '1') {
      const workflowTab = document.querySelector('[data-dashboard-view="workflow"][role="tab"]');
      workflowTab?.focus();
      workflowTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await wait(50);
      const timelineTab = document.querySelector('[data-dashboard-view="timeline"][role="tab"]');
      keyboardViewNavigationWorks = Boolean(timelineTab?.getAttribute('aria-selected') === 'true');
      timelineTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await wait(50);
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
      const listRoot = document.querySelector('.gwira-list');
      if (kind === 'listgroup' && listRoot) {
        const select = listRoot.querySelector('[data-testid="list-group-by"]');
        if (select) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value); select.dispatchEvent(new Event('change', { bubbles: true })); await wait(250); }
      }
      if (kind === 'listgrouparrows' && listRoot) {
        let group = listRoot.querySelector('[data-list-group-id]');
        group?.focus();
        group?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        await wait(100);
        const collapsed = listRoot.querySelector('[data-list-group-id]')?.getAttribute('aria-expanded') === 'false';
        group = listRoot.querySelector('[data-list-group-id]');
        group?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await wait(100);
        window.__listGroupCheck = { collapsed, expanded: listRoot.querySelector('[data-list-group-id]')?.getAttribute('aria-expanded') === 'true' };
      }
      if (kind === 'listfilter' && listRoot) {
        const [key, filterValue] = value.split('=');
        listRoot.querySelector('.gw-work-toolbar [aria-haspopup="dialog"]')?.click();
        await wait(80);
        const select = [...document.querySelectorAll('.gw-work-filter-menu label')].find((label) => label.textContent?.startsWith(key === 'Owner' ? 'Assignee' : key))?.querySelector('select');
        const option = select && [...select.options].find((entry) => entry.textContent === filterValue || entry.value === filterValue);
        if (select && option) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); }
        await wait(250);
      }
      if (kind === 'listsearch' && listRoot) {
        const input = listRoot.querySelector('[data-testid="list-search"]');
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (input instanceof HTMLInputElement) { setValue?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await wait(250); }
      }
      if (kind === 'listsort' && listRoot) {
        const select = listRoot.querySelector('[data-testid="list-sort-by"]');
        if (select) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value); select.dispatchEvent(new Event('change', { bubbles: true })); await wait(250); }
      }
      if (kind === 'listrowheights' && listRoot) {
        const applied = [];
        for (const height of value.split(',')) {
          const more=listRoot.querySelector('.gw-work-toolbar__more');if(more&&!more.open)more.open=true;
          listRoot.querySelector('.gwira-list__display button')?.click();await wait(80);
          const item=Array.from(document.querySelectorAll('.compact-action-menu button')).find(button=>button.textContent.includes(height+' px'));
          if(item){item.click();await wait(100);applied.push(Number(listRoot.getAttribute('data-row-height')));}
        }
        window.__listRowHeights = applied;
      }
      if (kind === 'listselect' && listRoot) { listRoot.querySelector('[data-list-task-id="' + value.replace(/"/g, '') + '"]')?.click(); await wait(1000); }
      if (kind === 'listkey' && listRoot) {
        const first = listRoot.querySelector('[data-list-task-id]');
        first?.focus();
        first?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        await wait(500);
        const active = document.activeElement;
        window.__listKeyboardCheck = { target: active instanceof HTMLElement ? active.dataset.listTaskId ?? null : null, title: active?.textContent ?? '' };
      }
      if (kind === 'listkeyselect' && listRoot) {
        const first = listRoot.querySelector('[data-list-task-id]');
        first?.focus();
        first?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        await wait(350);
      }
      const calendarRoot = document.querySelector('.gwira-calendar');
      if (kind === 'calview' && calendarRoot) {
        [...calendarRoot.querySelectorAll('.gwira-calendar__view-switch button')].find((button) => button.textContent?.trim().toLowerCase() === value)?.click();
        await wait(250);
      }
      if (kind === 'calselect' && calendarRoot) {
        calendarRoot.querySelector('[data-calendar-task-id="' + value.replace(/"/g, '') + '"]')?.click();
        await wait(350);
      }
      if (kind === 'calfilter' && calendarRoot) {
        const [key, filterValue] = value.split('=');
        if (!document.querySelector('.gw-work-filter-menu')) calendarRoot.querySelector('.gwira-calendar__controls [aria-haspopup="dialog"]')?.click();
        await wait(100);
        const select = [...document.querySelectorAll('.gw-work-filter-menu label')].find((label) => label.textContent?.startsWith(key === 'Owner' ? 'Assignee' : key))?.querySelector('select');
        const option = select && [...select.options].find((entry) => entry.textContent === filterValue || entry.value === filterValue);
        if (select && option) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); }
        await wait(300);
        const pop = document.querySelector('.gw-work-filter-menu')?.getBoundingClientRect();
        const bounds = calendarRoot.getBoundingClientRect();
        window.__calendarChecks = { ...window.__calendarChecks, filter: { popoverInside: Boolean(pop && pop.left >= 0 && pop.right <= window.innerWidth && pop.bottom <= window.innerHeight), strip: calendarRoot.querySelector('.gwira-work-filters')?.textContent ?? null, chips: calendarRoot.querySelectorAll('.gwira-work-filters__chip').length } };
      }
      if (kind === 'calsearch' && calendarRoot) {
        const input = calendarRoot.querySelector('.gwira-calendar__search input');
        if (input instanceof HTMLInputElement) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await wait(300); }
      }
      if (kind === 'calclear' && calendarRoot) {
        calendarRoot.querySelector('.gwira-work-filters__clear')?.click(); await wait(250);
        window.__calendarChecks = { ...window.__calendarChecks, clear: { chips: calendarRoot.querySelectorAll('.gwira-work-filters__chip').length, strip: Boolean(calendarRoot.querySelector('.gwira-work-filters')) } };
      }
      if (kind === 'calrecover' && calendarRoot) {
        const before = Boolean(calendarRoot.querySelector('.gwira-calendar__notice'));
        calendarRoot.querySelector('.gwira-calendar__notice button')?.click(); await wait(300);
        window.__calendarChecks = { ...window.__calendarChecks, recovery: { before, after: Boolean(calendarRoot.querySelector('.gwira-calendar__notice')) } };
      }
      if (kind === 'caldaykey' && calendarRoot) {
        const dateButton = calendarRoot.querySelector('.gwira-calendar__day-number[tabindex="0"], .gwira-calendar__day-strip button[tabindex="0"]');
        const before = calendarRoot.getAttribute('data-calendar-anchor');
        dateButton?.focus();
        dateButton?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        await wait(250);
        window.__calendarChecks = { ...window.__calendarChecks, keyboard: { before, after: calendarRoot.getAttribute('data-calendar-anchor'), focused: document.activeElement?.getAttribute('data-calendar-day') } };
      }
      if (kind === 'calhidedetails' && calendarRoot) {
        const toggle=document.querySelector('[data-testid="dashboard-context-toggle"]');
        const before=toggle?.getAttribute('aria-expanded');toggle?.click();await wait(150);
        const opened=toggle?.getAttribute('aria-expanded')==='true';
        if(opened)toggle?.click();await wait(150);
        window.__calendarChecks={...window.__calendarChecks,hideInspector:{visible:Boolean(toggle),opened,before,expanded:toggle?.getAttribute('aria-expanded')}};
      }
      const boardRoot = document.querySelector('.gwira-board');
      if (kind === 'boardselect' && boardRoot) {
        boardRoot.querySelector('[data-board-card="' + value.replace(/"/g, '') + '"]')?.click();
        await wait(350);
      }
      if (kind === 'boardfilter' && boardRoot) {
        const [key, filterValue] = value.split('=');
        if (!document.querySelector('.gw-work-filter-menu')) boardRoot.querySelector('.gw-work-toolbar [aria-haspopup="dialog"]')?.click();
        await wait(100);
        const select = [...document.querySelectorAll('.gw-work-filter-menu label')].find((label) => label.textContent?.startsWith(key === 'Owner' ? 'Assignee' : key))?.querySelector('select');
        const option = select && [...select.options].find((entry) => entry.textContent === filterValue || entry.value === filterValue);
        if (select && option) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); }
        await wait(300);
        const pop = document.querySelector('.gw-work-filter-menu')?.getBoundingClientRect();
        const bounds = boardRoot.getBoundingClientRect();
        window.__boardChecks = { ...window.__boardChecks, filter: { popoverInside: Boolean(pop && pop.left >= 0 && pop.right <= window.innerWidth && pop.bottom <= window.innerHeight), strip: boardRoot.querySelector('.gwira-work-filters')?.textContent ?? null, chips: boardRoot.querySelectorAll('.gwira-work-filters__chip').length } };
      }
      if (kind === 'boardsearch' && boardRoot) {
        const input = boardRoot.querySelector('.gwira-board__search input');
        if (input instanceof HTMLInputElement) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await wait(300); }
      }
      if (kind === 'boardclear' && boardRoot) {
        boardRoot.querySelector('.gwira-work-filters__clear')?.click(); await wait(250);
        window.__boardChecks = { ...window.__boardChecks, clear: { chips: boardRoot.querySelectorAll('.gwira-work-filters__chip').length, strip: Boolean(boardRoot.querySelector('.gwira-work-filters')) } };
      }
      if (kind === 'boardrecover' && boardRoot) {
        const before = Boolean(boardRoot.querySelector('.gwira-board__notice'));
        boardRoot.querySelector('.gwira-board__notice button')?.click(); await wait(300);
        window.__boardChecks = { ...window.__boardChecks, recovery: { before, after: Boolean(boardRoot.querySelector('.gwira-board__notice')) } };
      }
      if (kind === 'boardcollapse' && boardRoot) {
        boardRoot.querySelector('[data-board-column="' + value + '"] .gwira-board__column-header button')?.click();
        await wait(200);
      }
      if (kind === 'boardkey' && boardRoot) {
        const first = boardRoot.querySelector('.gwira-board__card');
        const before = first?.getAttribute('data-board-card') ?? null;
        first?.focus();
        first?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        await wait(200);
        window.__boardChecks = { ...window.__boardChecks, keyboard: { before, target: document.activeElement?.getAttribute('data-board-card') ?? null } };
      }
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
        const toggle = document.querySelector('[data-testid="dashboard-context-toggle"]');
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
        const filterButton = tl.querySelector('.gw-work-toolbar [aria-haspopup="dialog"]');
        if (!document.querySelector('.gw-work-filter-menu')) filterButton?.click();
        await wait(150);
        const select = [...document.querySelectorAll('.gw-work-filter-menu label')].find((label) => label.textContent?.startsWith(key === 'Owner' ? 'Assignee' : key))?.querySelector('select');
        if (select) {
          const option = [...select.options].find((entry) => entry.textContent === filterValue || entry.value === filterValue);
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option ? option.value : filterValue);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await wait(300);
        const pop = document.querySelector('.gw-work-filter-menu')?.getBoundingClientRect();
        const rootBox = tl.getBoundingClientRect();
        window.__timelineChecks = { ...window.__timelineChecks, filter: { popoverInside: Boolean(pop && pop.left >= 0 && pop.right <= window.innerWidth && pop.bottom <= window.innerHeight), popover: pop ? [Math.round(pop.left), Math.round(pop.right), Math.round(pop.bottom)] : null, strip: tl.querySelector('.gwira-work-filters')?.textContent ?? null, chips: tl.querySelectorAll('.gwira-work-filters__chip').length, warning: tl.querySelector('[data-testid="timeline-hidden-attention"]')?.textContent ?? null } };
      }
      if (kind === 'clearfilters' && tl) {
        tl.querySelector('.gwira-work-filters__clear')?.click(); await wait(300);
        window.__timelineChecks = { ...window.__timelineChecks, cleared: { strip: tl.querySelector('.gwira-work-filters') !== null, chips: tl.querySelectorAll('.gwira-work-filters__chip').length } };
      }
      if (kind === 'removechip' && tl) {
        tl.querySelector('.gwira-work-filters__chip')?.click(); await wait(300);
        window.__timelineChecks = { ...window.__timelineChecks, chipRemoved: { chips: tl.querySelectorAll('.gwira-work-filters__chip').length } };
      }
      if (kind === 'hidedetails' && tl) {
        const before = Math.round(tl.getBoundingClientRect().width);
        const button = tl.querySelector('[data-testid="timeline-hide-inspector"]');
        const visible = Boolean(button && getComputedStyle(button).display !== 'none');
        if (visible) button.click();
        await wait(400);
        window.__timelineChecks = { ...window.__timelineChecks, inspector: { before, after: Math.round(tl.getBoundingClientRect().width), expandedBefore: 'true', expandedAfter: document.querySelector('[data-testid="dashboard-context-toggle"]')?.getAttribute('aria-expanded'), buttonVisible: visible, nameWidth: Math.round(tl.querySelector('.gwira-timeline__corner')?.getBoundingClientRect().width ?? 0) } };
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
    const toggle = document.querySelector('[data-testid="dashboard-context-toggle"]');
    if (toggle?.getAttribute('aria-expanded') === 'false' && !window.__timelineChecks?.inspector && document.querySelector('.gwira-dashboard')?.getAttribute('data-narrow-inspector') !== 'true') {
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
    let filesCapture;
    let terminalCapture;
    let filesHoverConfirmed = false;
    let filesHoverFallback = false;
    let workspaceSessionsTab = '';
    let workspaceSessionsPanel = false;
    let workspaceSessionsWidth = '';
    let workspaceSessionsToolTabs = 0;
    let workspaceSessionsStableTab = false;
    let workspaceSessionsReused = false;
    let workspaceSessionsCloseFallback = false;
    let workspaceSessionsRoute = '';
    let workspaceSessionsEmpty = false;
    let workspaceSessionsSelected = false;
    if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_F3)} === '1') {
      const chooseDestination = async (label) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })); await wait(60);
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
      const setWorkspaceWidth = async () => {
        const requestedWidth = Number(${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_WORKSPACE_WIDTH)});
        if (!requestedWidth) return '';
        const divider = document.querySelector('[aria-label="Resize Workspace"]');
        if (!divider) throw new Error('F3 capture failed: Workspace resize divider is missing');
        divider.focus();
        const minimumWidth = Number(divider.getAttribute('aria-valuemin'));
        const maximumWidth = Number(divider.getAttribute('aria-valuemax'));
        if (requestedWidth <= minimumWidth) {
          divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
        } else if (requestedWidth >= maximumWidth) {
          divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        } else {
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const currentWidth = Number(divider.getAttribute('aria-valuenow'));
            if (currentWidth === requestedWidth) break;
            divider.dispatchEvent(new KeyboardEvent('keydown', { key: requestedWidth > currentWidth ? 'ArrowLeft' : 'ArrowRight', bubbles: true, cancelable: true }));
            await wait(25);
          }
        }
        await wait(160);
        return divider.getAttribute('aria-valuenow') ?? '';
      };
      if (scenario === 'navigation-sessions') {
        const tabs = () => [...document.querySelectorAll('.global-topbar__primary-tabs [role="tab"]')];
        const selected = () => tabs().find(tab => tab.getAttribute('aria-selected') === 'true');
        document.querySelector('.gwira-primary-rail [data-navigation-view="home"]')?.click(); await wait(180);
        const initialCount = tabs().length;
        const library = document.querySelector('.gwira-secondary-sidebar [data-navigation-view="library"]');
        if (!library) throw new Error('Shell capture failed: Library navigation is missing');
        library.click(); await wait(180);
        if (tabs().length !== initialCount || selected()?.textContent?.trim() !== 'Library') throw new Error('Shell capture failed: navigation created a tab or did not select Library');
        document.querySelector('.global-topbar__primary-tabs [aria-label="Open a new global tab"]')?.click(); await wait(180);
        if (tabs().length !== initialCount + 1 || selected()?.textContent?.trim() !== 'Home' || document.querySelector('[aria-label="Open destination"]')) throw new Error('Shell capture failed: new tab did not open directly at Home');
        document.querySelector('.gwira-primary-rail [data-navigation-view="dashboard"]')?.click(); await wait(180);
        if (tabs().length !== initialCount + 1 || selected()?.textContent?.trim() !== 'Dashboard') throw new Error('Shell capture failed: Dashboard did not replace the active tab');
        tabs().find(tab => tab.textContent?.trim() === 'Library')?.click(); await wait(180);
        if (selected()?.textContent?.trim() !== 'Library') throw new Error('Shell capture failed: switching tabs lost Library');
        tabs().find(tab => tab.textContent?.trim() === 'Dashboard')?.click(); await wait(180);
        const topToggle = document.querySelector('.global-topbar [aria-label="Collapse sidebar"]');
        topToggle?.click(); await wait(180);
        if (!document.querySelector('.gwira-primary-rail [aria-label="Expand sidebar"] [data-icon="sidebar-expand"]')) throw new Error('Shell capture failed: rail did not reflect collapsed sidebar');
        document.querySelector('.gwira-primary-rail [aria-label="Expand sidebar"]')?.click(); await wait(180);
        if (!document.querySelector('.global-topbar [aria-label="Collapse sidebar"] [data-icon="sidebar-collapse"]')) throw new Error('Shell capture failed: top bar did not reflect expanded sidebar');
        const back = document.querySelector('.global-topbar [aria-label="Back"]');
        if (!(back instanceof HTMLButtonElement) || back.disabled) throw new Error('Shell capture failed: new tab history is unavailable');
        back.click(); await wait(180);
        if (selected()?.textContent?.trim() !== 'Home') throw new Error('Shell capture failed: Back did not restore new tab Home');
        document.querySelector('.global-topbar [aria-label="Forward"]')?.click(); await wait(180);
        if (selected()?.textContent?.trim() !== 'Dashboard') throw new Error('Shell capture failed: Forward did not restore Dashboard');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true, cancelable: true })); await wait(180);
        if (tabs().length !== initialCount + 2 || selected()?.textContent?.trim() !== 'Home') throw new Error('Shell capture failed: keyboard shortcut did not create a Home tab');
        document.querySelector('.global-topbar__primary-tabs .global-tab.is-active .global-tab__close')?.click(); await wait(180);
        if (tabs().length !== initialCount + 1 || selected()?.textContent?.trim() !== 'Dashboard') throw new Error('Shell capture failed: closing the active tab did not restore Dashboard');
      } else if (scenario === 'multiple-tabs') {
        document.querySelector('.global-topbar__primary-tabs [aria-label="Open a new global tab"]')?.click(); await wait(80);
        await chooseDestination('Inbox');
        document.querySelector('.global-topbar__primary-tabs [aria-label="Open a new global tab"]')?.click(); await wait(80);
        await chooseDestination('My Work');
        document.querySelector('.global-topbar__primary-tabs [aria-label="Open a new global tab"]')?.click(); await wait(80);
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
            document.querySelector('[data-testid="dashboard-context-toggle"]')?.click(); await wait(120);
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
              document.querySelector('.global-topbar__primary-tabs [aria-label="Open a new global tab"]')?.click(); await wait(80);
              await chooseDestination('Inbox');
              chooseDashboardTab(); await wait(100);
            }
          }
        }
      } else if (scenario.startsWith('nav-')) {
        const view = scenario.slice(4);
        if (view === 'library') { document.querySelector('button[data-navigation-view="home"]')?.click(); await wait(120); }
        let destination = document.querySelector(':is(.gwira-secondary-sidebar, .gwira-primary-rail) button[data-navigation-view="' + view + '"]');
        if (!destination) {
          document.querySelector('button[aria-label="More"]')?.click(); await wait(60);
          destination = document.querySelector('.gwira-more-menu button[data-navigation-view="' + view + '"]');
        }
        if (!destination) throw new Error('Capture navigation destination is unavailable: ' + view);
        destination.click(); await wait(240);
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
        document.querySelector('.my-work__view:not([hidden]) [data-list-task-id], .my-work__view:not([hidden]) [data-board-card], .gwira-task-card')?.click(); await wait(180);
      } else if (scenario === 'more-menu') {
        document.querySelector('button[aria-label="More"]')?.click(); await wait(120);
      } else if (scenario === 'notifications') {
        document.querySelector('button[aria-label^="Notifications"]')?.click(); await wait(100);
      } else if (scenario === 'picker') {
        document.querySelector('button[aria-label="Open a new workspace tab"]')?.click(); await wait(80);
      } else if (scenario === 'workspace-sessions') {
        await chooseDestination('Inbox');
        const toggle = document.querySelector('[aria-label="Workspace tools"]');
        if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
        await wait(120);
        const openLauncher = () => {
          let launcher = document.querySelector('[data-testid="new-tab-launcher"]');
          if (!launcher) {
            document.querySelector('.global-topbar__workspace-tabs .global-topbar__add')?.click();
          }
          return launcher;
        };
        let launcher = openLauncher();
        await wait(120);
        launcher = document.querySelector('[data-testid="new-tab-launcher"]');
        const initialWorkspaceTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active');
        const initialRoute = document.querySelector('.workspace')?.getAttribute('data-workspace-view') ?? '';
        const chooseWorkSessions = () => [...(launcher?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Work Sessions');
        const firstChoice = chooseWorkSessions();
        if (!firstChoice || !initialWorkspaceTab) throw new Error('F3 capture failed: the Workspace launcher or Work Sessions option is missing');
        firstChoice.click();
        await wait(240);
        const firstSessionTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active');
        const sessionPanel = document.querySelector('.workspace-tools__sessions .work-sessions[data-workspace-context="true"]');
        if (!sessionPanel || !firstSessionTab) throw new Error('F3 capture failed: Work Sessions did not open in the Workspace panel');
        workspaceSessionsStableTab = firstSessionTab === initialWorkspaceTab;
        const plus = document.querySelector('.global-topbar__workspace-tabs .global-topbar__add');
        plus?.click();
        await wait(120);
        launcher = document.querySelector('[data-testid="new-tab-launcher"]');
        const secondChoice = chooseWorkSessions();
        if (!launcher || !secondChoice) throw new Error('F3 capture failed: the Workspace plus button did not open a new launcher');
        secondChoice.click();
        await wait(240);
        const activeWorkspaceTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active');
        workspaceSessionsReused = activeWorkspaceTab === firstSessionTab;
        workspaceSessionsToolTabs = document.querySelectorAll('.global-topbar__workspace-tabs .global-tab').length;
        const closeSessionTab = document.querySelector('.global-topbar__workspace-tabs [aria-label="Close Work Sessions tab"]');
        closeSessionTab?.click();
        await wait(160);
        workspaceSessionsCloseFallback = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active .global-tab__select')?.textContent?.trim() === 'New tab'
          && document.querySelector('[data-testid="new-tab-launcher"]') instanceof HTMLElement;
        launcher = document.querySelector('[data-testid="new-tab-launcher"]');
        const finalChoice = chooseWorkSessions();
        if (!workspaceSessionsCloseFallback || !finalChoice) throw new Error('F3 capture failed: closing the final Work Sessions tab did not restore the launcher');
        finalChoice.click();
        await wait(240);
        workspaceSessionsTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active .global-tab__select')?.textContent?.trim() ?? '';
        workspaceSessionsPanel = !!document.querySelector('.workspace-tools__sessions .work-sessions[data-workspace-context="true"]');
        workspaceSessionsRoute = document.querySelector('.workspace')?.getAttribute('data-workspace-view') ?? '';
        if (workspaceSessionsRoute !== initialRoute) throw new Error('F3 capture failed: opening Work Sessions changed the active global canvas');
        workspaceSessionsWidth = await setWorkspaceWidth();
        const sessionState = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_WORK_SESSION_STATE)};
        if (sessionState === 'selected') {
          const row = document.querySelector('.work-sessions__list [data-work-row]');
          if (!row) throw new Error('F3 capture failed: seeded Work Session row is missing');
          row.click();
          await wait(180);
          workspaceSessionsSelected = !!document.querySelector('.work-sessions__feed-layout.has-selection .work-inspector');
        } else if (sessionState === 'empty') {
          workspaceSessionsEmpty = document.querySelector('.work-sessions__empty h3')?.textContent?.trim() === 'No work sessions yet'
            && document.querySelectorAll('.work-sessions__list [data-work-row]').length === 0;
        }
      } else if (scenario === 'terminal-idle') {
        await chooseDestination('Inbox');
        const workspaceToggle = document.querySelector('[aria-label="Workspace tools"]');
        if (workspaceToggle?.getAttribute('aria-expanded') === 'false') workspaceToggle.click();
        await wait(120);
        let launcher = document.querySelector('[data-testid="new-tab-launcher"]');
        if (!launcher) {
          document.querySelector('.global-topbar__workspace-tabs .global-topbar__add')?.click();
          await wait(120);
          launcher = document.querySelector('[data-testid="new-tab-launcher"]');
        }
        const initialTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active');
        const initialCount = document.querySelectorAll('.global-topbar__workspace-tabs .global-tab').length;
        const terminalChoice = [...(launcher?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Terminal');
        if (!initialTab || !terminalChoice) throw new Error('F3 capture failed: the Terminal launcher option or active Workspace tab is missing');
        terminalChoice.click();
        await wait(240);
        const activeTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active');
        const activeGlobal = document.querySelector('.global-topbar__tabs--global [role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '';
        const activeWorkspaceTab = activeTab?.querySelector('.global-tab__select')?.textContent?.trim() ?? '';
        const startButton = document.querySelector('.workspace-terminal__start-button');
        const workspaceWidth = await setWorkspaceWidth();
        terminalCapture = {
          activeGlobal,
          activeWorkspaceTab,
          startLabel: startButton?.textContent?.trim() ?? '',
          workspaceWidth,
          tabCountStable: document.querySelectorAll('.global-topbar__workspace-tabs .global-tab').length === initialCount
            && activeTab === initialTab
        };
        if (activeGlobal !== 'Inbox' || activeWorkspaceTab !== 'Terminal' || !startButton || !terminalCapture.tabCountStable) {
          throw new Error('F3 capture failed: Terminal did not replace its launcher tab while preserving Inbox');
        }
      } else if (scenario.startsWith('files-')) {
        const filesGlobalDestination = ${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_FILES_GLOBAL_DESTINATION || 'Inbox')};
        await chooseDestination(filesGlobalDestination);
        const workspaceToggle = document.querySelector('[aria-label="Workspace tools"]');
        if (workspaceToggle?.getAttribute('aria-expanded') === 'false') workspaceToggle.click();
        await wait(120);
        let launcher = document.querySelector('[data-testid="new-tab-launcher"]');
        if (!launcher) {
          document.querySelector('.global-topbar__workspace-tabs .global-topbar__add')?.click();
          await wait(120);
          launcher = document.querySelector('[data-testid="new-tab-launcher"]');
        }
        const filesChoice = [...(launcher?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Files');
        if (!filesChoice) throw new Error('F3 capture failed: the Files launcher option is missing');
        const initialLauncherTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active');
        const initialWorkspaceTabCount = document.querySelectorAll('.global-topbar__workspace-tabs .global-tab').length;
        if (!initialLauncherTab) throw new Error('F3 capture failed: the active Workspace launcher tab is missing');
        filesChoice.click();
        await wait(240);
        const openedInExistingTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active') === initialLauncherTab
          && document.querySelectorAll('.global-topbar__workspace-tabs .global-tab').length === initialWorkspaceTabCount;
        if (!openedInExistingTab) throw new Error('F3 capture failed: Files did not replace the active launcher tab');
        const workspaceWidth = await setWorkspaceWidth();
        const activeFilesTab = () => document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active .global-tab__select')?.textContent?.trim() ?? '';
        const tabs = () => [...document.querySelectorAll('.global-topbar__workspace-tabs .global-tab')];
        const fileTabCountBeforeSelection = tabs().length;
        const waitFor = async (test, description) => {
          for (let attempt = 0; attempt < 80; attempt += 1) {
            if (test()) return;
            await wait(50);
          }
          throw new Error('F3 capture failed: ' + description);
        };
        const explorerToggle = document.querySelector('.workspace-file-canvas [data-files-explorer-toggle="true"]');
        if (!explorerToggle) throw new Error('F3 capture failed: the Files explorer control is missing');
        if (explorerToggle.getAttribute('aria-expanded') === 'false') explorerToggle.click();
        await wait(100);
        const openFolder = document.querySelector('.workspace-files__open-folder');
        if (!(openFolder instanceof HTMLButtonElement)) throw new Error('F3 capture failed: Open folder is missing');
        openFolder.click();
        await waitFor(() => document.querySelector('.workspace-files__root-label span')?.textContent?.trim() === 'sample' || document.querySelector('.workspace-files__root-label span')?.textContent?.trim() === 'empty', 'the temporary approved Files folder did not load');
        await wait(100);
        const rootName = document.querySelector('.workspace-files__root-label span')?.textContent?.trim() ?? '';
        const findFile = (relativePath) => [...document.querySelectorAll('.workspace-files__tree-scroll [role="treeitem"][data-file-path]')]
          .find((item) => item.getAttribute('data-file-path') === relativePath);
        const selectFile = async (relativePath) => {
          const item = findFile(relativePath);
          if (!item) throw new Error('F3 capture failed: Files tree row is missing: ' + relativePath);
          item.click();
          await waitFor(() => !document.querySelector('.workspace-files__loading') && !document.querySelector('.workspace-files__toolbar-status')?.textContent?.includes('Loading'), 'preview did not settle for ' + relativePath);
          await wait(100);
        };
        if (scenario === 'files-image') await selectFile('gwira-logo.png');
        else if (scenario === 'files-text' || scenario === 'files-focus' || scenario === 'files-hover' || scenario === 'files-state' || scenario === 'files-narrow-selected') await selectFile('readme.txt');
        else if (scenario === 'files-markdown-preview' || scenario === 'files-markdown-source') await selectFile('guide.md');
        else if (scenario === 'files-code') await selectFile('example.ts');
        else if (scenario === 'files-pdf') await selectFile('overview.pdf');
        else if (scenario === 'files-unsupported') await selectFile('unsupported.bin');
        if (scenario === 'files-nested') {
          findFile('nested')?.click();
          await waitFor(() => !!findFile('nested/level'), 'expanding the nested folder did not load its child');
          findFile('nested/level')?.click();
          await waitFor(() => !!findFile('nested/level/needle-match.md'), 'expanding the nested child folder did not load its file');
        }
        if (scenario === 'files-markdown-source') {
          const sourceButton = [...document.querySelectorAll('.workspace-files__markdown-mode button')].find((button) => button.textContent?.trim() === 'Source');
          if (!sourceButton) throw new Error('F3 capture failed: Markdown Source mode is missing');
          sourceButton.click();
          await waitFor(() => !!document.querySelector('.workspace-file-canvas .workspace-files__text'), 'Markdown Source mode did not render the original text');
        }
        if (scenario === 'files-narrow-selected') {
          const explorer = document.querySelector('.workspace-files');
          filesCapture = { explorerStayedOpenAfterSelection: explorer?.getAttribute('data-explorer-open') === 'true' };
          if (!filesCapture.explorerStayedOpenAfterSelection) throw new Error('F3 capture failed: selecting a file closed the compact Files explorer');
          document.querySelector('.workspace-files__header-actions [aria-label="Show file preview"]')?.click();
          await wait(180);
        }
        if (scenario === 'files-split-resized') {
          const handle = document.querySelector('.workspace-files__layout-separator');
          const bounds = handle?.getBoundingClientRect();
          if (!handle || !bounds || bounds.width <= 0) throw new Error('F3 capture failed: the Files preview/explorer resize handle is missing');
          filesCapture = {
            splitPoint: { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2), scale: window.devicePixelRatio },
            splitRatioBefore: Number(handle.getAttribute('aria-valuenow'))
          };
        }
        if (scenario === 'files-pdf') {
          await waitFor(() => {
            const canvas = document.querySelector('.workspace-pdf canvas');
            return canvas instanceof HTMLCanvasElement && canvas.width > 0;
          }, 'the local PDF fixture did not render');
        }
        if (scenario === 'files-search') {
          const input = document.querySelector('.workspace-files__search input');
          if (!(input instanceof HTMLInputElement)) throw new Error('F3 capture failed: the Files search field is missing');
          const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setValue?.call(input, 'needle');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => !!findFile('nested/level/needle-match.md'), 'recursive Files search did not return the nested match');
          if (!findFile('nested') || !findFile('nested/level')) throw new Error('F3 capture failed: recursive search did not preserve the folder hierarchy');
        }
        const selectionKeepsTabCount = tabs().length === fileTabCountBeforeSelection;
        if (!selectionKeepsTabCount) throw new Error('F3 capture failed: selecting a file created an extra Workspace tab');
        if (scenario === 'files-focus') {
          if (explorerToggle.getAttribute('aria-expanded') === 'false') explorerToggle.click();
          await wait(100);
          document.querySelector('.workspace-files__search input')?.focus({ preventScroll: true, focusVisible: true });
          window.__preserveCaptureFocus = true;
        }
        if (scenario === 'files-hover') {
          const row = findFile('gwira-logo.png')?.closest('.workspace-files__row');
          if (!row) throw new Error('F3 capture failed: the selected Files row is missing for hover capture');
          const bounds = row.getBoundingClientRect();
          filesCapture = { hoverPoint: { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2), scale: window.devicePixelRatio } };
        }
        if (scenario === 'files-state') {
          const initialTab = document.querySelector('.global-topbar__workspace-tabs .global-tab.is-active');
          if (!initialTab) throw new Error('F3 capture failed: the active Files tab is missing before switching tools');
          const initialTabCount = tabs().length;
          const initialTabPosition = tabs().indexOf(initialTab);
          document.querySelector('.global-topbar__workspace-tabs .global-topbar__add')?.click();
          await wait(100);
          launcher = document.querySelector('[data-testid="new-tab-launcher"]');
          const workSessionsChoice = [...(launcher?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Work Sessions');
          if (!workSessionsChoice) throw new Error('F3 capture failed: Work Sessions was missing from the Workspace launcher');
          workSessionsChoice.click();
          await wait(240);
          document.querySelector('.global-topbar__workspace-tabs .global-topbar__add')?.click();
          await wait(100);
          launcher = document.querySelector('[data-testid="new-tab-launcher"]');
          const returnToFiles = [...(launcher?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Files');
          if (!returnToFiles) throw new Error('F3 capture failed: Files was missing from the second Workspace launcher');
          returnToFiles.click();
          await wait(240);
          const filesTabs = tabs().filter((tab) => tab.querySelector('.global-tab__select')?.textContent?.trim() === 'Files');
          const workSessionTabs = tabs().filter((tab) => tab.querySelector('.global-tab__select')?.textContent?.trim() === 'Work Sessions');
          if (filesTabs.length !== 1 || workSessionTabs.length !== 1 || tabs().length !== initialTabCount + 1) {
            throw new Error('F3 capture failed: switching Files → Work Sessions → Files created or retained a duplicate tool tab');
          }
          const selectedBeforeCollapse = document.querySelector('.workspace-files__tree-scroll [role="treeitem"][data-file-path="readme.txt"]')?.getAttribute('aria-selected') === 'true';
          const toggle = document.querySelector('[aria-label="Workspace tools"]');
          toggle?.click();
          await wait(100);
          toggle?.click();
          await wait(240);
          if (!selectedBeforeCollapse || document.querySelector('.workspace-files__tree-scroll [role="treeitem"][data-file-path="readme.txt"]')?.getAttribute('aria-selected') !== 'true') {
            throw new Error('F3 capture failed: Files selection was not preserved across tool switching and Workspace collapse/reopen');
          }
          filesCapture = { retainedTabPosition: tabs().findIndex((tab) => tab === initialTab), initialTabPosition };
        }
        const selectedFile = document.querySelector('.workspace-files__tree-scroll [role="treeitem"][aria-selected="true"]')?.getAttribute('data-file-path') ?? '';
        const explorer = document.querySelector('.workspace-files');
        const preview = document.querySelector('.workspace-file-canvas');
        const layoutHandle = document.querySelector('.workspace-files__layout-separator');
        const handleBounds = layoutHandle?.getBoundingClientRect();
        const canvasBounds = document.querySelector('.right-workspace__canvas')?.getBoundingClientRect();
        const activeGlobal = document.querySelector('.global-topbar__tabs--global [role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '';
        const resizeValue = document.querySelector('[aria-label="Resize Workspace"]')?.getAttribute('aria-valuenow') ?? '';
        filesCapture = {
          ...filesCapture,
          openedInExistingTab,
          selectionKeepsTabCount,
          initialWorkspaceTabCount,
          rootName,
          activeGlobal,
          activeWorkspaceTab: activeFilesTab(),
          workspaceTabs: tabs().length,
          filesTabs: tabs().filter((tab) => tab.querySelector('.global-tab__select')?.textContent?.trim() === 'Files').length,
          workSessionTabs: tabs().filter((tab) => tab.querySelector('.global-tab__select')?.textContent?.trim() === 'Work Sessions').length,
          selectedFile,
          explorerOpen: explorer?.getAttribute('data-explorer-open') === 'true',
          explorerVisible: Boolean(explorer?.getClientRects().length && getComputedStyle(explorer).visibility !== 'hidden' && getComputedStyle(explorer).display !== 'none'),
          markdownPreview: !!preview?.querySelector('.workspace-files__markdown'),
          markdownSource: !!preview?.querySelector('.workspace-files__text'),
          markdownTable: !!preview?.querySelector('.workspace-files__markdown table'),
          codeLineNumbers: !!preview?.querySelector('.workspace-files__line-number'),
          nestedExpanded: !!findFile('nested/level/needle-match.md'),
          splitHandleVisible: Boolean(handleBounds && handleBounds.width > 0),
          splitAligned: Boolean(handleBounds && canvasBounds && Math.abs((handleBounds.left + handleBounds.width / 2) - canvasBounds.right) <= 2),
          splitRatio: layoutHandle?.getAttribute('aria-valuenow') ?? '',
          imagePreview: !!preview?.querySelector('.workspace-files__image img'),
          textPreview: !!preview?.querySelector('.workspace-files__text'),
          pdfPreview: !!preview?.querySelector('.workspace-pdf canvas'),
          unsupportedPreview: preview?.textContent?.includes('Preview unavailable') ?? false,
          searchMatch: !!findFile('nested/level/needle-match.md'),
          emptyFolder: explorer?.textContent?.includes('This folder is empty.') ?? false,
          overflowRows: document.querySelectorAll('.workspace-files__tree-scroll [role="treeitem"][data-file-path]').length,
          focusVisible: document.querySelector('.workspace-files__search input')?.matches(':focus-visible') ?? false,
          horizontalOverflow: [explorer, preview].filter((element) => element instanceof HTMLElement && !element.hidden)
            .every((element) => element.scrollWidth <= element.clientWidth + 1),
          workspaceWidth: resizeValue || workspaceWidth,
          globalView: document.querySelector('.workspace')?.getAttribute('data-workspace-view') ?? ''
        };
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
    if (document.activeElement instanceof HTMLElement && !window.__preserveCaptureFocus) document.activeElement.blur();
    return {
      canvas: document.querySelector('[data-testid="workflow-canvas"]') instanceof HTMLElement,
      nodes: document.querySelectorAll('.gwira-work-node').length,
      edges: document.querySelectorAll('.react-flow__edge').length,
      modelEdges,
      narrowContext: document.querySelector('.gwira-dashboard')?.getAttribute('data-narrow-inspector') === 'true' && document.querySelector('#gwira-workflow-panel')?.getAttribute('data-inspector-mode') === 'context',
      narrowInspector: document.querySelector('.gwira-dashboard')?.getAttribute('data-narrow-inspector') === 'true',
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
          workflowCanvas: Boolean(document.querySelector('[data-testid="workflow-canvas"]')?.getClientRects().length)
        };
      })(),
      list: (() => {
        const root = document.querySelector('.gwira-list');
        if (!root) return undefined;
        const count = root.querySelector('.gwira-list__count')?.textContent ?? '';
        const counts = count.match(/Showing\\s+(\\d+)\\s+of\\s+(\\d+)/);
        const panel = document.querySelector('#gwira-workflow-panel');
        const keyboard = window.__listKeyboardCheck ?? {};
        return {
          tasks: root.querySelectorAll('[data-list-task-id]').length,
          total: Number(counts?.[2] ?? 0),
          filteredCount: Number(counts?.[1] ?? 0),
          groups: root.querySelectorAll('[data-list-group-id]').length,
          empty: Boolean(root.querySelector('[data-testid="list-empty"]')),
          selectedRows: root.querySelectorAll('[data-list-task-id][aria-current="true"]').length,
          filterStrip: root.querySelector('.gwira-work-filters') !== null,
          layout: root.getAttribute('data-layout'),
          renderedRows: root.querySelectorAll('[data-list-task-id]').length,
          sortBy: root.querySelector('[data-testid="list-sort-by"]')?.value ?? null,
          rowHeights: window.__listRowHeights ?? [],
          groupKeyboard: window.__listGroupCheck ?? {},
          searchClear: [...root.querySelectorAll('.gwira-list__empty button')].some((button) => button.textContent === 'Clear search'),
          filterClear: [...root.querySelectorAll('.gwira-list__empty button')].some((button) => button.textContent === 'Clear filters'),
          resetAll: [...root.querySelectorAll('.gwira-list__empty button')].some((button) => button.textContent === 'Reset all'),
          inspectorVisible: panel instanceof HTMLElement && !panel.hidden && panel.getBoundingClientRect().width > 0,
          keyboardReachedEnd: typeof keyboard.title === 'string' && keyboard.title.includes('Large dataset task 1600'),
          keyboardTarget: keyboard.target
        };
      })(),
      calendar: (() => {
        const root = document.querySelector('.gwira-calendar');
        if (!root) return undefined;
        const count = root.querySelector('.gwira-calendar__count')?.textContent ?? '';
        const parsedCount = count.match(/(\\d+)\\s+of\\s+(\\d+)/);
        const popover = root.querySelector('.gwira-calendar__popover')?.getBoundingClientRect();
        const bounds = root.getBoundingClientRect();
        return {
          view: root.getAttribute('data-calendar-view'),
          layout: root.getAttribute('data-layout'),
          anchor: root.getAttribute('data-calendar-anchor'),
          selectedTask: root.getAttribute('data-calendar-selected'),
          events: root.querySelectorAll('.gwira-calendar__event').length,
          taskTitles: [...new Set([...root.querySelectorAll('.gwira-calendar__event strong')].map((node) => node.textContent?.replace(/^Due · /, '') ?? '').concat([...root.querySelectorAll('.gwira-calendar__unscheduled-row button[data-work-item-id]')].map((node) => node.textContent ?? '')))],
          plannedEvents: root.querySelectorAll('.gwira-calendar__event.is-planned').length,
          actualEvents: root.querySelectorAll('.gwira-calendar__event.is-actual').length,
          unscheduled: Number(root.querySelector('.gwira-calendar__unscheduled summary span')?.textContent ?? 0),
          total: Number(parsedCount?.[2] ?? 0),
          shown: Number(parsedCount?.[1] ?? 0),
          activeFilters: root.querySelectorAll('.gwira-work-filters__chip').length,
          hiddenNotice: Boolean(root.querySelector('.gwira-calendar__notice')),
          filterStrip: root.querySelector('.gwira-work-filters')?.textContent ?? null,
          emptyText: root.querySelector('.gwira-calendar__empty strong')?.textContent ?? null,
          dateButtons: root.querySelectorAll('.gwira-calendar__day-number').length,
          hideInspectorVisible: (() => { const button = root.querySelector('.gwira-calendar__hide-inspector'); return button instanceof HTMLElement && getComputedStyle(button).display !== 'none'; })(),
          popoverInside: Boolean(popover && popover.left >= Math.max(bounds.left, 0) - 1 && popover.right <= Math.min(bounds.right, window.innerWidth) + 1 && popover.bottom <= window.innerHeight),
          bounds: { width: Math.round(bounds.width), height: Math.round(bounds.height) },
          checks: window.__calendarChecks ?? {}
        };
      })(),
      board: (() => {
        const root = document.querySelector('.gwira-board');
        if (!root) return undefined;
        const count = root.querySelector('.gwira-board__count')?.textContent ?? '';
        const parsedCount = count.match(/(\\d+)\\s+of\\s+(\\d+)/);
        const popover = root.querySelector('.gwira-board__popover')?.getBoundingClientRect();
        const bounds = root.getBoundingClientRect();
        return {
          selectedTask: root.getAttribute('data-board-selected'),
          columns: root.querySelectorAll('.gwira-board__column').length,
          statuses: [...root.querySelectorAll('.gwira-board__column')].map((column) => column.getAttribute('data-board-column')),
          tasks: root.querySelectorAll('.gwira-board__card').length,
          taskTitles: [...root.querySelectorAll('.gwira-board__card-title')].map((node) => node.textContent ?? ''),
          doatOwners: root.querySelectorAll('.gwira-board__owner.is-doat').length,
          draggableCards: [...root.querySelectorAll('.gwira-board__card')].filter((card) => card.getAttribute('draggable') === 'true').length,
          total: Number(parsedCount?.[2] ?? 0),
          shown: Number(parsedCount?.[1] ?? 0),
          collapsed: root.querySelectorAll('.gwira-board__column-header > button[aria-expanded="false"]:not(.compact-menu-trigger)').length,
          activeFilters: root.querySelectorAll('.gwira-work-filters__chip').length,
          hiddenNotice: Boolean(root.querySelector('.gwira-board__notice')),
          filterStrip: root.querySelector('.gwira-work-filters')?.textContent ?? null,
          emptyText: root.querySelector('.gwira-board__empty strong')?.textContent ?? null,
          popoverInside: Boolean(popover && popover.left >= Math.max(bounds.left, 0) - 1 && popover.right <= Math.min(bounds.right, window.innerWidth) + 1 && popover.bottom <= window.innerHeight),
          checks: window.__boardChecks ?? {}
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
      workspaceSessionsTab,
      workspaceSessionsPanel,
      workspaceSessionsWidth,
      workspaceSessionsToolTabs,
      workspaceSessionsStableTab,
      workspaceSessionsReused,
      workspaceSessionsCloseFallback,
      workspaceSessionsRoute,
      workspaceSessionsEmpty,
      workspaceSessionsSelected,
      filesCapture,
      terminalCapture,
      filesHoverConfirmed,
      filesHoverFallback,
      globalTabs: document.querySelectorAll('.global-tab').length,
      destinationPickerOpen: document.querySelector('[data-testid="new-tab-launcher"]') instanceof HTMLElement,
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
          topbarControls: ['Back', 'Forward', 'Collapse sidebar', 'Expand sidebar', 'Open a new global tab', 'Open a new workspace tab', 'Workspace tools', 'Gwira Chat', 'Collapse context panel', 'Expand context panel'].filter((label) => document.querySelector('.global-topbar [aria-label="' + label + '"]')),
          notifications: document.querySelector('.global-topbar [aria-label^="Notifications"]') instanceof HTMLElement,
          navLabels: [...document.querySelectorAll('.gwira-secondary-sidebar [data-navigation-view], .gwira-secondary-sidebar [data-nav-id]')].map((item) => item.textContent?.trim())
        };
      })(),
      layoutBounds: Object.fromEntries(['.shell', '.global-topbar', '.workspace', '.workspace__route', '.workspace__view:not([hidden])', '.gwira-dashboard', '.gwira-dashboard__main', '.gwira-workflow-body', '.gwira-workflow-canvas__interaction'].map((selector) => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return [selector, bounds ? { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left } : null];
      })),
      expandedCanvasWidth,
      reopenedContextTab,
      reopenedSelection,
      keyboardViewNavigationWorks,
      preview: document.querySelector('[data-testid="dashboard-view-preview"]') instanceof HTMLElement,
      createdTask: (() => { try { return JSON.parse(localStorage.getItem('gwira.local-prototype.v1') ?? '{}').tasks?.some((task) => task.title === 'Capture: new local task') ?? false; } catch { return false; } })(),
      draftSurvivedTabSwitch: document.querySelector('.gwira-inspector-form input')?.value === 'Draft survives switching tabs'
    };
  })()`);
  const emptyFixture = new URL(rendererDevUrl ?? 'http://127.0.0.1').searchParams.get('canvasFixture') === 'empty';
  const f3Scenario = process.env.ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO;
  if (f3Scenario?.startsWith('workspace-topbar-')) {
    const readLayout = async () => window.webContents.executeJavaScript(`(() => {
      const box = (selector) => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return bounds ? { left: bounds.left, right: bounds.right, width: bounds.width } : null;
      };
      const topbar = document.querySelector('.global-topbar');
      return {
        open: topbar?.getAttribute('data-workspace-open') === 'true',
        topbar: box('.global-topbar'),
        actions: box('.global-topbar__actions'),
        globalRegion: box('.global-topbar__global-region'),
        primaryTabs: box('.global-topbar__primary-tabs'),
        workspaceRegion: box('.global-topbar__workspace-region'),
        workspaceTabs: box('.global-topbar__workspace-tabs'),
        divider: box('.global-topbar__divider'),
        content: box('.shell > .workspace'),
        rightWorkspace: box('.right-workspace'),
        preferredWorkspaceWidth: Number.parseFloat(getComputedStyle(document.querySelector('.shell')).getPropertyValue('--gw-workspace-width')),
        globalTabs: [...document.querySelectorAll('.global-topbar__primary-tabs [role="tab"]')].map(tab => tab.textContent?.trim())
      };
    })()`);
    const setSavedWorkspaceState = async (collapsed: boolean) => {
      await window.webContents.executeJavaScript(`(() => {
        const tabsKey = 'gwira.workspace.tabs.v1';
        const tabs = JSON.parse(localStorage.getItem(tabsKey) ?? 'null');
        if (!tabs) throw new Error('Workspace tab state was unavailable for top-bar capture');
        tabs.workspaceCollapsed = ${collapsed};
        localStorage.setItem(tabsKey, JSON.stringify(tabs));
        const preferencesKey = 'gwira.work-sessions.preferences.v1';
        const preferences = JSON.parse(localStorage.getItem(preferencesKey) ?? '{}');
        preferences.workspaceWidth = 420;
        localStorage.setItem(preferencesKey, JSON.stringify(preferences));
      })()`);
      const loaded = new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
      window.webContents.reload();
      await loaded;
      await new Promise((resolve) => setTimeout(resolve, 180));
      return readLayout();
    };
    const before = await readLayout();
    let layout: Awaited<ReturnType<typeof readLayout>>;
    if (f3Scenario === 'workspace-topbar-reopened') {
      const collapsed = await setSavedWorkspaceState(true);
      if (collapsed.open) throw new Error('F3 capture failed: Workspace did not restore its collapsed state');
      layout = await setSavedWorkspaceState(false);
      result.workspaceWidthRestored = collapsed.preferredWorkspaceWidth > 0
        && Math.abs(collapsed.preferredWorkspaceWidth - (layout.rightWorkspace?.width ?? 0)) <= 1;
    } else {
      layout = await setSavedWorkspaceState(f3Scenario === 'workspace-topbar-collapsed');
    }
    result.workspaceTopbarLayout = layout;
    result.workspaceTopbarGlobalTabsUnchanged = JSON.stringify(before.globalTabs) === JSON.stringify(layout.globalTabs);
  }
  if (f3Scenario === 'files-hover' && result.filesCapture?.hoverPoint) {
    const point = result.filesCapture.hoverPoint;
    window.webContents.sendInputEvent({ type: 'mouseMove', x: Number(point.x), y: Number(point.y) });
    await new Promise((resolve) => setTimeout(resolve, 160));
    result.filesHoverConfirmed = await window.webContents.executeJavaScript(
      `document.querySelector('.workspace-files__tree-scroll [role="treeitem"][data-file-path="gwira-logo.png"]')?.matches(':hover') === true`
    );
    if (!result.filesHoverConfirmed && Number(point.scale) > 1) {
      window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(Number(point.x) * Number(point.scale)), y: Math.round(Number(point.y) * Number(point.scale)) });
      await new Promise((resolve) => setTimeout(resolve, 160));
      result.filesHoverConfirmed = await window.webContents.executeJavaScript(
        `document.querySelector('.workspace-files__tree-scroll [role="treeitem"][data-file-path="gwira-logo.png"]')?.matches(':hover') === true`
      );
    }
    if (!result.filesHoverConfirmed) {
      result.filesHoverFallback = await window.webContents.executeJavaScript(
        `(() => { const item = document.querySelector('.workspace-files__tree-scroll [role="treeitem"][data-file-path="gwira-logo.png"]'); item?.focus(); const trigger = item?.closest('.workspace-files__row')?.querySelector('.compact-menu-trigger'); return !!trigger && getComputedStyle(trigger).opacity === '1'; })()`
      );
    }
    if (!result.filesHoverConfirmed && !result.filesHoverFallback) throw new Error('Files capture failed: neither row hover nor the accessible focus-within action state appeared');
  }
  if (f3Scenario === 'files-focus') {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'TAB' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'TAB' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    result.filesCapture.focusIndicator = await window.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('.workspace-files__search input'); const search = input?.closest('.workspace-files__search'); input?.focus(); const style = search ? getComputedStyle(search) : undefined; return !!input && document.activeElement === input && style?.outlineStyle !== 'none' && style?.outlineWidth !== '0px'; })()`
    );
    if (!result.filesCapture.focusIndicator) throw new Error('Files capture failed: the focused search field did not show its visible focus indicator');
  }
  if (f3Scenario === 'files-split-resized') {
    const point = result.filesCapture?.splitPoint;
    if (!point) throw new Error('Files capture failed: the Files split handle did not provide a drag point');
    const before = Number(result.filesCapture.splitRatioBefore);
    const targetX = Number(point.x) - 48;
    const drag = async (scale: number): Promise<number> => {
      const x = Math.round(Number(point.x) * scale);
      const y = Math.round(Number(point.y) * scale);
      const endX = Math.round(targetX * scale);
      window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
      await new Promise((resolve) => setTimeout(resolve, 50));
      window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (let step = 1; step <= 4; step += 1) {
        window.webContents.sendInputEvent({
          type: 'mouseMove',
          x: Math.round(x + ((endX - x) * step) / 4),
          y,
          button: 'left'
        });
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      window.webContents.sendInputEvent({ type: 'mouseUp', x: endX, y, button: 'left', clickCount: 1 });
      await new Promise((resolve) => setTimeout(resolve, 180));
      return Number(await window.webContents.executeJavaScript(
        `Number(document.querySelector('.workspace-files__layout-separator')?.getAttribute('aria-valuenow'))`
      ));
    };
    let after = await drag(1);
    if (!Number.isFinite(after) || after >= before) after = await drag(Number(point.scale) || 1);
    result.filesCapture.splitRatioAfter = after;
    result.filesCapture.splitMoved = Number.isFinite(after) && after < before;
    result.filesCapture.splitAligned = await window.webContents.executeJavaScript(
      `(() => { const handle=document.querySelector('.workspace-files__layout-separator')?.getBoundingClientRect(); const canvas=document.querySelector('.right-workspace__canvas')?.getBoundingClientRect(); return Boolean(handle && canvas && Math.abs(handle.left + handle.width / 2 - canvas.right) <= 2); })()`
    );
    if (!result.filesCapture.splitMoved || !result.filesCapture.splitAligned) {
      throw new Error(`Files capture failed: internal split dragging or alignment failed (${before} → ${after}, aligned=${result.filesCapture.splitAligned})`);
    }
  }
  const expectedView = f3Scenario === 'workspace-sessions' || f3Scenario === 'terminal-idle' ? 'inbox' : f3Scenario?.startsWith('files-') ? (process.env.ELECTRON_WORKFLOW_CAPTURE_FILES_GLOBAL_DESTINATION === 'Dashboard' ? 'workflow' : 'inbox') : f3Scenario === 'task-tab' || f3Scenario === 'task-inspector' ? 'my-work' : f3Scenario?.startsWith('nav-') ? f3Scenario.slice(4) : f3Scenario && ['home', 'home-expanded', 'home-collapsed', 'tab-home'].includes(f3Scenario) ? 'home' : process.env.ELECTRON_WORKFLOW_CAPTURE_DASHBOARD_VIEW || process.env.ELECTRON_WORKFLOW_CAPTURE_VIEW || 'workflow';
  const emptyWorkspace = process.env.ELECTRON_WORKFLOW_CAPTURE_EMPTY === '1' || f3Scenario === 'empty';
  if (expectedView === 'workflow') {
    if (emptyWorkspace ? !result.workspaceEmpty || result.nodes !== 0 : !result.canvas || (emptyFixture ? !result.empty || result.nodes !== 0 : result.nodes === 0)) {
      throw new Error(`Workflow capture failed: expected graph/empty state did not mount (${JSON.stringify({ canvas: result.canvas, empty: result.empty, workspaceEmpty: result.workspaceEmpty, nodes: result.nodes, activeView: result.activeView })})`);
    }
  } else if (expectedView !== 'timeline' && expectedView !== 'list' && expectedView !== 'calendar' && expectedView !== 'board' && expectedView !== 'my-work' && expectedView !== 'home' && !f3Scenario?.startsWith('nav-') && f3Scenario !== 'workspace-sessions' && f3Scenario !== 'terminal-idle' && !f3Scenario?.startsWith('files-') && !result.preview) {
    throw new Error(`Dashboard capture failed: ${expectedView} did not render an explicit preview state`);
  }
  if (!capturePath) throw new Error('Workflow capture failed: screenshot destination was not configured');
  if (expectedView === 'workflow' && f3Scenario !== 'picker' && !result.nodesFit) throw new Error(`Workflow capture failed: graph nodes exceed the canvas viewport (${JSON.stringify({ nodeBounds: result.nodeBounds, layoutBounds: result.layoutBounds })})`);
  if (expectedView === 'timeline') {
    if (!result.timeline) throw new Error('Timeline capture failed: Timeline did not mount');
    if (result.timeline.workflowCanvas) throw new Error('Timeline capture failed: the inactive Workflow canvas is still visible');
    if (result.timeline.overlapsPanel && !result.narrowInspector) throw new Error('Timeline capture failed: the schedule overlaps the inspector');
  }
  if (expectedView === 'list' && !result.list) throw new Error('List capture failed: List did not mount');
  if (expectedView === 'calendar' && !result.calendar) throw new Error('Calendar capture failed: Calendar did not mount');
  if (expectedView === 'board' && !result.board) throw new Error('Board capture failed: Board did not mount');
  if (process.env.ELECTRON_WORKFLOW_SELECT_ID && !result.selected) throw new Error('Workflow capture failed: selected work inspector did not open');
  if (result.activeView !== expectedView) throw new Error(`Dashboard capture failed: active view was ${result.activeView}, expected ${expectedView}`);
  if (!result.narrowContext && !f3Scenario && process.env.ELECTRON_LIST_CAPTURE !== '1' && !result.timeline?.checks?.inspector && (process.env.ELECTRON_WORKFLOW_CAPTURE_PANEL === 'collapsed' ? result.panelVisible : !result.panelVisible)) {
    throw new Error(`Dashboard capture failed: context panel visibility did not match ${process.env.ELECTRON_WORKFLOW_CAPTURE_PANEL ?? 'expanded'}: ${JSON.stringify({visible:result.panelVisible,narrow:result.narrowInspector,context:result.narrowContext,mode:result.inspectorMode})}`);
  }
  if (process.env.ELECTRON_WORKFLOW_CAPTURE_TAB && result.activeContextTab !== process.env.ELECTRON_WORKFLOW_CAPTURE_TAB) {
    throw new Error(`Dashboard capture failed: selected context tab was ${result.activeContextTab}, expected ${process.env.ELECTRON_WORKFLOW_CAPTURE_TAB}`);
  }
  if (maximizeCaptureWindow) result.windowMaximized = window.isMaximized();
  await new Promise((resolve) => setTimeout(resolve, 150));
  await fs.writeFile(capturePath, (await window.webContents.capturePage()).toPNG());
  if (maximizeCaptureWindow) {
    const restored = new Promise<void>((resolve) => window.once('unmaximize', () => resolve()));
    window.unmaximize();
    await restored;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const restoredContentBounds = window.getContentBounds();
    const headerAligned = await window.webContents.executeJavaScript(`(() => {
      const topbar = document.querySelector('.global-topbar')?.getBoundingClientRect();
      const actions = document.querySelector('.global-topbar__actions')?.getBoundingClientRect();
      return Boolean(topbar && actions && Math.abs(topbar.right - actions.right) <= 1);
    })()`);
    result.windowRestored = Math.abs(restoredContentBounds.width - initialContentBounds.width) <= 1
      && Math.abs(restoredContentBounds.height - initialContentBounds.height) <= 1
      && headerAligned;
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
  await chooseLocalForCapture(window);
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
    click('My Work options'); await wait(); click('Link Benchmark Project 1'); await wait();
    click('New task'); await wait();
    form = document.querySelector('.gwira-task-form');
    setValue(form.querySelector('input'), 'Mock coding workflow');
    const projectSelect = [...form.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Project'))?.querySelector('select');
    const assigneeSelect = [...form.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Assignee'))?.querySelector('select');
    setValue(projectSelect, projectSelect.options[1].value);
    setValue(assigneeSelect, assigneeSelect.options[2].value);
    form.querySelector('button[type="submit"]').click(); await wait();
    document.querySelector('.my-work__view:not([hidden]) [data-list-task-id], .my-work__view:not([hidden]) [data-board-card], .gwira-task-card').click(); await wait();
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
  await chooseLocalForCapture(window);
  const projectPaths = (process.env.ELECTRON_SMOKE_PROJECTS || '').split(path.delimiter).filter(Boolean);
  const projectState = {
    projects: projectPaths.map((projectPath, index) => ({ id: projectPath, path: projectPath, name: `Smoke Project ${index + 1}` })),
    activeProjectId: projectPaths[0]
  };
  await window.webContents.executeJavaScript(`localStorage.setItem('codex-desktop.projects.v1', ${JSON.stringify(JSON.stringify(projectState))}); location.reload();`);
  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  await chooseLocalForCapture(window);
  const result = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (predicate, message, timeout = 5000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await wait(50);
      }
      throw new Error(message);
    };
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
    if (document.querySelector('.sidebar-recent .sidebar-collapsible-heading')?.getAttribute('aria-expanded') !== 'false' || [...document.querySelectorAll('.sidebar-recent .sidebar-shortcut-item')].some(row => row.getClientRects().length > 0)) throw new Error('Recent section should start collapsed');
    await waitFor(() => document.querySelector('.sidebar-recent .sidebar-collapsible-heading') instanceof HTMLButtonElement, 'Recent section did not load history');
    const recentHeading = document.querySelector('.sidebar-recent .sidebar-collapsible-heading');
    recentHeading?.click();
    await waitFor(() => document.querySelectorAll('.sidebar-recent .sidebar-shortcut-item').length >= 2, 'Sidebar Recent did not populate from history');
    if (document.querySelectorAll('.sidebar-recent .sidebar-shortcut-item').length < 2) throw new Error('Sidebar Recent did not populate from history');
    if (![...document.querySelectorAll('.sidebar-recent .sidebar-item-title')].some((item) => item.textContent === 'Untitled conversation')) throw new Error('Sidebar did not sanitize malformed history titles');
    recentHeading?.click(); await wait();
    if (document.querySelector('.sidebar-recent .sidebar-collapsible-heading')?.getAttribute('aria-expanded') !== 'false' || [...document.querySelectorAll('.sidebar-recent .sidebar-shortcut-item')].some(row => row.getClientRects().length > 0)) throw new Error('Recent section did not collapse');
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
    if (document.querySelector('.sidebar-favorites .sidebar-shortcut-item')) throw new Error('Unpinned item remained in Favorites');
    if (!document.querySelector('.sidebar-favorites .sidebar-section-empty')) throw new Error('Empty Pinned section did not explain how to pin conversations');
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
    await new Promise((resolve) => setTimeout(resolve, 100));
    const projectDialog = document.querySelector('.gw-project-dialog');
    const createProjectButton = projectDialog?.querySelector('.gw-project-create');
    if (!(projectDialog instanceof HTMLDialogElement) || !projectDialog.open || !(createProjectButton instanceof HTMLButtonElement) || !createProjectButton.disabled) throw new Error('Project creation must require a name and source folder');
    projectDialog.querySelector('.gw-project-source button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const projectNameInput = projectDialog.querySelector('#gw-project-name');
    if (!(projectNameInput instanceof HTMLInputElement) || !projectNameInput.value || createProjectButton.disabled) throw new Error('Native folder selection did not prepare the project draft');
    const projectNameSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    projectNameSetter?.call(projectNameInput, 'Smoke sidebar project');
    projectNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await wait();
    createProjectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (document.querySelector('.gw-project-dialog') || ![...document.querySelectorAll('.project-pill')].some(project => project.getAttribute('aria-label') === 'Smoke sidebar project')) throw new Error('Project dialog did not save the chosen project name');
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
      ['inbox', 'Inbox', ['Inbox']], ['my-work', 'My Work', ['My Work']], ['organization', 'Views', ['Views']],
      ['teams', 'Teams', ['Teams & People']], ['doats', 'Doats', ['Doats']], ['agents', 'Coding agents', ['Coding agents']],
      ['integrations', 'Integrations', ['Integrations']], ['settings', 'Settings', ['Settings']]
    ]) {
      await clickNavigation(view);
      await wait();
      if (!headings.includes(document.querySelector('.workspace__view:not([hidden]) h1')?.textContent || '')) throw new Error(label + ' navigation failed');
      if (!(document.querySelector('.gwira-secondary-sidebar button[data-navigation-view="' + view + '"]')?.getAttribute('aria-current') === 'page' || document.querySelector('button[aria-label="More"]')?.classList.contains('active'))) throw new Error(label + ' navigation state failed');
      const page = document.querySelector('.workspace__view:not([hidden]) .gwira-dashboard, .workspace__view:not([hidden]) .gwira-home, .workspace__view:not([hidden]) .gwira-inbox-workspace, .workspace__view:not([hidden]) .gwira-my-work, .workspace__view:not([hidden]) .gwira-workspace-page, .workspace__view:not([hidden]) .workforce-page, .workspace__view:not([hidden]) .gwira-doat-directory, .workspace__view:not([hidden]) .gwira-organization-page, .workspace__view:not([hidden]) .saved-views, .workspace__view:not([hidden]) .gwira-integrations-page, .workspace__view:not([hidden]) .gwira-onboarding-page');
      if (!page || page.getBoundingClientRect().height < 300) throw new Error(label + ' did not fill the workspace');
    }
    await clickNavigation('home'); await wait(); clickButton('Library'); await wait();
    // Library smoke exercises the real local gallery, without automatic sample records.
    if (document.querySelector('.gw-library h1')?.textContent !== 'Library') throw new Error('Library gallery route did not open');
    if (document.querySelector('.gwira-home')) throw new Error('Library incorrectly rendered Home');
    if (!document.querySelector('button[data-navigation-view="library"]')?.classList.contains('active')) throw new Error('Library destination did not stay selected');
    if (document.querySelector('.gw-library')?.getBoundingClientRect().height < 300) throw new Error('Library did not fill the workspace');
    if (localStorage.getItem('gwira.library.records.v1')) throw new Error('Library invented initial records');
    document.querySelector('button[aria-label="New library item"]')?.click(); await wait(); clickButton('New document'); await wait();
    const libraryName = document.querySelector('.gw-library-dialog input');
    const librarySetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    librarySetter?.call(libraryName, 'Smoke document'); libraryName?.dispatchEvent(new Event('input', { bubbles: true })); await wait();
    clickButton('Save'); await wait();
    document.querySelector('button[aria-label="Open Smoke document"]')?.click(); await wait();
    if (!document.querySelector('dialog[open]')) throw new Error('Library preview did not open');
    document.querySelector('button[aria-label="Close preview"]')?.click(); await wait();
    document.querySelector('.gw-library button[aria-label="List view"]')?.click(); await wait();
    if (!document.querySelector('.gw-library__items.is-list')) throw new Error('Library list view did not open');
    document.querySelector('.gw-library button[aria-label="Grid view"]')?.click(); await wait();
    document.querySelector('button[aria-label="Filter library"]')?.click(); await wait();
    if (!document.querySelector('[role="menu"][aria-label="Filter library"]')) throw new Error('Library filters did not open');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
    document.querySelector('button[aria-label="Library display options"]')?.click(); await wait();clickButton('Name A–Z');await wait();
    if (JSON.parse(localStorage.getItem('gwira.library.preferences.v1') || '{}').sort !== 'name-asc') throw new Error('Library sort did not persist');
    const librarySearch = document.querySelector('input[aria-label="Search library"]');
    librarySetter?.call(librarySearch, 'no such document');librarySearch?.dispatchEvent(new Event('input', { bubbles: true }));await wait();
    if (document.querySelector('[data-library-item]')) throw new Error('Library search did not filter');
    clickButton('Show all items');await wait();
    await clickNavigation('library');await wait();
    if (document.querySelectorAll('[data-library-item]').length !== 1 || JSON.parse(localStorage.getItem('gwira.library.records.v1') || '[]')[0]?.title !== 'Smoke document') throw new Error('Library did not reuse saved records');
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
  await chooseLocalForCapture(window);
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
    return document.querySelectorAll('[data-library-item]').length === 1 && JSON.parse(localStorage.getItem('gwira.library.records.v1') || '[]')[0]?.title === 'Smoke document';
  })()`);
  if (!libraryPersistedAfterReload) throw new Error('Library records did not persist after reload');
  window.setSize(1000, 720);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const compactLayout = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('button[data-navigation-view="library"]')?.click();
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Library')?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const gallery = document.querySelector('.gw-library__items.is-grid');
    const page = document.querySelector('.gw-library');
    const first = gallery?.querySelector('[data-library-item]');
    if (!(gallery instanceof HTMLElement) || !(page instanceof HTMLElement) || !(first instanceof HTMLElement)) return false;
    const card = first.getBoundingClientRect(), bounds = page.getBoundingClientRect();
    return page.scrollWidth <= page.clientWidth && card.left >= bounds.left && card.right <= bounds.right && document.querySelectorAll('.gw-library__tabs [role="tab"]').length === 5;
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
      if (${JSON.stringify(process.env.ELECTRON_WORKFLOW_CAPTURE_SUITE)} === 'inbox' && ${JSON.stringify(process.env.ELECTRON_WORKFLOW_INBOX_SCENARIO)} === 'stress') {
      for (let index = 0; index < 10; index++) state.tasks.push({ id: 'd0000000-0000-4000-8000-' + String(index).padStart(12, '0'), workspaceId: state.workspace.id, title: 'Capture fixture: verify the long linked record title and its review requirements ' + (index + 1), status: 'todo', priority: 'medium', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    localStorage.setItem(key, JSON.stringify(state)); return true;
    })()`);
    if (!dashboardStatePrepared) throw new Error('Dashboard screenshot capture failed: local Gwira state was unavailable');
    window.webContents.reload();
    await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
  await chooseLocalForCapture(window);
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

app.whenReady().then(async () => {
  if(!primaryInstance)return;
  if(app.isPackaged)app.setAsDefaultProtocolClient('gwira');
  const scheduler = new ScheduleService(path.join(app.getPath('userData'), 'gwira-schedules.v1.json'));
  let schedulerError: string | undefined;
  let retryDelay = 15000;
  const tick = async (): Promise<void> => {
    let ticket: number | undefined;
    try { ticket = executionContext.localTicket(); } catch { /* No local schedule capability in this context. */ }
    if (ticket !== undefined) {
      const current = ticket;
      try { await scheduler.tick(() => executionContext.assertLocal(current)); executionContext.assertLocal(current); schedulerError = undefined; retryDelay = 15000; }
      catch (cause) { try { executionContext.assertLocal(current); } catch { setTimeout(() => { void tick(); }, retryDelay).unref(); return; } console.error('[schedules] tick failed', { code: (cause as NodeJS.ErrnoException).code ?? 'STORE_REJECTED' }); schedulerError = 'Schedule triggers could not be saved. Check disk access and close other Gwira instances. Retrying automatically.'; retryDelay = Math.min(retryDelay * 2, 60000); }
    }
    setTimeout(() => { void tick(); }, retryDelay).unref();
  };
  const checkCaller = (event: Electron.IpcMainInvokeEvent, workspaceId: string): void => {
    const url = event.senderFrame?.url ?? '';
    const trusted = rendererDevUrl ? new URL(url).origin === new URL(rendererDevUrl).origin : url.startsWith('file:') && fileURLToPath(url.split('?')[0]!) === path.join(__dirname, '../renderer/index.html');
    if (!trusted || !BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame || typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 160) throw new Error('Schedules require the local Gwira workspace.');
    executionContext.localTicket();
  };
  ipcMain.handle('gwira:schedules:read', async (event, workspaceId: string) => { checkCaller(event, workspaceId); const ticket=executionContext.localTicket(),current=()=>{executionContext.assertLocal(ticket);checkCaller(event,workspaceId);}; try { if (schedulerError) { await scheduler.tick(current); current(); schedulerError = undefined; } const result={ ...await scheduler.read(workspaceId,current), serviceError: schedulerError }; current(); return result; } catch (cause) { console.error('[schedules] read failed', { code: (cause as NodeJS.ErrnoException).code ?? 'STORE_REJECTED' }); throw cause; } });
  ipcMain.handle('gwira:schedules:change', async (event, workspaceId: string, command: ScheduleCommand) => { checkCaller(event, workspaceId); const ticket=executionContext.localTicket(),current=()=>{executionContext.assertLocal(ticket);checkCaller(event,workspaceId);}; const result=await scheduler.change(workspaceId, command,current); current(); return result; });
  await tick();
  await createWindow();
}).catch((error) => {
  console.error('Failed to create Gwira window:', error);
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
