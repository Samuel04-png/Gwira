import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
const out=path.resolve('artifacts/workflow/schedule');await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(out,'schedule-qa-profile-'));
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));})});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
try {
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}if(!ready)throw Error('Vite unavailable');
 const env={...process.env,ELECTRON_RENDERER_URL:`http://127.0.0.1:${port}/`};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn('node_modules/.bin/electron',['scripts/schedule-qa.cjs','--force-device-scale-factor=1',`--user-data-dir=${profile}`],{env,stdio:'inherit'});
 const timeout=setTimeout(()=>child.kill('SIGKILL'),60000);
 const result=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject)});clearTimeout(timeout);if(result!==0)throw Error('Schedule QA failed: '+result);
} finally {server.kill();await fs.rm(profile,{recursive:true,force:true})}
