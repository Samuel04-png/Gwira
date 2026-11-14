import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const stage='phase4';
const dir=path.resolve('artifacts/workflow/polish/desktop-redesign',stage);await fs.mkdir(dir,{recursive:true});
const profile=await fs.mkdtemp(path.join(dir,'qa-profile-'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199','--strictPort'],{stdio:'ignore'});
try{for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5199')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
const env={...process.env,NAVIGATION_QA_OUTPUT:dir,ELECTRON_RENDERER_URL:'http://127.0.0.1:5199/',ELECTRON_WORKFLOW_CAPTURE:'1',ELECTRON_WORKFLOW_CAPTURE_TAB_SEQUENCE:'',ELECTRON_WORKFLOW_CAPTURE_F3:'1',ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO:'team',ELECTRON_WORKFLOW_WIDTH:'1440',ELECTRON_WORKFLOW_HEIGHT:'900',ELECTRON_WORKFLOW_CAPTURE_PATH:path.join(dir,'shell.png')};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn('node_modules/.bin/electron',['scripts/desktop-pages-qa.cjs','--force-device-scale-factor=1',`--user-data-dir=${profile}`],{env,stdio:'inherit'});const code=await new Promise(r=>child.on('exit',r));if(code)throw Error('Views QA failed: '+code);
}finally{server.kill();await fs.rm(profile,{recursive:true,force:true});}
