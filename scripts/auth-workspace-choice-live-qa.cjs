const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
 const base=process.env.GWIRA_CHOICE_LIVE_DIR,phase=process.env.GWIRA_CHOICE_LIVE_PHASE;
 if(!base||!['create','choose','restore'].includes(phase))throw Error('Provide QA directory and phase.');
 app.setPath('userData',path.join(base,phase==='create'?'create-profile':'choice-profile'));
 await app.whenReady();await import('../dist/main/main.js');
 let window;for(let i=0;i<150;i++){window=BrowserWindow.getAllWindows()[0];if(window&&!window.webContents.isLoading())break;await wait(100);}
 if(!window)throw Error('Electron window did not open.');
 window.show();const evaluate=source=>window.webContents.executeJavaScript(source,true);
 const poll=async(source,label)=>{for(let i=0;i<150;i++){if(await evaluate(source))return;await wait(100);}throw Error(`Timed out: ${label}`);};
 const fill=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
 const click=async(label)=>{const done=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true;})()`);if(!done)throw Error(`Action unavailable: ${label}`);};
 const submit=()=>evaluate("document.querySelector('form').requestSubmit()");
 const credentials=path.join(base,'credentials.json');
 if(phase==='create'){
  const email=`workspace-choice-${Date.now()}@example.test`,password='correct-horse-battery-1';
  await fs.writeFile(credentials,JSON.stringify({email,password}),{mode:0o600});
  await poll("!!document.querySelector('input[type=email]')",'sign in');await click('Create an account');
  await fill('input[type=email]',email);await fill('input[autocomplete="new-password"]',password);
  await evaluate(`(()=>{const inputs=document.querySelectorAll('input[autocomplete="new-password"]');if(inputs[1]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[1],${JSON.stringify(password)});inputs[1].dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await submit();await poll("!!document.querySelector('[data-app-route=\"AboutYou\"]')",'profile');
  await fill('input[autocomplete=name]','Workspace QA');await submit();
  await poll("!!document.querySelector('[data-app-route=\"WorkspaceSetup\"]')",'workspace setup');
  await click('Create a workspace');await fill('input[autocomplete=organization]','Choice QA First');await submit();
  await poll("!!document.querySelector('.meet-gwira')",'first workspace');
  const result=await evaluate("window.codexDesktop.account.command({type:'create_organization',name:'Choice QA Second',requestId:crypto.randomUUID()})");
  if(result.activeOrganization?.name!=='Choice QA Second'||result.organizations.length!==2)throw Error('Second organization was not created');
  const id=result.activeOrganization.id;
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid local organization ID');
  execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',`insert into gwira.teams(organization_id,name) values ('${id}','Choice QA Team')`],{stdio:'ignore'});
 }else if(phase==='choose'){
  const {email,password}=JSON.parse(await fs.readFile(credentials,'utf8'));
  await poll("!!document.querySelector('input[type=email]')",'fresh profile sign in');
  await fill('input[type=email]',email);await fill('input[autocomplete=current-password]',password);await submit();
  await poll("!!document.querySelector('[data-app-route=\"WorkspaceHub\"]')",'workspace chooser');
  const names=await evaluate("[...document.querySelectorAll('[data-app-route=\"WorkspaceHub\"] button')].map(e=>e.innerText)");
  if(!names.some(name=>name.includes('Choice QA First'))||!names.some(name=>name.includes('Choice QA Second')))throw Error('Actual memberships missing');
  await click('Choice QA Second (owner)');
  await poll("!!document.querySelector('.meet-gwira')",'selected workspace onboarding');
  const state=await evaluate('window.codexDesktop.account.snapshot()');
  if(state.activeOrganization?.name!=='Choice QA Second')throw Error('Wrong organization selected');
  await evaluate("window.codexDesktop.account.command({type:'complete_setup',deferred:true})");
  await poll("!!document.querySelector('[data-app-route=\"WorkspaceReady\"]')",'workspace ready');
  await poll("document.querySelector('.account-team-list')?.innerText.includes('Choice QA Team')",'real organization team');
 }else{
  await poll("!!document.querySelector('[data-app-route=\"WorkspaceReady\"]')",'restored selected workspace');
  const state=await evaluate('window.codexDesktop.account.snapshot()');
  if(state.activeOrganization?.name!=='Choice QA Second')throw Error('Selected organization did not persist');
  await poll("document.querySelector('.account-team-list')?.innerText.includes('Choice QA Team')",'restored organization team');
  if(process.env.GWIRA_CHOICE_LIVE_SCREENSHOTS){
   await fs.mkdir(process.env.GWIRA_CHOICE_LIVE_SCREENSHOTS,{recursive:true});
   for(const [width,height] of [[1440,900],[1280,800],[900,700],[780,640]]){
    window.setContentSize(width,height);await wait(250);
    if(await evaluate('document.documentElement.scrollWidth>innerWidth'))throw Error('Workspace screen overflows horizontally');
    await fs.writeFile(path.join(process.env.GWIRA_CHOICE_LIVE_SCREENSHOTS,`workspace-${width}x${height}.png`),(await window.webContents.capturePage()).toPNG());
   }
  }
 }
 await wait(1000);console.log(`WORKSPACE_CHOICE_LIVE_${phase.toUpperCase()}_PASSED`);app.exit(0);
})().catch(error=>{console.error(error.message);app.exit(1);});
