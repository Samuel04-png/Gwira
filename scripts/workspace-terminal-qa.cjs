const {app,BrowserWindow,dialog}=require('electron');
const nativeEvents=[];const nativeShow=dialog.showMessageBox.bind(dialog);dialog.showMessageBox=async(...args)=>{const options=args[1]??args[0];console.log('ACTUAL_NATIVE_OPEN',options.title);const result=await nativeShow(...args);nativeEvents.push({title:options.title,buttons:options.buttons,response:result.response});console.log('ACTUAL_NATIVE_RESPONSE',JSON.stringify(nativeEvents.at(-1)));return result};
const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const out=path.resolve('artifacts/workflow/polish/global-ui-corrections/terminal-verification');
const profile='/tmp/gwira-phase26-terminal-profile-verified';
const signal='/tmp/gwira26-native-continue';
app.setPath('userData',profile);process.env.ELECTRON_RENDERER_URL='http://127.0.0.1:5198/';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await fs.mkdir(out,{recursive:true});await import('../dist/main/main.js');await app.whenReady();
 let w;for(let i=0;i<100;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await wait(100)}
 w.setTitle('Gwira Phase 2.6 · Terminal Verification');w.setSize(1440,900);w.show();w.focus();await wait(800);
 const run=s=>w.webContents.executeJavaScript(s);
 const report={errors:[],nativeEvents};w.webContents.on('console-message',e=>{if(e.level==='error')report.errors.push(e.message)});
 const shot=async name=>{await wait(200);await fs.writeFile(path.join(out,name+'.png'),(await w.webContents.capturePage()).toPNG())};
 const click=async label=>{const ok=await run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)})&&b.getBoundingClientRect().height);if(!b)return false;b.click();return true})()`);if(!ok)throw Error('Missing '+label);await wait(200)};
 const check=async(name,s)=>{report[name]=await run(s);if(!report[name])throw Error(name)};
 const until=async s=>{for(let i=0;i<1200;i++){if(await run(s))return;await wait(250)}throw Error('Timed out '+s)};
 const native=async stage=>{await fs.rm(signal,{force:true});console.log('NATIVE_DIALOG',stage);for(let i=0;i<1200;i++){try{await fs.access(signal);return}catch{}await wait(250)}throw Error('Native UI timeout '+stage)};
 const stored=()=>run(`JSON.parse(localStorage.getItem('gwira.workspace.tabs.v1'))`);
 const currentSession=async()=>{const s=await stored();return s.workspaceTabs.find(t=>t.destination.type==='terminal'&&t.destination.sessionId)?.destination.sessionId};
 const start=async stage=>{await click('Start Terminal');await native(stage);await until(`document.querySelector('.workspace-terminal')?.textContent.includes('Starting…')===false`);return currentSession()};
 const processState=pid=>{try{return execFileSync('/bin/ps',['-o','stat=','-p',String(pid)],{encoding:'utf8'}).trim()}catch{return ''}};
 const alive=pid=>{const s=processState(pid);return !!s&&!s.startsWith('Z')};
 if(process.env.WORKSPACE_QA_PREPARE_RESTART==='1'){
  if(!await run('!!document.querySelector(".global-topbar__tabs--workspace")'))await click('Workspace tools');
  await run(`document.querySelector('[aria-label="Resize Workspace"]').focus()`);
  for(let i=0;i<3;i++){w.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'});await wait(80)}
  await wait(350);const width=await run('document.querySelector(".right-workspace").getBoundingClientRect().width');
  const state=await stored();await fs.writeFile(path.join(out,'restore-expectations.json'),JSON.stringify({width,globalTabs:state.globalTabs},null,2));
  await click('Workspace tools');await wait(600);app.quit();return;
 }
 if(process.env.WORKSPACE_QA_SELECTION==='1'){
  if(await run('!!document.querySelector(".global-topbar__tabs--workspace")'))await click('Workspace tools');
  report.selection=[];
  for(const page of ['Home','Workspace','Inbox','My Work','Schedule','Teams','Doats','Skills','Coding agents','Integrations','Settings']){
   if(['Teams','Doats','Skills','Coding agents','Integrations','Settings'].includes(page))await click('More');
   await click(page);await run('document.activeElement?.blur()');w.webContents.sendInputEvent({type:'mouseMove',x:600,y:300});
   const styles=await run(`(()=>{const resolve=(token)=>{const p=document.createElement('span');p.style.color='var('+token+')';document.body.append(p);const color=getComputedStyle(p).color;p.remove();return color};const rail=document.querySelector('.gwira-primary-rail button.active');const tab=document.querySelector('.global-topbar__tabs--global .global-tab.is-active [role=tab]');const row=document.querySelector('.desktop-tools-navigation button[aria-current]');return {railColor:rail&&getComputedStyle(rail.querySelector('svg')).color,expectedRail:resolve('--gw-rail-icon-active'),railBackground:rail&&getComputedStyle(rail).backgroundColor,expectedBackground:resolve('--gw-rail-selected'),tabColor:tab&&getComputedStyle(tab).color,expectedText:resolve('--gw-text'),rowBackground:row&&getComputedStyle(row).backgroundColor,expectedRow:resolve('--gw-selected')}})()`);
   if(styles.railColor!==styles.expectedRail||styles.railBackground!==styles.expectedBackground||styles.tabColor!==styles.expectedText||styles.rowBackground&&styles.rowBackground!==styles.expectedRow)throw Error('Neutral selection changed '+page+JSON.stringify(styles));
   report.selection.push({page,...styles});await shot('selection-'+page.toLowerCase().replaceAll(' ','-'));
   await run("document.documentElement.dataset.theme='dark'");await wait(220);const darkStyles=await run(`(()=>{const resolve=(token)=>{const p=document.createElement('span');p.style.color='var('+token+')';document.body.append(p);const color=getComputedStyle(p).color;p.remove();return color};const rail=document.querySelector('.gwira-primary-rail button.active');const tab=document.querySelector('.global-topbar__tabs--global .global-tab.is-active [role=tab]');const row=document.querySelector('.desktop-tools-navigation button[aria-current]');return {railColor:rail&&getComputedStyle(rail.querySelector('svg')).color,expectedRail:resolve('--gw-rail-icon-active'),railBackground:rail&&getComputedStyle(rail).backgroundColor,expectedBackground:resolve('--gw-rail-selected'),tabColor:tab&&getComputedStyle(tab).color,expectedText:resolve('--gw-text'),rowBackground:row&&getComputedStyle(row).backgroundColor,expectedRow:resolve('--gw-selected')}})()`);
   if(darkStyles.railColor!==darkStyles.expectedRail||darkStyles.railBackground!==darkStyles.expectedBackground||darkStyles.tabColor!==darkStyles.expectedText||darkStyles.rowBackground&&darkStyles.rowBackground!==darkStyles.expectedRow)throw Error('Dark neutral selection changed '+page+JSON.stringify(darkStyles));
   report.selection.push({page,theme:'dark',...darkStyles});await shot('selection-dark-'+page.toLowerCase().replaceAll(' ','-'));await run("document.documentElement.dataset.theme='light'");
  }
  await run(`document.querySelector('.global-topbar [aria-label="Workspace tools"]').focus()`);await shot('15-collapsed-keyboard-focus');await check('keyboardFocusVisible',`document.activeElement.matches(':focus-visible')`);
  await run('document.activeElement.blur()');await shot('16-collapsed-no-active-style');
  w.setSize(780,640);await shot('17-narrow-collapsed');
  await fs.writeFile(path.join(out,'selection-results.json'),JSON.stringify(report,null,2));console.log(report);app.quit();return;
 }
 if(process.env.WORKSPACE_QA_RESTART==='1'){
  const saved=JSON.parse(await fs.readFile(path.join(out,'before-restart.json'),'utf8'));
  await check('restartCollapsed','!document.querySelector(".global-topbar__tabs--workspace")&&document.querySelector(".right-workspace").hidden');await shot('12-restart-collapsed');
  const state=await stored();report.retainedIdsAfterRestart=state.suspendedWorkspaceTabs?.map(t=>t.id);report.globalTabsRestored=JSON.stringify(state.globalTabs)===JSON.stringify((await fs.readFile(path.join(out,'restore-expectations.json'),'utf8').then(JSON.parse).catch(()=>saved)).globalTabs);if(!report.globalTabsRestored)throw Error('Global tabs changed on restart');
  report.previousShellStopped=!alive(saved.shellPid);if(!report.previousShellStopped)throw Error('Shell survived app exit');
  report.previousForegroundProcessStopped=!saved.childPid||!alive(saved.childPid);if(!report.previousForegroundProcessStopped)throw Error('Child process survived app exit');
  await click('Workspace tools');await shot('13-restart-launcher');const expected=await fs.readFile(path.join(out,'restore-expectations.json'),'utf8').then(JSON.parse).catch(()=>null);if(expected){report.widthRestored=await run('document.querySelector(".right-workspace").getBoundingClientRect().width')===expected.width;if(!report.widthRestored)throw Error('Width not restored')}await check('restartSingleLauncher','document.querySelectorAll(".global-topbar__tabs--workspace [role=tab]").length===1');
  await click('Restore Terminal');await wait(700);await shot('14-restart-terminal-unavailable');
  await check('honestUnavailableAfterRestart',`document.querySelector('.workspace-terminal').textContent.includes('This shell disconnected')&&document.querySelector('.workspace-terminal').textContent.includes('Start new terminal')`);
  await check('noAutomaticProcessRestart',`window.codexDesktop.terminal.get(${JSON.stringify(saved.sessionId)}).then(s=>s===undefined)`);
  await fs.writeFile(path.join(out,'restart-results.json'),JSON.stringify(report,null,2));console.log(report);app.quit();return;
 }
 if(!await run('!!document.querySelector(".global-topbar__tabs--workspace")'))await click('Workspace tools');
 await click('Terminal');const sessionId=await start('03-start-approve');if(!sessionId)throw Error('No session registered');report.sessionId=sessionId;
 await run(`window.codexDesktop.terminal.write(${JSON.stringify(sessionId)},'echo GWIRA_QA_SHELL_PID=$$; sleep 300\\r')`);await wait(500);
 const snapshot=await run(`window.codexDesktop.terminal.get(${JSON.stringify(sessionId)})`);const shellPid=Number(snapshot.output.match(/GWIRA_QA_SHELL_PID=(\d+)/)?.[1]);if(!shellPid)throw Error('Missing actual shell pid');report.shellPid=shellPid;
 await until(`document.querySelector('.workspace-terminal__status')?.textContent==='Running'`);await shot('04-active-process');const before=await stored();
 await click('Workspace tools');await shot('05-collapsed-focus');
 await check('collapsedNoStrip','!document.querySelector(".global-topbar__tabs--workspace")');await check('collapsedNoPanel','document.querySelector(".right-workspace").getBoundingClientRect().width===0');await check('focusReturned','document.activeElement.getAttribute("aria-label")==="Workspace tools"');
 await check('runningWhileCollapsed',`window.codexDesktop.terminal.get(${JSON.stringify(sessionId)}).then(s=>s?.status==='running')`);report.processAliveWhileCollapsed=alive(shellPid);if(!report.processAliveWhileCollapsed)throw Error('Collapse killed shell');
 await run('document.activeElement.blur()');w.webContents.sendInputEvent({type:'mouseMove',x:600,y:300});await shot('06-collapsed-unfocused');
 report.collapsedToggle=await run(`(()=>{const e=document.querySelector('.global-topbar [aria-label="Workspace tools"]');const s=getComputedStyle(e);return {expanded:e.getAttribute('aria-expanded'),background:s.backgroundColor,color:s.color,outline:s.outlineStyle,focusVisible:e.matches(':focus-visible')}})()`);
 await click('Workspace tools');await shot('07-reopened-launcher');await check('singleLauncher','document.querySelectorAll(".global-topbar__tabs--workspace [role=tab]").length===1');
 await click('Restore Terminal');await wait(500);await shot('08-restored-running');await check('sameRunningSession',`window.codexDesktop.terminal.get(${JSON.stringify(sessionId)}).then(s=>s?.status==='running'&&s.output.includes('GWIRA_QA_SHELL_PID=${shellPid}'))`);
 report.focusAfterRestore=await run('document.activeElement.className');report.globalTabsUnchanged=JSON.stringify((await stored()).globalTabs)===JSON.stringify(before.globalTabs);
 await click('Close Terminal tab');await native('09-close-cancel');await check('closeCancelKeepsRunning',`window.codexDesktop.terminal.get(${JSON.stringify(sessionId)}).then(s=>s?.status==='running')`);await shot('10-close-cancelled');
 await click('Close Terminal tab');await native('11-close-approve');await wait(500);await check('closeRemovesSession',`window.codexDesktop.terminal.get(${JSON.stringify(sessionId)}).then(s=>s===undefined)`);report.explicitCloseStopsShell=!alive(shellPid);if(!report.explicitCloseStopsShell)throw Error('Close leaked shell');
 await click('Terminal');const second=await start('12-restart-test-start-approve');await run(`window.codexDesktop.terminal.write(${JSON.stringify(second)},'echo GWIRA_QA_RESTART_PID=$$; sleep 300\\r')`);await wait(500);
 const snap=await run(`window.codexDesktop.terminal.get(${JSON.stringify(second)})`);const secondPid=Number(snap.output.match(/GWIRA_QA_RESTART_PID=(\d+)/)?.[1]);
 const children=execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).split('\n').map(s=>s.trim().split(/\s+/)).filter(a=>Number(a[1])===secondPid&&a.slice(2).join(' ').includes('sleep'));const childPid=Number(children[0]?.[0]);
 if(!secondPid||!childPid)throw Error('Restart test has no foreground process');
 await click('Workspace tools');await shot('11-before-app-exit');const saved={...await stored(),sessionId:second,shellPid:secondPid,childPid};await fs.writeFile(path.join(out,'before-restart.json'),JSON.stringify(saved,null,2));
 await fs.writeFile(path.join(out,'terminal-results.json'),JSON.stringify(report,null,2));console.log('READY_TO_RESTART',report);app.quit();
})().catch(e=>{console.error(e);app.exit(1)});
