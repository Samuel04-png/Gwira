const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const out=process.env.NAVIGATION_QA_OUTPUT,wait=ms=>new Promise(r=>setTimeout(r,ms));let checking=false;const exit=app.exit.bind(app);
app.exit=code=>{if(code||checking)return exit(code);checking=true;check().then(()=>exit(0)).catch(e=>{console.error(e);exit(1)})};
async function check(){
 const w=BrowserWindow.getAllWindows()[0],wc=w.webContents;w.show();w.focus();wc.focus();wc.setBackgroundThrottling(false);
 const ev=s=>wc.executeJavaScript(s),assert=(ok,msg)=>{if(!ok)throw Error(msg)},shot=async name=>{await wait(180);await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG())};
 const click=async sel=>{await ev(`document.querySelector(${JSON.stringify(sel)}).click()`);await wait(100)};
 await ev(`localStorage.setItem('codex-desktop.projects.v1',JSON.stringify({projects:[{id:'canvas-gwira',name:'Gwira',path:${JSON.stringify(process.cwd())}},{id:'canvas-long',name:'Operations and collections — quarterly planning workspace',path:${JSON.stringify(path.dirname(process.cwd()))}}],activeProjectId:'canvas-gwira'}))`);
 wc.reload();await wait(1400);await click('.gwira-primary-rail [aria-label="Home"]');
 const measurements=[];
 for(const [width,height]of [[1440,900],[1280,800],[900,700],[780,640]]){
  w.setContentSize(width,height);await wait(100);await shot('welcome-'+width+'x'+height);
  measurements.push(await ev(`(()=>{const e=document.querySelector('.workspace__view--chat .welcome'),h=e.querySelector('h1'),s=e.querySelector('.project-select'),m=e.querySelector('.conversation-brand'),r=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}};return {viewport:[innerWidth,innerHeight],greeting:r(h),brand:r(m),weight:getComputedStyle(h).fontWeight,font:getComputedStyle(h).fontFamily,size:getComputedStyle(h).fontSize,selectorWeight:getComputedStyle(s).fontWeight,underline:getComputedStyle(s).textDecorationThickness,spacing:getComputedStyle(h).letterSpacing,overflow:e.scrollWidth>e.clientWidth}})()`));
 }
 await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify(measurements,null,2));
 if(process.env.CANVAS_QA_PHASE==='before'){console.log('CANVAS_BEFORE_CAPTURED');return;}
 assert(measurements.every(m=>!m.overflow&&m.weight==='400'&&m.selectorWeight==='400'),'Greeting weight or overflow');
 assert(await ev(`(()=>{const l=document.querySelector('.conversation-brand .gwira-logo');return l?.complete&&l.naturalWidth===182&&l.naturalHeight===164})()`),'Official logo missing');
 w.setContentSize(1440,900);await wait(120);
 const trigger='.welcome .project-select';await ev(`document.querySelector('${trigger}').focus()`);await shot('selector-focus');
 await click(trigger);assert(await ev(`!!document.querySelector('.project-selector-popover')`),'Project selector failed');await shot('selector-open');
 await ev(`Array.from(document.querySelectorAll('.project-selector-row')).find(e=>e.textContent.includes('Operations and collections')).click()`);await wait(120);
 assert(await ev(`document.querySelector('.welcome h1').textContent.includes('Operations and collections')`),'Project selection failed');
 w.setContentSize(780,640);await shot('long-context-780x640');assert(await ev(`(()=>{const e=document.querySelector('.welcome');return e.scrollWidth<=e.clientWidth})()`),'Long context overflow');
 await click('.global-topbar [aria-label="Gwira Chat"]');await shot('with-side-chat-780x640');w.setContentSize(1440,900);await shot('with-side-chat-1440x900');
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,viewports:4,officialLogo:true,selector:true,longContext:true},null,2));console.log('CANVAS_WELCOME_QA_PASSED');
}
require('../dist/main/main.js');
