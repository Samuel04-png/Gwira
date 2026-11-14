const {app,BrowserWindow,clipboard}=require('electron');const fs=require('node:fs/promises'),path=require('node:path');
const phase=process.env.UI_QA_PHASE||'after',base=path.resolve('artifacts/workflow/polish'),wait=ms=>new Promise(r=>setTimeout(r,ms));
app.setPath('userData','/tmp/gwira-library-chat-qa');process.env.ELECTRON_RENDERER_URL='http://127.0.0.1:5175/';
(async()=>{await import('../dist/main/main.js');await app.whenReady();let w;for(let i=0;i<100;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await wait(100)}w.show();w.focus();w.webContents.focus();w.setContentSize(1440,900);await wait(800);
 const ev=s=>w.webContents.executeJavaScript(s,true),assert=(v,m)=>{if(!v)throw Error(m)};
 const shot=async(area,name)=>{await wait(250);const dir=path.join(base,area,phase);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name+'.png'),(await w.webContents.capturePage()).toPNG())};
 const errors=[];w.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
 const key=async keyCode=>{w.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Return'||keyCode==='Enter')w.webContents.sendInputEvent({type:'char',keyCode:'\r'});w.webContents.sendInputEvent({type:'keyUp',keyCode});await wait(200)};
 const click=async sel=>{assert(await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true})()`),'Missing '+sel);await wait(200)};
 if(phase==='after'&&process.env.UI_QA_RESTART!=='1'){
  const folder='/tmp/gwira-navigation-qa-project';await fs.mkdir(folder,{recursive:true});
  const added=await ev(`(()=>{const key='codex-desktop.projects.v1',s=JSON.parse(localStorage.getItem(key)||'{"projects":[]}');if(s.projects.some(p=>p.path===${JSON.stringify(folder)}))return false;s.projects.push({id:${JSON.stringify(folder)},path:${JSON.stringify(folder)},name:'Local navigation QA'});localStorage.setItem(key,JSON.stringify(s));return true})()`);
  if(added){w.webContents.reload();await new Promise(resolve=>w.webContents.once('did-finish-load',resolve));await wait(600);}
 }
 if(process.env.UI_QA_RESTART==='1'){
  assert(await ev(`!!document.querySelector('.gw-library')?.getBoundingClientRect().height&&document.querySelector('.sidebar').dataset.sidebarContext==='home'`),'Library route not restored');
  assert(await ev(`document.querySelector('[aria-controls="sidebar-section-projects"]').getAttribute('aria-expanded')==='true'`),'Projects section not restored');assert(await ev(`document.querySelector('.project-pill[aria-label="Local navigation QA"]').getAttribute('aria-expanded')==='true'`),'Project group not restored');
  await shot('library-navigation-fix','restart-library');await click('.gwira-primary-rail [data-navigation-view="dashboard"]');assert(await ev(`!document.querySelector('.dashboard-sidebar [data-navigation-view="library"]')`),'Dashboard restored duplicate');
  await fs.writeFile(path.join(base,'library-navigation-fix',phase,'restart-results.json'),JSON.stringify({passed:true,libraryContext:'home',projectsExpanded:true}));app.exit(0);return;
 }
 if(await ev(`document.querySelector('[aria-label="Gwira Chat"]').getAttribute('aria-expanded')==='true'`))await click('[aria-label="Gwira Chat"]');
 await click('.gwira-primary-rail [data-navigation-view="home"]');await shot('library-navigation-fix','home');await click('.sidebar [data-navigation-view="library"]');await shot('library-navigation-fix','library');
 if(phase==='after'){assert(await ev(`!!document.querySelector('.sidebar-new-work')&&document.querySelector('.sidebar').dataset.sidebarContext==='home'`),'Home context lost');assert(await ev(`!!document.querySelector('.gw-library')?.getBoundingClientRect().height`),'Library canvas missing');assert(await ev(`document.querySelector('.sidebar [data-navigation-view="library"]').getAttribute('aria-current')==='page'`),'Library selection missing');}
 await click('.gwira-primary-rail [data-navigation-view="dashboard"]');await shot('library-navigation-fix','dashboard');
 if(phase==='after')assert(await ev(`!document.querySelector('.dashboard-sidebar [data-navigation-view="library"]')&&![...document.querySelectorAll('.dashboard-sidebar__nav-row')].some(e=>e.textContent==='Projects')`),'Duplicate Dashboard navigation');
 if(phase==='after'){
  await click('.gwira-primary-rail [data-navigation-view="home"]');
  const section='.sidebar [aria-controls="sidebar-section-projects"]';
  if(!await ev(`document.querySelector('${section}').getAttribute('aria-expanded')==='true'`))await click(section);
  await ev(`window.qaSidebarNode=document.querySelector('.sidebar-content-scroll');window.qaSidebarNode.scrollTop=24`);
  const savedScroll=await ev('window.qaSidebarNode.scrollTop');
  if(!await ev(`document.querySelector('.project-pill[aria-label="Local navigation QA"]').getAttribute('aria-expanded')==='true'`))await click('.project-pill[aria-label="Local navigation QA"]');
  await shot('library-navigation-fix','home-projects-expanded');
  for(const collapsed of [false,true]){
   const open=await ev(`document.querySelector('.global-topbar').dataset.workspaceOpen==='true'`);
   if(open===collapsed)await click('.global-topbar__actions [aria-label="Workspace tools"]');
   const tabs=await ev(`JSON.stringify([...document.querySelectorAll('.global-topbar__tabs--global [role=tab]')].map(e=>e.dataset.tabId||e.id))`);
   app.focus({steal:true});w.focus();w.webContents.focus();await wait(100);
   await ev(`document.querySelector('.sidebar [data-navigation-view="library"]').focus()`);
   await key('Return');
   assert(await ev(`!!document.querySelector('.gw-library')?.getBoundingClientRect().height`),'Keyboard Library canvas missing');
   assert(await ev(`window.qaSidebarNode===document.querySelector('.sidebar-content-scroll')&&window.qaSidebarNode.scrollTop===${savedScroll}`),'Sidebar node/scroll replaced');
   assert(await ev(`document.querySelector('${section}').getAttribute('aria-expanded')==='true'`),'Projects collapsed');assert(await ev(`document.querySelector('.project-pill[aria-label="Local navigation QA"]').getAttribute('aria-expanded')==='true'`),'Expanded project group reset');
   assert(await ev(`document.querySelector('.global-topbar').dataset.workspaceOpen===${JSON.stringify(String(!collapsed))}`),'Workspace changed by Library');
   assert(await ev(`JSON.stringify([...document.querySelectorAll('.global-topbar__tabs--global [role=tab]')].map(e=>e.dataset.tabId||e.id))===${JSON.stringify(tabs)}`),'Global tabs replaced');
   await shot('library-navigation-fix',collapsed?'library-workspace-collapsed':'library-workspace-open');
   await click('.sidebar-new-work');
  }
  await click('.sidebar [data-navigation-view="library"]');
  for(const [width,height]of [[1280,800],[900,700],[780,640]]){w.setContentSize(width,height);await wait(200);await shot('library-navigation-fix','library-'+width);assert(await ev('document.documentElement.scrollWidth<=innerWidth'),'Library overflow');}
  w.setContentSize(1440,900);
 }
 await ev(`import('/@fs/'+${JSON.stringify(path.resolve('scripts/chat-output-fixture.tsx'))}).then(m=>m.showChatOutputFixture())`);await wait(400);await shot('chat-output-refinement','grouped');
 if(phase==='before'){app.exit(0);return;}
 const fixture=async mode=>{await ev(`import('/@fs/'+${JSON.stringify(path.resolve('scripts/chat-output-fixture.tsx'))}).then(m=>m.showChatOutputFixture(${JSON.stringify(mode)}))`);await wait(250);await ev(`if(document.querySelector('#chat-output-fixture .content'))document.querySelector('#chat-output-fixture .content').scrollTop=0`);await wait(150)};
 const clip=clipboard.availableFormats().map(format=>[format,clipboard.readBuffer(format)]);
 try{
  await fixture('grouped');assert(await ev(`document.querySelector('#chat-output-fixture .thread-heading').textContent==='Review the navigation proposalLocal QA fixture'`),'Technical header label');await shot('chat-output-refinement','response-top');
  await ev(`document.querySelector('#chat-output-fixture .content').scrollTop=1e7`);await shot('chat-output-refinement','complete-response-actions');
  assert(await ev(`document.querySelectorAll('#chat-output-fixture .assistant-turn').length===1&&document.querySelectorAll('#chat-output-fixture .gw-assistant-identity').length===1`),'Response grouping');
  await click('#chat-output-fixture [aria-label="Copy entire response"]');
  const expected=await ev(`import('/@fs/'+${JSON.stringify(path.resolve('scripts/chat-output-fixture.tsx'))}).then(m=>m.responseParts.join('\\n\\n'))`);
  assert(clipboard.readText()===expected,'Complete Markdown copy differs');
  await click('#chat-output-fixture [data-message-id="a2"] [aria-label="Copy Gwira response"]');assert(clipboard.readText().startsWith('## Review the proposal')&&!clipboard.readText().includes('const proposal'),'Block copy boundary');
  await shot('chat-output-refinement','block-actions');
  await click('#chat-output-fixture .copy-code-button');assert(clipboard.readText()==='const proposal = { approved: false };','Code copy');
  const trace='#chat-output-fixture .activity-trace button';await click(trace);await shot('chat-output-refinement','activity-expanded');await click(trace);
  // Controlled speech events test the real shared playback owner without playing audio.
  await ev(`window.qaSpeech=[];window.speechSynthesis.getVoices=()=>[{name:'QA voice'}];window.speechSynthesis.cancel=()=>{};window.speechSynthesis.speak=u=>{window.qaSpeech.push(u.text);u.onstart?.()};window.speechSynthesis.dispatchEvent(new Event('voiceschanged'))`);await wait(150);
  await ev(`document.querySelector('#chat-output-fixture .response-actions button').focus()`);await key('Tab');assert(await ev(`document.activeElement.getAttribute('aria-label')==='Read entire response aloud'`),'Toolbar keyboard order');await key('Return');assert(await ev(`window.qaSpeech.length===1&&window.qaSpeech[0].includes('Review the proposal')&&!window.qaSpeech[0].includes('Command:')`),'Complete speech stream');await click('#chat-output-fixture .response-actions [aria-label="Stop reading"]');
  await ev(`document.querySelector('#chat-output-fixture .content').scrollTop=0`);
  await fixture('paste');await shot('chat-output-refinement','pasted-file');assert(await ev(`!!document.querySelector('#chat-output-fixture [aria-label="Open attachment Project brief"]')&&!document.querySelector('#chat-output-fixture .user-message-body').textContent.includes('/tmp/')`),'Attachment presentation');
  await fixture('long-paste');await click('#chat-output-fixture .message-show-more');await shot('chat-output-refinement','expanded-pasted-text');assert(await ev(`document.querySelector('#chat-output-fixture .message-user-content').textContent.includes('Paragraph 25')`),'Pasted content lost');
  await fixture('streaming');assert(await ev(`document.querySelector('#chat-output-fixture [aria-label="Read entire response aloud"]').disabled`),'Streaming speech enabled');await shot('chat-output-refinement','streaming');
  await fixture('long');const prior=await ev(`document.querySelector('#chat-output-fixture .content').scrollTop`);await ev('window.appendChatQA()');await wait(200);assert(await ev(`Math.abs(document.querySelector('#chat-output-fixture .content').scrollTop-${prior})<2`),'Scroll forced to bottom');
  assert(await ev(`!document.querySelector('#chat-output-fixture .conversation-scroll-controls').hidden`),'Jump missing');await shot('chat-output-refinement','jump-to-latest');await click('#chat-output-fixture .conversation-jump');assert(await ev(`document.querySelector('#chat-output-fixture .conversation-scroll-controls').hidden`),'Jump did not hide');
  for(const [width,height]of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(width,height);await fixture('grouped');await shot('chat-output-refinement','conversation-'+width);assert(await ev(`document.querySelector('#chat-output-fixture').scrollWidth<=document.querySelector('#chat-output-fixture').clientWidth`),'Conversation overflow '+width);}
  w.setContentSize(1440,900);await fixture('compact');await shot('chat-output-refinement','compact-320');assert(await ev(`(()=>{const e=document.querySelector('#chat-output-fixture .global-assistant__feed');return e.scrollWidth<=e.clientWidth})()`),'Compact transcript overflow');
  await ev(`document.querySelector('#chat-output-fixture').remove()`);
  await click('.sidebar [data-navigation-view="library"]');
  await fs.writeFile(path.join(base,'library-navigation-fix',phase,'results.json'),JSON.stringify({passed:true,keyboardEnter:true,sidebarNodePreserved:true,projectsExpanded:true,workspaceOpenAndCollapsed:true,viewports:[1440,1280,900,780]}));
  assert(errors.length===0,'Console errors: '+errors.join('\n'));
  await fs.writeFile(path.join(base,'chat-output-refinement',phase,'results.json'),JSON.stringify({passed:true,copyMarkdown:true,blockCopy:true,codeCopy:true,speech:'controlled speech events; not audible playback',scrollPreserved:true,viewports:[1440,1280,900,780],errors},null,2));
 }finally{clipboard.clear();for(const [format,buffer]of clip)clipboard.writeBuffer(format,buffer);}
 app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
