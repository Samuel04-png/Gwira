const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const out=process.env.NAVIGATION_QA_OUTPUT,wait=ms=>new Promise(r=>setTimeout(r,ms));let checking=false;const exit=app.exit.bind(app);
app.exit=code=>{if(code||checking)return exit(code);checking=true;check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)})};
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents;w.show();w.focus();wc.focus();wc.setBackgroundThrottling(false);
 const ev=s=>wc.executeJavaScript(s),assert=(ok,msg)=>{if(!ok)throw Error(msg)},shot=async name=>{await wait(180);await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG())};
 const click=async sel=>{const exists=await ev(`!!document.querySelector(${JSON.stringify(sel)})`);if(!exists)throw Error(`Missing chat QA control: ${sel}`);await ev(`document.querySelector(${JSON.stringify(sel)}).click()`);await wait(100)};
 await click('.gwira-primary-rail [aria-label="Home"]');await click('.global-topbar [aria-label="Gwira Chat"]');
 if(process.env.CHAT_QA_PHASE==='before'){
  for(const [width,height] of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(width,height);await shot('empty-'+width+'x'+height)}
  console.log('GLOBAL_CHAT_BEFORE_CAPTURED');return;
 }
 const errors=[];wc.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
 const setInput=async(sel,text)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));e.focus()})()`);await wait(70)};
 const key=async(keyCode,modifiers=[])=>{w.focus();wc.focus();wc.sendInputEvent({type:'keyDown',keyCode,modifiers});wc.sendInputEvent({type:'keyUp',keyCode,modifiers});await wait(120)};
 const source=path.join(out,'source-folder');await fs.mkdir(source,{recursive:true});
 const sessions={};let sends=[],stops=[],fail=false,historyFail=false,n=0;
 const now=new Date().toISOString();
 const histories=Array.from({length:52},(_,i)=>({id:'saved-'+i,cwd:source,title:i===0?'Review recorded operations':i===1?'A very long conversation title '.repeat(12):'Recorded conversation '+i,createdAt:now,updatedAt:now,filePath:path.join(source,i+'.jsonl'),model:'gpt-5.5'}));
 histories.push({...histories[0],id:'foreign',cwd:'/other-workspace',title:'PRIVATE OTHER WORKSPACE'});
 for(const c of ['codex:start-session','codex:send-input','codex:stop-session','codex:list-models','codex:list-histories','codex:resume-session','codex:select-files','codex:get-session'])ipcMain.removeHandler(c);
 ipcMain.handle('codex:list-models',()=>[{slug:'gpt-5.5',defaultReasoningLevel:'high',supportedReasoningLevels:['high']}]);
 ipcMain.handle('codex:list-histories',()=>{if(historyFail)throw Error('Deliberate history offline');return histories});
 ipcMain.handle('codex:start-session',(_e,r)=>{const s={...r,id:'chat-qa-'+(++n),status:'idle',messages:[],startedAt:now,updatedAt:now};sessions[s.id]=s;return s});
 ipcMain.handle('codex:resume-session',(_e,r)=>{const s={...r,id:'resumed-'+(++n),codexConversationId:r.codexConversationId,status:'idle',messages:[{id:'restored-u',role:'user',text:r.title,createdAt:now}],startedAt:now,updatedAt:now,model:r.model,reasoningEffort:'high',permissionMode:'default'};sessions[s.id]=s;return s});
 ipcMain.handle('codex:send-input',(_e,r)=>{if(fail)throw Error('Deliberate offline stub');sends.push(r)});
 ipcMain.handle('codex:stop-session',(_e,r)=>stops.push(r));
 ipcMain.handle('codex:get-session',(_e,id)=>sessions[id]);
 ipcMain.handle('codex:select-files',()=>({canceled:false,files:[{name:'context.txt',path:path.join(source,'context.txt'),kind:'file'}]}));
 await ev(`localStorage.setItem('codex-desktop.projects.v1',JSON.stringify({projects:[{id:'qa-project',name:'Operations',path:${JSON.stringify(source)}}],activeProjectId:'qa-project'}))`);
 wc.reload();await wait(1600);await click('.gwira-primary-rail [aria-label="Home"]');
 if(!await ev(`document.querySelector('.shell').dataset.assistantOpen==='true'`))await click('.global-topbar [aria-label="Gwira Chat"]');
 const panel='#gwira-assistant-panel',input='#gwira-assistant-input';
 for(const [width,height] of [[1440,900],[1280,800],[900,700],[780,640]]){
  w.setContentSize(width,height);await shot('empty-'+width+'x'+height);
  assert(await ev(`(()=>{const p=document.querySelector('${panel}'),f=p.querySelector('form').getBoundingClientRect();return f.bottom<=innerHeight&&p.scrollHeight<=p.clientHeight+1&&p.querySelectorAll('.gwira-logo').length===2})()`),'Empty layout '+width);
 }
 w.setContentSize(1440,900);await wait(100);
 assert(await ev(`(()=>{const e=document.querySelector('${panel} .gwira-logo--empty');return e.complete&&e.naturalWidth===182&&e.naturalHeight===164&&getComputedStyle(e).width==='64px'})()`),'Official logo failed');
 assert(await ev(`document.querySelector('.global-topbar__actions > span')!==null||document.querySelector('.global-topbar__actions .gwira-logo')!==null`),'Toolbar logo missing');
 if(process.env.CHAT_QA_DENSITY==='2') {await shot('empty-retina-2x');await fs.writeFile(path.join(out,'density.json'),JSON.stringify(await ev(`({dpr:devicePixelRatio,logoWidth:document.querySelector('${panel} .gwira-logo--empty').naturalWidth})`)));console.log('GLOBAL_CHAT_RETINA_PASSED');return;}
 await click(panel+' [aria-label="Conversation context and permissions"]');assert(await ev(`document.activeElement.role==='dialog'`),'Context focus');await shot('context-permissions');await key('Escape');assert(await ev(`document.activeElement.ariaLabel==='Conversation context and permissions'`),'Context focus return');
 await click(panel+' [aria-label="Add attachments"]');assert(await ev(`document.querySelector('${panel} .global-assistant__attachments').textContent.includes('context.txt')`),'Attachment bridge');await shot('attachment');await click(panel+' [aria-label="Remove context.txt"]');
 await setInput(input,'A saved multiline\ndraft');await click('.global-topbar [aria-label="Gwira Chat"]');assert(await ev(`document.querySelector('${panel}').hidden`),'Chat toggle did not close');await click('.global-topbar [aria-label="Gwira Chat"]');assert(await ev(`document.querySelector('${input}').value==='A saved multiline\\ndraft'`.replace('\\\\n','\\n')),'Close cleared draft');
 await setInput(input,'Review recorded operations');await key('Enter');assert(sends.length===1,'Send not wired');const id=sends[0].sessionId;
 assert(await ev(`document.querySelector('${panel} .gwira-thinking')&&!document.querySelector('${input}').disabled`),'Thinking/input');await shot('running-thinking');
 await setInput(input,'Follow-up remains while working');await key('Enter');assert(sends.length===1,'Unsafe concurrent send');
 wc.send('codex:output',{sessionId:id,role:'system',chunk:'Ran inspect-operations\n'});await wait(120);await shot('activity-collapsed');
 assert(await ev(`!!document.querySelector('${panel} .trace-summary')`),'Activity not rendered');await click(panel+' .trace-summary');await click(panel+' .trace-step__button');await shot('activity-expanded');
 wc.send('codex:output',{sessionId:id,role:'system',chunk:'Process exited with code 0\nWall time: 0.2 seconds\n'});
 wc.send('codex:output',{sessionId:id,role:'codex',chunk:'## Recorded result\n\nA **formatted** response with a [reference](https://example.com).\n\n- Read the actual record.\n- Review before taking action.\n\n| Record | State |\n| --- | --- |\n| Document | Read |\n\n> Recorded evidence only.\n\n```text\nA long code block with content that can scroll locally without making the conversation overflow horizontally.\n```'});
 wc.send('codex:exit',{sessionId:id,status:'idle',exitCode:0});await wait(150);await shot('formatted-response');
 assert(await ev(`document.querySelector('${panel} table')&&document.querySelector('${panel} blockquote')&&!document.querySelector('${panel} .gwira-thinking')`),'Shared markdown');
 for(const width of [320,380,440,540]){
  await ev(`(()=>{const el=document.querySelector('${panel} [role="separator"]');el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));})()`);await wait(70);
  for(let v=320;v<width;v+=20){await ev(`document.querySelector('${panel} [role="separator"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);await wait(25)}
  await shot('panel-'+width);
  assert(await ev(`(()=>{const p=document.querySelector('${panel}'),f=p.querySelector('.global-assistant__feed');return Math.abs(p.getBoundingClientRect().width-${width})<2&&f.scrollWidth<=f.clientWidth+1&&p.querySelector('form').getBoundingClientRect().bottom<=innerHeight})()`),'Panel overflow '+width);
 }
 // Pointer resizing uses pointer capture; the keyboard and pointer paths share clamps.
 const handle=await ev(`(()=>{const r=document.querySelector('${panel} [role="separator"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+80)}})()`);
 wc.sendInputEvent({type:'mouseMove',...handle});wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...handle});wc.sendInputEvent({type:'mouseMove',x:handle.x+100,y:handle.y});wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:handle.x+100,y:handle.y});await wait(100);
 assert(await ev(`document.querySelector('${panel} [role="separator"]').ariaValueNow==='440'`),'Pointer resize');
 for(const [width,height]of [[1280,800],[900,700],[780,640]]){w.setContentSize(width,height);await shot('conversation-'+width+'x'+height)}w.setContentSize(1440,900);
 await click(panel+' [aria-label="Conversation sessions"]');assert(await ev(`document.querySelectorAll('${panel} .global-assistant__session').length===53&&!document.querySelector('${panel}').textContent.includes('PRIVATE OTHER WORKSPACE')`),'Session scope/overflow');await shot('sessions-53');
 await setInput(panel+' [aria-label="Search conversations"]','very long');assert(await ev(`document.querySelectorAll('${panel} .global-assistant__session').length===1`),'Search');await shot('sessions-search');await setInput(panel+' [aria-label="Search conversations"]','not present');await shot('sessions-empty-filter');await setInput(panel+' [aria-label="Search conversations"]','');
 historyFail=true;await click(panel+' [aria-label="Refresh conversations"]');assert(await ev(`document.querySelector('${panel} [role="alert"]')`),'History error');await shot('sessions-error');historyFail=false;await click(panel+' [aria-label="Refresh conversations"]');
 await click(panel+' .global-assistant__session[aria-current="true"]');assert(await ev(`document.querySelector('${input}').value==='Follow-up remains while working'`),'Session draft restore');
 await setInput(input,'Generate a long recorded answer');await key('Enter');
 wc.send('codex:output',{sessionId:id,role:'codex',chunk:Array.from({length:70},(_,i)=>'Paragraph '+i+'. A recorded result with normal wrapping.\n\n').join('')});await wait(150);await shot('long-following');
 await ev(`(()=>{const e=document.querySelector('${panel} .global-assistant__feed');e.scrollTop=0;e.dispatchEvent(new Event('scroll'))})()`);await wait(100);wc.send('codex:output',{sessionId:id,role:'codex',chunk:'A later streamed result.\n'});await wait(100);
 assert(await ev(`document.querySelector('${panel} .global-assistant__feed').scrollTop<20&&document.querySelector('${panel} .conversation-jump')`),'Scroll hijack');await shot('long-reading');
 await click(panel+' [aria-label="Conversation sessions"]');await click(panel+' .global-assistant__session[aria-current="true"]');assert(await ev(`document.querySelector('${panel} .global-assistant__feed').scrollTop<20`),'Reading position lost');await click(panel+' .conversation-jump');
 await setInput(input,'Stop and send this follow-up');await click(panel+' [aria-label="Send options"]');await ev(`Array.from(document.querySelectorAll('[role="menu"][aria-label="Send options"] button')).find(e=>e.textContent.includes('Stop & Send')).click()`);await wait(120);const before=sends.length;assert(stops.length===1,'Stop bridge');assert(sends.length===before,'Cancellation race');await shot('cancelling');
 wc.send('codex:exit',{sessionId:id,status:'idle',exitCode:0});await wait(180);assert(sends.length===before+1,'Acknowledged Stop & Send');wc.send('codex:exit',{sessionId:id,status:'idle',exitCode:0});await wait(100);assert(sends.length===before+1,'Duplicate execution');
 fail=true;await setInput(input,'Preserve this offline request');await key('Enter');assert(await ev(`document.querySelector('${input}').value==='Preserve this offline request'&&document.querySelector('${panel} [role="alert"]')`),'Failed send draft');await shot('send-error');fail=false;
 await click(panel+' [aria-label="New Gwira conversation"]');await setInput(input,'Independent second conversation');await key('Enter');const second=sends.at(-1).sessionId;assert(second!==id,'New reused session');
 await click(panel+' [aria-label="Conversation sessions"]');await click(panel+' [aria-label="Show running conversations"]');assert(await ev(`document.querySelectorAll('${panel} .global-assistant__session').length===1`),'Running filter');await shot('sessions-running');
 await click(panel+' .global-assistant__session');await click('.global-topbar [aria-label="Gwira Chat"]');wc.send('codex:output',{sessionId:second,role:'codex',chunk:'Background result while panel is closed.'});wc.send('codex:exit',{sessionId:second,status:'idle',exitCode:0});await wait(100);await click('.global-topbar [aria-label="Gwira Chat"]');assert(await ev(`document.querySelector('${panel}').textContent.includes('Background result while panel is closed.')`),'Close lost background run');await shot('short-completed');
 await setInput(input,'Draft survives application navigation');await click('.gwira-primary-rail [aria-label="Workspace"]');await click('.gwira-primary-rail [aria-label="Home"]');assert(await ev(`document.querySelector('${input}').value==='Draft survives application navigation'`),'App navigation lost draft');await shot('composer-focused');
 const logoButton=await ev(`(()=>{const r=document.querySelector('.global-topbar [aria-label="Gwira Chat"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);wc.sendInputEvent({type:'mouseMove',...logoButton});await wait(700);await shot('toolbar-chat-hover');
 await ev(`document.querySelector('.global-topbar [aria-label="Gwira Chat"]').focus()`);await shot('toolbar-chat-focus');
 await click(panel+' [aria-label="Conversation sessions"]');await click(panel+' [aria-label="Show running conversations"]');await setInput(panel+' [aria-label="Search conversations"]','Recorded conversation 51');await click(panel+' .global-assistant__session');assert(await ev(`document.querySelector('${panel}').textContent.includes('Recorded conversation 51')`),'History resume');
 assert(errors.length===0,'Renderer errors: '+errors.join(' | '));
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,viewports:4,panelWidths:[320,380,440,540],sends:sends.length,stops:stops.length,rendererErrors:errors,isolatedIpcFixtures:true},null,2));console.log('GLOBAL_CHAT_QA_PASSED');
}
require('../dist/main/main.js');
