// Real local Supabase and Electron test. Uses a disposable Electron profile.
const {app, BrowserWindow} = require('electron');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!process.env.AUTH_QA_PROFILE || process.env.GWIRA_AUTH_PROFILE !== 'local-dev') {
  throw Error('A disposable AUTH_QA_PROFILE and local-dev auth profile are required.');
}
app.setPath('userData', process.env.AUTH_QA_PROFILE);

(async () => {
  await app.whenReady();
  await import('../dist/main/main.js');
  let window;
  for (let i = 0; i < 150; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoading()) break;
    await wait(100);
  }
  if (!window) throw Error('Electron window did not open.');
  const evaluate = source => window.webContents.executeJavaScript(source, true);
  const poll = async (source, label) => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(source)) return;
      await wait(100);
    }
    const diagnostic = await evaluate(`window.codexDesktop.account.snapshot().then(s=>({phase:s.phase,route:s.route?.type,progress:s.onboardingProgress?.act,hasGoal:!!s.onboardingProgress?.goal,accessIssue:s.accessIssue}))`);
    throw Error(`Timed out: ${label}: ${JSON.stringify(diagnostic)}`);
  };
  const click = async label => {
    for (let i = 0; i < 150; i++) {
      const clicked = await evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(label)});
        if (!button || button.disabled) return false;
        button.click(); return true;
      })()`);
      if (clicked) return;
      await wait(100);
    }
    throw Error(`Action unavailable: ${label}`);
  };
  const fill = async (selector, value) => {
    const found = await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', {bubbles:true})); return true;
    })()`);
    if (!found) throw Error(`Field unavailable: ${selector}`);
  };
  const submit = () => evaluate('document.querySelector("form").requestSubmit()');
  const assertContained = async label => {
    const result = await evaluate(`({
      leaked: document.body.innerText.includes('LEGACY_PRIVATE_MARKER'),
      shell: !!document.querySelector('.shell'),
      marker: localStorage.getItem('gwira.conversation-drafts.v1')
    })`);
    if (result.leaked || result.shell || result.marker !== '{"legacy":"LEGACY_PRIVATE_MARKER"}') {
      throw Error(`Legacy data exposure or modification: ${label}`);
    }
  };
  const reject = async expression => {
    const denied = await evaluate(`(async()=>{try{await (${expression});return false;}catch{return true;}})()`);
    if (!denied) throw Error(`Unexpectedly allowed: ${expression}`);
  };
  if (process.env.AUTH_QA_RESTART === '1') {
    await poll("document.body.innerText.includes('BOUNDARY_A_PRIVATE_GOAL')", 'restored onboarding after app restart');
    await assertContained('app restart');
    if (await evaluate("window.codexDesktop.scopedPreferences.read('tabs')") !== '{"owner":"A"}') throw Error('A preferences were not restored after app restart.');
    await evaluate("window.codexDesktop.account.command({type:'sign_out'})");
    await reject("window.codexDesktop.scopedPreferences.read('tabs')");
    console.log('REAL_ELECTRON_RESTART_ISOLATION_PASSED: session, onboarding and account-scoped preferences restored.');
    app.exit(0);
    return;
  }
  await poll("document.body.innerText.includes('Welcome back')", 'sign in');
  await reject("window.codexDesktop.workspaceFiles.chooseRoot()");
  await reject("window.codexDesktop.terminal.start({sessionId:'00000000-0000-4000-8000-000000000000',cols:80,rows:24})");
  await reject("window.codexDesktop.scopedPreferences.read('tabs')");
  const backend = await evaluate('window.codexDesktop.account.snapshot().then(s => s.backend)');
  if (backend?.label !== 'local') throw Error('QA requires the local Supabase backend.');
  await evaluate(`localStorage.setItem('gwira.conversation-drafts.v1', '{"legacy":"LEGACY_PRIVATE_MARKER"}')`);
  const suffix = randomUUID().replaceAll('-', '');
  const accounts = ['a', 'b'].map(letter => ({email: `boundary-${letter}-${suffix}@example.test`, password: `Qa-${randomUUID()}-strong`}));
  async function createAccount(account, name, leaveInOnboarding) {
    await click('Create an account');
    await fill('input[type=email]', account.email);
    await fill('input[autocomplete="new-password"]', account.password);
    await submit();
    await poll("!!document.querySelector('[data-app-route=\"AboutYou\"]')", 'profile');
    await assertContained('profile');
    await fill('input[autocomplete=name]', name);
    await submit();
    await poll("!!document.querySelector('[data-app-route=\"WorkspaceSetup\"]')", 'workspace choice');
    await click('Create a workspace');
    await fill('input[autocomplete=organization]', `${name} workspace`);
    await submit();
    await poll("!!document.querySelector('[data-authenticated-home]')", 'authenticated Home');
    await assertContained('Home');
    if (leaveInOnboarding && process.env.AUTH_QA_SCREENSHOTS) {
      await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});
      for (const [width,height] of [[1440,900],[1280,800],[900,700]]) {
        window.setContentSize(width,height);
        await wait(300);
        await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`home-${width}x${height}.png`),(await window.webContents.capturePage()).toPNG());
      }
    }
    await reject("window.codexDesktop.listHistories('/tmp')");
    await reject("window.codexDesktop.getSession('forged')");
    await reject("window.codexDesktop.workspaceFiles.list('forged','')");
    await reject("window.codexDesktop.terminal.get('forged')");
    await reject("window.codexDesktop.schedules.read('forged')");
    if (leaveInOnboarding) {
      await evaluate(`window.codexDesktop.scopedPreferences.write('tabs', '{"owner":"A"}')`);
    } else {
      if (await evaluate("window.codexDesktop.scopedPreferences.read('tabs')") !== null) throw Error('A preferences exposed to B.');
      await evaluate(`window.codexDesktop.scopedPreferences.write('tabs', '{"owner":"B"}')`);
    }
    if (leaveInOnboarding) {
      await fill('#home-goal', 'BOUNDARY_A_PRIVATE_GOAL');
      await evaluate("document.querySelector('.composer-actions .send').click()");
      await poll("document.body.innerText.includes('BOUNDARY_A_PRIVATE_GOAL')", 'first account goal');
      await poll("window.codexDesktop.account.snapshot().then(s => s.onboardingProgress?.goal === 'BOUNDARY_A_PRIVATE_GOAL')", 'saved goal');
    } else {
      if (await evaluate("document.body.innerText.includes('BOUNDARY_A_PRIVATE_GOAL')")) throw Error('First account onboarding appeared for second account.');
      await fill('#home-goal','BOUNDARY_B_SEPARATE_GOAL');
      await evaluate("document.querySelector('.composer-actions .send').click()");
      await poll("!!document.querySelector('.meet-gwira')", 'B Meet Gwira');
      await click('Skip for now');
      await poll("!!document.querySelector('[data-authenticated-home]')", 'workspace');
      await assertContained('workspace');
    }
    if (!leaveInOnboarding) await evaluate("document.querySelector('[aria-label=\"Account menu\"]').click()");
    await click('Sign out');
    await poll("document.body.innerText.includes('Welcome back')", 'sign out');
    await poll("!!document.querySelector('input[type=email]:not(:disabled):not([readonly])')", 'sign out completed');
    await assertContained('sign out');
  }
  await createAccount(accounts[0], 'Boundary A', true);
  await createAccount(accounts[1], 'Boundary B', false);
  await fill('input[type=email]', accounts[0].email);
  await fill('input[autocomplete=current-password]', accounts[0].password);
  await submit();
  await poll("document.body.innerText.includes('BOUNDARY_A_PRIVATE_GOAL')", 'returning account progress');
  await assertContained('returning account');
  if (await evaluate("window.codexDesktop.scopedPreferences.read('tabs')") !== '{"owner":"A"}') throw Error('A preferences were not restored.');
  const second = new BrowserWindow({show:false,webPreferences:{preload:path.resolve('dist/preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  await second.loadFile(path.resolve('dist/renderer/index.html'));
  const otherId = await second.webContents.executeJavaScript("window.codexDesktop.account.snapshot().then(s=>s.user?.id)");
  const currentId = await evaluate("window.codexDesktop.account.snapshot().then(s=>s.user?.id)");
  if (!currentId || otherId !== currentId) throw Error('Windows did not share the authenticated identity.');
  const untrusted = new BrowserWindow({show:false,webPreferences:{preload:path.resolve('dist/preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  await untrusted.loadURL('data:text/html,<title>Untrusted</title>');
  const rejected = await untrusted.webContents.executeJavaScript("(async()=>{try{await window.codexDesktop.scopedPreferences.read('tabs');return false}catch{return true}})()");
  if (!rejected) throw Error('Untrusted window could read scoped preferences.');
  untrusted.destroy();
  await evaluate("window.codexDesktop.account.command({type:'sign_out'})");
  const after = await second.webContents.executeJavaScript("window.codexDesktop.account.snapshot().then(s=>s.user)");
  if (after) throw Error('Second window retained the signed-out identity.');
  await reject("window.codexDesktop.scopedPreferences.read('tabs')");
  second.destroy();
  await poll("document.body.innerText.includes('Welcome back')", 'sign out in both windows');
  await fill('input[type=email]', accounts[0].email);
  await fill('input[autocomplete=current-password]', accounts[0].password);
  await submit();
  await poll("document.body.innerText.includes('BOUNDARY_A_PRIVATE_GOAL')", 'account A before restart');
  console.log('REAL_ELECTRON_LEGACY_BOUNDARY_PASSED: scoped preferences A/B/A; machine IPC denied; windows share sign-out; legacy marker unchanged.');
  app.exit(0);
})().catch(error => {
  console.error(error.message);
  app.exit(1);
});
