const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const base=path.resolve(process.env.TOPBAR_QA_OUTPUT||'artifacts/workflow/polish/topbar-workspace-layout');
const phase=process.env.TOPBAR_QA_PHASE||'after';const out=path.join(base,phase);
app.setPath('userData',process.env.TOPBAR_QA_PROFILE||'/tmp/gwira-topbar-layout-profile');process.env.ELECTRON_RENDERER_URL=process.env.TOPBAR_QA_URL||'http://127.0.0.1:5198/';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await fs.mkdir(out,{recursive:true});await import('../dist/main/main.js');await app.whenReady();let w;
 for(let i=0;i<100;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await wait(100)}
 w.setSize(1440,900);w.show();w.focus();await wait(800);
 const run=s=>w.webContents.executeJavaScript(s);const report={rendererUrl:process.env.ELECTRON_RENDERER_URL,states:[],errors:[]};w.webContents.on('console-message',e=>{if(e.level==='error')report.errors.push(e.message)});
 const click=async name=>{const ok=await run(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(name)}||e.textContent.trim()===${JSON.stringify(name)})&&e.getBoundingClientRect().height);if(!b)return false;b.click();return true})()`);if(!ok)throw Error('Missing '+name);await wait(250)};
 const open=()=>run('!!document.querySelector(".global-topbar__tabs--workspace")');
 const state=()=>run(`(()=>{const h=document.querySelector('.global-topbar'),a=document.querySelector('.global-topbar__actions'),g=document.querySelector('.global-topbar__global-region'),t=document.querySelector('.global-topbar__workspace-region'),p=document.querySelector('.right-workspace');const b=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};return {viewport:innerWidth,header:b(h),actions:b(a),global:b(g),tools:b(t),panel:b(p),open:!p.hidden,globalTabs:[...document.querySelectorAll('.global-topbar__tabs--global [role=tab]')].map(e=>e.textContent.trim()),toolTabs:[...document.querySelectorAll('.global-topbar__tabs--workspace [role=tab]')].map(e=>e.textContent.trim()),overflow:document.documentElement.scrollWidth>innerWidth,drag:getComputedStyle(h).webkitAppRegion,noDrag:getComputedStyle(a).webkitAppRegion,selectedColor:getComputedStyle(document.querySelector('.global-tab.is-active')).color,workspaceHeaderState:h.dataset.workspaceOpen,controls:[...a.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label'),...b(e),height:e.getBoundingClientRect().height})),tabScrollWidth:document.querySelector('.global-topbar__tabs--global').scrollWidth}})()`);
 const capture=async name=>{await wait(300);const s={name,...await state()};report.states.push(s);await fs.writeFile(path.join(out,name+'.png'),(await w.webContents.capturePage()).toPNG());if(phase!=='before'){
  if(Math.abs(s.actions.right-s.header.right)>1||Math.abs(s.header.right-s.viewport)>1)throw Error('Actions not anchored '+JSON.stringify(s));
  if(s.overflow)throw Error('Document overflow '+name);
  if(s.controls.length!==3||s.controls.some(c=>c.width<=0||c.height<=0||c.right>s.header.right||c.left<s.actions.left))throw Error('Hidden or clipped action '+name);
  if(s.workspaceHeaderState!==String(s.open))throw Error('Stale header state '+name);
  if(s.drag!=='drag'||s.noDrag!=='no-drag')throw Error('Drag region changed '+name);
  if(s.open&&Math.abs(s.tools.left-s.panel.left)>1)throw Error('Pane divider misaligned '+name);
  if(!s.open&&Math.abs(s.global.right-s.actions.left)>1)throw Error('Reserved gap '+name);
 }};
 if(process.env.TOPBAR_QA_RESTART==='1'){
  const saved=JSON.parse(await fs.readFile(path.join(base,'restart-expectations.json'),'utf8'));
  if(await open())throw Error('Collapse not restored');await capture('restart-collapsed');
  const current=await run(`JSON.parse(localStorage.getItem('gwira.workspace.tabs.v1'))`);
  if(JSON.stringify(current.globalTabs)!==JSON.stringify(saved.globalTabs))throw Error('Global tabs not restored');
  await click('Workspace tools');await capture('restart-reopened');
  if(Math.abs((await state()).panel.width-saved.width)>1)throw Error('Saved width changed');
  await fs.writeFile(path.join(out,'restart-results.json'),JSON.stringify(report,null,2));console.log(report);app.quit();return;
 }
 if(!await open())await click('Workspace tools');await capture('01-workspace-open');await click('Workspace tools');await capture('02-workspace-collapsed');
 if(phase==='before'){await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(report);app.quit();return}
 await click('Workspace tools');await capture('03-workspace-reopened');
 await click('Files');await click('Open a new workspace tab');await click('Terminal');await click('Open a new workspace tab');await click('Work Sessions');await capture('04-multiple-workspace-tabs');
 await click('Workspace tools');await capture('05-multiple-collapsed');
 await click('Workspace');await click('Inbox');await capture('06-global-switch');
 for(const [width,height] of [[1280,800],[900,700],[780,640]]){
  w.setSize(width,height);await capture(`collapsed-${width}`);await click('Workspace tools');await capture(`open-${width}`);await click('Workspace tools');
 }
 w.setSize(1440,900);w.maximize();await wait(650);report.maximized=w.isMaximized();if(!report.maximized)throw Error('Window did not maximize');await capture('07-maximized-collapsed');await click('Workspace tools');await capture('08-maximized-open');w.unmaximize();await wait(650);await capture('09-restored-open');
 await run(`document.querySelector('[aria-label="Resize Workspace"]').focus()`);w.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'});await wait(350);await capture('10-resized-workspace');
 await click('Workspace tools');await capture('11-resized-collapsed');
 // Intrinsic-width stress on rendered tab labels only; no records or persisted titles change.
 await run(`window.qaTitles=[...document.querySelectorAll('.global-topbar__tabs--global .global-tab__select')].map(e=>[e,e.innerHTML]);for(const [e]of window.qaTitles)e.append(document.createTextNode(' Very long title '.repeat(30)))`);await capture('12-long-tab-label-stress');await run('for(const [e,html]of window.qaTitles)e.innerHTML=html');
 await run(`document.querySelector('.global-topbar__tabs--global [role=tab][aria-selected=true]').focus()`);
 const activeBefore=await run(`document.querySelector('.global-topbar__tabs--global [role=tab][aria-selected=true]').textContent`);
 w.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'});await wait(250);
 report.keyboardGlobalTabSwitch=await run(`document.querySelector('.global-topbar__tabs--global [role=tab][aria-selected=true]').textContent`)!==activeBefore;
 if(!report.keyboardGlobalTabSwitch)throw Error('Global tab keyboard switch failed');await capture('13-keyboard-global-tab');
 w.webContents.sendInputEvent({type:'keyDown',keyCode:'t',modifiers:['meta']});w.webContents.sendInputEvent({type:'keyUp',keyCode:'t',modifiers:['meta']});await wait(250);
 if(!await open())throw Error('New workspace shortcut failed');await capture('14-keyboard-workspace-shortcut');await click('Workspace tools');
 const current=await run(`JSON.parse(localStorage.getItem('gwira.workspace.tabs.v1'))`);const prefs=await run(`JSON.parse(localStorage.getItem('gwira.work-sessions.preferences.v1'))`);
 await fs.writeFile(path.join(base,'restart-expectations.json'),JSON.stringify({globalTabs:current.globalTabs,width:prefs.workspaceWidth},null,2));
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(report);app.quit();
})().catch(e=>{console.error(e);app.exit(1)});
