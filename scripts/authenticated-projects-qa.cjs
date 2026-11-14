const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),exit=app.exit.bind(app);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1440,height:900,show:true});
 await win.loadURL('http://127.0.0.1:5189/scripts/authenticated-projects-fixture.html');
 await check(win);exit(0);
}).catch(error=>{console.error(error);exit(1);});
async function check(win){
 const wc=win.webContents;win.show();wc.setBackgroundThrottling(false);
 const run=source=>wc.executeJavaScript(source),assert=(ok,message)=>{if(!ok)throw Error(message);};
 const poll=async(source,label)=>{for(let i=0;i<100;i++){if(await run(source))return;await wait(100);}throw Error('Timed out: '+label);};
 const click=async selector=>{await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await wait(100);};
 const menu=async(name)=>{await click(`[aria-label=${JSON.stringify(name)}]`);};
 const action=async(name)=>{await run(`[...document.querySelectorAll('[role=menuitem]')].find(x=>x.textContent.trim()===${JSON.stringify(name)}).click()`);await wait(100);};
 const input=async(value)=>{await run(`(()=>{const e=document.querySelector('dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
 await run(`import('http://127.0.0.1:5189/@fs/'+${JSON.stringify(path.resolve('scripts/authenticated-projects-fixture.tsx'))}).then(m=>m.showAuthenticatedProjectsFixture())`);
 await poll("!!document.querySelector('#authenticated-projects-fixture button:not(:disabled)')",'fixture');
 await click('[aria-label="Create project"]');assert(await run("document.querySelector('dialog')?.innerText.includes('Cloud project without a local folder')"),'Cloud source explanation missing');
 assert(await run("document.querySelector('dialog button[type=submit]').disabled"),'Empty project name was accepted');
 assert(await run("document.activeElement?.getAttribute('aria-label')==='Project name'"),'Project name did not receive initial focus');
 await fs.writeFile(path.join(process.env.NAVIGATION_QA_OUTPUT,'project-create-modal.png'),(await wc.capturePage()).toPNG());
 wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(100);
 assert(await run("!document.querySelector('dialog')&&document.activeElement?.getAttribute('aria-label')==='Create project'"),'Create cancellation did not restore focus');
 await click('[aria-label="Create project"]');await input('Operations');await click('dialog button[type=submit]');
 await poll("document.querySelector('.cloud-project-toggle')?.innerText.includes('Operations')",'project creation');
 await menu('Options for Operations');await action('New section');await input('Planning');await click('dialog button[type=submit]');
 await poll("document.querySelector('.cloud-project-contents')?.innerText.includes('Planning')",'section creation');
 await menu('Options for Operations');await action('Pin project');await poll("!!document.querySelector('[aria-label=\"Options for Operations\"]')",'project pin');
 await menu('Options for Operations');assert(await run("[...document.querySelectorAll('[role=menuitem]')].some(x=>x.textContent.trim()==='Unpin project')"),'Pin state did not persist');
 await action('New chat');await poll("document.querySelector('[data-selected]')?.dataset.selected?.length>0",'project conversation opened');
 await poll("document.querySelector('.cloud-project-chat')?.innerText.includes('New chat')",'project chat listed');
 await menu('Project options for New chat');await action('Pin conversation');await menu('Project options for New chat');assert(await run("[...document.querySelectorAll('[role=menuitem]')].some(x=>x.textContent.trim()==='Unpin conversation')"),'Conversation pin action failed');
 await action('Unpin conversation');
 await menu('Options for Operations');await action('Edit name');await input('Operations updated');await click('dialog button[type=submit]');
 await poll("document.querySelector('.cloud-project-toggle')?.innerText.includes('Operations updated')",'project rename');
 assert(await run("(()=>{const row=document.querySelector('.cloud-project-chat'), sidebar=document.querySelector('.gwira-secondary-sidebar'), a=row.getBoundingClientRect(), b=sidebar.getBoundingClientRect();return a.width>0&&a.height>0&&a.top>=b.top&&a.bottom<=b.bottom&&a.left>=b.left&&a.right<=b.right})()"),'Project chat is clipped or outside the sidebar');
 await menu('Options for Operations updated');
 wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(100);
 assert(await run("!document.querySelector('[role=menu]')&&document.activeElement?.getAttribute('aria-label')==='Options for Operations updated'"),'Escape did not close the menu and restore focus');
 await menu('Options for Operations updated');await action('Remove project');
 wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(100);
 assert(await run("!document.querySelector('dialog')&&document.querySelector('.cloud-project-toggle')"),'Escape did not cancel removal');
 for(const [width,height] of [[1440,900],[1280,800],[780,640]]){win.setContentSize(width,height);await wait(150);await fs.writeFile(path.join(process.env.NAVIGATION_QA_OUTPUT,`projects-${width}x${height}.png`),(await wc.capturePage()).toPNG());}
 await menu('Options for Operations updated');await action('Archive chats');assert(await run("document.querySelector('dialog')?.open"),'Archive confirmation missing');await click('dialog button[type=submit]');
 await poll("!document.querySelector('.cloud-project-chat')",'archive');
 await menu('Options for Operations updated');await action('Remove project');assert(await run("document.querySelector('dialog')?.innerText.includes('not be deleted')"),'Remove warning missing');await click('dialog button[type=submit]');
 await poll("!document.querySelector('.cloud-project-toggle')",'remove project');
 console.log('AUTHENTICATED_PROJECTS_FIXTURE_PASS');
}
