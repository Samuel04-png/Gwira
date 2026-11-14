const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const out=process.env.NAVIGATION_QA_OUTPUT,before=process.env.PHASE1011_BEFORE==='1',wait=ms=>new Promise(r=>setTimeout(r,ms));let checking=false;const exit=app.exit.bind(app);
app.exit=code=>{if(code||checking)return exit(code);checking=true;check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)})};
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents;w.show();wc.setBackgroundThrottling(false);
 const ev=s=>wc.executeJavaScript(s),shot=async name=>{await wait(180);await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG())};
 const click=async s=>{await ev(`document.querySelector(${JSON.stringify(s)}).click()`);await wait(120)};
 const set=async(s,text)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(100)};
 const assert=(v,m)=>{if(!v)throw Error(m)};
 for(const [x,y]of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(x,y);await shot('dashboard-'+x+'x'+y)}
 w.setContentSize(1440,900);await wait(200);
 if(!before){
 await click('.dashboard-sidebar [aria-label="Channels options"]');await shot('channels-menu');await click('[role="menu"] button');
 await click('.dashboard-sidebar [aria-label="Directory options"]');await shot('directory-filter');await click('[role="menu"] button');
 await click('.dashboard-sidebar [aria-label="Add to Directory"]');await shot('directory-add');await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 await click('.dashboard-sidebar [aria-label="Create channel"]');await shot('create-channel');
 await ev(`(()=>{const e=document.querySelector('[aria-label="Channel name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Review channel');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(100);
 await click('.gw-inbox-dialog button[type="submit"]');
 assert(await ev(`document.querySelector('.dashboard-sidebar').textContent.includes('Review channel')`),'Channel not created');
 await ev(`Array.from(document.querySelectorAll('.dashboard-sidebar__nav-row')).find(b=>b.textContent==='Review channel').click()`);await wait(150);await shot('channel-opened');
 assert(await ev(`document.querySelector('.workspace').dataset.workspaceView==='inbox'`),'Channel navigation failed');
 }
 w.setContentSize(1440,900);
 const source=path.join(out,'source-folder');await fs.mkdir(source,{recursive:true});
 let n=0,sends=[];const now=new Date().toISOString();
 for(const c of ['codex:start-session','codex:send-input','codex:list-models','codex:list-histories','codex:stop-session'])ipcMain.removeHandler(c);
 ipcMain.handle('codex:list-models',()=>[]);ipcMain.handle('codex:list-histories',()=>[]);
 ipcMain.handle('codex:start-session',(_e,r)=>({...r,id:'phase1011-'+(++n),status:'idle',messages:[],startedAt:now,updatedAt:now}));
 ipcMain.handle('codex:send-input',(_e,r)=>{sends.push(r)});
 ipcMain.handle('codex:stop-session',(_e,r)=>{setTimeout(()=>wc.send('codex:exit',{sessionId:r.sessionId,status:'stopped'}),150)});
 await ev(`localStorage.setItem('codex-desktop.projects.v1',JSON.stringify({projects:[{id:'qa',name:'Operations',path:${JSON.stringify(source)}}],activeProjectId:'qa'}))`);wc.reload();await wait(1200);
 await click('.gwira-primary-rail [aria-label="Home"]');
 await ev(`document.querySelector('.work-sessions [aria-label="Close work sessions"]')?.click()`);await wait(150);
 const input='.composer-panel textarea';
 const measurements=[];
 for(const [x,y]of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(x,y);await wait(150);await shot('idle-'+x+'x'+y)}
 w.setContentSize(1440,900);await set(input,'Prepare the daily summary');await click('.composer-panel .send');
 for(const [x,y]of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(x,y);await wait(180);await set(input,'');const empty=await ev(`document.querySelector('.composer-panel').getBoundingClientRect().height`);await shot('running-empty-'+x+'x'+y);await set(input,'Prioritize outstanding invoices');const typed=await ev(`document.querySelector('.composer-panel').getBoundingClientRect().height`);measurements.push({x,y,empty,typed});await shot('running-draft-'+x+'x'+y);if(!before)assert(empty===typed&&empty<=112,'Composer grew: '+JSON.stringify(measurements.at(-1)))}
 if(!before){await click('.composer-panel [aria-label="Send options"]');await shot('send-menu');await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await click('.composer-panel [aria-label="Stop current work"]');await wait(250);assert(await ev(`!!document.querySelector('.composer-panel .send')`),'Stop not acknowledged');assert(await ev(`document.querySelector('${input}').value==='Prioritize outstanding invoices'`),'Stop lost draft');
 await click('.composer-panel .send');await set(input,'Replacement after safe stop');const count=sends.length;
 await click('.composer-panel [aria-label="Send options"]');await ev(`Array.from(document.querySelectorAll('.compact-action-menu button')).find(b=>b.textContent.includes('Stop & Send')).click()`);
 assert(sends.length===count,'Replacement sent before cancellation acknowledgement');await wait(350);assert(sends.length===count+1&&sends.at(-1).input==='Replacement after safe stop','Replacement not delivered after safe stop');
 await click('.composer-panel [aria-label="Stop current work"]');await wait(250);await set(input,'Retained after local restart');
 assert(await ev(`Object.values(JSON.parse(localStorage.getItem('gwira.conversation-drafts.v1'))).includes('Retained after local restart')`),'Draft was not persisted');
 }
 await click('.global-topbar [aria-label="Gwira Chat"]');await shot('side-chat-narrow');
 if(!before){
 await set('#gwira-assistant-input','Prepare local side chat summary');await click('.global-assistant__send');await set('#gwira-assistant-input','Keep this follow-up draft');await shot('side-chat-running');
 assert(await ev(`document.querySelector('.global-assistant [aria-label="Stop current work"]')!==null`),'Side chat stop absent');
 await click('.global-assistant [aria-label="Send options"]');await shot('side-chat-send-menu');await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 await click('.global-assistant [aria-label="Stop current work"]');await wait(250);
 assert(await ev(`document.querySelector('#gwira-assistant-input').value==='Keep this follow-up draft'`),'Side chat lost draft');
 }

 if(process.env.PHASE1011_DEV==='1'){
 w.setContentSize(900,700);await ev(`import('/@fs/'+${JSON.stringify(path.resolve('scripts/phase1011-fixture.tsx'))}).then(m=>m.showPhase1011Fixture())`);await wait(250);await shot('development-queue-status');
 await click('.conversation-queue__summary');await shot('development-queue-expanded');
 await click('.conversation-queue__row:nth-child(2) .compact-menu-trigger');await shot('development-queue-menu');
 await ev(`Array.from(document.querySelectorAll('.compact-action-menu button')).find(b=>b.textContent==='Move earlier').click()`);await wait(100);
 assert(await ev(`document.querySelector('.conversation-queue__preview').textContent.includes('instruction 2:')`),'Queue move failed');
 await click('.conversation-queue__row:first-child .compact-menu-trigger');await ev(`Array.from(document.querySelectorAll('.compact-action-menu button')).find(b=>b.textContent==='Edit message').click()`);await wait(100);
 await set('.conversation-queue__edit textarea','Edited development instruction');await shot('development-queue-edit');await click('.conversation-queue__edit button[type="submit"]');
 assert(await ev(`document.querySelector('.conversation-queue__preview').textContent==='Edited development instruction'`),'Queue edit failed');
 await click('.conversation-queue__row:first-child button[aria-label^="Remove queued"]');assert(await ev(`document.querySelectorAll('.conversation-queue__row').length===3`),'Queue removal failed');
 }
 await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify({before,measurements,fixtureIpcOnly:true},null,2));console.log('PHASE1011_QA_PASSED');
}
require('../dist/main/main.js');
