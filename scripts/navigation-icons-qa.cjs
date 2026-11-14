const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');const path=require('node:path');
const out=path.resolve(process.env.NAVIGATION_QA_OUTPUT || 'artifacts/workflow/navigation-icons');
const exit=app.exit.bind(app);let checking=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.exit=code=>{if(code||checking)return exit(code);checking=true;check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)});};
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents;w.show();w.focus();wc.setBackgroundThrottling(false);
 const ev=s=>wc.executeJavaScript(s);const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 const choose=async label=>{w.setContentSize(1440,900);await wait(80);await ev(`(async()=>{document.querySelector('[aria-label="Open a new tab"]').click();await new Promise(r=>setTimeout(r,80));const b=[...document.querySelectorAll('.global-popover--picker [role="option"]')].find(x=>x.querySelector('strong')?.textContent==='${label}');if(!b)throw Error('Missing destination ${label}');b.click()})()`);await wait(180)};
 const read=selector=>ev(`(()=>{const svg=document.querySelector(${JSON.stringify(selector)});if(!svg)return null;const r=svg.getBoundingClientRect();return {variant:svg.dataset.iconVariant,paths:svg.innerHTML,color:getComputedStyle(svg).color,x:r.x,y:r.y,width:r.width,height:r.height}})()`);
 const home='.gwira-primary-rail [data-navigation-view="home"] svg';
 await choose('Home');const activeHome=await read(home);assert(activeHome.variant==='solid','Home not solid');
 await choose('Dashboard');const inactiveHome=await read(home);assert(inactiveHome.variant==='outline','Home did not revert');assert(activeHome.paths!==inactiveHome.paths,'Home reused outline geometry');
 for(const k of ['x','y','width','height'])assert(activeHome[k]===inactiveHome[k],'Home geometry changed: '+k);
 const routes=[['Home','home','home'],['Dashboard','dashboard','dashboard'],['Inbox','inbox','inbox'],['My Work','my-work','work'],['Library','library','library'],['Views','organization','views'],['Teams','teams','teams'],['Doats','doats','doats'],['Coding agents','agents','agents'],['Skills','skills','skills'],['Integrations','integrations','integrations'],['Settings','settings','settings']];
 const results=[];
 for(const [label,route,icon] of routes){
  await choose(label);
  if(['teams','doats','agents','skills','integrations','settings'].includes(route)){await ev(`document.querySelector('.gwira-primary-rail [aria-label="More"]').click()`);await wait(80)}
  const selected=await read(`[data-navigation-view="${route}"] svg[data-navigation-icon="${icon}"]`);assert(selected?.variant==='solid',label+' missing solid icon');assert(selected.color==='rgb(59, 61, 63)',label+' color mismatch');results.push({route,selected});
  for(const [width,height] of [[1440,900],[1280,800],[900,700],[780,640]]){w.setContentSize(width,height);wc.invalidate();await wait(250);await fs.writeFile(path.join(out,`${route}-${width}x${height}.png`),(await wc.capturePage()).toPNG())}
 }
 await choose('Inbox');
 const inbox=[];
 for(const id of ['unread','threads','drafts','needs-review','mentions','saved']){
  await ev(`document.querySelector('.gw-msg-nav [data-nav-id="${id}"]').click()`);await wait(80);
  const s=await read(`.gw-msg-nav [data-nav-id="${id}"] svg`);assert(s?.variant==='solid',id+' not solid');inbox.push({id,selected:s.variant});
 }
 await choose('Home');
 wc.debugger.attach('1.3');await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');
 const {root}=await wc.debugger.sendCommand('DOM.getDocument');const selector='.gwira-primary-rail [data-navigation-view="home"]';
 const {nodeId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector});
 const states={};
 for(const state of ['default','hover','active','focus-visible']){await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state==='default'?[]:[state]});await wait(170);states[state]=await ev(`(()=>{const b=document.querySelector('${selector}'),s=getComputedStyle(b);return {background:s.backgroundColor,outline:s.outlineStyle,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}})()`);await fs.writeFile(path.join(out,`rail-${state}.png`),(await wc.capturePage()).toPNG())}
 assert(states.default.background==='rgb(237, 234, 227)','Rail selected paint mismatch');assert(states.hover.background===states.default.background,'Selected background must persist on hover');assert(states['focus-visible'].outline==='solid','No keyboard focus');
 await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
 const inactiveSelector='.gwira-primary-rail [data-navigation-view="dashboard"]';
 const {nodeId:inactiveId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:inactiveSelector});
 const cycle={};
 for(const state of ['default','hover','active']){
  await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId:inactiveId,forcedPseudoClasses:state==='default'?[]:[state]});await wait(180);
  cycle[state]=await ev(`(()=>{const b=document.querySelector('${inactiveSelector}'),g=b.querySelector('svg');return {variant:g.dataset.iconVariant,color:getComputedStyle(g).color,background:getComputedStyle(b).backgroundColor,paths:g.innerHTML,transition:getComputedStyle(g).transitionDuration}})()`);
  await fs.writeFile(path.join(out,'inactive-'+state+'.png'),(await wc.capturePage()).toPNG());
 }
 assert(cycle.default.color==='rgb(112, 108, 101)'&&cycle.default.background==='rgba(0, 0, 0, 0)','Default state mismatch');
 assert(cycle.hover.color==='rgb(59, 61, 63)'&&cycle.hover.background==='rgb(238, 236, 230)','Hover state mismatch');
 assert(cycle.hover.variant==='outline'&&cycle.default.paths===cycle.hover.paths,'Hover changed icon geometry');
 assert(cycle.hover.transition==='0.15s','Hover timing mismatch');
 assert(cycle.active.background==='rgb(230, 227, 220)','Pressed feedback mismatch');
 await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId:inactiveId,forcedPseudoClasses:[]});
 await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(70);
 const reduced=await ev(`getComputedStyle(document.querySelector('${selector}')).transitionDuration`);assert(reduced==='0s','Reduced motion failed');
 w.focus();wc.focus();await wait(100);
 await ev(`document.querySelector('${selector}').focus()`);wc.sendInputEvent({type:'keyDown',keyCode:'Tab'});wc.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(50);
 const keyboard=await ev(`({label:document.activeElement.getAttribute('aria-label'),visible:document.activeElement.matches(':focus-visible')})`);assert(keyboard.label==='Workspace'&&keyboard.visible,'Keyboard focus failed: '+JSON.stringify(keyboard));wc.sendInputEvent({type:'keyDown',keyCode:'Enter'});wc.sendInputEvent({type:'char',keyCode:'\r'});wc.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait(400);assert((await read(home)).variant==='outline','Keyboard routing did not revert Home');
 await choose('Home');w.setContentSize(900,700);await wait(150);
 const header=await ev(`(()=>{const h=document.querySelector('.gwira-title'),t=h.querySelector('strong');return {text:t.textContent,display:getComputedStyle(t).display,width:t.getBoundingClientRect().width,hasLogo:!!h.querySelector('svg,img')}})()`);assert(header.text==='Gwira'&&header.display!=='none'&&header.width>0&&!header.hasLogo,'Text header missing at900px');
 w.setContentSize(1440,900);await ev(`document.querySelector('.gwira-primary-rail [aria-label="More"]').click()`);await wait(100);
 const {root:menuRoot}=await wc.debugger.sendCommand('DOM.getDocument');const {nodeId:menuId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:menuRoot.nodeId,selector:'.gwira-more-menu button'});
 await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId:menuId,forcedPseudoClasses:['active']});await wait(50);
 const menuTransform=await ev(`getComputedStyle(document.querySelector('.gwira-more-menu button')).transform`);assert(menuTransform==='none','Pressed More destination moved');await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId:menuId,forcedPseudoClasses:[]});
 await ev(`document.querySelector('.gwira-primary-rail [aria-label="More"]').click()`);
 // Isolated style probes are explicitly labelled; no business records are created.
 await ev(`(()=>{const p=document.createElement('section');p.id='brand-style-probes';p.style='position:fixed;z-index:10000;top:200px;left:400px;width:400px;padding:24px;background:var(--gw-surface);border:1px solid var(--gw-border)';p.innerHTML='<h2>UI verification fixtures</h2><button id="brand-primary" data-gw-button data-variant="primary" class="gw-button">Primary action style</button><button id="brand-unread" class="gw-inbox-row is-unread" style="margin-top:16px">Unread marker style</button>';document.body.append(p)})()`);
 const brand=await ev(`({action:getComputedStyle(document.querySelector('#brand-primary')).backgroundColor,dot:getComputedStyle(document.querySelector('#brand-unread'),'::before').backgroundColor,focus:getComputedStyle(document.documentElement).getPropertyValue('--gw-focus-color').trim()})`);
 assert(brand.action==='rgb(66, 84, 230)'&&brand.dot==='rgb(72, 98, 252)','Approved brand paints did not reach controls');await fs.writeFile(path.join(out,'brand-style-probes.png'),(await wc.capturePage()).toPNG());await ev(`document.querySelector('#brand-style-probes').remove()`);
 await fs.writeFile(path.join(out,'session-1-checks.json'),JSON.stringify({header,menuTransform,brand},null,2));
 await ev(`import(${JSON.stringify('/@fs/'+path.resolve('scripts/navigation-icons-gallery.tsx'))}).then(m=>m.showNavigationPairs())`);await wait(200);
 const pairs=await ev(`Array.from(document.querySelectorAll('[data-pair]')).map(row=>{const [a,b]=row.querySelectorAll('svg');const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return {name:row.dataset.pair,differentPaths:a.innerHTML!==b.innerHTML,sameSize:x.width===y.width&&x.height===y.height,sameViewBox:a.getAttribute('viewBox')===b.getAttribute('viewBox')}})`);
 for(const pair of pairs)assert(pair.differentPaths&&pair.sameSize&&pair.sameViewBox,'Pair geometry failed: '+pair.name);
 await fs.writeFile(path.join(out,'all-icon-pairs.png'),(await wc.capturePage()).toPNG());
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({home:{active:activeHome,inactive:inactiveHome},routes:results,inbox,pairs,states,cycle,reduced,keyboard},null,2));console.log('NAVIGATION_ICONS_QA_PASS',JSON.stringify({destinations:results.length,inbox:inbox.length,states,reduced,keyboard}));
}
import(path.resolve('dist/main/main.js'));
