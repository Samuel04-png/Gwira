const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
 const output=process.env.GWIRA_CHOICE_QA_OUTPUT;
 if(!output||!process.env.GWIRA_CHOICE_QA_PROFILE||!process.env.ELECTRON_RENDERER_URL)throw Error('Provide QA output, profile and renderer URL.');
 app.setPath('userData',process.env.GWIRA_CHOICE_QA_PROFILE);
 await fs.mkdir(output,{recursive:true});
 await import('../dist/main/main.js');await app.whenReady();
 let window;
 for(let i=0;i<100;i++){window=BrowserWindow.getAllWindows()[0];if(window&&!window.webContents.isLoading())break;await wait(100);}
 if(!window)throw Error('Electron window did not open.');
 const errors=[];window.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
 const evaluate=source=>window.webContents.executeJavaScript(source,true);
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 window.show();window.focus();
 await evaluate("localStorage.setItem('gwira.dev.standalone-meet','1')");
 for(const [width,height] of [[1440,900],[1280,800],[900,700],[780,640]]){
  window.setContentSize(width,height);
  await evaluate(`import('/@fs/'+${JSON.stringify(path.resolve('scripts/auth-routing-fixture.tsx'))}).then(m=>m.showRoutingFixture('multiple'))`);
  await wait(300);
  assert(await evaluate("document.querySelector('[data-app-route=\"WorkspaceHub\"]')?.innerText.includes('First workspace') && document.querySelector('[data-app-route=\"WorkspaceHub\"]')?.innerText.includes('Second workspace')"),'Authorized choices missing');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow');
  await fs.writeFile(path.join(output,`choice-${width}x${height}.png`),(await window.webContents.capturePage()).toPNG());
 }
 await evaluate("[...document.querySelectorAll('#routing-fixture button')].find(button=>button.textContent.includes('Second workspace')).focus()");
 window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
 window.webContents.sendInputEvent({type:'char',keyCode:'\r'});
 window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
 await wait(300);
 assert(await evaluate("document.querySelector('#routing-fixture [data-app-route]')?.dataset.appRoute==='WorkspaceReady'"),'Keyboard selection did not route');
 assert(await evaluate("!document.querySelector('#forbidden-local-home')"),'Local prototype mounted');
 assert(errors.length===0,`Console errors: ${errors.join('; ')}`);
 console.log('WORKSPACE_CHOICE_ELECTRON_QA_PASSED (simulated backend facts)');
 app.exit(0);
})().catch(error=>{console.error(error);app.exit(1);});
