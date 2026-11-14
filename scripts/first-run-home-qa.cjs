// Real Electron QA for first-run Home (Phase B2.2) against the isolated local Supabase stack. See run-first-run-home-qa.mjs.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');const {execFileSync}=require('node:child_process');
const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-tAc',sql],{encoding:'utf8'}).trim();
const wait=ms=>new Promise(r=>setTimeout(r,ms)),out=process.env.AUTH_QA_OUTPUT,phase=process.env.FR_PHASE;
app.setPath('userData',process.env.AUTH_QA_PROFILE);
const credsFile=path.join(process.env.AUTH_QA_PROFILE,'fr-credentials.json');
(async()=>{
 await fs.mkdir(out,{recursive:true});await app.whenReady();await import('../dist/main/main.js');
 let w;for(let i=0;i<150;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await wait(100)}
 app.focus({steal:true});w.show();w.focus();w.webContents.focus();w.setContentSize(1440,900);await wait(600);
 const errors=[];w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)});
 const ev=async s=>{try{return await w.webContents.executeJavaScript(s,true)}catch(e){throw Error(e.message+' :: '+s.slice(0,140))}},assert=(v,m)=>{if(!v)throw Error('QA assertion failed: '+m)};
 const log=(...a)=>console.log('QA',phase,...a);
 const text=()=>ev('document.body.innerText');
 const poll=async(fn,label,tries=200)=>{for(let i=0;i<tries;i++){if(await ev(fn))return;await wait(100)}await fs.writeFile(path.join(out,`failure-${phase}.png`),(await w.webContents.capturePage()).toPNG());throw Error(`Timed out: ${label}\n${(await text()).slice(0,800)}`)};
 const click=async label=>{assert(await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}));if(!b||b.disabled)return false;b.click();return true})()`),'missing or disabled: '+label);await wait(150)};
 const has=label=>ev(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}))`);
 const fill=async(sel,value)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.focus()})()`);await wait(80)};
 const shot=async(name,settle=400)=>{await wait(settle);await fs.writeFile(path.join(out,`${phase}-${name}.png`),(await w.webContents.capturePage()).toPNG());console.log('QA shot',`${phase}-${name}`)};
 const key=async(keyCode,modifiers=[])=>{w.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(keyCode==='Return')w.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});w.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await wait(200)};
 const composer=()=>ev(`!!document.querySelector('.first-run-dock textarea')`);
 const send=async msg=>{await fill(opening?'#first-run-goal':'.first-run-dock textarea',msg);await key('Return');};
 let opening=false;
 const say=async msg=>{await poll(`!!document.querySelector('.first-run-dock textarea')`,'conversation composer');await fill('.first-run-dock textarea',msg);await key('Return');await wait(300)};
 const convo=()=>ev(`document.querySelector('.first-run-conversation')?.innerText??''`);
 const sidebarWidth=()=>ev(`(()=>{const e=document.querySelector('.gwira-secondary-sidebar,.project-sidebar,aside');return e?Math.round(e.getBoundingClientRect().width):-1})()`);
 const dockWidth=()=>ev(`(()=>{const e=document.querySelector('aside.right-workspace');return e?Math.round(e.getBoundingClientRect().width):0})()`);
 const orgName=()=>JSON.parse(require('node:fs').readFileSync(credsFile,'utf8')).org;
 const planRow=()=>psql(`select current_version||'|'||status||'|'||title from gwira.plan_documents d join gwira.organizations o on o.id=d.organization_id where o.name='${orgName()}'`);


 const signOutAndWait=async()=>{await poll(`!!document.querySelector('form')||!!document.querySelector('.global-topbar')||document.body.innerText.includes('Welcome back')`,'app ready');if(!await ev(`document.body.innerText.includes('Welcome back')`)){await ev(`window.codexDesktop.account.command({type:'sign_out'})`);}await poll(`document.body.innerText.includes('Welcome back')`,'signed out');};
 const bootstrap=async org=>{
  const email=`fr${Date.now()}@example.test`,password='correct-horse-battery-1';
  if(await has('Use email and password'))await click('Use email and password');await click('Create an account');
  await fill('input[type=email]',email);await fill('input[autocomplete="new-password"]',password);
  await ev(`(()=>{const e=document.querySelectorAll('input[autocomplete="new-password"]')[1];if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(password)});e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await ev(`document.querySelector('form').requestSubmit()`);await poll(`!!document.querySelector('[data-app-route="AboutYou"]')`,'AboutYou');
  await fill('input[autocomplete="name"]','Variant Founder');await ev(`document.querySelector('form').requestSubmit()`);
  await poll(`!!document.querySelector('[data-app-route="WorkspaceSetup"]')`,'WorkspaceSetup');await click('Create a workspace');
  await fill('input[autocomplete="organization"]',org);await ev(`document.querySelector('form').requestSubmit()`);
  await poll(`!!document.querySelector('#first-run-goal')`,'first-run Home composer');opening=true;
 };
 const orgPlan=org=>psql(`select d.id||'|'||current_version||'|'||status||'|'||title from gwira.plan_documents d join gwira.organizations o on o.id=d.organization_id where o.name='${org}'`);
 const kong=action=>execFileSync('docker',[action,'supabase_kong_gwira-local-dev']);
 const apiUp=async()=>{for(let i=0;i<80;i++){try{const r=await fetch(process.env.QA_API_URL+'/auth/v1/health',{headers:{apikey:process.env.QA_API_KEY}});if(r.ok)return}catch{}await wait(500)}throw Error('API did not return')};
 if(phase==='journey'){
  const email=`fr${Date.now()}@example.test`,password='correct-horse-battery-1';const org='First Run Co '+Date.now();await fs.writeFile(credsFile,JSON.stringify({email,password,org}));
  await poll(`document.body.innerText.includes('Welcome back')`,'sign-in');
  if(await has('Use email and password'))await click('Use email and password');await click('Create an account');
  await fill('input[type=email]',email);await fill('input[autocomplete="new-password"]',password);
  await ev(`(()=>{const e=document.querySelectorAll('input[autocomplete="new-password"]')[1];if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(password)});e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await ev(`document.querySelector('form').requestSubmit()`);
  await poll(`!!document.querySelector('[data-app-route="AboutYou"]')`,'AboutYou');
  await fill('input[autocomplete="name"]','First Run Founder');await ev(`document.querySelector('form').requestSubmit()`);
  await poll(`!!document.querySelector('[data-app-route="WorkspaceSetup"]')`,'WorkspaceSetup');await click('Create a workspace');
  await fill('input[autocomplete="organization"]',org);await ev(`document.querySelector('form').requestSubmit()`);
  await poll(`!!document.querySelector('.first-run-home')`,'first-run Home inside the shell');opening=true;
  // 1. Shell reuse.
  assert(await ev(`!!document.querySelector('.global-topbar')`),'global top bar present');
  assert(await ev(`!document.querySelector('.meet-gwira__bar')&&!document.body.innerText.includes('Start over')`),'no separate Meet Gwira header');
  log('shell: topbar',await ev(`!!document.querySelector('.global-topbar')`),'| sidebar width',await sidebarWidth(),'| right workspace width',await dockWidth());
  assert(await dockWidth()===0,'right Workspace collapsed initially');
  assert(await ev(`localStorage.getItem('gwira.sidebar.collapsed')!=='true'`),'saved sidebar preference not overwritten');
  await shot('01-first-run-home');
  assert(await ev(`document.querySelectorAll('.meet-gwira__idea').length===4`),'four starting points');
  for(let i=0;i<40;i++){const h=await ev(`document.querySelector('[data-hint]')?.textContent??''`);if(h.length>=5&&h.length<14)break;await wait(60)}
  await shot('02-hint-typing',0);
  // 2. Goal.
  await fill('#first-run-goal','I run a lending business and want to follow up on overdue customer payments.');await key('Return');
  await poll(`!document.querySelector('.first-run-home .meet-gwira')`,'moved into the conversation');opening=false;
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('Google')||document.querySelector('.first-run-conversation')?.innerText.includes('?')`,'follow-up question');
  log('first question:',(await convo()).split('\n').filter(Boolean).slice(-1)[0]);await shot('03-first-goal-and-question');
  // 3. Answer the clarifying questions (at most three).
  let answered=0;
  while(answered<3&&await ev(`!!document.querySelector('.first-run-dock .suggestions')`)){
   const before=(await convo()).length;await say(answered===0?'Google Sheets':'Draft them for my approval');answered++;await wait(900);
   if(await ev(`!document.querySelector('.first-run-dock .suggestions')`))break;
  }
  log('questions answered:',answered);
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('prepared a plan')`,'plan prepared message',150);
  await shot('04-plan-generated',800);
  log('plan row:',await planRow());
  assert((await planRow()).startsWith('1|draft|'),'draft plan v1 saved in Supabase');
  // 4. Files tool opens with the plan.
  await poll(`(document.querySelector('aside.right-workspace')?.getBoundingClientRect().width??0)>200`,'right Workspace opened');
  await poll(`document.querySelector('aside.right-workspace')?.innerText.includes('Proposed workflow')`,'plan document preview',120);
  log('right Workspace width',await dockWidth(),'| plan preview shows:',await ev(`document.querySelector('aside.right-workspace')?.innerText.split('\\n').filter(Boolean).slice(0,6).join(' / ')`));
  assert(await ev(`document.querySelector('aside.right-workspace')?.innerText.includes('Prepared with suggested rules')`),'document labelled rules-based');
  await shot('05-plan-beside-conversation',600);
  // 5. Edit.
  await say('Change step two. I want the messages drafted in English and Nyanja.');
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('version 2')`,'edit confirmed',120);
  log('after edit:',await planRow());assert((await planRow()).startsWith('2|draft|'),'edit saved as version 2');
  await poll(`document.querySelector('aside.right-workspace')?.innerText.includes('Nyanja')`,'document refreshed with the change');
  await shot('06-plan-revised',600);
  // 6. Ambiguous approval.
  await say('Maybe approve it later.');await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('Nothing has been approved')`,'ambiguous approval declined');
  assert((await planRow()).includes('|draft|'),'plan still draft after ambiguous approval');await shot('07-ambiguous-approval');
  // 7. Real approval.
  await say('I approve the plan.');await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('The plan is approved')`,'approval confirmed',120);
  log('after approval:',await planRow(),'| approvals:',psql(`select count(*)||' '||string_agg(scope::text||method,',') from gwira.plan_approvals a join gwira.plan_documents d on d.id=a.plan_id join gwira.organizations o on o.id=d.organization_id where o.name='${orgName()}'`));
  assert((await planRow()).includes('|approved|'),'plan approved in Supabase');
  await poll(`document.querySelector('aside.right-workspace')?.innerText.includes('Approved')`,'document shows Approved');
  await shot('08-approved',600);
  assert(!/\bI(?:’ve| have)? (?:sent|created|connected|published)\b/i.test(await convo())&&(await convo()).includes('nothing has been sent'),'approval makes no execution claim');
  const snap=await ev('window.codexDesktop.account.snapshot()');assert(!/accessToken|refreshToken|eyJ/.test(JSON.stringify(snap)),'no token in snapshot');
 }

 else if(phase==='variants'){
  await signOutAndWait();const org='Website Co '+Date.now();await bootstrap(org);
  await fill('#first-run-goal','Build a simple website for my business');await key('Return');
  await poll(`!document.querySelector('.first-run-home .meet-gwira')`,'conversation');opening=false;
  for(let i=0;i<3&&await ev(`!!document.querySelector('.first-run-dock .suggestions')`);i++){await say(i===0?'Contact us':'Draft first');await wait(900);}
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('prepared a plan')`,'plan prepared');await wait(800);
  const row=orgPlan(org).split('|');log('website plan:',row.slice(1).join('|'));assert(/website/i.test(row[3]),'plan is about the website, not collections');
  const doc=await ev(`document.querySelector('aside.right-workspace')?.innerText??''`);assert(!/collection/i.test(doc)&&!doc.includes('Gmail'),'different business gets a different plan with no Gmail dependency');
  // Responsive layouts with the plan open.
  for(const [name,width,height] of [['1200x800',1200,800],['900x700',900,700],['760x560',760,560]]){
   w.setContentSize(width,height);await wait(700);
   const overflow=await ev(`document.documentElement.scrollWidth>document.documentElement.clientWidth+1`);
   const fits=await ev(`(()=>{const c=document.querySelector('.first-run-dock textarea');if(!c)return null;const r=c.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.width>200})()`);
   log('layout',name,'| horizontal overflow:',overflow,'| composer reachable and usable:',fits,'| right Workspace width:',await dockWidth());
   log('rects',name,await ev(`JSON.stringify(['.first-run-home','.first-run-conversation','.first-run-dock','aside.right-workspace','main.shell'].map(q=>{const e=document.querySelector(q);if(!e)return [q,null];const r=e.getBoundingClientRect();return [q,Math.round(r.left),Math.round(r.right),getComputedStyle(e).position]}))`));
   assert(!overflow,'no horizontal overflow at '+name);await shot('14-conversation-with-plan-'+name,300);
  }
  w.setContentSize(1440,900);await wait(700);
  // Backend unavailable: the conversation survives, the plan is unchanged and nothing is called saved.
  kong('stop');await wait(500);
  await say('Change step 1 to review every page before it is published.');
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('The plan was not changed')`,'honest failure when the backend is unavailable',120);
  assert(await ev(`!!document.querySelector('.first-run-home')`),'conversation still on screen during the outage');
  assert(await ev(`document.querySelector('.first-run-dock textarea').value`)==='Change step 1 to review every page before it is published.','the unsent message is kept in the composer after a failed save');
  assert(orgPlan(org).split('|')[1]==='1','plan unchanged while offline');log('offline edit refused honestly; plan still v1');await shot('15-backend-unavailable',500);
  kong('start');await apiUp();await wait(1500);
  await key('Return');
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('version 2')`,'retry succeeds after recovery',150);
  assert(orgPlan(org).split('|')[1]==='2','edit saved after recovery');log('retry after recovery saved v2');
  // Stale approval: another session saves version 3 behind the user's back.
  const id=orgPlan(org).split('|')[0];
  psql(`insert into gwira.plan_versions(plan_id,version,content_markdown,structured,authored_by,change_summary) select plan_id,3,content_markdown,structured,authored_by,'edited elsewhere' from gwira.plan_versions where plan_id='${id}' and version=2; update gwira.plan_documents set current_version=3 where id='${id}'`);
  await say('I approve the plan.');await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('changed since you last reviewed')`,'stale approval refused by the backend',120);
  assert(orgPlan(org).split('|')[2]==='draft','stale approval did not approve');log('stale approval refused; still draft');await shot('16-stale-approval',400);
  await say('I approve the plan.');await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('which you haven’t reviewed yet')`,'asks the user to review the current version',120);
  assert(orgPlan(org).split('|')[2]==='draft','still draft until the current version is reviewed');
  await say('I approve the plan.');await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('The plan is approved (version 3)')`,'current version approved',120);
  assert(orgPlan(org).startsWith(id+'|3|approved'),'version 3 approved');log('current version approved:',orgPlan(org));await shot('17-current-version-approved',400);
 }

 else if(phase==='narrow'){
  await signOutAndWait();w.setContentSize(800,600);await wait(500);const org='Narrow Co '+Date.now();await bootstrap(org);
  await shot('20-narrow-first-run-800x600',300);
  assert(!await ev(`document.documentElement.scrollWidth>document.documentElement.clientWidth+1`),'no horizontal overflow when narrow');
  await fill('#first-run-goal','Track stock levels and low inventory');await key('Return');
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('prepared a plan')`,'plan prepared');opening=false;await wait(800);
  assert(await dockWidth()===0,'plan does not cover the conversation on a narrow window');
  assert((await convo()).includes('Use Open plan'),'conversation tells the user how to open the plan');await shot('21-narrow-conversation-plan-ready',300);
  await click('Open plan');await poll(`(document.querySelector('aside.right-workspace')?.getBoundingClientRect().width??0)>200`,'plan overlay opened');
  await poll(`document.querySelector('aside.right-workspace')?.innerText.includes('Proposed workflow')`,'plan visible');await shot('22-narrow-plan-overlay',300);
  const toggle=async()=>{const r=await ev(`(()=>{const b=document.querySelector('[data-testid="context-panel-toggle"]');const x=b.getBoundingClientRect();return {x:Math.round(x.left+x.width/2),y:Math.round(x.top+x.height/2)}})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])w.webContents.sendInputEvent({type,x:r.x,y:r.y,button:'left',clickCount:1});await wait(600)};
  await toggle();assert(await dockWidth()===0,'overlay closes and returns to the conversation');await shot('23-narrow-back-to-conversation',300);
  await say('I approve the plan.');await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('The plan is approved')`,'approval works at a narrow width after the plan was opened',120);
  log('narrow approval recorded:',orgPlan(org));assert(orgPlan(org).includes('|approved|'),'approved in Supabase');
 }
 else if(phase==='skip'){
  await signOutAndWait();const org='Skip Co '+Date.now();await bootstrap(org);
  await fill('#first-run-goal','I want to follow up on overdue customer payments');await key('Return');
  await poll(`!document.querySelector('.first-run-home .meet-gwira')`,'conversation');opening=false;
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('?')`,'a clarifying question is waiting');
  await ev(`document.querySelector('button[aria-label="Setup options"]').click()`);await poll(`!!document.querySelector('[role="menu"]')`,'setup menu');await shot('18-setup-menu',200);
  const items=await ev(`[...document.querySelectorAll('[role="menuitem"]')].map(e=>e.textContent.trim()+(e.disabled?'(disabled)':''))`);log('menu items:',items.join(', '));
  await click('Skip for now');await poll(`!document.querySelector('.first-run-home')&&!!document.querySelector('.global-topbar')`,'normal workspace after skipping');
  const state=psql(`select (deferred_at is not null)||'|'||(completed_at is not null) from gwira.workspace_setup w join gwira.organizations o on o.id=w.organization_id where o.name='${org}'`);
  log('setup after skip (deferred|completed):',state,'| plans for this org (expected 0):',psql(`select count(*) from gwira.plan_documents d join gwira.organizations o on o.id=d.organization_id where o.name='${org}'`));
  assert(state==='true|true','skip recorded as an explicit deferral');assert(psql(`select count(*) from gwira.plan_documents d join gwira.organizations o on o.id=d.organization_id where o.name='${org}'`)==='0','skipping creates no plan');assert((await ev('window.codexDesktop.account.snapshot()')).plan==null,'no plan fabricated and none leaked from another organization');
  assert(!(await text()).includes('Gwira documents'),'another organization’s documents are not visible');await shot('19-skipped-to-normal-home',700);
 }
 else if(phase==='resume'){
  const {email,password}=JSON.parse(await fs.readFile(credsFile,'utf8'));
  await poll(`!!document.querySelector('.first-run-home')||document.body.innerText.includes('Welcome back')`,'restored first-run Home or sign-in');
  assert(await ev(`!!document.querySelector('.first-run-home')`),'session restored into first-run Home');
  await poll(`document.querySelector('.first-run-conversation')?.innerText.includes('prepared a plan')`,'conversation restored');
  const c=await convo();assert(c.includes('overdue customer payments')&&c.includes('Google Sheets'),'goal and answers restored');assert(c.includes('The plan is approved'),'approval message restored');
  log('conversation restored;',c.split('\n').filter(Boolean).length,'lines | plan row:',await planRow());
  assert(await dockWidth()===0,'right Workspace starts collapsed after restart');
  await shot('09-interrupted-onboarding-resumed');
  await click('Open plan');await poll(`document.querySelector('aside.right-workspace')?.innerText.includes('Proposed workflow')`,'plan reopened from the conversation');await shot('10-plan-reopened',600);
  // Collapse and reopen the right Workspace from the top bar.
  const toggleDock=async()=>{const r=await ev(`(()=>{const b=document.querySelector('[data-testid="context-panel-toggle"]');if(!b)return null;const x=b.getBoundingClientRect();return {x:Math.round(x.left+x.width/2),y:Math.round(x.top+x.height/2),expanded:b.getAttribute('aria-expanded')}})()`);if(!r)return false;console.log('QA toggle',JSON.stringify(r));for(const type of ['mouseMove','mouseDown','mouseUp'])w.webContents.sendInputEvent({type,x:r.x,y:r.y,button:'left',clickCount:1});return true};
  log('workspace width before collapse',await dockWidth(),'| top bar shows right tabs:',await ev(`document.querySelector('.global-topbar').innerText.includes('Fol')||document.querySelector('.global-topbar').innerText.includes('Ne')`));
  assert(await toggleDock(),'Workspace tools toggle present');await wait(700);
  const topbarAfter=await ev(`document.querySelector('.global-topbar').innerText`);
  log('after collapse: width',await dockWidth(),'| top bar text:',JSON.stringify(topbarAfter));
  assert(await dockWidth()===0,'right Workspace collapsed');assert(!/Fol|New tab/.test(topbarAfter),'workspace tabs disappear from the top bar');
  assert((await convo()).includes('The plan is approved'),'conversation intact while collapsed');await shot('11-workspace-collapsed',300);
  await toggleDock();await wait(700);assert(await dockWidth()>200,'right Workspace reopened');
  await poll(`document.querySelector('aside.right-workspace')?.innerText.includes('Restore Follow up on overdue payments.md')`,'existing retained-tools restore offered for the plan');await shot('11b-workspace-reopened-retained-tools',400);
  await click('Restore Follow up on overdue payments.md');await poll(`document.querySelector('aside.right-workspace')?.innerText.includes('Proposed workflow')`,'plan document restored from retained tools');log('plan document restored after reopening the Workspace');await shot('11c-plan-restored',500);
  await click('Continue to your workspace');
  await poll(`!document.querySelector('.first-run-home')&&!!document.querySelector('.global-topbar')`,'normal Home after setup');
  assert(!(await text()).includes('Getting started'),'first-run controls gone');
  const setup=psql(`select coalesce(deferred_at::text,'-')||'|'||(completed_at is not null) from gwira.workspace_setup w join gwira.organizations o on o.id=w.organization_id where o.name='${orgName()}'`);log('setup row (deferred|completed):',setup);assert(setup.endsWith('|true')&&setup.startsWith('-'),'completed after approval, not deferred');
  const afterSetup=await ev('window.codexDesktop.account.snapshot()');log('plan kept in the session after setup:',afterSetup.plan&&afterSetup.plan.title,'v'+(afterSetup.plan&&afterSetup.plan.version),afterSetup.plan&&afterSetup.plan.status);assert(afterSetup.plan&&afterSetup.plan.status==='approved','approved plan still available after leaving first-run');
  await poll(`!!document.querySelector('aside.right-workspace')||true`,'');log('sidebar width on normal Home',await sidebarWidth());await shot('12-normal-home-after-setup',800);
 }
 else if(phase==='returning'){
  await poll(`!!document.querySelector('.global-topbar')||document.body.innerText.includes('Welcome back')`,'returning user');
  assert(await ev(`!document.querySelector('.first-run-home')&&!!document.querySelector('.global-topbar')`),'normal Home, no repeated onboarding');
  assert(psql(`select count(*) from gwira.plan_documents d join gwira.organizations o on o.id=d.organization_id where o.name='${orgName()}'`)==='1','one plan only');
  await shot('13-returning-user',800);
  // The saved plan is still reachable in Files.
  const files=await ev(`[...document.querySelectorAll('button')].some(e=>/files/i.test(e.getAttribute('aria-label')||e.textContent))`);log('Files entry visible:',files);
 }
 const unexpected=errors.filter(m=>!/Autofill|DevTools|Electron Security Warning/.test(m));log('console errors:',unexpected.length?unexpected.join(' | ').slice(0,600):'none');
 assert(unexpected.length===0,'no console errors');
 console.log('QA',phase,'PASS');app.exit(0);
})().catch(e=>{console.error('QA',process.env.FR_PHASE,'FAIL',e.message);app.exit(1)});
