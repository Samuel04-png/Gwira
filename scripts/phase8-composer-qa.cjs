const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const out=process.env.NAVIGATION_QA_OUTPUT, wait=ms=>new Promise(r=>setTimeout(r,ms));let checking=false;const exit=app.exit.bind(app);
app.exit=code=>{if(code||checking)return exit(code);checking=true;check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)})};
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents;w.show();w.focus();wc.focus();wc.setBackgroundThrottling(false);
 const ev=s=>wc.executeJavaScript(s),assert=(ok,msg)=>{if(!ok)throw Error(msg)},shot=async name=>{await wait(100);await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG())};
 const click=async s=>{await ev(`document.querySelector(${JSON.stringify(s)}).click()`);await wait(100)};
 const input='.composer-panel textarea', set=async(s,text)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(100)};
 const source=path.join(out,'source-folder');await fs.mkdir(source,{recursive:true});
 let n=0,sends=[];const now=new Date().toISOString();
 for(const c of ['codex:start-session','codex:send-input','codex:list-models','codex:list-histories'])ipcMain.removeHandler(c);
 ipcMain.handle('codex:list-models',()=>[{slug:'verified-advanced-model-with-a-very-long-name',supportedReasoningLevels:['medium','high']}]);
 ipcMain.handle('codex:list-histories',()=>[]);
 ipcMain.handle('codex:start-session',(_e,r)=>({...r,id:'phase8-'+(++n),status:'idle',messages:[],startedAt:now,updatedAt:now}));
 ipcMain.handle('codex:send-input',(_e,r)=>{sends.push(r)});
 await ev(`localStorage.setItem('codex-desktop.projects.v1',JSON.stringify({projects:[{id:'phase8',name:'Operations workspace with a very long project name for overflow verification',path:${JSON.stringify(source)}}],activeProjectId:'phase8'}))`);
 wc.reload();await wait(1300);await click('.gwira-primary-rail [aria-label="Home"]');
 const measurements=[];
 for(const [width,height]of [[1440,900],[1280,800],[900,700],[780,640]]){
  w.setContentSize(width,height);await wait(150);await set(input,'');
  const m=await ev(`(()=>{const p=document.querySelector('.composer-panel'),t=p.querySelector('textarea'),c=p.querySelector('.composer-context');return {width:innerWidth,height:p.getBoundingClientRect().height,input:t.getBoundingClientRect().height,context:c.getBoundingClientRect().height,overflow:p.scrollWidth>p.clientWidth+1,font:getComputedStyle(t).fontSize,buttons:[...p.querySelectorAll('.composer-footer button')].map(b=>({label:b.ariaLabel,x:b.getBoundingClientRect().right}))}})()`);
  measurements.push(m);assert(m.height>=96&&m.height<=112&&m.input===32&&m.context===36&&!m.overflow,'Geometry '+JSON.stringify(m));
  await shot('empty-'+width+'x'+height);
 }
 w.setContentSize(1440,900);await ev(`document.querySelector('${input}').focus()`);await shot('focused');
 await set(input,Array.from({length:30},(_,i)=>'Line '+i).join('\n'));
 assert(await ev(`(()=>{const t=document.querySelector('${input}');return t.clientHeight<=200&&getComputedStyle(t).overflowY==='auto'})()`),'Multiline cap');await shot('multiline');
 await set(input,'Preserve this failed request');await click('.composer-panel .send');const id=sends.at(-1).sessionId;
 await set(input,'A newer draft must survive');wc.send('codex:exit',{sessionId:id,status:'error',error:'Simulated private provider failure'});await wait(150);
 assert(await ev(`document.querySelector('${input}').value==='A newer draft must survive'&&!document.querySelector('.composer-panel').textContent.includes('private provider')`),'Async failure overwrote draft or leaked detail');await shot('failed-newer-draft');
 await click('.composer-panel [aria-label="Dismiss error"]');await set(input,'Restore after asynchronous rejection');await click('.composer-panel .send');
 wc.send('codex:exit',{sessionId:id,status:'error',error:'Model test is not available'});await wait(150);
 assert(await ev(`document.querySelector('${input}').value==='Restore after asynchronous rejection'`),'Async failure draft not restored');await shot('failed-restored-draft');
 await click('.composer-panel [aria-label="model"]');await shot('model-selected');
 await ev(`Array.from(document.querySelectorAll('.model-inline-select [role="option"]')).find(e=>e.textContent.toLowerCase().includes('verified-advanced')).click()`);await wait(120);w.setContentSize(780,640);await wait(150);await shot('advanced-long-narrow');
 assert(await ev(`(()=>{const p=document.querySelector('.composer-panel'),s=p.querySelector('.send');return p.scrollWidth<=p.clientWidth+1&&s.getBoundingClientRect().right<=p.getBoundingClientRect().right})()`),'Advanced overflow');
 await click('.global-topbar [aria-label="Gwira Chat"]');await wait(150);await shot('side-chat-narrow');
 assert(await ev(`(()=>{const p=document.querySelector('.global-assistant__input-box');return p.scrollWidth<=p.clientWidth+1&&p.getBoundingClientRect().height>=96&&p.getBoundingClientRect().height<=112})()`),'Side chat overflow or initial height');
 await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify({measurements,sends:sends.length,asyncFailureRestore:true,isolatedIpcFixtures:true},null,2));console.log('PHASE8_COMPOSER_QA_PASSED');
}
require('../dist/main/main.js');
