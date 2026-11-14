const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const out=path.resolve('artifacts/workflow/polish/onboarding-visual-qa');
app.setPath('userData',path.join(os.tmpdir(),'gwira-onboarding-qa-'+Date.now()));
process.env.ELECTRON_RENDERER_URL=process.env.ONBOARDING_QA_URL||'http://127.0.0.1:5198/dev/onboarding';
(async()=>{await fs.mkdir(out,{recursive:true});await import('../dist/main/main.js');await app.whenReady();let w;for(let i=0;i<100;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await new Promise(r=>setTimeout(r,100));}await new Promise(r=>setTimeout(r,1200));const errors=[];w.webContents.on('console-message',(_e,level,msg)=>{if(level>=3)errors.push(msg)});const run=s=>w.webContents.executeJavaScript(s);const shot=async n=>{await new Promise(r=>setTimeout(r,150));await fs.writeFile(path.join(out,n+'.png'),(await w.webContents.capturePage()).toPNG())};
const phase=process.env.ONBOARDING_QA_PHASE||'before';
await w.setSize(1440,900);await shot(phase+'-initial-wide');
console.log(await run('document.body.innerText.slice(0,350)'));
if(process.env.ONBOARDING_QA_PRODUCTION){const guarded=await run('!document.querySelector(".gwira-onboarding-page")');await fs.writeFile(path.join(out,'production-guard.json'),JSON.stringify({guarded,url:w.webContents.getURL()}));if(!guarded)throw Error('Production guard failed');app.exit(0);return;}
for(const [key,goal] of [['collections','Prepare customer collections'],['website','Build a business website'],['assignments','Organize employee assignments']]){await run(`(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(goal)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await shot(phase+'-'+key);}
for(const [key,width,height]of[['medium',1100,760],['narrow',800,650]]){w.setSize(width,height);await shot(phase+'-'+key);}
w.setSize(1440,900);
await run(`(()=>{const e=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Example business');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await shot(phase+'-optional-context');
await run("document.querySelector('textarea').focus()");await w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});await w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});const tabTarget=await run('document.activeElement.tagName');
await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='Continue').click()");await shot(phase+'-organization');
await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='Back').click()");if(!(await run("document.querySelector('textarea').value.includes('employee')")))throw Error('Back lost goal');
await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='Continue').click()");await run("document.querySelector('input[type=radio]').click()");await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='Continue').click()");await shot(phase+'-templates');await run("document.querySelector('.gwira-onboarding-page__templates button').click()");await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='Continue').click()");await shot(phase+'-guidance');await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='Continue').click()");await shot(phase+'-complete');
console.log('Keyboard Tab target:',tabTarget,'; Back retained input; all steps reached');
await fs.writeFile(path.join(out,phase+'-report.json'),JSON.stringify({errors,text:await run('document.body.innerText'),scrollWidth:await run('document.documentElement.scrollWidth'),innerWidth:await run('innerWidth')},null,2));app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
