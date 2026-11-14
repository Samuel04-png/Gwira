const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const out=path.resolve('artifacts/workflow/polish/global-ui-corrections');
app.setPath('userData',path.join(os.tmpdir(),'gwira-corrections-'+Date.now()));
process.env.ELECTRON_RENDERER_URL='http://127.0.0.1:5198/';
(async()=>{
 await fs.mkdir(out,{recursive:true});await import('../dist/main/main.js');await app.whenReady();
 let w;for(let i=0;i<100;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await new Promise(r=>setTimeout(r,100));}
 const wait=(ms=250)=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await w.webContents.executeJavaScript(s)}catch(e){console.error("Renderer expression failed",s);throw e}};
 const errors=[];w.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error(event.message)}});
 const shot=async name=>{await wait();await fs.writeFile(path.join(out,name+'.png'),(await w.webContents.capturePage()).toPNG())};
 const click=async label=>{const ok=await run(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)})&&e.getBoundingClientRect().height);if(!e)return false;e.click();return true})()`);await wait();return ok};
 const must=async label=>{if(!await click(label))throw Error('Missing button '+label)};
 const check=async (name,script)=>{const value=await run(script);report[name]=value;if(!value)throw Error(name+' failed')};
 const report={errors};w.setSize(1440,900);w.show();w.focus();await wait(800);
 await shot('home-composer');
 if(!await run('document.querySelector(".global-topbar__tabs--workspace")!==null'))await must('Workspace tools');
 await must('Files');await shot('workspace-files-open');
 const globals=await run('[...document.querySelectorAll(".global-topbar__tabs--global [role=tab]")].map(e=>e.textContent)');
 const openWidth=await run('document.querySelector(".right-workspace").getBoundingClientRect().width');
 await must('Workspace tools');await shot('workspace-collapsed');
 await check('stripRemoved','!document.querySelector(".global-topbar__tabs--workspace")');
 await check('panelHidden','document.querySelector(".right-workspace").getBoundingClientRect().width===0');
 await check('focusReturned','document.activeElement?.getAttribute("aria-label")==="Workspace tools"');
 await check('globalsPreserved',`JSON.stringify([...document.querySelectorAll('.global-topbar__tabs--global [role=tab]')].map(e=>e.textContent))===${JSON.stringify(JSON.stringify(globals))}`);
 await w.webContents.reload();await wait(1400);
 await check('reloadRemainsCollapsed','!document.querySelector(".global-topbar__tabs--workspace")');
 await must('Workspace tools');await shot('workspace-reopened');
 await check('launcherOnReopen','!!document.querySelector(".right-workspace .new-tab-launcher")');
 await must('Restore Files');await check('filesRestored','document.querySelector(".global-topbar__tabs--workspace").textContent.includes("Files")');
 await must('Open a new workspace tab');await must('Terminal');await shot('terminal-ready');
 const terminal=null;report.liveTerminal='Not verified: native confirmation belongs to an Electron process that CUA could not uniquely target. No confirmation or security bypass used.';
 await must('Open a new workspace tab');await must('Work Sessions');await shot('workspace-multiple-tabs');
 await must('Workspace tools');await check('multipleToolsHidden','!document.querySelector(".global-topbar__tabs--workspace")');

 await must('Home');await check('globalSwitchKeepsCollapsed','!document.querySelector(".global-topbar__tabs--workspace")');
 await must('Workspace tools');await must('Restore Terminal');await wait(500);await shot('workspace-terminal-restored');
 await check('terminalRestored','document.querySelector(".right-workspace").textContent.includes("Start Terminal")');
 await run(`document.querySelector('[aria-label="Resize Workspace"]').focus()`);w.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'});await wait();await shot('workspace-resized');
 report.openWidth=openWidth;report.resizedWidth=await run('document.querySelector(".right-workspace").getBoundingClientRect().width');
 await must('Close Terminal tab');
 await must('Workspace tools');
 for(const label of ['Skills','Integrations','Settings','Schedule']){await must('More');await must(label);await shot(label.toLowerCase());if(label==='Skills'){w.setSize(780,640);await shot('skills-narrow');w.setSize(1440,900);}if(label==='Schedule'){if(await click('New task')){await shot('new-schedule-dialog');await click('Cancel');}else if(await click('New Schedule')){await shot('new-schedule-dialog');await click('Cancel');}}}
 await must('Workspace');await shot('workflow-toolbar');await must('My Work');await shot('my-work-toolbar');
 await must('Home');await shot('restored-sidebar-global-tabs');
 await check('neutralSelectedRail',`(()=>{const el=document.querySelector('.gwira-primary-rail button.active');const probe=document.createElement('span');probe.style.color='var(--gw-rail-icon-active)';document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return getComputedStyle(el.querySelector('svg')).color===expected})()`);

 const hover=await run('(()=>{const e=document.querySelector(".gw-rail-item button:not([aria-current])");if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');if(hover){w.webContents.sendInputEvent({type:'mouseMove',...hover});await shot('sidebar-hover')}
 w.setSize(1280,800);await shot('desktop-1280');w.setSize(900,700);await shot('desktop-900');w.setSize(780,640);await shot('narrow-desktop');
 await check('noDocumentOverflow','document.documentElement.scrollWidth<=innerWidth');

 // Mount the actual shared switch in an explicitly marked, isolated QA harness.
 // Its callback writes only this temporary Electron profile, never installed skill preferences.
 await run(`(async()=>{
 const source=await(await fetch('/components/Toggle.tsx')).text();const reactUrl=source.match(/from \"([^\"]*react.js[^\"]*)\"/)[1];const React=(await import(reactUrl)).default;const dom=await import(reactUrl.replace('react.js','react-dom_client.js'));const createRoot=dom.createRoot??dom.default.createRoot;const {Toggle}=await import('/components/Toggle.tsx');
 const host=document.createElement('div');host.id='qa-switch';document.body.append(host);
 host.style.cssText='position:fixed;inset:20%;padding:var(--gw-space-6);background:var(--gw-surface);z-index:9999;border:var(--gw-hairline) solid var(--gw-border)';
 function Harness(){const [value,setValue]=React.useState(localStorage.getItem('qa-switch')==='true');return React.createElement('div',null,React.createElement('p',null,'Development QA · shared toggle'),React.createElement(Toggle,{label:'QA preference',checked:value,onChange:v=>new Promise(resolve=>{window.qaSave=()=>{localStorage.setItem('qa-switch',String(v));setValue(v);resolve()}})}),React.createElement(Toggle,{label:'Disabled QA preference',checked:false,disabled:true,onChange:()=>{throw Error('Disabled switch activated')}}),React.createElement(Toggle,{label:'Failed QA preference',checked:false,onChange:async()=>{throw Error('Could not save. Try again.')}}));}
 window.qaRoot=createRoot(host);window.qaRoot.render(React.createElement(Harness));})()`);await wait();
 await run('document.querySelector("#qa-switch [role=switch]").focus()');w.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await wait();
 await check('toggleKeyboardPending','document.querySelector("#qa-switch [role=switch]").getAttribute("aria-busy")==="true"&&document.querySelector("#qa-switch [role=switch]").disabled');
 await run('window.qaSave()');await wait();await check('toggleSaved','localStorage.getItem("qa-switch")==="true"&&document.querySelector("#qa-switch [role=switch]").getAttribute("aria-checked")==="true"');
 await run(`document.querySelector('#qa-switch [aria-label="Failed QA preference"]').click()`);await wait();await check('toggleErrorAnnounced','!!document.querySelector("#qa-switch [role=alert]")');await shot('shared-toggle-qa-states');
 await run('window.qaRoot.unmount();document.querySelector("#qa-switch").remove()');
 await fs.writeFile(path.join(out,'interaction-results.json'),JSON.stringify(report,null,2));console.log(report);app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
