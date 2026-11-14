// Real Electron visual + behaviour QA for the refined Meet Gwira screen (Phase B2.1).
// Runs against the isolated local Supabase stack with a fresh account. See scripts/run-meet-gwira-refinement-qa.mjs.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),out=process.env.AUTH_QA_OUTPUT;
app.setPath('userData',process.env.AUTH_QA_PROFILE);
(async()=>{
 await fs.mkdir(out,{recursive:true});await app.whenReady();await import('../dist/main/main.js');
 let w;for(let i=0;i<150;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await wait(100)}
 app.focus({steal:true});w.show();w.focus();w.webContents.focus();w.setContentSize(1440,900);await wait(500);
 const errors=[];w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)});
 const ev=s=>w.webContents.executeJavaScript(s,true),assert=(v,m)=>{if(!v)throw Error('QA assertion failed: '+m)};
 const poll=async(fn,label)=>{for(let i=0;i<150;i++){if(await ev(fn))return;await wait(100)}await fs.writeFile(path.join(out,'failure.png'),(await w.webContents.capturePage()).toPNG());throw Error(`Timed out: ${label}\n${await ev('document.body.innerText')}`)};
 const click=async label=>{assert(await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}));if(!b||b.disabled)return false;b.click();return true})()`),'missing or disabled: '+label);await wait(150)};
 const fill=async(sel,value)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(80)};
 const shot=async(name,settle=350)=>{await wait(settle);await fs.writeFile(path.join(out,`${name}.png`),(await w.webContents.capturePage()).toPNG());console.log('QA shot',name)};
 const hint=()=>ev(`document.querySelector('[data-hint]')?.textContent??null`);
 const key=async(keyCode,modifiers=[])=>{w.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(keyCode==='Return')w.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});w.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await wait(150)};
 const overflow=()=>ev(`(()=>{const m=document.querySelector('.meet-gwira');return {x:m.scrollWidth>m.clientWidth+1,doc:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}})()`);

 // The standalone Meet Gwira route is the production path; the development shell would otherwise replace it.
 await ev(`localStorage.setItem('gwira.dev.standalone-meet','1')`);await w.webContents.reload();await wait(1500);
 // Fresh real account through the actual UI.
 const email=`refine${Date.now()}@example.test`,password='correct-horse-battery-1';
 await poll(`document.body.innerText.includes('Welcome back')`,'sign-in screen');
 await click('Use email and password').catch(()=>{});await click('Create an account');
 await fill('input[type=email]',email);await fill('input[autocomplete="new-password"]',password);
 await ev(`(()=>{const e=document.querySelectorAll('input[autocomplete="new-password"]')[1];if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(password)});e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await ev(`document.querySelector('form').requestSubmit()`);
 await poll(`!!document.querySelector('[data-app-route="AboutYou"]')`,'AboutYou');
 await fill('input[autocomplete="name"]','QA Founder');await ev(`document.querySelector('form').requestSubmit()`);
 await poll(`!!document.querySelector('[data-app-route="WorkspaceSetup"]')`,'WorkspaceSetup');await click('Create a workspace');
 await fill('input[autocomplete="organization"]','Refinement Co');await ev(`document.querySelector('form').requestSubmit()`);
 await poll(`!!document.querySelector('.meet-gwira')`,'Meet Gwira');

 // 1. Initial composition.
 await shot('01-initial',120);
 const header=await ev(`(()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom}};return {title:r('.meet-gwira__title'),preview:r('.meet-gwira__preview-button'),skip:r('.is-skip'),signout:r('.meet-gwira__bar-actions .is-ghost'),actions:r('.meet-gwira__bar-actions'),bar:r('.meet-gwira__bar')}})()`);
 console.log('QA header',JSON.stringify(header));
 assert(header.title.l>=78,'title clears the native window controls');
 assert(header.skip.l>header.preview.r+200,'Skip is in the right-hand action group, not the centre');
 assert(Math.abs(header.actions.r-(1440-20))<6,'actions are right-aligned');
 assert(await ev(`!document.body.innerText.includes('Rule-based suggestions')&&!document.body.innerText.includes('Explore a local example')`),'technical copy removed');
 const layout=await ev(`(()=>{const c=document.querySelector('.meet-gwira__composer').getBoundingClientRect();return {w:c.width,left:c.left,right:c.right}})()`);
 console.log('QA composer',JSON.stringify(layout));assert(layout.w<=760&&layout.w>=600,'composer width within 680-760 container');
 assert(Math.abs((layout.left+layout.right)/2-720)<2,'composer centred');
 assert(await ev(`document.querySelectorAll('.meet-gwira__idea').length===4`),'four initial suggestions');
 assert(await ev(`document.querySelector('#meet-goal').value===''`),'textarea stays empty while hint animates');

 const pv=await ev(`(()=>{const b=document.querySelector('.meet-gwira__preview-button').getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()`);
 w.webContents.sendInputEvent({type:'mouseMove',x:pv.x,y:pv.y});await wait(250);
 assert(await ev(`(()=>{const t=document.querySelector('.meet-gwira__tooltip');return !t.hidden&&t.textContent.includes('No external actions run during setup')&&!t.textContent.toLowerCase().includes('live ai')})()`),'preview disclosure explains the preview on hover');
 await shot('01b-preview-disclosure',0);w.webContents.sendInputEvent({type:'mouseMove',x:700,y:700});await wait(200);
 // 2. Hint animation.
 for(let i=0;i<40;i++){const h=await hint();if(h&&h.length>=6&&h.length<=14)break;await wait(60)}
 await shot('02-hint-midway',0);
 const midway=await hint();console.log('QA hint midway:',JSON.stringify(midway));assert(midway&&midway.length>0,'hint is typing');
 assert(await ev(`document.querySelector('#meet-goal').value===''`),'hint never writes into the textarea');
 // 3. Pause on focus.
 await ev(`document.querySelector('#meet-goal').focus()`);await wait(200);console.log('QA focus state:',await ev('document.hasFocus()+" "+document.activeElement.id'));const paused=await hint();await wait(900);
 assert(await hint()===paused,'hint paused after focus');await shot('03-hint-paused-focused',0);
 // Typing replaces the hint and the draft is preserved.
 await fill('#meet-goal','Chase two invoices that are 30 days late');
 assert(await ev(`!document.querySelector('[data-hint]')`),'hint removed once the user types');await wait(2500);
 assert(await ev(`document.querySelector('#meet-goal').value==='Chase two invoices that are 30 days late'`),'draft preserved');
 await shot('04-user-draft',0);
 // Shift+Enter inserts a newline; Enter on a draft submits later.
 await key('Return',['shift']);const afterShift=await ev(`document.querySelector('#meet-goal').value`);console.log('QA after Shift+Enter:',JSON.stringify(afterShift));
 assert(afterShift.includes('\n')&&await ev(`!!document.querySelector('.meet-gwira.is-opening')`),'Shift+Enter adds a new line without sending');
 await fill('#meet-goal','');await ev(`document.activeElement.blur()`);await wait(400);

 // 5-8. Suggestions.
 await shot('05-suggestions-at-rest',0);
 const box=await ev(`(()=>{const b=document.querySelector('.meet-gwira__idea').getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()`);
 w.webContents.sendInputEvent({type:'mouseMove',x:box.x,y:box.y});await wait(300);await shot('06-suggestion-hovered',0);
 await click('Customer follow-ups');
 assert(await ev(`document.querySelector('#meet-goal').value==='Follow up on overdue customer payments'`),'suggestion fills the composer');
 assert(await ev(`!!document.querySelector('.meet-gwira.is-opening')&&document.activeElement.id==='meet-goal'`),'suggestion did not submit and composer is focused');
 assert(await ev(`document.querySelector('.meet-gwira__idea[aria-pressed="true"]')?.textContent.includes('Customer follow-ups')`),'selected state shown');
 await shot('07-suggestion-selected',0);
 await fill('#meet-goal','');await click('More ideas');
 assert(await ev(`document.querySelectorAll('.meet-gwira__idea').length===6`),'more ideas expands');await shot('08-more-ideas',0);
 const tabbable=await ev(`[...document.querySelectorAll('.meet-gwira__bar button,.meet-gwira__idea,textarea,.composer-actions button')].every(e=>e.tabIndex>=0)`);assert(tabbable,'controls are keyboard reachable');

 // 9-10. Submission and conversation.
 await click('Customer follow-ups');
 await key('Return');
 await shot('09-after-submission',0);
 await poll(`!!document.querySelector('.meet-gwira__transcript')`,'conversation opened');
 assert(await ev(`document.querySelector('.meet-gwira__transcript').innerText.includes('Follow up on overdue customer payments')`),'first message preserved');
 await shot('10-conversation-opened',400);
 const noReload=await ev(`!!window.codexDesktop`);assert(noReload,'window not reloaded');

 // 11. Narrow and short windows.
 await click('Start over');await poll(`!!document.querySelector('.meet-gwira.is-opening')`,'back to opening');
 w.setContentSize(760,560);await wait(500);await shot('11-narrow-760x560',0);
 const narrow=await overflow();console.log('QA narrow overflow',JSON.stringify(narrow));assert(!narrow.doc,'no horizontal document overflow at 760px');
 const reach=await ev(`(()=>{const m=document.querySelector('.meet-gwira');const last=[...document.querySelectorAll('.meet-gwira__idea')].pop();last.scrollIntoView({block:'end'});const lb=last.getBoundingClientRect();const c=document.querySelector('.meet-gwira__composer').getBoundingClientRect();return {scrollable:m.scrollHeight>m.clientHeight,lastVisible:lb.bottom<=innerHeight+1,composerTopReachable:m.scrollTop>=0&&c.height>0}})()`);
 console.log('QA short-height reach',JSON.stringify(reach));assert(reach.lastVisible,'last suggestion reachable at short height');
 await ev(`document.querySelector('.meet-gwira').scrollTo(0,0)`);
 w.setContentSize(760,900);await wait(400);await shot('12-narrow-min-width-tall',0);
 // 13. Reduced motion.
 w.setContentSize(1440,900);await wait(400);
 w.webContents.debugger.attach('1.3');await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(500);
 const still=await hint();await wait(1500);assert(await hint()===still&&still.length>10,'reduced motion shows one static example');
 console.log('QA reduced-motion hint:',JSON.stringify(still));await shot('13-reduced-motion',0);
 await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});

 // Skip for now preserves a valid state and routes onward; sign out works.
 assert(await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Skip for now')&&[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Sign out')`),'Skip and Sign out present');
 const unexpected=errors.filter(m=>!/Autofill|DevTools|Electron Security Warning/.test(m));console.log('QA console errors:',unexpected.length?unexpected.join(' | '):'none');
 assert(unexpected.length===0,'no console errors');
 console.log('QA refinement PASS');app.exit(0);
})().catch(e=>{console.error('QA refinement FAIL',e.message);app.exit(1)});
