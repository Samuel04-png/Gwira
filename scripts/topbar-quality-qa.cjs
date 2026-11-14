const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const out=process.env.NAVIGATION_QA_OUTPUT,wait=ms=>new Promise(r=>setTimeout(r,ms));let checking=false;const exit=app.exit.bind(app);
app.exit=code=>{if(code||checking)return exit(code);checking=true;check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)})};
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents;w.show();w.focus();wc.focus();wc.setBackgroundThrottling(false);
 const errors=[];wc.on('console-message',(event)=>{if(['error','warning'].includes(event.level))errors.push(event.message)});
 const ev=s=>wc.executeJavaScript(s),assert=(ok,msg)=>{if(!ok)throw Error(msg)},shot=async name=>{await wait(180);await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(await ev(`(()=>{const a=document.querySelector('#gwira-assistant-panel');if(!a)return {};const r=a.getBoundingClientRect();return {hidden:a.hidden,display:getComputedStyle(a).display,z:getComputedStyle(a).zIndex,width:r.width,left:r.left,right:r.right,top:r.top,root:document.querySelector('.shell').dataset.assistantOpen,hit:document.elementFromPoint(innerWidth-100,100)?.outerHTML.slice(0,250)}})()`),null,2))};
 const click=async sel=>{await ev(`document.querySelector(${JSON.stringify(sel)}).click()`);await wait(160)};
 const key=async(keyCode,modifiers=[])=>{w.focus();wc.focus();wc.sendInputEvent({type:'keyDown',keyCode,modifiers});wc.sendInputEvent({type:'keyUp',keyCode,modifiers});await wait(160)};
 const setInput=async(sel,text)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));e.focus()})()`);await wait(70)};
 const tabs=()=>ev(`JSON.stringify(Array.from(document.querySelectorAll('.global-topbar [role="tab"]')).map(e=>[e.textContent,e.ariaSelected]))`);
 for(const [width,height]of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(width,height);await wait(200);await shot('dashboard-'+width+'x'+height)}
 if(process.env.TOPBAR_QA_PHASE==='before')return;
 w.setContentSize(1440,900);await wait(200);
 assert(await ev(`Array.from(document.querySelectorAll('.global-topbar__actions button')).map(e=>e.ariaLabel).join('|')==='Gwira Chat|Notifications|Collapse context panel'`),'Incorrect toolbar order');
 assert(await ev(`!document.querySelector('.global-topbar__search')&&document.querySelector('.global-topbar').getBoundingClientRect().height===38`),'Search still visible or bar taller');
 const initial=await tabs();await click('[aria-label="Gwira Chat"]');assert(await tabs()===initial,'Opening Chat reset tabs');
 assert(await ev(`document.activeElement.id==='gwira-assistant-input'&&!document.querySelector('#gwira-assistant-panel').hidden`),'Chat focus missing');
 await setInput('#gwira-assistant-input','Draft stays across every page');
 for(const [width,height]of [[1440,900],[1280,800],[900,700],[780,640]]){
  w.setContentSize(width,height);await wait(220);await shot('assistant-'+width+'x'+height);
  assert(await ev(`(()=>{const a=document.querySelector('#gwira-assistant-panel').getBoundingClientRect(),t=document.querySelector('.global-topbar').getBoundingClientRect(),b=Array.from(document.querySelectorAll('.global-topbar__actions button')).map(e=>e.getBoundingClientRect());return a.width>=300&&a.left>=0&&a.right===innerWidth&&a.top===38&&a.bottom<=innerHeight&&t.top===0&&b[0].right<=b[1].left&&b[1].right<=b[2].left&&b[2].right<=innerWidth})()`),'Panel or toolbar overflow '+width);
 }
 w.setContentSize(1440,900);await wait(200);
 await click('[data-testid="context-panel-toggle"]');assert(await ev(`document.querySelector('#gwira-assistant-panel').hidden`),'Right toggle did not collapse Chat');
 await click('[aria-label="Gwira Chat"]');assert(await ev(`document.querySelector('#gwira-assistant-input').value==='Draft stays across every page'`),'Collapse discarded draft');
 await click('[aria-label="Collapse sidebar"]');assert(await ev(`!document.querySelector('#gwira-assistant-panel').hidden&&document.querySelector('.shell').dataset.sidebar==='collapsed'`),'Left toggle collapsed assistant');await click('[aria-label="Expand sidebar"]');
 await ev(`document.querySelector('#gwira-assistant-input').focus()`);await key('k',['meta']);assert(await ev(`document.querySelector('[role="dialog"][aria-label="Search Gwira"]')&&document.activeElement.tagName==='INPUT'`),'Keyboard Search failed');await shot('keyboard-search');await key('Escape');assert(await ev(`document.activeElement.id==='gwira-assistant-input'`),'Search did not restore focus');
 // All real destinations are opened through the existing picker, never hardcoded business records.
 await click('[aria-label="Open a new tab"]');const choices=await ev(`Array.from(document.querySelectorAll('.global-popover [role="option"] strong')).map(e=>e.textContent)`);await key('Escape');
 for(const label of choices){
  await click('[aria-label="Open a new tab"]');await ev(`Array.from(document.querySelectorAll('.global-popover [role="option"]')).find(e=>e.querySelector('strong').textContent===${JSON.stringify(label)}).click()`);await wait(150);
  assert(await ev(`!document.querySelector('#gwira-assistant-panel').hidden&&document.querySelector('#gwira-assistant-input').value==='Draft stays across every page'&&document.querySelectorAll('.global-topbar').length===1`),'Global Chat lost on '+label);
 }
 w.setContentSize(780,640);await wait(200);await shot('many-tabs-780x640');
 assert(await ev(`document.querySelector('.global-topbar__tabs').scrollWidth>document.querySelector('.global-topbar__tabs').clientWidth`),'Many tabs did not scroll');
 assert(await ev(`(()=>{const t=document.querySelector('.global-topbar__tabs').getBoundingClientRect(),a=document.querySelector('.global-tab.is-active').getBoundingClientRect();return a.left>=t.left-1&&a.right<=t.right})()`),'Active tab hidden after resize');
 const beforeSwitch=await tabs();await key('Tab',['control']);assert(await tabs()!==beforeSwitch,'Ctrl+Tab failed');await key('Tab',['control','shift']);assert(await tabs()===beforeSwitch,'Ctrl+Shift+Tab failed');
 await click('[aria-label^="Notifications"]');assert(await ev(`document.querySelector('[role="dialog"][aria-label="Notifications"]')!==null`),'Notifications failed');await shot('notifications');await key('Escape');
 await click('[aria-label="Close Gwira Chat"]');const count=await ev(`document.querySelectorAll('.global-tab').length`);await click('.global-tab.is-active .global-tab__close');assert(await ev(`document.querySelectorAll('.global-tab').length`)===count-1,'Closing tab failed');
 await click('[data-testid="context-panel-toggle"]');assert(await ev(`!document.querySelector('#gwira-assistant-panel').hidden`),'Right toggle unavailable outside Dashboard');await key('Escape');assert(await ev(`document.querySelector('#gwira-assistant-panel').hidden&&document.activeElement.ariaLabel==='Gwira Chat'`),'Chat Escape focus');
 // Isolated profile + IPC stubs verify the real UI without starting any agent or accessing an AI service.
 const projectDir=path.join(out,'source-folder');await fs.mkdir(projectDir,{recursive:true});
 await ev(`localStorage.setItem('codex-desktop.projects.v1',JSON.stringify({projects:[{id:'qa-project',name:'QA source',path:${JSON.stringify(projectDir)}}],activeProjectId:'qa-project'}))`);
 let started=0,sent=[],stopped=0,fail=false;const now=new Date().toISOString();
 for(const ch of ['codex:start-session','codex:send-input','codex:stop-session','codex:list-models'])ipcMain.removeHandler(ch);
 ipcMain.handle('codex:list-models',()=>[{slug:'gpt-5.5',defaultReasoningLevel:'high',supportedReasoningLevels:['high']}]);
 ipcMain.handle('codex:start-session',(_e,r)=>{started++;return {id:'qa-assistant',cwd:r.cwd,model:r.model,reasoningEffort:r.reasoningEffort,permissionMode:r.permissionMode,context:r.context,status:'idle',messages:[],startedAt:now,updatedAt:now}});
 ipcMain.handle('codex:send-input',(_e,r)=>{sent.push(r);if(fail)throw Error('QA offline');});ipcMain.handle('codex:stop-session',(_e,request)=>{stopped++;setTimeout(()=>wc.send('codex:exit',{sessionId:request.sessionId,status:'idle',exitCode:0}),20)});
 wc.reload();await wait(1700);await click('[aria-label="Gwira Chat"]');assert(started===0,'Opening Chat executed a session');
 await setInput('#gwira-assistant-input','Verify isolated assistant session');await key('Enter');assert(started===1&&sent.length===1&&sent[0].sessionId==='qa-assistant'&&sent[0].permissionMode==='default','Send bridge incorrect');
 wc.send('codex:output',{sessionId:'qa-assistant',role:'codex',chunk:'Verified response from the isolated QA bridge.'});await wait(160);
 assert(await ev(`document.querySelector('#gwira-assistant-panel .transcript').textContent.includes('Verified response')`),'Stream output missing');await shot('assistant-response');
 wc.send('codex:exit',{sessionId:'qa-assistant',status:'idle',exitCode:0});await wait(150);assert(await ev(`!Array.from(document.querySelectorAll('#gwira-assistant-panel button')).some(e=>e.textContent==='Stop')`),'Completion did not settle');await setInput('#gwira-assistant-input','Second turn');await key('Enter');assert(started===1&&sent.length===2,'Conversation session was replaced');
 await ev(`Array.from(document.querySelectorAll('#gwira-assistant-panel button')).find(e=>e.textContent==='Stop').click()`);await wait(150);
 assert(stopped===1,'Stop bridge incorrect');
 fail=true;await setInput('#gwira-assistant-input','Keep my draft on failure');await key('Enter');await wait(150);assert(await ev(`document.querySelector('#gwira-assistant-panel [role="alert"]')&&document.querySelector('#gwira-assistant-input').value==='Keep my draft on failure'`),'Failed send loses draft or error');await shot('assistant-send-error');
 const existingWarnings=errors.filter(e=>e.includes('Electron Security Warning (Insecure Content-Security-Policy)'));const unexpected=errors.filter(e=>!existingWarnings.includes(e));assert(unexpected.length===0,'New renderer warnings/errors: '+unexpected.join('\n'));
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,viewports:4,destinations:choices.length,started,sends:sent.length,stopped,rendererErrors:unexpected,existingSecurityWarnings:existingWarnings.length},null,2));console.log('TOPBAR_QA_PASSED');
}
require('../dist/main/main.js');
