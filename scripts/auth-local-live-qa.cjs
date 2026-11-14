// Real Electron QA against the isolated local Supabase stack (no fixtures, no mocks).
// Driven by scripts/run-auth-local-live-qa.mjs. Phases share one Electron profile (vault + preferences).
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');const {execFileSync}=require('node:child_process');
const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-tAc',sql],{encoding:'utf8'}).trim();
const docker=(...a)=>execFileSync('docker',a,{encoding:'utf8'});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),out=process.env.AUTH_QA_OUTPUT,phase=process.env.AUTH_QA_PHASE;
app.setPath('userData',process.env.AUTH_QA_PROFILE);
const creds=path.join(process.env.AUTH_QA_PROFILE,'qa-credentials.json');
(async()=>{
 await app.whenReady();
 session.defaultSession.on('will-download',(_e,item)=>item.setSavePath(path.join(out,'downloaded-brief.md')));
 await import('../dist/main/main.js');
 let w;for(let i=0;i<150;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await wait(100)}
 w.show();w.setContentSize(1440,900);await wait(500);
 const ev=s=>w.webContents.executeJavaScript(s,true),assert=(v,m)=>{if(!v)throw Error(m)};
 const text=()=>ev('document.body.innerText');
 const poll=async(fn,label)=>{for(let i=0;i<150;i++){if(await ev(fn))return;await wait(100)}await fs.writeFile(path.join(out,`failure-${phase}.png`),(await w.webContents.capturePage()).toPNG());throw Error(`Timed out: ${label||fn}\n${await text()}`)};
 const click=async label=>{assert(await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}));if(!b||b.disabled)return false;b.click();return true})()`),'Missing or disabled action: '+label);await wait(200)};
 const has=label=>ev(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}))`);
 const fill=async(sel,value)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(80)};
 const submit=async()=>{await ev(`document.querySelector('form').requestSubmit()`);await wait(200)};
 const shot=async name=>{await wait(300);await fs.writeFile(path.join(out,`${phase}-${name}.png`),(await w.webContents.capturePage()).toPNG())};
 const route=()=>ev('window.codexDesktop.account.snapshot().then(s=>s.route&&s.route.type)');
 const snap=()=>ev('window.codexDesktop.account.snapshot()');
 const log=(...a)=>console.log('QA',phase,...a);
 // The standalone Meet Gwira route is the production path; the dev shell would otherwise replace it.
 await ev(`localStorage.setItem('gwira.dev.standalone-meet','1')`);await w.webContents.reload();await wait(1500);
 const noSecrets=async()=>{const s=JSON.stringify(await snap());assert(!/accessToken|refreshToken|access_token|refresh_token|eyJ/.test(s),'Token leaked into renderer snapshot')};
 const ready=()=>poll(`!!document.querySelector('[data-auth-surface],.meet-gwira,[data-dev-preview-banner],form')`);

 if(phase==='flow'){
  const email=`qa${Date.now()}@example.test`,password='correct-horse-battery-1';await fs.writeFile(creds,JSON.stringify({email,password}));
  await poll(`document.body.innerText.includes('Welcome back')`,'sign-in screen');
  assert(await has('Use email and password')||await ev(`!!document.querySelector('input[type=email]')`),'Password-first entry missing');
  log('sign-in screen shown; Google visible only if configured:',await has('Continue with Google'));
  await shot('signin');
  if(await has('Use email and password'))await click('Use email and password');
  await click('Create an account');
  await fill('input[type=email]',email);await fill('input[autocomplete="new-password"]',password);
  const second=await ev(`document.querySelectorAll('input[autocomplete="new-password"]').length`);if(second>1)await ev(`(()=>{const e=document.querySelectorAll('input[autocomplete="new-password"]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(password)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await submit();
  await poll(`document.querySelector('[data-app-route="AboutYou"]')`,'AboutYou after signup (no OTP step)');
  assert(!(await text()).toLowerCase().includes('check your email'),'OTP/confirmation step appeared');
  log('signup created a session immediately; route=',await route());await shot('about-you');await noSecrets();
  await fill('input[autocomplete="name"]','QA Founder');await submit();
  await poll(`document.querySelector('[data-app-route="WorkspaceSetup"]')`,'WorkspaceSetup');await shot('workspace-setup');
  assert(await has('Create a workspace')&&await has('Join a workspace'),'Create/Join choices missing');await click('Create a workspace');
  await fill('input[autocomplete="organization"]','QA Trading Co');await submit();
  await poll(`!!document.querySelector('.meet-gwira')`,'Meet Gwira');log('route=',await route());await shot('meet-open');
  assert(!await has('Finish setup'),'Finish setup offered before the onboarding process finished');
  assert(await has('Skip for now'),'Explicit deferral missing');
  // A real business goal, typed by the user.
  await fill('#meet-goal','Follow up on overdue customer payments');
  assert(await ev(`(()=>{const b=document.querySelector('.composer-actions .send');if(!b||b.disabled)return false;b.click();return true})()`),'Send unavailable');
 }
 if(phase==='flow'){
  await poll(`document.querySelector('.meet-gwira__transcript')?.innerText.includes('Follow up on overdue customer payments')`,'goal appears in the conversation');
  log('conversation advanced; question:',(await ev(`document.querySelector('.meet-gwira__message:last-child')?.innerText`)).replace(/\s+/g,' '));
  await shot('meet-clarifying');
  const options=await ev(`[...document.querySelectorAll('.meet-gwira__suggestions button')].map(b=>b.textContent.trim())`);
  await click(options[0]);
  await wait(800);const s=await snap();log('saved progress:',JSON.stringify(s.onboardingProgress));
  assert(s.onboardingProgress&&s.onboardingProgress.goal==='Follow up on overdue customer payments'&&s.onboardingProgress.answers.length>=1,'Progress was not persisted to the workspace record');
  assert(!await has('Finish setup'),'Finish setup offered mid-conversation');
 }
 if(phase==='resume'){
  await poll(`!!document.querySelector('.meet-gwira')`,'Meet Gwira restored after restart');
  await poll(`document.querySelector('.meet-gwira__transcript')?.innerText.includes('Follow up on overdue customer payments')`,'answers retained after reopening');
  log('progress survived restart; route=',await route());await shot('meet-restored');
  assert(!await has('Finish setup'),'Finish setup offered before proposal');
  // Finish the conversation: keep answering/skip until a proposal appears.
  for(let i=0;i<6&&!(await ev(`!!document.querySelector('.meet-gwira__workspace')`));i++){if(await has('Skip'))await click('Skip');else break;await wait(300)}
  await poll(`!!document.querySelector('.meet-gwira__workspace')`,'proposed workflow');
  log('proposal:',(await ev(`document.querySelector('.meet-gwira__workspace h2').innerText`)),'| label:',(await ev(`document.querySelector('.meet-gwira__workspace header').innerText`)).replace(/\s+/g,' '));
  await shot('meet-proposal');assert(!await has('Finish setup'),'Finish setup offered at proposal stage');
  await click('Review plan');await click('Download brief');
  await poll(`document.body.innerText.includes('Download requested')`,'brief completion step');
  await poll(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Finish setup')`,'Finish setup after the brief step');
  await shot('meet-result');await click('Finish setup');
  await poll(`document.querySelector('[data-app-route="WorkspaceReady"]')`,'WorkspaceReady');log('route=',await route(),'org=',(await snap()).activeOrganization.name,(await snap()).activeOrganization.role);
  await shot('workspace-ready');
  if(await has('Open development preview')){
   await click('Open development preview');await poll(`!!document.querySelector('[data-dev-preview-banner]')&&!!document.querySelector('.shell')`,'local prototype');
   assert((await text()).includes('local, unsynchronized'),'Preview not labelled as local');log('development preview opened and labelled');await shot('dev-preview');
   await click('Back to workspace');await poll(`document.querySelector('[data-app-route="WorkspaceReady"]')`,'back to workspace');
  }else log('development preview unavailable (non-dev renderer) as designed');
 }
 if(phase==='returning'){
  const {email,password}=JSON.parse(await fs.readFile(creds,'utf8'));
  await poll(`document.querySelector('[data-app-route="WorkspaceReady"]')`,'returning session restored into the workspace');log('session restored; route=',await route());await noSecrets();
  await click('Sign out');await poll(`document.body.innerText.includes('Welcome back')`,'signed out');
  const vault=(await fs.readdir(path.join(process.env.AUTH_QA_PROFILE,'accounts'),{recursive:true})).filter(f=>f.endsWith('.session-vault'));
  for(const f of vault){try{await fs.access(path.join(process.env.AUTH_QA_PROFILE,'accounts',f));log('vault file after logout still present:',f)}catch{}}
  assert(!(await snap()).user,'User still present after logout');
  if(await has('Use email and password'))await click('Use email and password');
  await fill('input[type=email]',email);await fill('input[autocomplete="current-password"]','wrong-password-123');await submit();
  await poll(`document.body.innerText.includes('email or password is incorrect')`,'wrong password error');log('wrong password rejected');await shot('wrong-password');
  await fill('input[autocomplete="current-password"]',password);await submit();
  await poll(`document.querySelector('[data-app-route="WorkspaceReady"]')`,'login again lands in the workspace');log('login again ok; route=',await route());
  assert(!(await text()).includes('Forgot password?'),'Recovery offered while mailbox ownership is unverified');
 }
 const signUpFresh=async(tag)=>{const email=`${tag}${Date.now()}@example.test`,password='correct-horse-battery-1';await fs.writeFile(path.join(process.env.AUTH_QA_PROFILE,'nw-creds.json'),JSON.stringify({email,password}));
  await poll(`document.body.innerText.includes('Welcome back')||!!document.querySelector('[data-app-route="WorkspaceReady"]')`,'previous session or sign-in screen');if(await has('Sign out')){await click('Sign out');await poll(`document.body.innerText.includes('Welcome back')`,'signed out');}if(await has('Use email and password'))await click('Use email and password');await click('Create an account');
  await fill('input[type=email]',email);await fill('input[autocomplete="new-password"]',password);await submit();await poll(`document.querySelector('[data-app-route="AboutYou"]')`,'AboutYou');
  await fill('input[autocomplete="name"]','No Workspace User');await submit();await poll(`document.querySelector('[data-app-route="WorkspaceSetup"]')`,'WorkspaceSetup');return email;};
 const orgCount=email=>Number(psql(`select count(*) from gwira.organization_memberships m join auth.users u on u.id=m.user_id where u.email='${email}'`));
 const waitRoute=(type,label)=>poll(`document.querySelector('[data-app-route="${type}"]')`,label||type);
 if(phase==='noworkspace'){
  const email=await signUpFresh('nw');await fs.writeFile(path.join(process.env.AUTH_QA_PROFILE,'nw-email'),email);
  const t=await text();assert(t.includes('Create a workspace')&&t.includes('Join a workspace'),'No-workspace screen lacks Create/Join');assert(!t.includes('Account & Security'),'Account & Security fallback shown');
  log('no-workspace user sees Create + Join; memberships in DB =',orgCount(email));await shot('where-to');
  await click('Join a workspace');await wait(200);const j=await text();assert(/development environment/.test(j)&&!await ev(`!!document.querySelector('input[autocomplete="off"]')`),'Join panel should explain unverified-mailbox protection and offer no way in');
  assert(!/organization name/i.test(j),'Join must not accept an organization name');log('join panel (autoconfirm env):',j.replace(/\s+/g,' ').slice(0,260));await shot('join-unverified');
  assert(orgCount(email)===0,'A workspace was created automatically');
 }
 if(phase==='noworkspace2'){
  await waitRoute('WorkspaceSetup','no-workspace screen again after restart');const email=await fs.readFile(path.join(process.env.AUTH_QA_PROFILE,'nw-email'),'utf8');
  assert(orgCount(email)===0,'Restart created a workspace');log('after restart still no workspace (no auto-creation)');
  await click('Create a workspace');await fill('input[autocomplete="organization"]','Second Account Co');
  // double submit must create one organization only
  await ev(`(()=>{const f=document.querySelector('form');f.requestSubmit();f.requestSubmit();})()`);
  await poll(`!!document.querySelector('.meet-gwira')`,'Meet Gwira after creating');await wait(500);
  log('created; memberships =',orgCount(email),'setup rows =',psql(`select count(*) from gwira.workspace_setup w join auth.users u on u.id=w.creator_user_id where u.email='${email}'`),'role =',psql(`select m.role from gwira.organization_memberships m join auth.users u on u.id=m.user_id where u.email='${email}'`));
  assert(orgCount(email)===1,'Duplicate organizations after double submit');await shot('meet-after-create');
 }
 const signedInReady=async()=>{
  await poll(`!!document.querySelector('[data-app-route]')||!!document.querySelector('.meet-gwira')||document.body.innerText.includes('Welcome back')`,'any screen');
  if(!await ev(`!!document.querySelector('[data-app-route="WorkspaceReady"]')`)){
   if(await ev(`!!window.codexDesktop`)&&(await snap()).user){await ev(`window.codexDesktop.account.command({type:'sign_out'})`);await poll(`document.body.innerText.includes('Welcome back')`,'signed out');}
   const {email,password}=JSON.parse(await fs.readFile(creds,'utf8'));if(await has('Use email and password'))await click('Use email and password');
   await fill('input[type=email]',email);await fill('input[autocomplete="current-password"]',password);await submit();
  }
  await waitRoute('WorkspaceReady','original account in workspace');};
 const refresh=()=>ev(`window.codexDesktop.account.command({type:'refresh'}).then(s=>s.route&&s.route.type)`);
 if(phase==='offline'){
  await signedInReady();docker('stop','supabase_kong_gwira-local-dev');
  try{await refresh();await waitRoute('AccessError','offline error screen');const t=await text();log('offline screen:',t.replace(/\s+/g,' ').slice(0,240));assert(/can.t connect/i.test(t)&&t.includes('Try again'),'Network message/action missing');assert(!/Account & Security|PGRST|supabase_/.test(t),'Technical detail leaked');await shot('offline');}
  finally{docker('start','supabase_kong_gwira-local-dev');}
  for(let i=0;i<60;i++){try{if((await fetch(process.env.GWIRA_SUPABASE_URL+'/auth/v1/health',{headers:{apikey:process.env.GWIRA_SUPABASE_PUBLISHABLE_KEY}})).ok)break}catch{}await wait(500)}
  await click('Try again');await signedInReady();log('recovered after backend returned; workspace reopened');
 }
 if(phase==='setup-missing'){
  await signedInReady();psql('alter table gwira.workspace_setup rename to workspace_setup_qa_hidden');psql("notify pgrst, 'reload schema'");await wait(1500);
  try{await refresh();await waitRoute('AccessError','setup unavailable screen');const t=await text();log('missing-contract screen:',t.replace(/\s+/g,' ').slice(0,420));assert(/Account setup isn.t available/i.test(t),'Setup-unavailable message missing');assert(!/PGRST|schema cache|gwira\./.test(t),'Database internals leaked');assert(!/Account & Security/.test(t),'Fallback shown');assert(!(await ev(`!!document.querySelector('.meet-gwira,.shell')`)),'Workspace mounted despite failed setup');await shot('setup-unavailable');}
  finally{psql('alter table gwira.workspace_setup_qa_hidden rename to workspace_setup');psql("notify pgrst, 'reload schema'");}
  await wait(1500);await click('Try again');await signedInReady();log('recovered after the backend contract returned');
 }
 if(phase==='revoked'){
  await signedInReady();const {email}=JSON.parse(await fs.readFile(creds,'utf8'));
  psql(`set session_replication_role=replica; delete from gwira.organization_memberships where user_id=(select id from auth.users where email='${email}')`);
  await refresh();await wait(800);const t=await text();const r=await route();log('after membership removed: route =',r,'|',t.replace(/\s+/g,' ').slice(0,200));
  assert(r!=='WorkspaceReady'&&r!=='MeetGwira','Revoked member still inside the workspace');assert(!/Account & Security/.test(t),'Fallback shown');await shot('revoked');
  assert(Number(psql(`select count(*) from gwira.organizations`))===Number(process.env.QA_ORG_COUNT_BEFORE||psql(`select count(*) from gwira.organizations`)),'An organization was created automatically');
 }
 log('PASS');app.exit(0);
})().catch(e=>{console.error('QA FAIL',phase,e.message);app.exit(1)});
