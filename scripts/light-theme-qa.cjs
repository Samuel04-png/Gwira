/* Electron-only visual/state regression check using an isolated capture profile. */
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const output=path.resolve('artifacts/workflow/light-polish');
const exit=app.exit.bind(app);
let checking=false;
app.exit=(code)=>{
 if(code || checking) return exit(code);
 checking=true;
 check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)});
};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents;
 const evaluate=s=>wc.executeJavaScript(s);
 const results=[];
 const assert=(condition,message)=>{if(!condition)throw Error(message)};
 for(const route of (process.env.LIGHT_THEME_STATES_ONLY ? [] : ['dashboard','home','inbox','my-work','doats','library','views'])){
  w.setContentSize(1440,900);await wait(180);
  const label=({'dashboard':'Dashboard','home':'Home','inbox':'Inbox','my-work':'My Work','doats':'Doats','library':'Library','views':'Views'})[route];
  await evaluate(`(async()=>{document.querySelector('[aria-label="Open a new tab"]').click();await new Promise(r=>setTimeout(r,100));const b=[...document.querySelectorAll('.global-popover--picker [role="option"]')].find(b=>b.querySelector('strong')?.textContent==='${label}');if(!b)throw Error('Missing destination: ${route}');b.click()})()`);
  await wait(400);
  for(const [width,height] of [[1440,900],[1280,800],[780,640]]){
   w.setContentSize(width,height);await wait(200);
   const state=await evaluate(`(()=>{const sidebar=document.querySelector('.dashboard-sidebar')||document.querySelector('.gwira-secondary-sidebar');return {route:'${route}',width:${width},background:getComputedStyle(document.body).backgroundColor,sidebar:sidebar&&getComputedStyle(sidebar).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
   assert(!state.overflow,route+' window overflow');
   assert(state.background==='rgb(250, 249, 246)',route+' background mismatch');
   await fs.writeFile(path.join(output,`${route}-${width}x${height}.png`),(await wc.capturePage()).toPNG());results.push(state);
  }
 }
 w.setContentSize(1440,900);
 // Scoped semantic control probes verify shared CSS without mutating business state.
 await evaluate(`(()=>{const d=document.createElement('div');d.id='light-theme-probe';d.style='position:fixed;z-index:10000;top:80px;left:400px;background:var(--gw-surface);padding:16px;display:flex;gap:16px';d.innerHTML='<button id="qa-button" class="gw-button" data-gw-button data-variant="secondary">Shared action</button><button id="qa-disabled" class="gw-button" data-gw-button disabled>Disabled action</button><button id="qa-loading" class="gw-button" data-gw-button aria-busy="true"><span class="gw-button__icon--running">↻</span>Loading</button><input id="qa-input" class="gw-input" data-gw-input placeholder="Text field" />';document.body.append(d)})()`);
 wc.debugger.attach('1.3');
 await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');
 const {root}=await wc.debugger.sendCommand('DOM.getDocument');
 const {nodeId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#qa-button'});
 const colors={};
 for(const state of ['default','hover','active','focus-visible']){
  await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state==='default'?[]:[state]});await wait(180);
  colors[state]=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('#qa-button'));return {background:s.backgroundColor,outline:s.outlineStyle,width:s.outlineWidth}})()`);
  await fs.writeFile(path.join(output,`state-${state}.png`),(await wc.capturePage()).toPNG());
 }
 assert(colors.default.background!==colors.hover.background,'Missing hover feedback');
 assert(colors.hover.background!==colors.active.background,'Missing pressed feedback');
 assert(colors['focus-visible'].outline==='solid','Missing keyboard focus');
 await evaluate(`document.querySelector('#qa-button').setAttribute('aria-pressed','true')`);
 await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});await wait(180);
 const selected=await evaluate(`getComputedStyle(document.querySelector('#qa-button')).backgroundColor`);
 assert(selected==='rgb(237, 234, 227)','Selected paint mismatch');
 const disabled=await evaluate(`({disabled:document.querySelector('#qa-disabled').disabled,color:getComputedStyle(document.querySelector('#qa-disabled')).color})`);
 const loading=await evaluate(`getComputedStyle(document.querySelector('#qa-loading span')).animationName`);
 assert(disabled.disabled,'Disabled contract lost');assert(loading==='gw-button-running','Loading animation missing');
 await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await wait(100);
 const reduced=await evaluate(`({transition:getComputedStyle(document.querySelector('#qa-button')).transitionDuration,animation:getComputedStyle(document.querySelector('#qa-loading span')).animationName})`);
 console.log('REDUCED_DIAGNOSTIC',JSON.stringify(reduced));
 assert(reduced.transition.split(',').every(s=>s.trim()==='0s')&&reduced.animation==='none','Reduced motion failed');
 await evaluate(`document.querySelector('#qa-input').focus()`);wc.sendInputEvent({type:'keyDown',keyCode:'Tab'});wc.sendInputEvent({type:'keyUp',keyCode:'Tab'});
 await wait(80);
 const keyboard=await evaluate(`document.activeElement.id!=='qa-input'`);assert(keyboard,'Tab navigation failed');
 await fs.writeFile(path.join(output,'interaction-results.json'),JSON.stringify({screens:results,colors,selected,disabled,loading,reduced,keyboard},null,2));
 console.log('LIGHT_THEME_QA_PASS',JSON.stringify({screens:results.length,colors,selected,disabled,loading,reduced,keyboard}));
}
import(path.resolve('dist/main/main.js'));
