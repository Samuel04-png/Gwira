/** Isolated Electron visual and interaction checks. Never runs against a user profile. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const out = path.resolve('artifacts/workflow/schedule');
const wait = ms => new Promise(r => setTimeout(r,ms));
const assert = (value, message) => { if (!value) throw Error(message); };
async function check() {
 if (!process.env.ELECTRON_RENDERER_URL?.startsWith('http://127.0.0.1:') || !app.getPath('userData').includes('schedule-qa-profile-')) throw Error('Schedule QA requires an isolated development profile.');
 let w;
 for (let i=0;i<200;i++) { w=BrowserWindow.getAllWindows()[0]; if(w && !w.webContents.isLoadingMainFrame()) break; await wait(50); }
 if(!w)throw Error('No app window');
 const wc=w.webContents; const rendererIssues=[]; wc.on('console-message',details=>{if(['warning','error'].includes(details.level)&&!details.message.includes('Electron Security Warning'))rendererIssues.push(details.message)}); w.show(); wc.setBackgroundThrottling(false); w.setContentSize(1440,900);
 const ev = script => wc.executeJavaScript(script);
 const shot = async name => { wc.invalidate(); await wait(100); await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG()); };
 await wait(1200);
 // Seed through existing factories; fixtures exist only in this disposable dev profile.
 await ev(`(async()=>{const {createInitialLocalState,saveGwiraLocalState}=await import('/gwira/data/localStore.ts');const {createProceduralVisualRevision}=await import('/gwira/doats/visual/avatar.ts');const id=()=>crypto.randomUUID(),now=new Date().toISOString();const s=createInitialLocalState(id(),id(),now),doat=id(),owner=id();s.onboarding.completedAt=now;s.onboarding.currentStep='complete';s.people.push({id:owner,workspaceId:s.workspace.id,name:'QA owner',role:'Owner',createdAt:now});s.agents.push({id:doat,workspaceId:s.workspace.id,name:'QA coding Doat',type:'coding',createdAt:now});const visual=createProceduralVisualRevision({doatId:doat,name:'QA coding Doat',role:'Coding',generationKey:'qa'},1,now);s.doats.push({id:doat,workspaceId:s.workspace.id,createdAt:now,updatedAt:now,identity:{name:'QA coding Doat',role:'Coding'},intelligence:{providerId:'codex-local',providerAvailability:'configured',businessContextRefs:[]},capabilities:[],governance:{autonomy:'supervised',approvalRequired:true,allowedProjectPaths:[],maxConcurrentRuns:1},appearance:{active:visual,history:[visual]},operations:{status:'idle',updatedAt:now}});saveGwiraLocalState(localStorage,s);localStorage.setItem('gwira.workspace.tabs.v1',JSON.stringify({tabs:[{id:'qa-schedule',destination:{type:'view',view:'schedule'}}],activeTabId:'qa-schedule'}));})()`);
 await ev(`localStorage.setItem('gwira.conversation-drafts.v1',JSON.stringify({'project:workspace':'Keep this existing Home draft unchanged.'}))`);
 await wc.reload(); await wait(1300);
 await ev(`window.__scheduleIssues=[];for(const level of ['warn','error']){const old=console[level];console[level]=(...args)=>{window.__scheduleIssues.push(args.map(String).join(' '));old(...args)}};window.addEventListener('error',e=>window.__scheduleIssues.push(e.message));window.addEventListener('unhandledrejection',e=>window.__scheduleIssues.push(String(e.reason)));`);
 assert(await ev(`!!document.querySelector('[data-testid="schedule-page"]')`),'Schedule route missing');
 const button = async (label, selector='.gw-schedule') => { if(selector==='.gw-schedule__categories'){await button('Filter schedules');selector='[role=menu]';} assert(await ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector+' button')})].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)}||b.getAttribute('title')===${JSON.stringify(label)});if(!b||b.disabled)return false;b.focus();b.click();return true})()`),'Button missing: '+label);await wait(100); };
 const set = async (selector,value) => { await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;setter.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await wait(70); };
 assert(await ev(`document.querySelectorAll('[data-schedule-suggestion]').length===6`),'Six suggestions missing');
 assert(await ev(`document.querySelectorAll('.gwira-secondary-sidebar .gw-schedule__nav').length===1&&!document.querySelector('.dashboard-sidebar')&&!document.querySelector('.gw-schedule__nav footer')&&document.querySelectorAll('input[aria-label="Search schedules"]').length===1`),'Contextual slot architecture failed');
 assert(await ev(`getComputedStyle(document.querySelector('.gw-schedule__nav')).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(document.querySelector('[data-schedule-suggestion]')).borderTopStyle==='dashed'`),'White canvas / dashed border missing');
 await ev(`document.querySelector('[data-schedule-suggestion]').click()`);await wait(150);
 assert(await ev(`document.querySelector('.workspace').dataset.workspaceView==='home'&&document.querySelector('.workspace textarea[aria-label="Message Gwira"]').value.startsWith('/schedule ')&&!document.querySelector('.gw-schedule-dialog')`),'Suggestion did not open an unsent Home instruction: '+await ev(`JSON.stringify({route:document.querySelector('.workspace').dataset.workspaceView,text:document.querySelector('.workspace textarea[aria-label="Message Gwira"]')?.value,dialogs:document.querySelectorAll('.gw-schedule-dialog').length,issues:window.__scheduleIssues,drafts:localStorage.getItem('gwira.conversation-drafts.v1')})`));
 assert(await ev(`document.activeElement===document.querySelector('.workspace textarea[aria-label="Message Gwira"]')`),'Home composer not focused');
 assert(await ev(`JSON.parse(localStorage.getItem('gwira.conversation-drafts.v1'))['project:workspace']==='Keep this existing Home draft unchanged.'`),'Existing Home draft overwritten');
 await set('.workspace textarea[aria-label="Message Gwira"]','/schedule Edited instruction, still unsent.');await shot('suggestion-home-draft-1440x900');
 assert(await ev(`JSON.parse(localStorage.getItem('gwira.local-prototype.v1')).tasks.length===0`),'Suggestion created work');
 await ev(`document.querySelector('[data-navigation-view="schedule"]').click()`);await wait(120);await ev(`document.querySelector('[data-navigation-view="home"]').click()`);await wait(150);
 assert(await ev(`document.querySelector('.workspace textarea[aria-label="Message Gwira"]').value==='Keep this existing Home draft unchanged.'`),'Original Home draft could not be restored');
 await ev(`document.querySelector('[data-navigation-view="schedule"]').click()`);await wait(150);
 app.focus({steal:true});w.focus();wc.focus();await wait(250);await ev(`document.querySelector('[data-schedule-suggestion]').focus()`);wc.sendInputEvent({type:'keyDown',keyCode:'Tab'});wc.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(700);
 if(!await ev(`document.hasFocus()`)){app.focus({steal:true});w.focus();wc.focus();await ev(`document.querySelectorAll('[data-schedule-suggestion]')[1].focus()`);await wait(800);}
 assert(await ev(`!!document.querySelector('[role="tooltip"]')&&document.querySelector('[role="tooltip"]').textContent.includes('General example')`),'Full suggestion text not available on keyboard focus: '+await ev(`JSON.stringify({active:document.activeElement?.outerHTML,focused:document.hasFocus(),tooltip:document.querySelector('[role=tooltip]')?.textContent})`));await shot('suggestion-focus-tooltip-1440x900');
 wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 await ev(`document.activeElement?.blur()`);wc.sendInputEvent({type:'mouseMove',x:10,y:10});await wait(250);
 for(const [width,height] of [[1440,900],[1280,800],[900,700],[780,640]]) { w.setContentSize(width,height);await wait(100);await shot('empty-'+width+'x'+height);assert(await ev(`document.documentElement.scrollWidth<=innerWidth`),'Empty window overflow'); }
 w.setContentSize(1440,900);await wait(100);
 await button('New task');await shot('create-description-1440x900');
 await set('.gw-schedule-dialog input[maxlength="160"]','Weekly project review');
 await set('.gw-schedule-dialog textarea','Every Friday at 3 pm, review project progress and prepare a summary. Do not send messages.');
 await button('Continue','.gw-schedule-dialog');
 assert(await ev(`document.querySelector('.gw-schedule-dialog input[type=time]').value==='15:00'`),'Natural recurrence not suggested');
 await set('.gw-schedule-dialog input[list]','Africa/Lusaka');
 await ev(`document.querySelector('.gw-schedule-dialog input[type=checkbox]').click()`);
 await ev(`(()=>{const s=document.querySelectorAll('.gw-schedule-dialog select');const d=s[s.length-1];d.value=d.options[1].value;d.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 await shot('create-confirm-1440x900');await button('Register schedule','.gw-schedule-dialog');await wait(150);
 assert(await ev(`!document.querySelector('.gw-schedule-dialog')`),'Registration did not close');
 await button('Weekly project review');await shot('selected-1440x900');
 for(const [width,height] of [[1280,800],[900,700],[780,640]]) {w.setContentSize(width,height);await wait(150);await shot('details-'+width+'x'+height);assert(await ev(`document.querySelector('.gw-schedule__detail').getBoundingClientRect().right<=innerWidth`),'Detail overflow');}
 w.setContentSize(1440,900);await wait(120);app.focus({steal:true});w.focus();wc.focus();await ev(`document.querySelector('.gw-schedule__detail button').focus()`);wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(100);assert(await ev(`!document.querySelector('.gw-schedule__detail')&&document.activeElement.hasAttribute('data-schedule-row')`),'Details Escape/focus failed');await button('Weekly project review');

 await button('Run now');await shot('pending-review-1440x900');
 assert(await ev(`document.querySelector('.gw-schedule__history').textContent.includes('Awaiting review · not started')`),'Run now fabricated execution');
 await button('Review in My Work');await wait(180);
 assert(await ev(`document.querySelector('.workspace').getAttribute('data-workspace-view')==='my-work'`),'Review task handoff failed');
 const taskCount=await ev(`JSON.parse(localStorage.getItem('gwira.local-prototype.v1')).tasks.length`);assert(taskCount===1,'Review task not persisted');
 await ev(`document.querySelector('[data-navigation-view="schedule"]').click()`);await wait(150);
 await button('Open task');await wait(100);await ev(`document.querySelector('[data-navigation-view="schedule"]').click()`);await wait(100);
 assert(await ev(`JSON.parse(localStorage.getItem('gwira.local-prototype.v1')).tasks.length===1`),'Duplicate task created');
 await button('Dismiss review');await button('Schedule actions');await button('Pause','[role="menu"]');await shot('paused-1440x900');
 await button('Schedule actions');await button('Resume','[role="menu"]');
 await button('Schedule actions');await button('Edit','[role="menu"]');await set('.gw-schedule-dialog input[maxlength="160"]','Updated project review');await button('Continue','.gw-schedule-dialog');await ev(`document.querySelector('.gw-schedule-dialog input[type=checkbox]').click()`);await button('Save changes','.gw-schedule-dialog');
 assert(await ev(`document.querySelector('.gw-schedule__detail h1').textContent==='Updated project review'`),'Edit did not persist');
 await button('Schedule actions');await button('Delete','[role="menu"]');await shot('delete-confirm-1440x900');await button('Cancel','.gw-schedule-dialog');
 assert(await ev(`document.querySelector('.gw-schedule__detail h1').textContent==='Updated project review'`),'Cancel deleted schedule');
 await wc.reload();await wait(900);await button('Updated project review');
 await button('Schedule actions');await button('Delete','[role="menu"]');await button('Delete schedule','.gw-schedule-dialog');
 assert(await ev(`!document.querySelector('.gw-schedule__row')`),'Delete did not unregister');
 await button('Collapse sidebar','.global-topbar');assert(await ev(`document.querySelector('.gwira-secondary-sidebar').hidden`),'Schedule collapse failed');await shot('collapsed-1440x900');await button('Expand sidebar','.global-topbar');
 // Many records, long titles, paused entries and one pending review. All remain dev-profile only.
 await ev(`(async()=>{const s=JSON.parse(localStorage.getItem('gwira.local-prototype.v1'));for(let i=0;i<55;i++){const snap=await window.codexDesktop.schedules.change(s.workspace.id,{kind:'save',input:{title:i===0?'A very long operations review title that must truncate without moving hover actions or breaking the sidebar layout':('QA schedule '+String(i).padStart(2,'0')),instructions:'Every weekday at 9 am, prepare a review.',ownerId:s.people[0].id,doatId:s.doats[0].id,recurrence:{frequency:'weekdays',weekday:1,time:'09:00',timeZone:'Africa/Lusaka'}}});const last=snap.schedules.at(-1);if(i===2)await window.codexDesktop.schedules.change(s.workspace.id,{kind:'pause',id:last.id,version:last.version});}})()`);
 await ev(`(async()=>{const s=JSON.parse(localStorage.getItem('gwira.local-prototype.v1')),snap=await window.codexDesktop.schedules.read(s.workspace.id),first=snap.schedules[0];await window.codexDesktop.schedules.change(s.workspace.id,{kind:'run',id:first.id,version:first.version});})()`);
 await wc.reload();await wait(900);
 for(const category of ['Upcoming','Active','Needs attention','Paused','All schedules']) { await button(category,'.gw-schedule__categories');await shot('category-'+category.toLowerCase().replaceAll(' ','-')+'-1440x900');assert(await ev(`document.querySelector('.gw-schedule__category-header h1').textContent===${JSON.stringify(category)}`),'Category not selected'); }
 await ev(`document.documentElement.dataset.theme='dark'`);await shot('dark-categories-1440x900');await ev(`delete document.documentElement.dataset.theme`);
 await button('Upcoming','.gw-schedule__categories');await set('select[aria-label="Upcoming range"]','30');assert(await ev(`document.querySelectorAll('.gw-schedule__table-row').length>54`),'Upcoming recurrence expansion missing');await button('All schedules','.gw-schedule__categories');
 await button('Notifications, 1 pending','.global-topbar');await shot('notification-1440x900');await button('Review scheduled work','.global-topbar');
 for(const [width,height] of [[1440,900],[1280,800],[900,700],[780,640]]) { w.setContentSize(width,height);await wait(100);await shot('overflow-'+width+'x'+height);assert(await ev(`document.documentElement.scrollWidth<=innerWidth`),'Many schedule window overflow'); }
 w.setContentSize(1440,900);await wait(100);
 const geometry = await ev(`(()=>{const e=document.querySelector('[data-schedule-row]');const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
 wc.sendInputEvent({type:'mouseMove',x:Math.round(geometry.x+geometry.width/2),y:Math.round(geometry.y+geometry.height/2)});await wait(170);await shot('hover-1440x900');
 await ev(`document.querySelector('[data-schedule-row]').focus()`);await shot('focus-1440x900');
 wc.sendInputEvent({type:'keyDown',keyCode:'Down'});wc.sendInputEvent({type:'keyUp',keyCode:'Down'});await wait(80);
 assert(await ev(`document.activeElement===document.querySelectorAll('.gw-schedule__list [data-schedule-row]')[1]`),'Arrow navigation failed');
 await set('.gw-schedule__search input','no-match');await shot('no-results-1440x900');assert(await ev(`!document.querySelector('.gw-schedule__row')`),'Search failed');await button('Clear filters');
 await button('Paused','.gw-schedule__categories');assert(await ev(`document.querySelectorAll('.gw-schedule__list [data-schedule-row]').length===1`),'Paused filter failed');await shot('filtered-paused-1440x900');
 await button('All schedules','.gw-schedule__categories');
 await button('New task');wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(100);assert(await ev(`!document.querySelector('.gw-schedule-dialog')&&document.activeElement.hasAttribute('data-new-schedule')`),'Escape/focus restoration failed');
 // Return to the empty first-run workspace before checking ranked recommendations.
 await ev(`(async()=>{const s=JSON.parse(localStorage.getItem('gwira.local-prototype.v1'));const snap=await window.codexDesktop.schedules.read(s.workspace.id);for(const schedule of snap.schedules)await window.codexDesktop.schedules.change(s.workspace.id,{kind:'delete',id:schedule.id,version:schedule.version});})()`);
 // Context fixtures are restricted to this disposable development profile.
 await ev(`(async()=>{const {saveGwiraLocalState}=await import('/gwira/data/localStore.ts');const s=JSON.parse(localStorage.getItem('gwira.local-prototype.v1')),now=new Date().toISOString(),p=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID(),d=crypto.randomUUID();s.projects.push({id:p,workspaceId:s.workspace.id,name:'QA Delivery',createdAt:now});const task=(id,title,rest)=>({id,workspaceId:s.workspace.id,title,status:'todo',priority:'medium',createdAt:now,updatedAt:now,...rest});s.tasks.push(task(a,'QA delivery task',{dueDate:'2026-10-01T09:00:00Z',projectId:p}),task(b,'QA blocked handoff',{status:'blocked',dependsOnTaskIds:[a]}),task(c,'QA failed execution',{agentRun:{sessionId:'qa-fixture',status:'error',startedAt:now,error:'QA recorded error'}}),task(d,'QA priority',{priority:'high'}));s.approvals.push({id:crypto.randomUUID(),taskId:a,resultId:'qa-result',requestedBy:{kind:'person',id:s.people[0].id},status:'pending',createdAt:now});saveGwiraLocalState(localStorage,s);})()`);
 await wc.reload();await wait(1000);w.setContentSize(1440,900);await wait(100);wc.sendInputEvent({type:'mouseMove',x:10,y:10});await ev(`document.activeElement?.blur()`);await wait(250);await shot('contextual-suggestions-1440x900');
 assert(await ev(`document.querySelectorAll('[data-schedule-suggestion]').length===6&&document.querySelector('[data-schedule-suggestion]').dataset.scheduleSuggestion.startsWith('deadlines:')`),'Context recommendations were not ranked');
 assert(await ev(`!document.querySelector('.gw-schedule__templates').textContent.includes('General example')`),'Strong context was replaced with examples');
 await ev(`(async()=>{const s=JSON.parse(localStorage.getItem('gwira.local-prototype.v1'));await window.codexDesktop.schedules.change(s.workspace.id,{kind:'save',input:{title:'Existing daily review',instructions:'Every weekday review overdue tasks, blocked work and pending approvals.',ownerId:s.people[0].id,doatId:s.doats[0].id,recurrence:{frequency:'weekdays',weekday:1,time:'09:00',timeZone:'Africa/Lusaka'}}});})()`);
 await wc.reload();await wait(900);assert(await ev(`!document.querySelector('[data-schedule-suggestion]')`),'Already-scheduled work was suggested');await shot('deduplicated-suggestions-1440x900');
 // Verify empty real-data conditions: no Doat or owner, then storage failure and recovery.
 await ev(`(async()=>{const {createInitialLocalState,saveGwiraLocalState}=await import('/gwira/data/localStore.ts');const now=new Date().toISOString(),s=createInitialLocalState(crypto.randomUUID(),crypto.randomUUID(),now);s.onboarding.completedAt=now;s.onboarding.currentStep='complete';saveGwiraLocalState(localStorage,s);localStorage.setItem('gwira.workspace.tabs.v1',JSON.stringify({tabs:[{id:'empty',destination:{type:'view',view:'schedule'}}],activeTabId:'empty'}));})()`);
 await wc.reload();await wait(900);await shot('empty-no-workers-1440x900');await button('New task');await set('.gw-schedule-dialog input[maxlength="160"]','First routine');await set('.gw-schedule-dialog textarea','Every weekday at 9 am, review work.');await button('Continue','.gw-schedule-dialog');
 assert(await ev(`document.querySelector('.gw-schedule-dialog button[type=submit]').disabled`),'Registration enabled without workers');w.setContentSize(900,700);await wait(100);await shot('missing-workers-900x700');await button('Close schedule editor','.gw-schedule-dialog');
 const store=path.join(app.getPath('userData'),'gwira-schedules.v1.json'),saved=await fs.readFile(store,'utf8');await fs.writeFile(store,'corrupt');await wc.reload();for(let i=0;i<60;i++){await wait(100);if(await ev(`!!document.querySelector('.gw-schedule__error')`))break;}await shot('storage-error-900x700');assert(await ev(`!!document.querySelector('.gw-schedule__error')`),'Storage failure hidden');await fs.writeFile(store,saved);await button('Retry');assert(await ev(`!document.querySelector('.gw-schedule__error')`),'Retry did not recover');
 // Reproduce a renderer talking to an older main process without its IPC handler.
 const beforeMissingBridge=await fs.readFile(store,'utf8');require('electron').ipcMain.removeHandler('gwira:schedules:read');await wc.reload();for(let i=0;i<60;i++){await wait(100);if(await ev(`!!document.querySelector('.gw-schedule__error')`))break;}await shot('missing-service-900x700');assert(await ev(`document.querySelector('.gw-schedule__error').textContent.includes('Restart Gwira')&&!document.querySelector('.gw-schedule__empty')`),'Missing main service misdiagnosed');assert(await fs.readFile(store,'utf8')===beforeMissingBridge,'Missing bridge changed persisted schedules');
 const issues=[...rendererIssues,...await ev(`window.__scheduleIssues??[]`)];assert(!issues.length,'Console issues: '+issues.join('\n'));
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({sizes:[[1440,900],[1280,800],[900,700],[780,640]],registration:true,naturalLanguageSuggestion:true,runNowWaitsForReview:true,persistedTaskHandoff:true,noDuplicateTask:true,pauseResume:true,edit:true,deleteConfirmation:true,reloadPersistence:true,search:true,filters:true,keyboard:true,focusRestoration:true,manyRecords:55,notifications:true,sixSuggestions:true,scopedContextRanking:true,alreadyScheduledSuppression:true,unsentHomeHandoff:true,preservedHomeDraft:true,suggestionFocusTooltip:true,disabledWithoutWorkers:true,storageFailureAndRecovery:true,consoleIssues:issues},null,2));
 console.log('SCHEDULE_QA_PASS');
}
(async()=>{await fs.mkdir(out,{recursive:true});await import(path.resolve('dist/main/main.js'));await app.whenReady();await wait(300);await check();app.exit(0)})().catch(e=>{console.error(e);app.exit(1)});
