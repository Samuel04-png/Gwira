const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const out=process.env.NAVIGATION_QA_OUTPUT,baseline=process.env.RAIL_QA_PHASE==='before';
const exit=app.exit.bind(app),wait=ms=>new Promise(r=>setTimeout(r,ms));let checking=false;
app.exit=code=>{if(code||checking)return exit(code);checking=true;check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)})};
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents,ev=s=>wc.executeJavaScript(s),assert=(v,m)=>{if(!v)throw Error(m)};
 w.show();w.focus();wc.setBackgroundThrottling(false);wc.on('console-message',(_e,...args)=>console.log('RENDERER',...args));
 const snap=async name=>{await wait(200);await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG())};
 const choose=async label=>{await ev(`(async()=>{document.querySelector('[aria-label="Open a new tab"]').click();await new Promise(r=>setTimeout(r,80));[...document.querySelectorAll('.global-popover--picker [role="option"]')].find(b=>b.querySelector('strong')?.textContent===${JSON.stringify(label)}).click()})()`);await wait(200)};
 await choose('Home');wc.sendInputEvent({type:'mouseMove',x:700,y:500});await wait(200);
 for(const [x,y]of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(x,y);await snap(`home-${x}x${y}`)}
 w.setContentSize(1440,900);await wait(150);
 if(baseline){console.log('RAIL_BASELINE_CAPTURED');return}
 const point=async label=>ev(`(()=>{const r=document.querySelector(${JSON.stringify('.gwira-primary-rail [aria-label='+JSON.stringify(label)+']')}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
 for(const label of ['Home','Workspace','Scheduled work unavailable','More','Help unavailable']){
  w.focus();wc.focus();await wait(50);wc.sendInputEvent({type:'mouseMove',x:700,y:500});await wait(150);const p=await point(label);wc.sendInputEvent({type:'mouseMove',...p});await wait(450);
  const state=await ev(`(()=>{const b=document.querySelector(${JSON.stringify('.gwira-primary-rail [aria-label='+JSON.stringify(label)+']')}),t=document.querySelector('.gw-rail-tooltip');return {label:b.ariaLabel,disabled:b.disabled,variant:b.querySelector('svg').dataset.iconVariant,color:getComputedStyle(b.querySelector('svg')).color,background:getComputedStyle(b).backgroundColor,tooltip:t?.textContent,opacity:t&&getComputedStyle(t).opacity,rect:t&&{right:t.getBoundingClientRect().right,bottom:t.getBoundingClientRect().bottom}}})()`);
  assert(state.tooltip&&state.opacity==='1','Missing tooltip '+label+' '+JSON.stringify(state));assert(state.rect.right<=1440&&state.rect.bottom<=900,'Tooltip clipped');
  if(label==='Home')assert(state.variant==='solid'&&state.color==='rgb(26, 28, 31)','Selected hover lost fill');
  if(label==='Workspace')assert(state.variant==='outline'&&state.color==='rgb(83, 90, 96)','Inactive hover wrong');
  if(state.disabled)assert(state.background==='rgba(0, 0, 0, 0)','Disabled hover painted');
  await snap('hover-'+label.split(' ')[0].toLowerCase());
 }
 wc.sendInputEvent({type:'mouseMove',x:700,y:500});await wait(180);assert(await ev(`!document.querySelector('.gw-rail-tooltip')`),'Tooltip persisted');
 w.focus();wc.focus();await ev(`document.querySelector('.gwira-primary-rail [aria-label="Home"]').focus()`);wc.sendInputEvent({type:'keyDown',keyCode:'Tab'});wc.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(350);
 assert(await ev(`document.activeElement.ariaLabel==='Workspace'&&document.activeElement.matches(':focus-visible')`),'Keyboard focus');await snap('keyboard-focus');
 wc.sendInputEvent({type:'keyDown',keyCode:'Enter'});wc.sendInputEvent({type:'char',keyCode:'\r'});wc.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait(250);
 assert(await ev(`document.querySelector('.gwira-primary-rail [aria-label="Workspace"]').getAttribute('aria-current')==='page'`),'Keyboard route');
 await ev(`document.querySelector('.gwira-primary-rail [aria-label="More"]').focus()`);await snap('more-trigger');
 wc.sendInputEvent({type:'keyDown',keyCode:'Down'});wc.sendInputEvent({type:'keyUp',keyCode:'Down'});await wait(100);assert(await ev(`document.activeElement.matches('.gwira-more-menu button')`),'Menu arrow navigation');
 wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});assert(await ev(`!document.querySelector('.gwira-more-menu')&&document.activeElement.ariaLabel==='More'`),'Menu Escape');
 for(const label of ['Inbox','My Work','Library','Views','Teams','Doats','Coding agents','Skills','Integrations','Settings'])await choose(label);
 await choose('Inbox');await snap('inbox-unchanged');await choose('Home');
 wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert(await ev(`getComputedStyle(document.querySelector('.gwira-primary-rail button')).transitionDuration==='0s'`),'Reduced motion');
 await snap('reduced-motion');
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,hoverItems:5,routes:12,viewports:4,keyboard:true,reducedMotion:true},null,2));console.log('RAIL_QA_PASS');
}
import(path.resolve('dist/main/main.js'));
