const {app,BrowserWindow}=require('electron');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.env.GWIRA_AUTH_PROFILE!=='local-dev'||!process.env.AUTH_QA_PROFILE)throw Error('Local profile required.');
app.setPath('userData',process.env.AUTH_QA_PROFILE);
let dropNextSend=false;
let dropNextChannelSend=false;
let dropNextChannelCreate=false;
let dropNextDirectoryCreate=false;
let failNextNotifications=false;
let delayNextRestore=false,restoreHeld=false,restoreReleased=false;
let unavailableNextAi=process.env.AUTH_QA_AI_UNAVAILABLE==='1';
let aiService;
const aiCalls=[];
if(process.env.AUTH_QA_AI_STUB==='1')process.env.GWIRA_AUTH_API_URL='https://ai-test.invalid';
const actualFetch=globalThis.fetch;
globalThis.fetch=async(...args)=>{
 if(delayNextRestore&&String(args[0]).includes('/rpc/restore_onboarding_conversation')){delayNextRestore=false;restoreHeld=true;await wait(3000);restoreReleased=true;}
 if(failNextNotifications&&String(args[0]).includes('/rest/v1/notifications?')){failNextNotifications=false;throw Error('Simulated notification network failure');}
 if(aiService&&String(args[0])==='https://ai-test.invalid/api/ai/generate'){
  if(unavailableNextAi){unavailableNextAi=false;return new Response(JSON.stringify({code:'configuration_required'}),{status:400,headers:{'Content-Type':'application/json'}});}
  const headers=new Headers(args[1].headers);
  const bearer=(headers.get('authorization')||'').replace(/^Bearer /i,'');
  try{return new Response(JSON.stringify(await aiService.generate(bearer,JSON.parse(args[1].body))),{status:200,headers:{'Content-Type':'application/json'}});}
  catch(error){return new Response(JSON.stringify({code:error.code||'generation_failed'}),{status:400,headers:{'Content-Type':'application/json'}});}
 }
 const response=await actualFetch(...args);
 if(dropNextDirectoryCreate&&String(args[0]).includes('/rpc/create_directory_person')){dropNextDirectoryCreate=false;throw Error('Simulated lost directory creation response after commit');}
 if(dropNextChannelCreate&&String(args[0]).includes('/rpc/create_channel')){dropNextChannelCreate=false;throw Error('Simulated lost channel creation response after commit');}
 if(dropNextChannelSend&&String(args[0]).includes('/rpc/send_channel_message')){dropNextChannelSend=false;throw Error('Simulated lost channel message response after commit');}
 if(dropNextSend&&String(args[0]).includes('/rpc/send_conversation_message')){dropNextSend=false;throw Error('Simulated lost response after server commit');}
 return response;
};
(async()=>{
 if(process.env.AUTH_QA_AI_STUB==='1'){
  const raw=execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const env=Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=/^([A-Z_]+)="(.*)"$/.exec(line);return m?[[m[1],m[2]]]:[];}));
  const url=new URL(env.API_URL);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local Supabase required.');
  const {AiService}=await import('../dist-server/server/hostedAuth/aiService.js');
  const {SupabaseAiGateway}=await import('../dist-server/server/hostedAuth/aiGateway.js');
  const provider={generate:async(history,plan)=>{aiCalls.push({history,plan});await wait(1500);return {content:'# Test provider plan\n\n- Review the request.',inputTokens:10,outputTokens:5};}};
  aiService=new AiService(new SupabaseAiGateway(url.origin,env.ANON_KEY,env.SERVICE_ROLE_KEY,actualFetch),provider,'test-model',20);
 }
 await app.whenReady();await import('../dist/main/main.js');
 let window;
 for(let i=0;i<150;i++){window=BrowserWindow.getAllWindows()[0];if(window&&!window.webContents.isLoading())break;await wait(100);}
 if(!window)throw Error('No application window.');
 window.webContents.session.on('will-download',event=>event.preventDefault());
 const run=source=>window.webContents.executeJavaScript(source,true);
 const poll=async(source,label)=>{for(let i=0;i<200;i++){if(await run(source))return;await wait(100);}const diag=await run("window.codexDesktop.account.snapshot().then(s=>({phase:s.phase,route:s.route?.type,issue:s.accessIssue,error:document.querySelector('.authenticated-home__error')?.innerText,heading:document.querySelector('.cloud-home__heading h1')?.innerText}))");throw Error(`Timeout ${label}: ${JSON.stringify(diag)}`);};
 const click=async label=>{await poll(`Array.from(document.querySelectorAll('button')).some(x=>x.textContent.trim()===${JSON.stringify(label)}&&!x.disabled)`,label);await run(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()===${JSON.stringify(label)}&&!x.disabled).click()`);};
 const clickConversation=async label=>{const selector=`.cloud-home__sidebar [role="button"][aria-label=${JSON.stringify(label)}]:not([aria-disabled="true"])`;await poll(`!!document.querySelector(${JSON.stringify(selector)})`,label);await run(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const conversationAction=async label=>{await poll('!!document.querySelector(".global-topbar button[aria-label=\\"Conversation options\\"]")',`menu for ${label}`);await run('document.querySelector(".global-topbar button[aria-label=\\"Conversation options\\"]").click()');await click(label);};
 const fill=async(selector,value)=>{await poll(`!!document.querySelector(${JSON.stringify(selector)})`,selector);await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
 const submit=()=>run('document.querySelector("form").requestSubmit()');
 const signOut=async()=>{await run('document.querySelector("[aria-label=\\"Account menu\\"]").click()');await click('Sign out');await poll("!!document.querySelector('input[type=email]:not(:disabled):not([readonly])')",'signed out');};
 const goal=async text=>{await fill('#cloud-goal',text);await poll("!!document.querySelector('[aria-label=\"Send message\"]:not(:disabled)')",'send ready');await run("document.querySelector('[aria-label=\"Send message\"]').click()");await poll(`document.body.innerText.includes(${JSON.stringify(text)})`,'saved message');};
 const sidebar=async expanded=>{if(await run(`document.querySelector('.shell')?.dataset.sidebar!==${JSON.stringify(expanded?'expanded':'collapsed')}`))await run(`document.querySelector('.global-topbar [aria-label="${expanded?'Expand':'Collapse'} sidebar"]').click()`);await poll(`document.querySelector('.shell')?.dataset.sidebar===${JSON.stringify(expanded?'expanded':'collapsed')}`,'sidebar state');};
 const capture=async name=>{if(!process.env.AUTH_QA_SCREENSHOTS)return;await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(300);if(name==='home-before-new-work'&&!(await run("document.querySelector('[aria-label=\"Message composer\"]').getBoundingClientRect().height<220")))throw Error(`Composer stretched at ${w}x${h}.`);if(name==='shell-account-menu'&&!(await run("(()=>{const menu=document.querySelector('[role=\"group\"][aria-label=\"Account\"]'),button=[...menu.querySelectorAll('button')].find(x=>x.textContent.trim()==='Sign out'),r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})()")))throw Error(`Account menu is clipped or covered at ${w}x${h}.`);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`${name}-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}window.setContentSize(1440,900);};
 if(process.env.AUTH_QA_CHAT_RESTART==='1'){
  await poll("!!document.querySelector('[aria-label=\"Gwira Chat\"]:not(:disabled)')",'restored chat control');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('QA_SIDECHAT_A_PRIVATE')",'restored chat message');
  await poll("document.querySelector('#gwira-assistant-input')?.value==='QA_SIDECHAT_A_DRAFT'",'restored chat draft');
  await poll("document.querySelector('[aria-label=\"Resize Gwira Chat\"]')?.getAttribute('aria-valuenow')==='412'",'restored chat width');
  if(process.env.AUTH_QA_AI_STUB==='1')await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('Test provider plan')",'restored chat AI response');
  console.log('ELECTRON_GLOBAL_CHAT_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_NOTIFICATIONS_RESTART==='1'){
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'notifications control restored');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('QA_NOTIFICATION_A')&&document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'read status after restart');
  console.log('ELECTRON_NOTIFICATIONS_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_DIRECTORY_RESTART==='1'){
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace rail');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  await poll("!!document.querySelector('.dashboard-sidebar')",'directory sidebar');
  if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
  await poll("document.querySelector('.shell')?.dataset.sidebar==='expanded'",'business sidebar expanded');
  await poll("document.querySelector('#authenticated-dashboard-pinned')?.hidden",'pinned section collapsed after restart');
  await run("document.querySelector('[aria-controls=\"authenticated-dashboard-pinned\"]').click()");
  await poll("document.querySelector('#authenticated-dashboard-pinned')?.innerText.includes('QA_DIRECTORY_PERSON')",'directory pin restart');
  console.log('ELECTRON_DIRECTORY_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_ROLE_NOTIFICATION_RESTART==='1'){
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'notifications control');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('Workspace role changed')&&document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'role notification after restart');
  console.log('ELECTRON_ROLE_NOTIFICATION_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_TASK_APPROVAL_RESTART==='1'){
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'notifications control');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('Your task result was approved.')&&document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'approval decision after restart');
  console.log('ELECTRON_TASK_APPROVAL_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_CHANNEL_CREATE_RESTART==='1'){
  const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8'}).trim();
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace rail');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  await poll("document.body.innerText.includes('Channel creation is unconfirmed.')",'unconfirmed creation restored');
  await run("[...document.querySelectorAll('[role=\"alert\"]')].find(x=>x.textContent.includes('Channel creation is unconfirmed.')).querySelector('button').click()");
  await poll("!document.body.innerText.includes('Channel creation is unconfirmed.')",'unconfirmed creation resolved');
  const scope=await run("window.codexDesktop.account.snapshot().then(s=>({organizationId:s.activeOrganization.id}))");
  if(!/^[0-9a-f-]{36}$/.test(scope.organizationId))throw Error('Invalid QA organization.');
  if(psql(`select count(*) from gwira.channels where organization_id='${scope.organizationId}' and name='QA_CREATE_RECOVERY'`)!=='1')throw Error('Channel creation retry duplicated or lost the channel.');
  if(await run("window.codexDesktop.scopedPreferences.read('pending-channel-create').then(x=>x!=='null')"))throw Error('Confirmed channel creation remains pending.');
  console.log('ELECTRON_CHANNEL_CREATE_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_DIRECTORY_CREATE_RESTART==='1'){
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace rail');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
  await poll("document.body.innerText.includes('Person creation is unconfirmed.')",'unconfirmed person restored');
  await run("[...document.querySelectorAll('[role=alert]')].find(x=>x.textContent.includes('Person creation is unconfirmed.')).querySelector('button').click()");
  await poll("document.querySelector('#authenticated-dashboard-people')?.innerText.includes('QA_RETRY_PERSON')",'recovered person');
  await poll("window.codexDesktop.scopedPreferences.read('pending-directory-person').then(x=>x==='null')",'person retry confirmed');
  const scope=await run("window.codexDesktop.account.snapshot().then(s=>({organizationId:s.activeOrganization.id}))");
  if(!/^[0-9a-f-]{36}$/.test(scope.organizationId))throw Error('Invalid QA organization.');
  const count=execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-tAc',`select count(*) from gwira.employees where organization_id='${scope.organizationId}' and name='QA_RETRY_PERSON' and user_id is null`],{encoding:'utf8'}).trim();
  if(count!=='1')throw Error('Person retry duplicated or lost the record.');
  await capture('directory-person-recovered');
  console.log('ELECTRON_DIRECTORY_CREATE_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_RESTART==='1'){
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='schedule'",'restored selected Schedule tab');
  await poll("window.codexDesktop.scopedPreferences.read('tabs').then(x=>x&&JSON.parse(x).tabs.some(t=>t.destination.view==='dashboard')&&JSON.parse(x).active===JSON.parse(x).tabs.find(t=>t.destination.view==='schedule')?.id)",'restored tab preferences');
  await poll("[...document.querySelectorAll('.global-topbar [role=tab]')].some(x=>x.innerText.includes('Dashboard'))",'restored Dashboard tab');
  if(!(await run("window.codexDesktop.scopedPreferences.read('tabs').then(x=>{const t=JSON.parse(x).tabs;return t.findIndex(v=>v.destination.view==='schedule')<t.findIndex(v=>v.destination.view==='dashboard')})")))throw Error('Global tab order did not survive restart.');
  console.log('ELECTRON_GLOBAL_TABS_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_SELECT_CONVERSATION==='1'){
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='schedule'",'restored schedule');
  await run("[...document.querySelectorAll('.global-topbar [role=tab]')].find(x=>x.innerText.includes('QA_A_ONBO')).click()");
  await poll("document.body.innerText.includes('QA_A_ONBOARDING_GOAL')",'selected conversation');
  await poll("window.codexDesktop.scopedPreferences.read('tabs').then(x=>{if(!x)return false;const t=JSON.parse(x);return t.tabs.some(v=>v.id===t.active&&v.destination.type==='conversation')})",'selected conversation saved');
  console.log('ELECTRON_GLOBAL_TABS_CONVERSATION_SAVED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_CONVERSATION_RESTART==='1'){
  await poll("document.body.innerText.includes('QA_A_ONBOARDING_GOAL')",'conversation restored');
  await poll("window.codexDesktop.scopedPreferences.read('tabs').then(x=>{if(!x)return false;const t=JSON.parse(x);return t.tabs.some(v=>v.id===t.active&&v.destination.type==='conversation')})",'conversation remains selected');
  console.log('ELECTRON_GLOBAL_TABS_CONVERSATION_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_WORKSPACES==='1'){
  await poll("document.body.innerText.includes('QA_A_ONBOARDING_GOAL')",'first workspace conversation');
  const first=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  const oldTabs=await run("window.codexDesktop.scopedPreferences.read('tabs')");
  const second=await run("window.codexDesktop.account.command({type:'create_organization',name:'QA tab second workspace',requestId:crypto.randomUUID()}).then(s=>s.activeOrganization?.id)");
  if(!second||second===first.organizationId)throw Error('Second workspace creation failed.');
  await run("window.codexDesktop.account.command({type:'complete_setup',deferred:true})");
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'second workspace');
  if(await run("window.codexDesktop.scopedPreferences.read('tabs').then(x=>x&&JSON.parse(x).tabs.some(t=>t.destination.type==='conversation'||t.destination.view==='schedule'||t.destination.view==='dashboard'))"))throw Error('Tabs leaked into second workspace.');
  if(!(await run(`window.codexDesktop.scopedPreferences.write('tabs','{}',${JSON.stringify(first)}).then(()=>false,()=>true)`)))throw Error('Stale workspace tab write was accepted.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(first.organizationId)}})`);
  await poll("document.body.innerText.includes('QA_A_ONBOARDING_GOAL')",'first workspace conversation restored');
  if((await run("window.codexDesktop.scopedPreferences.read('tabs')"))!==oldTabs)throw Error('First workspace tabs changed.');
  console.log('ELECTRON_GLOBAL_TABS_WORKSPACES_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_ARCHIVE_SETUP==='1'){
  await poll("document.body.innerText.includes('QA_A_ONBOARDING_GOAL')",'conversation to archive');
  await run("(async()=>{const raw=await window.codexDesktop.scopedPreferences.read('tabs');const saved=JSON.parse(raw);const tab=saved.tabs.find(t=>t.id===saved.active&&t.destination.type==='conversation');if(!tab)throw Error('No selected conversation tab');await window.codexDesktop.conversations.request({type:'update',id:tab.id,action:'archive'});})()");
  console.log('ELECTRON_GLOBAL_TABS_ARCHIVE_SETUP_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_ARCHIVE_RESTART==='1'){
  await poll("!!document.querySelector('.global-topbar [role=tab]')",'restored tabs');
  await poll("window.codexDesktop.scopedPreferences.read('tabs').then(x=>x&&!JSON.parse(x).tabs.some(t=>t.destination.type==='conversation'))",'archived tab filtered');
  if(await run("document.body.innerText.includes('QA_A_ONBOARDING_GOAL')||[...document.querySelectorAll('.global-topbar [role=tab]')].some(x=>x.innerText.includes('QA_A_ONBO'))"))throw Error('Archived conversation restored.');
  console.log('ELECTRON_GLOBAL_TABS_ARCHIVE_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_CORRUPT_SETUP==='1'){
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace');
  await run("window.codexDesktop.scopedPreferences.write('tabs','{\"version\":999,\"tabs\":[],\"active\":\"invalid\"}')");
  console.log('ELECTRON_GLOBAL_TABS_CORRUPT_SETUP_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS_CORRUPT_RESTART==='1'){
  await poll("document.querySelector('[role=\"alert\"]')?.innerText.includes('Saved tabs are invalid and were not overwritten.')",'invalid saved tabs warning');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'",'navigation with invalid preferences');
  await wait(1000);
  if((await run("window.codexDesktop.scopedPreferences.read('tabs')"))!=='{\"version\":999,\"tabs\":[],\"active\":\"invalid\"}')throw Error('Invalid saved tabs were overwritten.');
  console.log('ELECTRON_GLOBAL_TABS_CORRUPT_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_CHANNEL_UI_RESTART==='1'){
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace rail');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'",'dashboard');
  if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
  await poll("document.querySelector('#authenticated-dashboard-channels')?.innerText.includes('QA_TEAM_CHANNEL')",'channel after restart');
  await poll("(()=>{const t=document.querySelector('#authenticated-dashboard-channels')?.innerText||'';return t.includes('QA_PRIVATE_CHANNEL')&&t.indexOf('QA_PRIVATE_CHANNEL')<t.indexOf('QA_TEAM_CHANNEL')})()",'channel sort after restart');
  await run("[...document.querySelectorAll('#authenticated-dashboard-channels button')].find(x=>x.textContent.includes('QA_TEAM_CHANNEL')).click()");
  await poll("document.querySelector('.gw-msg-feed')?.innerText.includes('QA_CHANNEL_REPLY')",'channel messages after restart');
  console.log('ELECTRON_CHANNEL_UI_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_RESTART==='1'){
  await poll("document.body.innerText.includes('QA_A_NORMAL_MESSAGE')",'restored conversation');
  await poll("!!document.querySelector('#cloud-goal')",'conversation composer');
  await poll("document.querySelector('.shell')?.dataset.sidebar==='expanded'",'restored sidebar layout');
  console.log('ELECTRON_CONVERSATION_RESTART_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_FIRST_RESTART==='1'){
  await poll("document.body.innerText.includes('QA_B_ONBOARDING_GOAL')",'restored first message');
  await poll("document.body.innerText.includes('Test provider plan')",'restored first response');
  const count=await run("(async()=>{const l=await window.codexDesktop.conversations.request({type:'list'});const m=await window.codexDesktop.conversations.request({type:'messages',id:l.conversations[0].id});return m.filter(x=>x.content==='QA_B_ONBOARDING_GOAL').length})()");
  if(count!==1)throw Error('Restart duplicated the first message.');
  console.log('ELECTRON_FIRST_MESSAGE_RESTART_PASSED');app.exit(0);return;
 }
 await poll("document.body.innerText.includes('Welcome back')",'login');
 await run("localStorage.setItem('gwira.library.records.v1',JSON.stringify([{id:'legacy',title:'QA_LEGACY_PRIVATE_RECORD'}]));localStorage.setItem('gwira.library.preferences.v1','QA_LEGACY_PREFERENCES');localStorage.setItem('gwira.dashboard.view.v1','QA_LEGACY_PREFERENCES');localStorage.setItem('gwira.local-prototype.v1',JSON.stringify({name:'QA_LEGACY_PRIVATE_RECORD'}));true");
 const backend=await run('window.codexDesktop.account.snapshot().then(s=>s.backend?.label)');
 if(backend!=='local')throw Error('Local backend required.');
 const accounts=['A','B'].map(letter=>({name:`QA ${letter}`,email:`conversation-${randomUUID()}@example.test`,password:`Qa-${randomUUID()}-strong`}));
 async function create(account,goalText,complete=false){
  await click('Create an account');await fill('input[type=email]',account.email);await fill('input[autocomplete=new-password]',account.password);await submit();
  await poll('!!document.querySelector("[data-app-route=\\"AboutYou\\"]")','profile');
  await fill('input[autocomplete=name]',account.name);await submit();
  await poll('!!document.querySelector("[data-app-route=\\"WorkspaceSetup\\"]")','workspace');await click('Create a workspace');
  await fill('input[autocomplete=organization]',`${account.name} workspace`);await submit();
  await poll('!!document.querySelector("#home-goal")','first-run Home');
  if(!(await run("document.querySelector('.shell')?.dataset.sidebar==='collapsed'")))throw Error('New workspace did not start collapsed.');
  await run("window.__qaShell=document.querySelector('[data-authenticated-home]');window.__qaBar=document.querySelector('.global-topbar');window.__qaRail=document.querySelector('.authenticated-home__rail');window.__qaComposer=document.querySelector('#home-goal');window.__qaWorkspace=document.querySelector('.right-workspace');true");
  if((await run('document.querySelectorAll(".global-topbar [role=tab]").length'))!==1)throw Error('First-run did not open exactly one Home tab.');
  await poll("!!document.querySelector('[aria-label=\"Open a new global tab\"]:not(:disabled)')",'global picker enabled');
  await run('document.querySelector("[aria-label=\\"Open a new global tab\\"]").focus();document.querySelector("[aria-label=\\"Open a new global tab\\"]").click()');
  await poll("!!document.querySelector('[role=\"dialog\"][aria-label=\"Open destination\"]')",'global picker');
  if(!(await run("(()=>{const add=document.querySelector('[aria-label=\"Open a new global tab\"]').getBoundingClientRect(),picker=document.querySelector('[aria-label=\"Open destination\"]').getBoundingClientRect();return Math.abs(picker.left-add.left)<=8})()")))throw Error('Global picker is not anchored to its global tab control.');
  if(complete)await capture('shell-global-picker');
  await run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await poll("!document.querySelector('[aria-label=\"Open destination\"]')&&document.activeElement?.getAttribute('aria-label')==='Open a new global tab'",'global picker escape');
  await run('document.querySelector("[aria-label=\\"Account menu\\"]").click()');
  await poll("!!document.querySelector('[role=\"group\"][aria-label=\"Account\"]')",'account menu');
  if(complete)await capture('shell-account-menu');
  await run("document.querySelector('.workspace').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  await poll("!document.querySelector('[role=\"group\"][aria-label=\"Account\"]')",'account menu outside dismissal');
  await run('document.querySelector("[aria-label=\\"Account menu\\"]").click()');
  await run("document.querySelector('[aria-label=\"Account\"] button').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await poll("!document.querySelector('[role=\"group\"][aria-label=\"Account\"]')&&document.activeElement?.getAttribute('aria-label')==='Account menu'",'account menu escape');
  await poll("!!document.querySelector('button[aria-label=\"Workspace tools\"]:not(:disabled)')",'first-run workspace control');
  await run("document.querySelector('button[aria-label=\"Workspace tools\"]').click()");
  await poll("document.querySelectorAll('.new-tab-launcher__tools button:not(:disabled)').length===3",'workspace launcher');
  if(process.env.AUTH_QA_SCREENSHOTS&&complete){await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(300);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`workspace-launcher-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}window.setContentSize(1440,900);await wait(300);}
  await click('Terminal');await poll("document.querySelector('[aria-label=\"Terminal\"]')?.innerText.includes('Terminal execution is unavailable')",'terminal unavailable');
  if(!(await run("document.querySelector('.workspace-terminal__start-button')?.disabled")))throw Error('Authenticated terminal start must remain disabled.');
  await run('document.querySelector("[aria-label=\\"Open a new workspace tab\\"]").click()');
  await click('Files');await poll("document.querySelector('[aria-label=\"Authorized plan preview\"]')?.innerText.includes('No authorized plan')",'files unavailable');
  if(!(await run("document.querySelector('[aria-label=\"Workspace Files\"] .workspace-files__open-folder')?.disabled")))throw Error('Local folder access is enabled.');
  await run("document.querySelector('[aria-label=\"Authorized plan preview\"] [data-files-explorer-toggle]').click()");
  await poll("getComputedStyle(document.querySelector('.right-workspace__tools')).visibility==='visible'&&document.querySelector('[aria-label=\"Workspace Files\"]').dataset.explorerOpen==='true'",'Files explorer opened');
  if(!(await run("document.querySelector('[aria-label=\"Workspace Files\"] .workspace-files__open-folder').getClientRects().length>0")))throw Error('Files explorer controls are not visible.');
  await run("document.querySelector('button[aria-label=\"Workspace tools\"]').click()");
  await poll("!!document.querySelector('.right-workspace[hidden]')",'Files Workspace collapsed');
  if(!(await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")))throw Error('Hidden Files explorer intercepted Escape.');
  await run("document.querySelector('button[aria-label=\"Workspace tools\"]').click()");
  await poll("!!document.querySelector('.right-workspace:not([hidden]) [aria-label=\"Workspace Files\"]')",'Files Workspace reopened');
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await poll("document.querySelector('[aria-label=\"Workspace Files\"]').dataset.explorerOpen==='false'",'Files explorer closed');
  if(!(await run("document.activeElement?.matches('[aria-label=\"Authorized plan preview\"] [data-files-explorer-toggle]')")))throw Error('Files explorer focus was not restored.');
  if(process.env.AUTH_QA_SCREENSHOTS&&complete){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(300);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`workspace-files-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}window.setContentSize(1440,900);await wait(300);}
  await run('document.querySelector("[aria-label=\\"Open a new workspace tab\\"]").click()');
  await click('Work Sessions');await poll("document.querySelector('[aria-label=\"Work Sessions\"]')?.innerText.includes('unavailable')",'sessions unavailable');
  if(!(await run("[...document.querySelectorAll('[aria-label=\"Work session views\"] button')].every(button=>button.disabled)&&document.querySelector('[aria-label=\"Search sessions\"]')?.disabled")))throw Error('Unavailable work-session controls must be disabled.');
  if(!(await run("document.querySelector('[aria-label=\"Close Work Sessions\"]')?.getClientRects().length>0")))throw Error('Work Sessions close control is not visible.');
  window.setContentSize(900,700);await wait(300);
  if(!(await run("(()=>{const panel=document.querySelector('.right-workspace__tools').getBoundingClientRect(),sessions=document.querySelector('.work-sessions').getBoundingClientRect();return Math.abs(panel.top-sessions.top)<2&&Math.abs(panel.left-sessions.left)<2&&Math.abs(panel.width-sessions.width)<2;})()")))throw Error('Work Sessions is not aligned with its Workspace panel at narrow width.');
  window.setContentSize(1440,900);await wait(300);
  if(process.env.AUTH_QA_SCREENSHOTS&&complete){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(300);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`workspace-sessions-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}window.setContentSize(1440,900);await wait(300);}
  const widthBefore=await run("Number(document.querySelector('[aria-label=\"Resize Workspace\"]').getAttribute('aria-valuenow'))");
  await run("document.querySelector('[aria-label=\"Resize Workspace\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
  if((await run("Number(document.querySelector('[aria-label=\"Resize Workspace\"]').getAttribute('aria-valuenow'))"))!==widthBefore+10)throw Error('Workspace keyboard resize failed.');
  const handle=await run("(()=>{const r=document.querySelector('[aria-label=\"Resize Workspace\"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()");
  window.webContents.sendInputEvent({type:'mouseMove',x:handle.x,y:handle.y});
  window.webContents.sendInputEvent({type:'mouseDown',x:handle.x,y:handle.y,button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseMove',x:handle.x-20,y:handle.y,button:'left'});
  window.webContents.sendInputEvent({type:'mouseUp',x:handle.x-20,y:handle.y,button:'left',clickCount:1});
  await poll(`Number(document.querySelector('[aria-label="Resize Workspace"]').getAttribute('aria-valuenow'))>${widthBefore+10}`,'workspace pointer resize');
  await run('document.querySelector("[aria-label=\\"Close Work Sessions\\"]").click()');
  await poll("!document.querySelector('[aria-label=\"Work Sessions\"]')&&!!document.querySelector('.right-workspace:not([hidden])')",'close work sessions tool without closing Workspace');
  await run("document.querySelector('button[aria-label=\"Workspace tools\"]').click()");
  await poll("!!document.querySelector('.right-workspace[hidden]')",'workspace tab close');
  await run("document.querySelector('button[aria-label=\"Workspace tools\"]').click()");
  await poll("!!document.querySelector('.right-workspace:not([hidden])')",'workspace reopen');
  await run("document.querySelector('button[aria-label=\"Workspace tools\"]').click()");
  await poll("!!document.querySelector('.right-workspace[hidden]')",'workspace collapsed');
  if(process.env.AUTH_QA_SCREENSHOTS&&complete){await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w-1,h);await wait(150);window.setContentSize(w,h);await wait(500);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`first-home-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
  if(process.env.AUTH_QA_SHELL_ONLY==='1'){
   if(!(await run("document.querySelector('.shell')?.dataset.sidebar==='collapsed'&&document.querySelector('.right-workspace')?.hidden&&document.querySelector('.workspace[data-workspace-view=\"home\"]')!==null")))throw Error('Incorrect initial shell state.');
   await run('document.querySelector("[aria-label=\\"Toggle conversations\\"]").click()');
   await poll("!document.querySelector('.cloud-home__sidebar').hidden",'sidebar expanded');
   await poll("!!document.querySelector('[aria-label=\"Recent options\"]:not(:disabled)')",'scoped sidebar settings loaded');
   await run('document.querySelector("[aria-label=\\"Recent options\\"]").click()');
   await click('Sort chats by');await click('Name');
   await poll("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='name')",'sidebar settings saved');
   await run("(()=>{const trigger=document.querySelector('[aria-label=\"Recent options\"]');trigger.focus();trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));})()");
   await poll("document.activeElement?.getAttribute('role')==='menuitem'&&!!document.activeElement.closest('[aria-label=\"Recents options\"]')",'keyboard menu focus');
   await click('Show sections');await run("[...document.querySelectorAll('[role=menuitemcheckbox]')].find(x=>x.textContent.trim()==='Projects').click()");
   await poll("document.querySelector('.sidebar-work-section[aria-label=\"Projects\"]').hidden",'section hidden');
   await run("[...document.querySelectorAll('[role=menuitemcheckbox]')].find(x=>x.textContent.trim()==='Projects').click()");await poll("!document.querySelector('.sidebar-work-section[aria-label=\"Projects\"]').hidden",'section restored');
   await run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
   await run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
   await poll("document.activeElement?.getAttribute('aria-label')==='Recent options'&&!document.querySelector('[aria-label=\"Recents options\"]')",'menu close and focus restoration');
   if(await run("!!document.querySelector('.cloud-home__sidebar input[type=search]')"))throw Error('Search should be collapsed initially.');
   await run('document.querySelector("[aria-label=\\"Search conversations\\"]").click()');
   await poll("!!document.querySelector('.cloud-home__sidebar input[type=search]')",'sidebar search');
   await click('Show archived conversations');
   await poll("document.body.innerText.includes('Show active conversations')",'archived conversation filter');
   await run("document.querySelector('.cloud-home__sidebar input[type=search]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
   await poll("!document.querySelector('.cloud-home__sidebar input[type=search]')",'sidebar search closed');
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(400);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`authenticated-sidebar-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
   if(!(await run("document.querySelector('[aria-label=\"Search conversations\"]').getBoundingClientRect().width>0")))throw Error('Sidebar search is not visible at the current window size.');
   await run('document.querySelector("[aria-label=\\"Toggle conversations\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Workspace\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='dashboard'&&document.querySelector('[aria-selected=true][role=tab]')?.innerText.includes('Dashboard')",'dashboard navigation');
   await run('document.querySelector("[aria-label=\\"Expand sidebar\\"]").click()');
   await poll("!!document.querySelector('.gwira-secondary-sidebar:not([hidden]) [aria-label=\"Business navigation\"] [aria-current=\"page\"][data-navigation-view=\"dashboard\"]')",'canonical business sidebar');
   if(await run("!document.querySelector('.cloud-home__sidebar').hidden"))throw Error('Home sidebar remained visible on Dashboard.');
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(250);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`dashboard-sidebar-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}window.setContentSize(1440,900);}
   await run('document.querySelector("[aria-label=\\"Business navigation\\"] [data-navigation-view=\\"my-work\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='my-work'&&document.querySelector('.my-work')?.innerText.includes('Work records are unavailable')",'restricted My Work');
   if(!(await run("document.querySelector('.my-work__primary')?.disabled")))throw Error('Local task creation must remain disabled.');
   await run('document.querySelector("[aria-label=\\"Business navigation\\"] [data-navigation-view=\\"organization\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='organization'&&document.querySelector('.saved-views')?.innerText.includes('Saved views are unavailable')",'restricted views');
   if(!(await run("document.querySelector('.saved-views__primary')?.disabled")))throw Error('Local saved view creation must remain disabled.');
   if(!(await run("document.querySelector('.saved-views__directory [aria-label=\"Find a view\"]')?.disabled")))throw Error('Unavailable view search must remain disabled.');
   await run('document.querySelector("[aria-label=\\"Business navigation\\"] [data-navigation-view=\\"dashboard\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Close My Work tab\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Close Views tab\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Collapse sidebar\\"]").click()');
   if(await run("document.body.innerText.includes('QA_LEGACY_PRIVATE_RECORD')"))throw Error('Legacy data leaked into Dashboard.');
   if(!(await run("document.querySelector('[data-dashboard-view=\"workflow\"][role=\"tab\"]')&&!document.querySelector('[data-dashboard-view=\"workflow\"][role=\"tab\"]').disabled&&[...document.querySelectorAll('.gwira-dashboard-views [role=tab]')].filter(x=>x.dataset.dashboardView!=='workflow').every(x=>x.disabled)")))throw Error('Dashboard restricted tabs are incorrect.');
   await run('document.querySelector("[data-dashboard-view=\\"workflow\\"][role=\\"tab\\"]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))');
   if(await run("localStorage.getItem('gwira.dashboard.view.v1')!=='QA_LEGACY_PREFERENCES'||document.querySelector('.gwira-dashboard').dataset.dashboardView!=='workflow'"))throw Error('Dashboard accessed legacy navigation state.');
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(250);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`dashboard-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
   await run('document.querySelector("[aria-label=\\"Schedule\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='schedule'&&document.querySelector('[data-testid=\"schedule-page\"]')?.innerText.includes('Schedules unavailable')",'restricted schedule');
   if(!(await run("document.querySelector('[data-testid=\"schedule-page\"] button')?.disabled")))throw Error('Local scheduling must remain disabled.');
   await run('document.querySelector("[aria-label=\\"Expand sidebar\\"]").click()');
   await poll("!!document.querySelector('.gwira-secondary-sidebar:not([hidden]) [aria-label=\"Schedules\"]')",'schedule sidebar');
   await poll("document.querySelector('.gw-schedule__compact-heading span')?.textContent==='Upcoming'&&!!document.querySelector('[aria-label=\"Filter schedules\"]')",'compact schedule filter');
   await run('document.querySelector("[aria-label=\\"Filter schedules\\"]").click()');
   await poll("[...document.querySelectorAll('[role=\"menu\"][aria-label=\"Filter schedules\"] button')].map(x=>x.textContent.trim()).join('|')==='Upcoming|Active|Needs attention|Paused'",'schedule categories');
   await run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
   if(await run("document.querySelector('[data-testid=\"schedule-page\"]').innerText.includes('All schedules')"))throw Error('Removed All schedules view returned.');
   await capture('schedule-corrected');
   window.setContentSize(900,700);await wait(250);
   await run("document.querySelector('.gw-schedule__category-content').scrollTop=10000");
   if(!(await run("(()=>{const p=document.querySelector('.gw-schedule__category-content'),last=p.querySelector('.gw-schedule__empty-note');return p.scrollTop>0&&last.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom+1})()")))throw Error('Narrow schedule content cannot be scrolled into view.');
   if(process.env.AUTH_QA_SCREENSHOTS)await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,'schedule-narrow-scrolled-900x700.png'),(await window.webContents.capturePage()).toPNG());
   window.setContentSize(1440,900);await wait(300);
   for(const name of ['Active','Needs attention','Paused','Upcoming']){
    await run('document.querySelector("[aria-label=\\"Filter schedules\\"]").click()');
    await poll("!!document.querySelector('[role=\"menu\"][aria-label=\"Filter schedules\"]')",'open schedule filter');
    await run(`[...document.querySelectorAll('[role="menu"][aria-label="Filter schedules"] button')].find(x=>x.textContent.trim()===${JSON.stringify(name)}).click()`);
    await poll(`document.querySelector('.gw-schedule__compact-heading span')?.textContent===${JSON.stringify(name)}&&document.querySelector('[data-testid="schedule-page"] h1')?.textContent===${JSON.stringify(name)}`,'schedule section '+name);
    if(name==='Active'&&process.env.AUTH_QA_SCREENSHOTS){await wait(250);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,'schedule-active-1440x900.png'),(await window.webContents.capturePage()).toPNG());}
   }
   if(!(await run("document.querySelectorAll('[data-testid=\"schedule-page\"] [data-schedule-suggestion]').length===6&&!document.querySelector('[data-testid=\"schedule-page\"] button[data-schedule-suggestion]')")))throw Error('Unavailable schedule examples must not execute.');
   await run('document.querySelector("[aria-label=\\"Collapse sidebar\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Close Schedule tab\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='dashboard'",'close schedule');
   await run('document.querySelector("[aria-label=\\"Expand sidebar\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Business navigation\\"] [data-navigation-view=\\"inbox\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Collapse sidebar\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='inbox'",'inbox navigation');
   if(!(await run("document.querySelector('.gwira-primary-rail [aria-label=\"Workspace\"]')?.getAttribute('aria-current')==='page'")))throw Error('Inbox must retain the original Workspace rail selection.');
   await run('document.querySelector("[aria-label=\\"Back\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='dashboard'",'navigation back');
   await run('document.querySelector("[aria-label=\\"Forward\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='inbox'",'navigation forward');
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(250);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`inbox-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
   await run('document.querySelector("[aria-label=\\"Toggle conversations\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Expand sidebar\\"]").click()');
   await click('Library');
   await run('document.querySelector("[aria-label=\\"Collapse sidebar\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='library'",'library navigation');
   if(await run("document.body.innerText.includes('QA_LEGACY_PRIVATE_RECORD')"))throw Error('Legacy data leaked into Library.');
   await poll("!!document.querySelector('[aria-label=\"Library categories\"]')",'canonical Library categories');
   await run('document.querySelector("[aria-label=\\"List view\\"]").click()');
   if(await run("localStorage.getItem('gwira.library.preferences.v1')!=='QA_LEGACY_PREFERENCES'"))throw Error('Library modified legacy preferences.');
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(250);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`library-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
   await run('document.querySelector("[aria-label=\\"More\\"]").click()');await run('document.querySelector("[role=menuitem][data-navigation-view=\\"integrations\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='integrations'&&!!document.querySelector('.gwira-integrations-page')",'integrations navigation');
   if(!(await run("[...document.querySelectorAll('.gwira-integrations-page button')].filter(button=>button.textContent.trim()==='Connect').every(button=>button.disabled)&&document.querySelector('.gwira-integrations-page').innerText.includes('Unavailable')")))throw Error('Integration availability is incorrect.');
   await run('document.querySelector("[aria-label=\\"Close Integrations tab\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='library'",'close integrations tab');
   await run('document.querySelector("[aria-label=\\"More\\"]").click()');await run('document.querySelector("[role=menuitem][data-navigation-view=\\"agents\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='agents'&&document.querySelector('[aria-label=\"Agents\"]')?.innerText.includes('Coding agents unavailable')",'restricted coding agents');
   if(!(await run("[...document.querySelectorAll('[aria-label=\"Agents\"] button, [aria-label=\"Agents\"] input')].every(element=>element.disabled)")))throw Error('Local coding-agent controls must be disabled.');
   await run('document.querySelector("[aria-label=\\"More\\"]").click()');await run('document.querySelector("[role=menuitem][data-navigation-view=\\"skills\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='skills'&&document.querySelector('.skills-page')?.innerText.includes('Skills are unavailable')",'restricted skills');
   if(!(await run("[...document.querySelectorAll('.skills-page button, .skills-page input')].every(element=>element.disabled)")))throw Error('Local skill controls must be disabled.');
   await run('document.querySelector("[aria-label=\\"Expand sidebar\\"]").click()');
   await poll("!!document.querySelector('.gwira-secondary-sidebar:not([hidden]) [aria-label=\"Workspace tools\"] [aria-current=\"page\"][data-navigation-view=\"skills\"]')",'canonical workspace tools sidebar');
   await run('document.querySelector("[aria-label=\\"Collapse sidebar\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Close Skills tab\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Close Coding agents tab\\"]").click()');
   await run('document.querySelector("[aria-label=\\"More\\"]").click()');await run('document.querySelector("[role=menuitem][data-navigation-view=\\"doats\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='doats'&&document.querySelector('.gwira-doat-directory')?.innerText.includes('Doats unavailable')",'restricted Doats');
   if(!(await run("document.querySelector('.gwira-doat-directory__header button')?.disabled")))throw Error('Doat creation must remain disabled.');
   await run('document.querySelector("[aria-label=\\"More\\"]").click()');await run('document.querySelector("[role=menuitem][data-navigation-view=\\"settings\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='settings'&&!!document.querySelector('.settings-page')",'authenticated settings');
   await click('Security and permissions');await poll("document.querySelector('.settings-page').innerText.includes('terminal execution')",'restricted security settings');
   await run('document.querySelector("[aria-label=\\"Close Settings tab\\"]").click()');
   await run('document.querySelector("[aria-label=\\"Close Doats tab\\"]").click()');
   await run('document.querySelector("[aria-label=\\"More\\"]").click()');await run('document.querySelector("[role=menuitem][data-navigation-view=\\"teams\\"]").click()');
   await poll("document.querySelector('.workspace').dataset.workspaceView==='teams'&&document.querySelector('.workforce-page')?.innerText.includes('directory is unavailable')",'restricted teams');
   if(!(await run("[...document.querySelectorAll('.workforce-page__header button')].every(button=>button.disabled)")))throw Error('Local workforce creation must remain disabled.');
   await run("[...document.querySelectorAll('[aria-label=\"Workforce views\"] button')].find(x=>x.textContent.trim()==='Teams').click()");
   await poll("document.querySelector('[aria-label=\"Search teams\"]')?.disabled&&document.querySelector('[aria-label=\"Workforce views\"] [aria-current=\"page\"]')?.textContent.trim()==='Teams'",'teams tab');
   await run("[...document.querySelectorAll('[aria-label=\"Workforce views\"] button')].find(x=>x.textContent.trim()==='People').click()");
   await poll("document.querySelector('[aria-label=\"Search people\"]')?.disabled",'people tab');
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(250);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`teams-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}window.setContentSize(1440,900);}
   await run('document.querySelector("[aria-label=\\"Close Teams tab\\"]").click()');
   await run("document.querySelector('[aria-label=\"Close Library tab\"]').click()");
   await poll("document.querySelector('.workspace').dataset.workspaceView!=='library'",'close library tab');
   await run("[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.trim()==='Home').click()");
   await poll("document.querySelector('.workspace').dataset.workspaceView==='home'",'return Home');
   await run('document.querySelector("[aria-label=\\"Close Inbox tab\\"]").click()');
   if(!(await run("document.querySelector('.workspace').dataset.workspaceView==='home'")))throw Error('Closing an inactive tab changed the active view.');
   await run('document.querySelector("button[aria-label=\\"Workspace tools\\"]").click()');
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(400);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`authenticated-workspace-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
   return 'shell-only';
  }
  if(complete){
   await run(`window.codexDesktop.account.command({type:'save_onboarding',progress:{act:'clarifying',goal:${JSON.stringify(goalText)},answers:[],asked:1}})`);
  }else{
   if(process.env.AUTH_QA_INTERRUPT_BEFORE_COMPLETION==='1'||process.env.AUTH_QA_INTERRUPT_DIRECT_FIRST==='1'){
    await run(`(async()=>{const s=await window.codexDesktop.account.command({type:'save_onboarding',progress:{act:'clarifying',goal:${JSON.stringify(goalText)},answers:[],asked:1}});if(!s.user?.id||!s.activeOrganization?.id||s.onboardingSaveFailed)throw Error('Recovery setup failed');const marker={userId:s.user.id,organizationId:s.activeOrganization.id};if(${process.env.AUTH_QA_INTERRUPT_DIRECT_FIRST==='1'})Object.assign(marker,{conversationId:crypto.randomUUID(),messageId:crypto.randomUUID(),goal:${JSON.stringify(goalText)}});await window.codexDesktop.scopedPreferences.write('initial-generation',JSON.stringify(marker));if(marker.conversationId){await window.codexDesktop.conversations.request({type:'create',id:marker.conversationId,title:marker.goal.slice(0,200),visibility:'private'});await window.codexDesktop.conversations.request({type:'send',id:marker.conversationId,messageId:marker.messageId,content:marker.goal});}})()`);
    return 'interrupted';
   }
   await poll("!!document.querySelector('#home-goal:not(:disabled)')",'first-run recovery');
   await fill('#home-goal',goalText);await poll("!!document.querySelector('.composer-actions .send:not(:disabled)')",'first message ready');await run('document.querySelector(".composer-actions .send").click()');
   await poll('!!document.querySelector("#cloud-goal")','first conversation');
   if(!(await run("window.__qaShell===document.querySelector('[data-authenticated-home]')&&window.__qaBar===document.querySelector('.global-topbar')&&window.__qaRail===document.querySelector('.authenticated-home__rail')&&window.__qaComposer===document.querySelector('#cloud-goal')&&window.__qaWorkspace===document.querySelector('.right-workspace')")))throw Error('Home shell, composer or Workspace remounted during the first message.');
   await poll(`document.body.innerText.includes(${JSON.stringify(goalText)})`,'saved first message');
   if(aiService)await poll(process.env.AUTH_QA_GREETING_UNAVAILABLE==='1'?"document.body.innerText.includes('AI is unavailable: the trusted AI provider is not configured.')":"document.body.innerText.includes('Test provider plan')",'first message AI response');
   if(await run("!!document.querySelector('.meet-gwira')"))throw Error('First message entered rules-based onboarding.');
   if(process.env.AUTH_QA_FIRST_RECOVERY==='1'){
    window.webContents.reload();await poll("document.body.innerText.includes('Test provider plan')",'first response recovery');
    const count=await run(`(async()=>{const l=await window.codexDesktop.conversations.request({type:'list'});const m=await window.codexDesktop.conversations.request({type:'messages',id:l.conversations[0].id});return m.filter(x=>x.content===${JSON.stringify(goalText)}).length})()`);
    if(count!==1)throw Error('First-message recovery duplicated the message.');
   }
   if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w-1,h);await wait(150);window.setContentSize(w,h);await wait(500);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`first-conversation-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
   return;
  }
  await poll('!!document.querySelector(".meet-gwira")','onboarding');
  if(!(await run('!!document.querySelector(".global-topbar")&&!!document.querySelector(".authenticated-home__rail")')))throw Error('Onboarding lost the authenticated shell.');
  if(process.env.AUTH_QA_SCREENSHOTS&&complete){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w-1,h);await wait(150);window.setContentSize(w,h);await wait(500);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`onboarding-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
  if(complete){
   await click('I’m not sure');await poll("document.querySelector('#meet-goal')?.value==='I’m not sure'",'editable suggestion');await run("document.querySelector('.meet-gwira [aria-label=\"Send message\"]').click()");await click('Review plan');await click('Download brief');await click('Finish setup');
  }else await click('Skip for now');
  await poll('!!document.querySelector("#cloud-goal")','ordinary Home');
  await poll(`document.body.innerText.includes(${JSON.stringify(goalText)})`,'onboarding history');
 }
 if(await create(accounts[0],'QA_A_ONBOARDING_GOAL',true)==='shell-only'){console.log('ELECTRON_AUTHENTICATED_SHELL_PASSED');app.exit(0);return;}
 if(process.env.AUTH_QA_TASK_APPROVAL==='1'){
  const first=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  const second=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  if(![first.userId,first.organizationId,second.userId].every(id=>/^[0-9a-f-]{36}$/.test(id)))throw Error('Invalid QA identity.');
  execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${first.organizationId}','${second.userId}','member')`],{stdio:'ignore'});
  const raw=await fs.readFile('.env.auth.dev.local','utf8');
  const env=Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=/^(GWIRA_[A-Z_]+)=(.*)$/.exec(line.trim());return m?[[m[1],m[2].replace(/^"|"$/g,'')]]:[];}));
  const url=new URL(env.GWIRA_SUPABASE_URL);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local Supabase required.');
  const {createClient}=await import('@supabase/supabase-js');
  const client=()=>createClient(url.href,env.GWIRA_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const owner=client(),reviewer=client();
  for(const [c,account] of [[owner,accounts[0]],[reviewer,accounts[1]]]){const result=await c.auth.signInWithPassword({email:account.email,password:account.password});if(result.error)throw Error('Local QA login failed.');}
  const task=randomUUID(),id=randomUUID(),org=first.organizationId;
  const request=async(c,name,params)=>{const result=await c.schema('gwira').rpc(name,params);if(result.error)throw Error(`${name}: ${result.error.code}`);return result.data;};
  await request(owner,'create_approval_task',{p_org:org,p_id:task,p_title:'QA task',p_reviewer:second.userId});
  await request(owner,'submit_task_approval',{p_org:org,p_task:task,p_id:id,p_result:'QA completed work'});
  const foreign=await run(`window.codexDesktop.approvals.request({type:'list'},${JSON.stringify(second)})`);
  if(foreign.tasks.some(item=>item.id===task)||foreign.results.some(item=>item.id===id))throw Error('Approval leaked into another workspace.');
  if(!(await run(`window.codexDesktop.approvals.request({type:'list'},${JSON.stringify(first)}).then(()=>false,()=>true)`)))throw Error('Stale workspace approval request was accepted.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(org)}})`);
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'reviewer notifications');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('A task result is ready for your review.')",'approval notification');
  await capture('task-approval-request');
  await click('Mark as read');
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'approval notification read');
  await click('Open Inbox');
  await poll("!!document.querySelector('[data-nav-id=\"needs-review\"]')",'review navigation');
  await run("document.querySelector('[data-nav-id=\"needs-review\"]').click()");
  await poll("document.querySelector('.gw-review')?.innerText.includes('QA task')",'review item');
  await run("document.querySelector('[data-inbox-row^=\"approval:\"]').click()");
  await poll("document.querySelector('.gw-review__source')?.innerText.includes('QA completed work')",'authorized review result');
  await capture('task-approval-review');
  window.setContentSize(900,700);
  await wait(500);
  await poll("document.querySelector('.gw-review')?.classList.contains('is-master-detail')",'compact review layout');
  await poll("!!document.querySelector('[data-inbox-row^=\"approval:\"]')",'compact review row');
  await run("document.querySelector('[data-inbox-row^=\"approval:\"]').click()");
  await poll("document.querySelector('.gw-review__source')?.innerText.includes('QA completed work')",'compact review detail');
  if(!(await run("document.querySelector('.gw-review__source').getBoundingClientRect().width>=300")))throw Error('Review detail is too narrow.');
  await wait(500);
  if(process.env.AUTH_QA_SCREENSHOTS)await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,'task-approval-review-detail-900x700.png'),(await window.webContents.capturePage()).toPNG());
  window.setContentSize(1440,900);
  await click('Approve');
  await poll("document.querySelector('.gw-review')?.innerText.includes('No longer needs review')",'review decision');
  const decided=await reviewer.schema('gwira').from('task_approval_results').select('status').eq('id',id).single();
  if(decided.error||decided.data.status!=='approved')throw Error('Approval decision was not persisted.');
  await signOut();await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'owner notifications');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('Your task result was approved.')",'approval decision notification');
  await capture('task-approval-decision');
  await click('Mark as read');
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'decision read');
  console.log('ELECTRON_TASK_APPROVAL_NOTIFICATION_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_DIRECTORY_CREATE==='1'){
  const firstScope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  if(!/^[0-9a-f-]{36}$/.test(firstScope.organizationId))throw Error('Invalid QA organization.');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'",'dashboard');
  if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
  await poll("!!document.querySelector('[aria-label=\"Add to Directory\"]:not(:disabled)')",'directory menu');
  await run("document.querySelector('[aria-label=\"Add to Directory\"]').click()");
  await click('Add person');
  await poll("!!document.querySelector('[role=dialog][aria-label=\"Add person\"]')",'original person form');
  await fill('[role=dialog][aria-label=\"Add person\"] input[id]', 'QA_CREATED_PERSON');
  await run("(()=>{const e=document.querySelectorAll('[role=dialog][aria-label=\"Add person\"] input')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Engineer');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await run("document.querySelector('[role=dialog][aria-label=\"Add person\"] form').requestSubmit()");
  await poll("!document.querySelector('[role=dialog][aria-label=\"Add person\"]')&&document.querySelector('#authenticated-dashboard-people')?.innerText.includes('QA_CREATED_PERSON')",'confirmed person created');
  await poll("window.codexDesktop.scopedPreferences.read('pending-directory-person').then(x=>x==='null')",'person creation confirmed');
  await run("document.querySelector('[aria-label=\"Add to Directory\"]').click()");
  await click('Add person');
  await poll("!!document.querySelector('[role=dialog][aria-label=\"Add person\"]')",'original person form reopened');
  await fill('[role=dialog][aria-label=\"Add person\"] input[id]', 'QA_RETRY_PERSON');
  await run("(()=>{const e=document.querySelectorAll('[role=dialog][aria-label=\"Add person\"] input')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Designer');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await capture('directory-person-form');
  dropNextDirectoryCreate=true;
  await run("document.querySelector('[role=dialog][aria-label=\"Add person\"] form').requestSubmit()");
  await poll("document.body.innerText.includes('Person creation could not be confirmed.')",'lost creation response');
  if(!(await run("window.codexDesktop.scopedPreferences.read('pending-directory-person').then(x=>x&&JSON.parse(x)?.name==='QA_RETRY_PERSON')")))throw Error('Pending person not saved.');
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
  await poll("!!document.querySelector('#authenticated-dashboard-people')",'other workspace directory');
  if(await run("document.querySelector('#authenticated-dashboard-people').innerText.includes('QA_RETRY_PERSON')||window.codexDesktop.scopedPreferences.read('pending-directory-person').then(x=>!!x&&x!=='null')"))throw Error('Person or pending request exposed to other account.');
  const memberId=await run("window.codexDesktop.account.snapshot().then(s=>s.user.id)");
  if(!/^[0-9a-f-]{36}$/.test(memberId))throw Error('Invalid QA member.');
  execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${firstScope.organizationId}','${memberId}','member')`],{stdio:'ignore'});
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(firstScope.organizationId)}})`);
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
  await poll("document.querySelector('#authenticated-dashboard-people')?.innerText.includes('QA_RETRY_PERSON')",'member sees authorized directory');
  await run("document.querySelector('[aria-label=\"Add to Directory\"]').click()");
  await poll("[...document.querySelectorAll('[role=menuitem]')].some(x=>x.textContent.includes('Add person')&&(x.disabled||x.getAttribute('aria-disabled')==='true'))",'member cannot add person');
  await signOut();await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'owner restored');
  console.log('ELECTRON_DIRECTORY_CREATE_SETUP_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_GLOBAL_TABS==='1'){
  await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace rail');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'",'dashboard tab');
  await run("document.querySelector('[aria-label=\"Schedule\"]').click()");
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='schedule'",'schedule tab');
  await run("(()=>{const tabs=[...document.querySelectorAll('.global-topbar [role=tab]')],schedule=tabs.find(x=>x.innerText.includes('Schedule')).closest('.global-tab'),dashboard=tabs.find(x=>x.innerText.includes('Dashboard')).closest('.global-tab');schedule.dispatchEvent(new DragEvent('dragstart',{bubbles:true}));dashboard.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}));})()");
  await poll("window.codexDesktop.scopedPreferences.read('tabs').then(x=>x&&JSON.parse(x).tabs.some(t=>t.destination.view==='dashboard')&&JSON.parse(x).active===JSON.parse(x).tabs.find(t=>t.destination.view==='schedule')?.id)",'tabs saved');
  await poll("window.codexDesktop.scopedPreferences.read('tabs').then(x=>{if(!x)return false;const t=JSON.parse(x).tabs;return t.findIndex(v=>v.destination.view==='schedule')<t.findIndex(v=>v.destination.view==='dashboard')})",'tab order saved');
  const savedA=await run("window.codexDesktop.scopedPreferences.read('tabs')");
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  if(await run("window.codexDesktop.scopedPreferences.read('tabs').then(x=>x&&JSON.parse(x).tabs.some(t=>t.destination.view==='schedule'||t.destination.view==='dashboard'))"))throw Error('A tabs exposed to B.');
  await signOut();await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='schedule'",'A selected tab restored');
  const restored=await run("window.codexDesktop.scopedPreferences.read('tabs')");
  if(JSON.stringify(JSON.parse(savedA).tabs)!==JSON.stringify(JSON.parse(restored).tabs))throw Error('A tab ordering changed after account switch.');
  await capture('scoped-global-tabs');
  console.log('ELECTRON_GLOBAL_TABS_ABA_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_CHANNEL_UI==='1'){
  const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8'}).trim();
  const valid=id=>{if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid QA identity.');return id;};
  const ascope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(ascope.userId);valid(ascope.organizationId);
  const openBusiness=async()=>{
   await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace rail');
   await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
   await poll("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'",'dashboard');
   if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
   await poll("document.querySelector('.shell')?.dataset.sidebar==='expanded'",'business sidebar');
  };
  const createChannel=async(name,visibility)=>{
   await poll("!!document.querySelector('[aria-label=\"Create channel\"]:not(:disabled)')",'create channel');
   await run("document.querySelector('[aria-label=\"Create channel\"]').click()");
   await fill('[aria-label=\"Channel name\"]',name);
   await run(`(()=>{const e=document.querySelector('[aria-label="Channel visibility"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(visibility)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await click('Create channel');
   await poll("!document.querySelector('[role=\"dialog\"][aria-labelledby=\"gw-inbox-create-title\"]')",'channel created');
   await poll(`document.querySelector('#authenticated-dashboard-channels')?.innerText.includes(${JSON.stringify(name)})`,'new channel in sidebar');
  };
  const openChannel=async(name)=>{
   await poll(`document.querySelector('#authenticated-dashboard-channels')?.innerText.includes(${JSON.stringify(name)})`,'channel in sidebar');
   await run(`[...document.querySelectorAll('#authenticated-dashboard-channels button')].find(x=>x.textContent.includes(${JSON.stringify(name)})).click()`);
   await poll(`document.querySelector('.workspace')?.dataset.workspaceView==='inbox'&&document.querySelector('.gw-msg-header')?.innerText.includes(${JSON.stringify(name)})`,'channel opened');
  };
  const sendChannel=async(text)=>{
   await fill('[aria-label=\"Write a message\"]',text);
   await poll("!!document.querySelector('.gw-msg-send-button:not(:disabled)')",'channel send ready');
   await run("document.querySelector('.gw-msg-send-button').click()");
   await poll(`document.querySelector('.gw-msg-feed')?.innerText.includes(${JSON.stringify(text)})`,'channel message saved');
  };
  let suspendedMember;
  if(process.env.AUTH_QA_CHANNEL_CREATE_REVOKE==='1'){
   await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
   suspendedMember=valid(await run("window.codexDesktop.account.snapshot().then(s=>s.user.id)"));
   psql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${ascope.organizationId}','${suspendedMember}','member'); insert into gwira.employees(organization_id,user_id,name) values ('${ascope.organizationId}','${suspendedMember}','QA_RETRY_MEMBER')`);
   await signOut();await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  }
  await openBusiness();
  if(process.env.AUTH_QA_CHANNEL_CREATE_SETUP==='1'){
   dropNextChannelCreate=true;
   await poll("!!document.querySelector('[aria-label=\"Create channel\"]:not(:disabled)')",'create channel');
   await run("document.querySelector('[aria-label=\"Create channel\"]').click()");
   await fill('[aria-label=\"Channel name\"]','QA_CREATE_RECOVERY');
   if(suspendedMember){
    await poll("[...document.querySelectorAll('.gw-inbox-person-option')].some(x=>x.textContent.includes('QA_RETRY_MEMBER'))",'member available');
    await run("[...document.querySelectorAll('.gw-inbox-person-option')].find(x=>x.textContent.includes('QA_RETRY_MEMBER')).click()");
   }
   await click('Create channel');
   await poll("document.body.innerText.includes('Channel creation could not be confirmed.')",'channel creation response loss');
   if(!(await run("window.codexDesktop.scopedPreferences.read('pending-channel-create').then(x=>x&&JSON.parse(x)?.name==='QA_CREATE_RECOVERY')")))throw Error('Pending channel creation was not saved.');
   if(suspendedMember)psql(`update gwira.organization_memberships set status='suspended' where organization_id='${ascope.organizationId}' and user_id='${suspendedMember}'`);
   console.log('ELECTRON_CHANNEL_CREATE_SETUP_PASSED');app.exit(0);return;
  }
  await createChannel('QA_TEAM_CHANNEL','org');
  await createChannel('QA_PRIVATE_CHANNEL','private');
  await run("document.querySelector('[aria-label=\"Channels options\"]').click()");
  await poll("[...document.querySelectorAll('[role=\"menuitemradio\"]')].some(x=>x.textContent.trim()==='Alphabetical'&&!x.disabled)",'channel sort ready');
  await click('Alphabetical');
  await poll("window.codexDesktop.scopedPreferences.read('business-channels').then(x=>x&&JSON.parse(x).sort==='name')",'channel sort saved');
  await capture('channels-sidebar');
  await openChannel('QA_TEAM_CHANNEL');
  await sendChannel('QA_CHANNEL_FIRST');
  dropNextChannelSend=true;
  await fill('[aria-label=\"Write a message\"]','QA_CHANNEL_RETRY');
  await poll("!!document.querySelector('.gw-msg-send-button:not(:disabled)')",'retry send ready');
  await run("document.querySelector('.gw-msg-send-button').click()");
  await poll("!!document.querySelector('.gw-msg-retry-button:not(:disabled)')",'unconfirmed channel send');
  await run("document.querySelector('.gw-msg-retry-button').click()");
  await poll("document.querySelector('.gw-msg-feed')?.innerText.includes('QA_CHANNEL_RETRY')",'retried channel message');
  if(psql(`select count(*) from gwira.channel_messages where organization_id='${ascope.organizationId}' and body='QA_CHANNEL_RETRY'`)!=='1')throw Error('Retry duplicated channel message.');
  await capture('channels-conversation');
  window.setContentSize(900,700);
  await wait(600);
  await poll("document.querySelector('[data-testid=\"inbox-workspace\"]')?.dataset.layout==='master-detail'&&!!document.querySelector('[aria-label=\"Back to conversations\"]')&&!!document.querySelector('[aria-label=\"Write a message\"]')",'narrow channel detail');
  if(!(await run(`(()=>{const pane=document.querySelector('.gw-inbox-main').getBoundingClientRect(),title=document.querySelector('.gw-msg-header__title'),composer=document.querySelector('[aria-label="Write a message"]'),a=title.getBoundingClientRect(),b=composer.getBoundingClientRect();return a.width>80&&a.left>=pane.left&&a.right<=pane.right&&b.left>=pane.left&&b.right<=pane.right&&b.bottom<=innerHeight;})()`)))throw Error('Narrow channel title or composer is clipped.');
  await run("document.querySelector('[aria-label=\"Back to conversations\"]').click()");
  await poll("!!document.querySelector('.gw-inbox-master:not(.is-hidden)')&&!!document.querySelector('.gw-inbox-main.is-hidden')",'narrow channel navigation');
  await poll("[...document.querySelectorAll('.gw-inbox-master .gw-msg-nav__conversation-row')].some(x=>x.textContent.includes('QA_TEAM_CHANNEL'))",'narrow channel list');
  await run("[...document.querySelectorAll('.gw-inbox-master .gw-msg-nav__conversation-row')].find(x=>x.textContent.includes('QA_TEAM_CHANNEL')).click()");
  await poll("!!document.querySelector('[aria-label=\"Back to conversations\"]')",'narrow channel reopened');
  window.setContentSize(1440,900);
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  const bscope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(bscope.userId);valid(bscope.organizationId);
  psql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${ascope.organizationId}','${bscope.userId}','member')`);
  await openBusiness();
  if(await run("document.querySelector('#authenticated-dashboard-channels')?.innerText.includes('QA_TEAM_CHANNEL')"))throw Error('Channel exposed in foreign workspace.');
  if(await run("window.codexDesktop.scopedPreferences.read('business-channels').then(x=>x&&JSON.parse(x).sort==='name')"))throw Error('Channel sort preference exposed to another account.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(ascope.organizationId)}})`);
  await openBusiness();
  await poll("document.querySelector('#authenticated-dashboard-channels')?.innerText.includes('QA_TEAM_CHANNEL')",'shared channel visible');
  if(await run("document.querySelector('#authenticated-dashboard-channels')?.innerText.includes('QA_PRIVATE_CHANNEL')"))throw Error('Private channel exposed to B.');
  await openChannel('QA_TEAM_CHANNEL');
  await poll("document.querySelector('.gw-msg-feed')?.innerText.includes('QA_CHANNEL_FIRST')",'shared message visible');
  await click('Join channel');
  await poll("!!document.querySelector('[aria-label=\"Write a message\"]')",'joined channel composer');
  await sendChannel('QA_CHANNEL_REPLY');
  await signOut();await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  await openBusiness();
  await poll("(()=>{const t=document.querySelector('#authenticated-dashboard-channels')?.innerText||'';return t.includes('QA_PRIVATE_CHANNEL')&&t.indexOf('QA_PRIVATE_CHANNEL')<t.indexOf('QA_TEAM_CHANNEL')})()",'channel sort restored after account switch');
  await openChannel('QA_TEAM_CHANNEL');
  await poll("document.querySelector('.gw-msg-feed')?.innerText.includes('QA_CHANNEL_REPLY')",'reply after account switch');
  console.log('ELECTRON_CHANNEL_UI_ABA_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_CHANNEL_SERVICE==='1'){
  const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8'}).trim();
  const valid=id=>{if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid QA identity.');return id;};
  const ascope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(ascope.userId);valid(ascope.organizationId);
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  const bscope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(bscope.userId);valid(bscope.organizationId);
  psql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${ascope.organizationId}','${bscope.userId}','member')`);
  const raw=execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const env=Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=/^([A-Z_]+)="(.*)"$/.exec(line);return m?[[m[1],m[2]]]:[];}));
  const url=new URL(env.API_URL);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local Supabase required.');
  const token=async account=>{
   const response=await actualFetch(`${url.origin}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:env.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
   if(!response.ok)throw Error('QA authentication failed.');
   return (await response.json()).access_token;
  };
  const atoken=await token(accounts[0]),btoken=await token(accounts[1]);
  const api=async (accessToken,route,body)=>actualFetch(`${url.origin}/rest/v1/${route}`,{method:body===undefined?'GET':'POST',headers:{apikey:env.ANON_KEY,authorization:`Bearer ${accessToken}`,'Content-Type':'application/json','Content-Profile':'gwira','Accept-Profile':'gwira'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const rpc=(accessToken,name,body)=>api(accessToken,`rpc/${name}`,body);
  const pub=randomUUID(),priv=randomUUID(),invited=randomUUID(),message=randomUUID();
  const publicInput={p_org:ascope.organizationId,p_id:pub,p_name:'QA public',p_topic:'QA',p_visibility:'org',p_members:[]};
  const privateInput={...publicInput,p_id:priv,p_name:'QA private',p_visibility:'private'};
  if(!(await rpc(atoken,'create_channel',publicInput)).ok||!(await rpc(atoken,'create_channel',publicInput)).ok)throw Error('Public channel create or retry failed.');
  if(!(await rpc(atoken,'create_channel',privateInput)).ok)throw Error('Private channel create failed.');
  if(!(await rpc(atoken,'create_channel',{...privateInput,p_id:invited,p_name:'QA invited',p_members:[bscope.userId]})).ok)throw Error('Invited private channel create failed.');
  if((await rpc(atoken,'create_channel',{...privateInput,p_id:randomUUID(),p_members:[randomUUID()]})).ok)throw Error('Foreign channel participant accepted.');
  if((await rpc(atoken,'create_channel',{...publicInput,p_name:'Changed'})).ok)throw Error('Conflicting channel retry succeeded.');
  const bchannels=await api(btoken,`channels?select=id&organization_id=eq.${ascope.organizationId}`);
  const visible=await bchannels.json();
  if(!bchannels.ok||!visible.some(row=>row.id===pub)||!visible.some(row=>row.id===invited)||visible.some(row=>row.id===priv))throw Error('Channel visibility isolation failed.');
  if((await rpc(btoken,'join_channel',{p_org:ascope.organizationId,p_channel:priv})).ok)throw Error('Private channel join was allowed.');
  if((await rpc(btoken,'send_channel_message',{p_org:ascope.organizationId,p_channel:pub,p_id:message,p_body:'QA channel message'})).ok)throw Error('Nonmember posted to channel.');
  if(!(await rpc(btoken,'join_channel',{p_org:ascope.organizationId,p_channel:pub})).ok)throw Error('Public channel join failed.');
  const send={p_org:ascope.organizationId,p_channel:pub,p_id:message,p_body:'QA channel message'};
  if(!(await rpc(btoken,'send_channel_message',send)).ok||!(await rpc(btoken,'send_channel_message',send)).ok)throw Error('Channel message or retry failed.');
  if((await rpc(btoken,'send_channel_message',{...send,p_body:'Changed'})).ok)throw Error('Conflicting channel message retry succeeded.');
  if(psql(`select count(*) from gwira.channel_messages where channel_id='${pub}'`)!=='1')throw Error('Channel message was duplicated.');
  const amessages=await api(atoken,`channel_messages?select=body&channel_id=eq.${pub}`);
  if(!amessages.ok||!(await amessages.json()).some(row=>row.body==='QA channel message'))throw Error('Channel message not visible to member.');
  const summaries=await rpc(atoken,'list_channels',{p_org:ascope.organizationId});
  const summary=(await summaries.json()).find(row=>row.id===pub);
  if(!summaries.ok||summary?.unread!==1||summary.member_count!==2||!summary.is_member)throw Error('Channel unread summary incorrect.');
  if(!(await rpc(atoken,'update_channel_preference',{p_org:ascope.organizationId,p_channel:pub,p_muted:true,p_mark_read:true})).ok)throw Error('Channel preferences failed.');
  const readSummaries=await rpc(atoken,'list_channels',{p_org:ascope.organizationId});
  const readSummary=(await readSummaries.json()).find(row=>row.id===pub);
  if(!readSummaries.ok||readSummary?.unread!==0||!readSummary.muted)throw Error('Channel preference summary incorrect.');
  const members=await api(btoken,`channel_members?select=user_id,muted&channel_id=eq.${pub}`);
  const rows=await members.json();
  if(!members.ok||rows.length!==1||rows[0].user_id!==bscope.userId||rows[0].muted)throw Error('Another member’s channel preferences were exposed.');
  if((await rpc(btoken,'join_channel',{p_org:bscope.organizationId,p_channel:pub})).ok)throw Error('Foreign workspace channel accepted.');
  const ipcChannel=randomUUID(),ipcMessage=randomUUID();
  await run(`window.codexDesktop.channels.request({type:'create',id:${JSON.stringify(ipcChannel)},name:'QA IPC channel',topic:'',visibility:'private',members:[]},${JSON.stringify(bscope)})`);
  await run(`window.codexDesktop.channels.request({type:'send',id:${JSON.stringify(ipcChannel)},messageId:${JSON.stringify(ipcMessage)},body:'QA IPC message'},${JSON.stringify(bscope)})`);
  if(!(await run(`window.codexDesktop.channels.request({type:'messages',id:${JSON.stringify(ipcChannel)}},${JSON.stringify(bscope)}).then(rows=>rows.some(row=>row.body==='QA IPC message'))`)))throw Error('Trusted channel IPC did not persist the message.');
  if(!(await run(`window.codexDesktop.channels.request({type:'list'},${JSON.stringify(bscope)}).then(rows=>rows.some(row=>row.id===${JSON.stringify(ipcChannel)}))`)))throw Error('Trusted channel IPC did not list the channel.');
  if(!(await run(`window.codexDesktop.channels.request({type:'list'},${JSON.stringify(ascope)}).then(()=>false,()=>true)`)))throw Error('Stale channel workspace context accepted.');
  if(psql("select has_table_privilege('authenticated','gwira.channels','insert,update,delete') or has_table_privilege('authenticated','gwira.channel_members','insert,update,delete') or has_table_privilege('authenticated','gwira.channel_messages','insert,update,delete')")!=='f')throw Error('Direct channel mutations are permitted.');
  psql(`update gwira.organization_memberships set status='suspended' where organization_id='${ascope.organizationId}' and user_id='${bscope.userId}'`);
  const suspended=await api(btoken,`channels?select=id&organization_id=eq.${ascope.organizationId}`);
  if(!suspended.ok||(await suspended.json()).length!==0)throw Error('Suspended member read channels.');
  if((await rpc(btoken,'send_channel_message',{...send,p_id:randomUUID()})).ok)throw Error('Suspended member posted to channel.');
  if((await rpc(btoken,'list_channels',{p_org:ascope.organizationId})).ok)throw Error('Suspended member listed channels.');
  console.log('ELECTRON_CHANNEL_SERVICE_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_ROLE_NOTIFICATION==='1'){
  const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8'}).trim();
  const valid=id=>{if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid QA identity.');return id;};
  const ascope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(ascope.userId);valid(ascope.organizationId);
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  const bscope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(bscope.userId);valid(bscope.organizationId);
  psql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${ascope.organizationId}','${bscope.userId}','member')`);
  const raw=execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const env=Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=/^([A-Z_]+)="(.*)"$/.exec(line);return m?[[m[1],m[2]]]:[];}));
  const url=new URL(env.API_URL);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local Supabase required.');
  const token=async account=>{
   const response=await actualFetch(`${url.origin}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:env.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
   if(!response.ok)throw Error('QA authentication failed.');
   return (await response.json()).access_token;
  };
  const role=async (accessToken,newRole)=>actualFetch(`${url.origin}/rest/v1/rpc/change_member_role`,{method:'POST',headers:{apikey:env.ANON_KEY,authorization:`Bearer ${accessToken}`,'Content-Type':'application/json','Content-Profile':'gwira'},body:JSON.stringify({p_org:ascope.organizationId,p_user:bscope.userId,p_role:newRole})});
  const atoken=await token(accounts[0]),btoken=await token(accounts[1]);
  if((await role(btoken,'admin')).ok)throw Error('Non-owner changed a role.');
  if(!(await role(atoken,'admin')).ok)throw Error('Owner role change failed.');
  if(!(await role(atoken,'admin')).ok)throw Error('Repeated role request failed.');
  if(psql(`select count(*) from gwira.notifications where organization_id='${ascope.organizationId}' and recipient_id='${bscope.userId}' and title='Workspace role changed'`)!=='1')throw Error('Role change notification missing or duplicated.');
  if(psql(`select count(*) from gwira.notifications where organization_id='${ascope.organizationId}' and recipient_id='${ascope.userId}' and title='Workspace role changed'`)!=='0')throw Error('Role notification exposed to another member.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(ascope.organizationId)}})`);
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'shared workspace');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('Your role in this workspace was changed to admin.')",'real role notification');
  await capture('notification-role-change');
  await click('Mark as read');
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'role notification marked read');
  await signOut();await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'owner notification control');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('No notifications yet.')",'owner cannot see recipient notification');
  await signOut();await fill('input[type=email]',accounts[1].email);await fill('input[autocomplete=current-password]',accounts[1].password);await submit();
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'recipient notification control');
  const activeOrg=await run("window.codexDesktop.account.snapshot().then(s=>s.activeOrganization?.id)");
  if(activeOrg!==ascope.organizationId)await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(ascope.organizationId)}})`);
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'recipient shared workspace');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('Workspace role changed')&&document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'recipient read state after switching');
  console.log('ELECTRON_ROLE_NOTIFICATION_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_DIRECTORY==='1'){
  const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8'}).trim();
  const valid=id=>{if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid QA identity.');return id;};
  const ascope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(ascope.userId);valid(ascope.organizationId);
  const employee=randomUUID(),secondEmployee=randomUUID();
  psql(`insert into gwira.employees(id,organization_id,name,job_title) values ('${employee}','${ascope.organizationId}','QA_DIRECTORY_PERSON','QA engineer'),('${secondEmployee}','${ascope.organizationId}','QA_DIRECTORY_SECOND','QA analyst')`);
  const openDirectory=async()=>{
   await poll("!!document.querySelector('[aria-label=\"Workspace\"]')",'workspace rail');
   await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
   await poll("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'&&!!document.querySelector('.dashboard-sidebar')",'business sidebar');
   if(await run("document.querySelector('.shell')?.dataset.sidebar!=='expanded'"))await run("document.querySelector('[aria-label=\"Expand sidebar\"]').click()");
   await poll("document.querySelector('.shell')?.dataset.sidebar==='expanded'",'business sidebar expanded');
  };
  await openDirectory();
  await poll("document.querySelector('#authenticated-dashboard-people')?.innerText.includes('QA_DIRECTORY_PERSON')",'authorized directory person');
  console.log('DIRECTORY_QA_PERSON_VISIBLE');
  await run("(()=>{const row=[...document.querySelectorAll('#authenticated-dashboard-people .dashboard-sidebar__row')].find(x=>x.textContent.includes('QA_DIRECTORY_PERSON'));row.focus();row.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));})()");
  if(!(await run("document.activeElement?.textContent.includes('QA_DIRECTORY_SECOND')")))throw Error('Directory keyboard navigation did not move to the next person.');
  await capture('directory-person');
  await run("[...document.querySelectorAll('#authenticated-dashboard-people .dashboard-sidebar__row')].find(x=>x.textContent.includes('QA_DIRECTORY_PERSON')).click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"QA_DIRECTORY_PERSON\"]')?.innerText.includes('QA engineer')",'person details');
  await run("document.querySelector('[role=\"dialog\"][aria-label=\"QA_DIRECTORY_PERSON\"] [aria-label=\"Close dialog\"]').click()");
  await run("document.querySelector('[aria-label=\"More actions for QA_DIRECTORY_PERSON\"]').click()");await click('Pin');
  await poll("document.querySelector('#authenticated-dashboard-pinned')?.innerText.includes('QA_DIRECTORY_PERSON')",'person pinned');
  console.log('DIRECTORY_QA_PINNED');
  if(psql(`select count(*) from gwira.directory_pins where user_id='${ascope.userId}' and employee_id='${employee}'`)!=='1')throw Error('Directory pin was not saved.');
  await capture('directory-pinned');
  await run("document.querySelector('[aria-controls=\"authenticated-dashboard-people\"]').click()");
  await poll("document.querySelector('#authenticated-dashboard-people')?.hidden",'directory collapsed');
  await run("window.__qaBusinessSidebar=document.querySelector('.dashboard-sidebar');document.querySelector('[aria-label=\"Toggle conversations\"]').click()");
  await poll("document.querySelector('.workspace')?.dataset.workspaceView==='home'",'Home after collapsing directory');
  await openDirectory();
  if(!(await run("window.__qaBusinessSidebar===document.querySelector('.dashboard-sidebar')&&document.querySelector('#authenticated-dashboard-people')?.hidden")))throw Error('Navigating away reset the business sidebar.');
  await poll(`window.codexDesktop.scopedPreferences.read('business-sidebar',${JSON.stringify(ascope)}).then(raw=>raw&&JSON.parse(raw).people===false)`,'directory section preference saved');
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  const bscope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(bscope.userId);valid(bscope.organizationId);
  psql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${ascope.organizationId}','${bscope.userId}','member')`);
  await openDirectory();
  console.log('DIRECTORY_QA_B_WORKSPACE');
  if(await run("document.querySelector('.dashboard-sidebar').innerText.includes('QA_DIRECTORY_PERSON')"))throw Error('A directory exposed in B workspace.');
  if(!(await run(`window.codexDesktop.directory.request({type:'pin',id:${JSON.stringify(employee)},pinned:true},${JSON.stringify(bscope)}).then(()=>false,()=>true)`)))throw Error('B pinned foreign directory entry.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(ascope.organizationId)}})`);
  await openDirectory();
  console.log('DIRECTORY_QA_B_SHARED');
  if(await run("document.querySelector('#authenticated-dashboard-people')?.hidden"))throw Error('A section preference exposed to B.');
  await poll("document.querySelector('#authenticated-dashboard-people')?.innerText.includes('QA_DIRECTORY_PERSON')",'shared directory person');
  if(await run("document.querySelector('#authenticated-dashboard-pinned').innerText.includes('QA_DIRECTORY_PERSON')"))throw Error('A pin exposed to B.');
  if(!(await run(`window.codexDesktop.directory.request({type:'list'},${JSON.stringify(ascope)}).then(()=>false,()=>true)`)))throw Error('Stale A directory scope accepted.');
  await signOut();await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);delayNextRestore=true;await submit();
  await openDirectory();
  for(let i=0;i<100&&!restoreHeld;i++)await wait(100);
  if(!restoreHeld)throw Error('Initial conversation restoration was not delayed.');
  for(let i=0;i<100&&!restoreReleased;i++)await wait(100);
  if(!restoreReleased)throw Error('Initial conversation restoration did not resume.');
  console.log('DIRECTORY_QA_A_RESTORED');
  await poll("document.querySelector('#authenticated-dashboard-people')?.hidden",'A section preference restored');
  await run("document.querySelector('[aria-controls=\"authenticated-dashboard-people\"]').click()");
  await poll("document.querySelector('#authenticated-dashboard-pinned')?.innerText.includes('QA_DIRECTORY_PERSON')",'A pin after account switch');
  await wait(500);
  if(!(await run("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'")))throw Error('Initial conversation restoration overrode Dashboard navigation.');
  await run("document.querySelector('[aria-label=\"More actions for QA_DIRECTORY_PERSON\"]').click()");await click('Unpin');
  await poll("document.querySelector('#authenticated-dashboard-people')?.innerText.includes('QA_DIRECTORY_PERSON')",'unpin person');
  if(!(await run("document.querySelector('.workspace')?.dataset.workspaceView==='dashboard'")))throw Error('Dashboard navigation was overridden after account restoration.');
  console.log('DIRECTORY_QA_UNPINNED');
  await wait(500);
  await run("document.querySelector('[aria-label=\"More actions for QA_DIRECTORY_PERSON\"]').click()");await click('Pin');
  await poll("document.querySelector('#authenticated-dashboard-pinned')?.innerText.includes('QA_DIRECTORY_PERSON')",'repin person');
  await run("document.querySelector('[aria-controls=\"authenticated-dashboard-pinned\"]').click()");
  await poll(`window.codexDesktop.scopedPreferences.read('business-sidebar',${JSON.stringify(ascope)}).then(raw=>raw&&JSON.parse(raw).pinned===false)`,'pinned section preference saved');
  console.log('ELECTRON_DIRECTORY_ABA_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_NOTIFICATIONS==='1'){
  const psql=sql=>execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8'}).trim();
  const valid=id=>{if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid QA identity.');return id;};
  const ascope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(ascope.userId);valid(ascope.organizationId);
  const aid=randomUUID(),bid=randomUUID(),otherId=randomUUID();
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('No notifications yet.')",'empty notifications');
  psql(`set role service_role; insert into gwira.notifications(id,organization_id,recipient_id,title,body) values ('${aid}','${ascope.organizationId}','${ascope.userId}','QA_NOTIFICATION_A','QA A notification body')`);
  await wait(31000);
  await poll("document.querySelector('.global-topbar button[title=\"Notifications\"]')?.getAttribute('aria-label')==='Notifications, 1 pending'",'automatic notification refresh');
  await click('Refresh');
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('QA_NOTIFICATION_A')",'notification record');
  await poll("document.querySelector('.global-topbar button[title=\"Notifications\"]')?.getAttribute('aria-label')==='Notifications, 1 pending'",'unread badge');
  await capture('notifications-unread');
  await poll("!![...document.querySelectorAll('[role=\"dialog\"][aria-label=\"Notifications\"] button')].find(x=>x.textContent.trim()==='Refresh'&&!x.disabled)",'notification refresh idle');
  await wait(2000);
  failNextNotifications=true;await click('Refresh');
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"] [role=\"alert\"]')?.innerText.includes('could not be loaded')",'notification network failure');
  await click('Refresh');
  await poll("!document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"] [role=\"alert\"]')&&document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('QA_NOTIFICATION_A')",'notification refresh retry');
  await click('Mark as read');
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'mark notification read');
  if(psql(`select (read_at is not null)::text from gwira.notifications where id='${aid}'`)!=='true')throw Error('Notification read state was not saved.');
  await capture('notifications-read');
  await click('Open Inbox');
  await poll("document.querySelector('.workspace').dataset.workspaceView==='inbox'&&!document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')",'notifications Inbox navigation');
  await signOut();await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  const bscope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  valid(bscope.userId);valid(bscope.organizationId);
  psql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${ascope.organizationId}','${bscope.userId}','member'); insert into gwira.notifications(id,organization_id,recipient_id,title,body) values ('${bid}','${ascope.organizationId}','${bscope.userId}','QA_NOTIFICATION_B','QA B notification body'),('${otherId}','${bscope.organizationId}','${bscope.userId}','QA_NOTIFICATION_OTHER','QA other workspace body')`);
  if(psql("select has_table_privilege('authenticated','gwira.notifications','insert') or has_table_privilege('authenticated','gwira.notifications','update') or has_table_privilege('authenticated','gwira.notifications','delete')")!=='f')throw Error('Authenticated users can modify notification rows directly.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(ascope.organizationId)}})`);
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'B shared workspace');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('QA_NOTIFICATION_B')",'B notification');
  if(await run("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]').innerText.includes('QA_NOTIFICATION_A')"))throw Error('A notification exposed to B in the same organization.');
  const sharedB={userId:bscope.userId,organizationId:ascope.organizationId};
  if(!(await run(`window.codexDesktop.notifications.request({type:'mark_read',id:${JSON.stringify(aid)}},${JSON.stringify(sharedB)}).then(()=>false,()=>true)`)))throw Error('B marked A notification read.');
  if(!(await run(`window.codexDesktop.notifications.request({type:'mark_read',id:${JSON.stringify(otherId)}},${JSON.stringify(sharedB)}).then(()=>false,()=>true)`)))throw Error('B marked a notification in another workspace.');
  if(psql(`select (read_at is null)::text from gwira.notifications where id='${otherId}'`)!=='true')throw Error('Other workspace notification was changed.');
  if(!(await run(`window.codexDesktop.notifications.request({type:'list'},${JSON.stringify(ascope)}).then(()=>false,()=>true)`)))throw Error('Stale A notification context accepted for B.');
  await click('Mark as read');
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes(' · Read')",'B notification read');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(bscope.organizationId)}})`);
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'B original workspace');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('QA_NOTIFICATION_OTHER')",'other workspace notification');
  if(await run("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]').innerText.includes('QA_NOTIFICATION_B')"))throw Error('Shared workspace notification exposed in other workspace.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(ascope.organizationId)}})`);
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'shared workspace before revocation');
  psql(`update gwira.organization_memberships set status='suspended' where organization_id='${ascope.organizationId}' and user_id='${bscope.userId}'`);
  if(!(await run(`window.codexDesktop.notifications.request({type:'list'},${JSON.stringify(sharedB)}).then(()=>false,()=>true)`)))throw Error('Suspended member read notifications.');
  await run("window.codexDesktop.account.command({type:'sign_out'})");await poll("!!document.querySelector('input[type=email]:not(:disabled):not([readonly])')",'signed out after revocation');
  await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  await poll("!!document.querySelector('.global-topbar button[title=\"Notifications\"]')",'A notification control');
  await run("document.querySelector('.global-topbar button[title=\"Notifications\"]').click()");
  await poll("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]')?.innerText.includes('QA_NOTIFICATION_A')",'A notification after switching');
  if(await run("document.querySelector('[role=\"dialog\"][aria-label=\"Notifications\"]').innerText.includes('QA_NOTIFICATION_B')"))throw Error('B notification exposed to A.');
  console.log('ELECTRON_NOTIFICATIONS_ABA_PASSED');app.exit(0);return;
 }
 if(process.env.AUTH_QA_CHAT_ONLY==='1'){
  if(process.env.AUTH_QA_CHAT_LOAD_RETRY==='1'){
   await run("window.codexDesktop.scopedPreferences.write('global-chat',JSON.stringify({invalid:true}))");
   window.webContents.reload();
  }
  await poll("!!document.querySelector('[aria-label=\"Gwira Chat\"]:not(:disabled)')",'chat button');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  if(process.env.AUTH_QA_CHAT_LOAD_RETRY==='1'){
   await poll("!![...document.querySelectorAll('#gwira-assistant-panel button')].find(x=>x.textContent.trim()==='Retry loading Gwira Chat')",'chat loading error');
   await run("window.codexDesktop.scopedPreferences.write('global-chat',JSON.stringify({conversationId:null,draft:'',drafts:{},pending:null}))");
   await click('Retry loading Gwira Chat');
  }
  await poll("!!document.querySelector('#gwira-assistant-panel:not([hidden]) #gwira-assistant-input:not(:disabled)')",'open chat');
  await run("document.querySelector('#gwira-assistant-panel [aria-label=\"Conversation context and permissions\"]').click()");
  await poll("document.querySelector('[aria-label=\"Conversation context and permissions\"][role=\"dialog\"]')?.innerText.includes('Authorized workspace')",'authorized chat context');
  await run("document.querySelector('[aria-label=\"Conversation context and permissions\"][role=\"dialog\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await poll("!document.querySelector('[aria-label=\"Conversation context and permissions\"][role=\"dialog\"]')&&!document.querySelector('#gwira-assistant-panel').hidden&&document.activeElement?.getAttribute('aria-label')==='Conversation context and permissions'",'escape closes context without closing chat');
  await capture('global-chat-empty');
  await fill('#gwira-assistant-input','QA_SIDECHAT_A_PRIVATE');dropNextSend=true;
  await run("document.querySelector('[aria-label=\"Send message to Gwira\"]').click()");
  await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('Message not confirmed')",'chat unconfirmed send');
  await poll("!!document.querySelector('[aria-label=\"Retry message to Gwira\"]:not(:disabled)')",'chat retry ready');
  await run("document.querySelector('[aria-label=\"Retry message to Gwira\"]').click()");
  await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('QA_SIDECHAT_A_PRIVATE')",'chat saved message');
  if(aiService)await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('Test provider plan')",'chat test provider response');
  else await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('AI is unavailable: the trusted AI server is not configured.')",'chat AI unavailable');
  const aid=await run("window.codexDesktop.scopedPreferences.read('global-chat').then(raw=>JSON.parse(raw).conversationId)");
  const ascope=await run("window.codexDesktop.account.snapshot().then(s=>({userId:s.user.id,organizationId:s.activeOrganization.id}))");
  if((await run(`window.codexDesktop.conversations.request({type:'messages',id:${JSON.stringify(aid)}}).then(m=>m.filter(x=>x.content==='QA_SIDECHAT_A_PRIVATE').length)`))!==1)throw Error('Chat retry duplicated message.');
  await capture('global-chat-message');
  await fill('#gwira-assistant-input','QA_SIDECHAT_A_DRAFT');await wait(900);
  await run("document.querySelector('#gwira-assistant-panel [aria-label=\"Conversation sessions\"]').click()");
  await poll("!!document.querySelector('#gwira-assistant-panel .global-assistant__session')",'chat sessions');
  await fill('#gwira-assistant-panel [aria-label="Search conversations"]','QA_SIDECHAT_A_PRIVATE');
  await poll("document.querySelectorAll('#gwira-assistant-panel .global-assistant__session').length===1",'chat session search');
  await run("document.querySelector('#gwira-assistant-panel .global-assistant__session').focus();document.querySelector('#gwira-assistant-panel .global-assistant__session-list').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");
  await poll("document.activeElement?.classList.contains('global-assistant__session')",'chat session keyboard navigation');
  await fill('#gwira-assistant-panel [aria-label="Search conversations"]','');
  await run("document.querySelector('#gwira-assistant-panel [aria-label=\"New Gwira conversation\"]').click()");
  await poll("document.querySelector('#gwira-assistant-input')?.value===''",'new chat');
  await fill('#gwira-assistant-input','QA_SIDECHAT_NEW_DRAFT');
  await run("document.querySelector('#gwira-assistant-panel [aria-label=\"Conversation sessions\"]').click()");
  await poll("!![...document.querySelectorAll('#gwira-assistant-panel .global-assistant__session')].find(x=>x.textContent.includes('QA_SIDECHAT_A_PRIVATE'))",'saved chat in sessions');
  await run("[...document.querySelectorAll('#gwira-assistant-panel .global-assistant__session')].find(x=>x.textContent.includes('QA_SIDECHAT_A_PRIVATE')).click()");
  await poll("document.querySelector('#gwira-assistant-input')?.value==='QA_SIDECHAT_A_DRAFT'",'per-conversation draft restored');
  await run("document.querySelector('[aria-label=\"Workspace\"]').click()");
  await poll("document.querySelector('.workspace').dataset.workspaceView==='dashboard'&&!document.querySelector('#gwira-assistant-panel').hidden",'chat stays open across navigation');
  await run("document.querySelector('[aria-label=\"Workspace tools\"]').click()");
  await poll("document.querySelector('#gwira-assistant-panel').hidden&&!document.querySelector('.right-workspace').hidden",'workspace replaces chat');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  await poll("!document.querySelector('#gwira-assistant-panel').hidden&&document.querySelector('.right-workspace').hidden",'chat replaces workspace');
  await run("document.querySelector('[aria-label=\"Close Gwira Chat\"]').click()");
  await poll("document.querySelector('#gwira-assistant-panel')?.hidden&&document.activeElement?.getAttribute('aria-label')==='Gwira Chat'",'chat close focus');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  await poll("document.querySelector('#gwira-assistant-input')?.value==='QA_SIDECHAT_A_DRAFT'",'chat draft after reopen');
  await run("document.querySelector('[aria-label=\"Resize Gwira Chat\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
  await poll("Number(document.querySelector('[aria-label=\"Resize Gwira Chat\"]').getAttribute('aria-valuenow'))===412",'chat keyboard resize');
  await poll("window.codexDesktop.scopedPreferences.read('global-chat').then(x=>x&&JSON.parse(x).width===412)",'chat width saved');
  await signOut();
  await create(accounts[1],'QA_B_ONBOARDING_GOAL');
  await poll("!!document.querySelector('[aria-label=\"Gwira Chat\"]:not(:disabled)')",'B chat');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  await poll("!!document.querySelector('#gwira-assistant-input:not(:disabled)')",'B chat ready');
  if(await run("document.querySelector('[aria-label=\"Resize Gwira Chat\"]').getAttribute('aria-valuenow')!=='392'"))throw Error('A chat width exposed to B.');
  if(await run("document.querySelector('#gwira-assistant-panel').innerText.includes('QA_SIDECHAT_A_PRIVATE')||document.querySelector('#gwira-assistant-input').value.includes('QA_SIDECHAT_A_DRAFT')"))throw Error('A chat exposed to B.');
  if(!(await run(`window.codexDesktop.conversations.request({type:'messages',id:${JSON.stringify(aid)}}).then(()=>false,()=>true)`)))throw Error('B accessed A chat.');
  if(!(await run(`window.codexDesktop.scopedPreferences.write('global-chat',JSON.stringify({conversationId:null,draft:'QA_FOREIGN_WRITE',pending:null}),${JSON.stringify(ascope)}).then(()=>false,()=>true)`)))throw Error('Stale A preferences were written to B.');
  if(!(await run(`window.codexDesktop.conversations.request({type:'create',id:crypto.randomUUID(),title:'QA_FOREIGN_WRITE',visibility:'private'},${JSON.stringify(ascope)}).then(()=>false,()=>true)`)))throw Error('Stale A conversation was created in B.');
  await signOut();
  await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
  await poll("!!document.querySelector('[aria-label=\"Gwira Chat\"]:not(:disabled)')",'A chat restored');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('QA_SIDECHAT_A_PRIVATE')",'A chat after switching');
  await poll("document.querySelector('#gwira-assistant-input')?.value==='QA_SIDECHAT_A_DRAFT'",'A chat draft after switching');
  await poll("document.querySelector('[aria-label=\"Resize Gwira Chat\"]')?.getAttribute('aria-valuenow')==='412'",'A chat width after switching');
  const second=await run("window.codexDesktop.account.command({type:'create_organization',name:'QA A second workspace',requestId:crypto.randomUUID()}).then(s=>s.activeOrganization?.id)");
  if(!second||second===ascope.organizationId)throw Error('Second workspace creation failed.');
  await run("window.codexDesktop.account.command({type:'complete_setup',deferred:true})");
  await poll("!!document.querySelector('[aria-label=\"Gwira Chat\"]:not(:disabled)')",'second workspace chat');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  await poll("!!document.querySelector('#gwira-assistant-input:not(:disabled)')",'second workspace chat ready');
  if(await run("document.querySelector('#gwira-assistant-panel').innerText.includes('QA_SIDECHAT_A_PRIVATE')||document.querySelector('#gwira-assistant-input').value.includes('QA_SIDECHAT_A_DRAFT')"))throw Error('First workspace chat exposed to second workspace.');
  if(!(await run(`window.codexDesktop.scopedPreferences.write('global-chat',JSON.stringify({conversationId:null,draft:'QA_FOREIGN_WRITE',pending:null}),${JSON.stringify(ascope)}).then(()=>false,()=>true)`)))throw Error('Stale workspace preferences were written to second workspace.');
  await run(`window.codexDesktop.account.command({type:'switch',organizationId:${JSON.stringify(ascope.organizationId)}})`);
  await poll("!!document.querySelector('[aria-label=\"Gwira Chat\"]:not(:disabled)')",'first workspace chat restored');
  await run("document.querySelector('[aria-label=\"Gwira Chat\"]').click()");
  await poll("document.querySelector('#gwira-assistant-panel')?.innerText.includes('QA_SIDECHAT_A_PRIVATE')",'first workspace chat after switch');
  await poll("document.querySelector('#gwira-assistant-input')?.value==='QA_SIDECHAT_A_DRAFT'",'first workspace draft after switch');
  console.log('ELECTRON_GLOBAL_CHAT_ABA_PASSED');app.exit(0);return;
 }
 await conversationAction('Review plan');await poll("!!document.querySelector('.right-workspace:not([hidden]) [aria-label=\"Workspace Files\"]')",'plan review');
 await poll("document.querySelector('.right-workspace:not([hidden]) [aria-label=\"Authorized plan preview\"]').innerText.includes('QA_A_ONBOARDING_GOAL')",'plan content');
 await run("document.querySelector('[aria-label=\"Authorized plan preview\"] [aria-label=\"Markdown view mode\"] button:nth-child(2)').click()");
 await poll("!!document.querySelector('[aria-label=\"Authorized plan preview\"] pre.workspace-files__text')",'plan source');
 await run("document.querySelector('[aria-label=\"Authorized plan preview\"] [aria-label=\"Markdown view mode\"] button:nth-child(1)').click()");
 await poll("!document.querySelector('[aria-label=\"Authorized plan preview\"] pre.workspace-files__text')",'plan preview');
 await run('document.querySelector("button[aria-label=\\"Workspace tools\\"]").click()');await poll("!!document.querySelector('.right-workspace[hidden]')",'workspace toggle close');
 await run('document.querySelector("button[aria-label=\\"Workspace tools\\"]").click()');await poll("!!document.querySelector('.right-workspace:not([hidden]) [aria-label=\"Workspace Files\"]')",'workspace toggle open');
 if(process.env.AUTH_QA_SCREENSHOTS){await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});window.setContentSize(1440,900);await wait(300);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,'plan-1440x900.png'),(await window.webContents.capturePage()).toPNG());}
 await conversationAction('Close plan');
 await fill('#cloud-goal','QA_A_NORMAL_MESSAGE');dropNextSend=true;
 await run("document.querySelector('[aria-label=\"Send message\"]').click()");
 await poll("document.body.innerText.includes('Message not confirmed')",'lost response error');
 await poll("document.querySelector('#cloud-goal').value==='QA_A_NORMAL_MESSAGE'",'retained draft');
 if(process.env.AUTH_QA_SCREENSHOTS){await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});window.setContentSize(1440,900);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,'message-retry-1440x900.png'),(await window.webContents.capturePage()).toPNG());}
 await goal('QA_A_NORMAL_MESSAGE');
 if(aiService){
  if(process.env.AUTH_QA_AI_UNAVAILABLE==='1'){
   await poll("document.body.innerText.includes('AI is unavailable: the trusted AI provider is not configured.')",'unconfigured AI notice');
   if(aiCalls.length!==0)throw Error('Unconfigured AI reached the provider.');
   await click('Check response');
  }
  await poll("document.body.innerText.includes('Gwira is working')",'AI working');
  if(process.env.AUTH_QA_SCREENSHOTS){await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});window.setContentSize(1440,900);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,'test-provider-working-1440x900.png'),(await window.webContents.capturePage()).toPNG());}
  await poll("document.body.innerText.includes('Test provider plan')",'test provider response');
  if(aiCalls.length!==1)throw Error('Lost-message retry caused duplicate generation.');
  await click('Save as new plan version');await poll("document.querySelector('.right-workspace:not([hidden]) [aria-label=\"Authorized plan preview\"]')?.innerText.includes('Test provider plan')",'saved AI plan');
  if(process.env.AUTH_QA_SCREENSHOTS){for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w-1,h);await wait(150);window.setContentSize(w,h);await wait(500);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`test-provider-plan-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
  await run("document.querySelector('[aria-label=\"Authorized plan preview\"] [aria-label=\"Close Workspace tab\"]').click()");
  await poll("!document.querySelector('.right-workspace:not([hidden]) [aria-label=\"Workspace Files\"]')",'plan tab closed');
  await conversationAction('Close plan');await goal('QA_A_FOLLOWUP');
  await poll('document.querySelectorAll(".gw-assistant-response").length>=3','follow-up response');
  if(!aiCalls[1]?.history.some(item=>item.content==='QA_A_NORMAL_MESSAGE')||!aiCalls[1]?.plan?.includes('Test provider plan'))throw Error('Follow-up omitted authorized context.');
 }
 const duplicates=await run("(async()=>{const l=await window.codexDesktop.conversations.request({type:'list'});const m=await window.codexDesktop.conversations.request({type:'messages',id:l.conversations[0].id});return m.filter(x=>x.content==='QA_A_NORMAL_MESSAGE').length})()");
 if(duplicates!==1)throw Error('Retry duplicated the message.');
 await conversationAction('Pin');await conversationAction('Unpin');await conversationAction('Pin');
 await conversationAction('Rename');await fill('.cloud-home__rename input','QA A renamed conversation');await click('Save name');
 await poll("document.body.innerText.includes('QA A renamed conversation')",'rename');
 await run('document.querySelector("[aria-label=\\"Workspace\\"]").click()');
 await poll("document.querySelector('.workspace').dataset.workspaceView==='dashboard'",'dashboard with conversation tab');
 await run(`(()=>{const tabs=[...document.querySelectorAll('.global-tab')],dashboard=tabs.find(x=>x.textContent.trim()==='Dashboard'),conversation=tabs.find(x=>x.textContent.includes('QA A renamed'));if(!dashboard?.draggable||!conversation?.draggable)throw Error('Global view and conversation tabs must both be draggable');dashboard.dispatchEvent(new DragEvent('dragstart',{bubbles:true}));conversation.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}));})()`);
 await poll("[...document.querySelectorAll('.global-topbar__tabs--global [role=tab]')][1]?.textContent.includes('Dashboard')",'mixed global tab reorder');
 await run(`(()=>{const tabs=[...document.querySelectorAll('.global-tab')],dashboard=tabs.find(x=>x.textContent.trim()==='Dashboard'),conversation=tabs.find(x=>x.textContent.includes('QA A renamed'));conversation.dispatchEvent(new DragEvent('dragstart',{bubbles:true}));dashboard.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}));})()`);
 await poll("[...document.querySelectorAll('.global-topbar__tabs--global [role=tab]')][1]?.textContent.includes('QA A renamed')",'mixed tab order restored');
 await run("[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('QA A renamed conversation')).click()");
 await poll("document.querySelector('.workspace').dataset.workspaceView==='home'&&document.body.innerText.includes('QA_A_NORMAL_MESSAGE')",'conversation tab from dashboard');
 await run('document.querySelector("[aria-label=\\"Close Dashboard tab\\"]").click()');
 if(!(await run("document.querySelector('.workspace').dataset.workspaceView==='home'&&document.querySelector('[role=tab][aria-selected=true]').textContent.includes('QA A renamed conversation')")))throw Error('Closing an inactive view changed the conversation.');
 await run("document.querySelector('[role=tab]')?.click()");await poll("document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim()==='Home'",'Home tab');
 await run("[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('QA A renamed conversation')).click()");
 await poll("document.body.innerText.includes('QA_A_NORMAL_MESSAGE')",'conversation tab');
 await run('document.querySelector("[aria-label=\\"Toggle conversations\\"]").click()');
 await poll("document.body.innerText.includes('Pinned')",'sidebar pin');
 await poll("!!document.querySelector('[aria-label=\"Recent options\"]:not(:disabled)')",'sidebar preferences ready');
 await run('document.querySelector("[aria-label=\\"Recent options\\"]").click()');await click('Sort chats by');await click('Name');
 await poll("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='name')",'A sidebar preference saved');
 await run('document.querySelector("[aria-label=\\"Unpin QA A renamed conversation\\"]").click()');
 await poll("!!document.querySelector('[aria-label=\"Pin QA A renamed conversation\"]')",'sidebar unpin');
 await run('document.querySelector("[aria-label=\\"Pin QA A renamed conversation\\"]").click()');
 await poll("!!document.querySelector('[aria-label=\"Unpin QA A renamed conversation\"]')",'sidebar repin');
 await run('document.querySelector("[aria-label=\\"Search conversations\\"]").click()');
 await fill('input[type=search]','QA A renamed');await poll("document.querySelector('.cloud-home__sidebar').innerText.includes('QA A renamed conversation')",'search');
 await fill('input[type=search]','');if(!(await run("(()=>{const composer=document.querySelector('[aria-label=\"Message composer\"]'),content=document.querySelector('.workspace__view--chat > .content');return composer.getBoundingClientRect().height<220&&content.getBoundingClientRect().height>composer.getBoundingClientRect().height})()")))throw Error('Conversation grid incorrectly stretches the composer.');await capture('home-before-new-work');await click('New work');await poll("document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim()==='Home'&&document.querySelector('.shell').dataset.sidebar==='expanded'",'new conversation keeps expanded sidebar');await capture('home-after-new-work');await goal('QA_A_SECOND_CONVERSATION');
 await poll("!!document.querySelector('[aria-label=\"Close QA_A_SECOND_CONVERSATION tab\"]:not(:disabled)')",'second tab ready');
 await run('document.querySelector("[aria-label=\\"Unpin QA A renamed conversation\\"]").click()');
 await poll("document.querySelectorAll('#cloud-recent .sidebar-conversation-row').length===2",'two recent conversations');
 await run('document.querySelector("[aria-label=\\"Recent options\\"]").click()');await click('Sort chats by');await click('Manual order');
 await poll("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='manual')",'manual sort saved');
 const recentOrder=await run("[...document.querySelectorAll('#cloud-recent .sidebar-conversation-row')].map(x=>x.getAttribute('aria-label'))");
 await run("(()=>{const row=document.querySelectorAll('#cloud-recent .sidebar-conversation-row')[1];row.focus();row.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true,cancelable:true}));})()");
 await poll(`[...document.querySelectorAll('#cloud-recent .sidebar-conversation-row')][0]?.getAttribute('aria-label')===${JSON.stringify(recentOrder[1])}`,'keyboard reorder');
 await run("(()=>{const rows=document.querySelectorAll('#cloud-recent .sidebar-conversation-row');const data=new DataTransfer();rows[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));rows[1].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()");
 await poll(`[...document.querySelectorAll('#cloud-recent .sidebar-conversation-row')][0]?.getAttribute('aria-label')===${JSON.stringify(recentOrder[0])}`,'drag reorder');
 await run('document.querySelector("[aria-label=\\"Recent options\\"]").click()');await click('Sort chats by');await click('Name');
 await run('document.querySelector("[aria-label=\\"Pin QA A renamed conversation\\"]").click()');
 await poll("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='name')",'name sort restored');
 await run(`(()=>{const tabs=[...document.querySelectorAll('.global-tab')];const first=tabs.find(x=>x.textContent.includes('QA A renamed')),second=tabs.find(x=>x.textContent.includes('QA_A_SECOND_CONVERSATION'));if(!first?.draggable||!second?.draggable||tabs[0].draggable)throw Error('Incorrect authenticated tab drag state');second.dispatchEvent(new DragEvent('dragstart',{bubbles:true}));first.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}));})()`);
 await poll("[...document.querySelectorAll('[role=tab]')][1]?.textContent.includes('QA_A_SECOND_CONVERSATION')",'reordered tabs');
 await run(`(()=>{const tabs=[...document.querySelectorAll('.global-tab')];const first=tabs.find(x=>x.textContent.includes('QA A renamed')),second=tabs.find(x=>x.textContent.includes('QA_A_SECOND_CONVERSATION'));first.dispatchEvent(new DragEvent('dragstart',{bubbles:true}));second.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}));})()`);
 await poll("[...document.querySelectorAll('[role=tab]')][1]?.textContent.includes('QA A renamed')",'restored tab order');
 await run("document.querySelector('[aria-label=\"Close QA_A_SECOND_CONVERSATION tab\"]').click()");
 await poll("document.querySelector('[role=tab][aria-selected=true]')?.innerText.includes('QA A renamed conversation')",'close tab fallback');
 await sidebar(true);await clickConversation('QA_A_SECOND_CONVERSATION');
 await poll("document.querySelector('[role=tab][aria-selected=true]')?.innerText.includes('QA_A_SECOND_CONVERSATION')",'reopen closed tab');
 if(!(await run("document.querySelector('.shell').dataset.sidebar==='expanded'")))throw Error('Opening a conversation collapsed the sidebar.');
 await sidebar(false);await capture('home-collapsed');await run("[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.trim()==='Home').click()");
 await poll("document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim()==='Home'&&document.querySelector('.shell').dataset.sidebar==='collapsed'",'Home tab keeps sidebar collapsed');
 await run("[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('QA_A_SECOND_CONVERSATION')).click()");
 await poll("document.querySelector('[role=tab][aria-selected=true]')?.innerText.includes('QA_A_SECOND_CONVERSATION')&&document.querySelector('.shell').dataset.sidebar==='collapsed'",'conversation tab keeps sidebar collapsed');
 if(await run("!!document.querySelector('.workspace__view--chat > .topbar')"))throw Error('Conversation content header returned.');
 await conversationAction('Archive');await poll("!document.body.innerText.includes('QA_A_SECOND_CONVERSATION')",'archive complete');await sidebar(true);
 await run('document.querySelector("[aria-label=\\"Search conversations\\"]").click()');await click('Show archived conversations');await clickConversation('QA_A_SECOND_CONVERSATION');await poll("!!document.querySelector('[role=tab][aria-selected=true]')&&document.querySelector('[role=tab][aria-selected=true]').textContent.includes('QA_A_SECOND_CONVERSATION')",'archived conversation tab');await conversationAction('Unarchive');
 await conversationAction('Delete');await click('Delete permanently');
 await sidebar(true);
 await clickConversation('QA A renamed conversation');await poll("document.body.innerText.includes('QA_A_NORMAL_MESSAGE')",'reopen');
 await poll("document.querySelector('.shell').dataset.sidebar==='expanded'",'reopen keeps sidebar expanded');
 await poll("window.codexDesktop.scopedPreferences.read('layout').then(raw=>raw&&JSON.parse(raw).sidebarExpanded===true)",'expanded layout saved');
 if(process.env.AUTH_QA_SCREENSHOTS){await fs.mkdir(process.env.AUTH_QA_SCREENSHOTS,{recursive:true});for(const [w,h] of [[1440,900],[1280,800],[900,700]]){window.setContentSize(w,h);await wait(300);await fs.writeFile(path.join(process.env.AUTH_QA_SCREENSHOTS,`conversation-${w}x${h}.png`),(await window.webContents.capturePage()).toPNG());}}
 const aid=await run("window.codexDesktop.conversations.request({type:'list'}).then(x=>x.conversations[0].id)");
 if(aiService){await goal('QA_A_STALE_PENDING');await poll("document.body.innerText.includes('Gwira is working')",'pending generation before sign-out');await signOut();}
 else{await fill('#cloud-goal','QA_A_PRIVATE_DRAFT');await wait(800);await signOut();}
 if(process.env.AUTH_QA_GREETING_UNAVAILABLE==='1')unavailableNextAi=true;
 const interrupted=await create(accounts[1],process.env.AUTH_QA_GREETING==='1'?'Hi':'QA_B_ONBOARDING_GOAL');
 if(interrupted==='interrupted'){console.log('ELECTRON_FIRST_MESSAGE_INTERRUPTED');app.exit(0);return;}
 if(process.env.AUTH_QA_STOP_AFTER_FIRST==='1'){console.log('ELECTRON_FIRST_MESSAGE_STOPPED');app.exit(0);return;}
 if(await run("document.body.innerText.includes('QA_A_NORMAL_MESSAGE')||document.querySelector('#cloud-goal').value.includes('QA_A_PRIVATE_DRAFT')"))throw Error('A data appeared for B.');
 if(await run("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='name')"))throw Error('A sidebar preferences appeared for B.');
 if(await run("window.codexDesktop.scopedPreferences.read('layout').then(raw=>raw&&JSON.parse(raw).sidebarExpanded===true)"))throw Error('A layout appeared for B.');
 if(!(await run(`window.codexDesktop.schedules.read(${JSON.stringify(aid)}).then(()=>false,()=>true)`)))throw Error('Authenticated account accessed local schedules.');
 await run('document.querySelector("[aria-label=\\"Schedule\\"]").click()');
 await poll("document.querySelector('.workspace').dataset.workspaceView==='schedule'&&document.querySelector('[data-testid=\"schedule-page\"]')?.innerText.includes('Schedules unavailable')",'B schedule isolation');
 if(await run("document.querySelector('[data-testid=\"schedule-page\"]').innerText.includes('QA_A_')"))throw Error('A schedule data appeared for B.');
 await run("[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.trim()==='Home').click()");
 const denied=await run(`window.codexDesktop.conversations.request({type:'messages',id:${JSON.stringify(aid)}}).then(()=>false,()=>true)`);
 if(!denied)throw Error('B accessed A conversation through IPC.');
 const deniedPlan=await run(`window.codexDesktop.conversations.request({type:'plan',id:${JSON.stringify(aid)}}).then(()=>false,()=>true)`);
 if(!deniedPlan)throw Error('B accessed A plan through conversation IPC.');
 await goal('QA_B_NORMAL_MESSAGE');await signOut();
 await fill('input[type=email]',accounts[0].email);await fill('input[autocomplete=current-password]',accounts[0].password);await submit();
 await poll("document.body.innerText.includes('QA_A_NORMAL_MESSAGE')",'A restoration');
 await poll("document.querySelector('.shell')?.dataset.sidebar==='expanded'",'A layout restored after sign-in');
 await poll("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='name')",'A sidebar preference restored');
 if(!aiService)await poll("document.querySelector('#cloud-goal')?.value==='QA_A_PRIVATE_DRAFT'",'A draft restoration');
 if(await run("document.body.innerText.includes('QA_B_NORMAL_MESSAGE')"))throw Error('B message appeared for A.');
 if(!aiService){
  const original=await run("window.codexDesktop.account.snapshot().then(s=>s.activeOrganization.id)");
  await run("window.codexDesktop.account.command({type:'create_organization',name:'QA Second workspace',requestId:crypto.randomUUID()})");
  await poll(`window.codexDesktop.account.snapshot().then(s=>s.activeOrganization?.id&&s.activeOrganization.id!==${JSON.stringify(original)})`,'second organization');
  await poll("!!document.querySelector('#home-goal')",'second organization first Home');
  await poll("document.querySelector('.shell')?.dataset.sidebar==='collapsed'",'second organization starts collapsed');
  if(await run("document.body.innerText.includes('QA_A_NORMAL_MESSAGE')||document.body.innerText.includes('QA A renamed conversation')"))throw Error('Original organization data appeared in second organization.');
  if(await run("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='name')"))throw Error('Original organization preferences appeared in second organization.');
  const deniedOther=await run(`window.codexDesktop.conversations.request({type:'messages',id:${JSON.stringify(aid)}}).then(()=>false,()=>true)`);
  if(!deniedOther)throw Error('Original organization conversation accessible in second organization.');
  await run('document.querySelector("[aria-label=\\"Account menu\\"]").click()');
  await click('Switch to QA A workspace');
  await poll("document.body.innerText.includes('QA_A_NORMAL_MESSAGE')",'original organization restored');
  await poll("document.querySelector('.shell')?.dataset.sidebar==='expanded'",'original organization layout restored');
  await poll("document.querySelector('#cloud-goal')?.value==='QA_A_PRIVATE_DRAFT'",'original organization draft restored');
  await poll("window.codexDesktop.scopedPreferences.read('sidebar').then(raw=>raw&&JSON.parse(raw).preferences.recentSort==='name')",'original organization preferences restored');
 }
 console.log('ELECTRON_CONVERSATION_ABA_PASSED');app.exit(0);
})().catch(error=>{console.error(error.message);app.exit(1);});
