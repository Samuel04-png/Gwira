import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const dir=path.join(root,'artifacts/workflow/polish/topbar-phase3',process.env.TOPBAR_QA_PHASE || 'after');
await fs.mkdir(dir,{recursive:true});
const profile=await fs.mkdtemp(path.join(dir,'qa-profile-'));
try{
 const env={...process.env,NAVIGATION_QA_OUTPUT:dir,ELECTRON_WORKFLOW_CAPTURE:'1',ELECTRON_WORKFLOW_CAPTURE_TAB_SEQUENCE:'',ELECTRON_WORKFLOW_CAPTURE_F3:'1',ELECTRON_WORKFLOW_CAPTURE_F3_SCENARIO:'team',ELECTRON_WORKFLOW_WIDTH:'1440',ELECTRON_WORKFLOW_HEIGHT:'900',ELECTRON_WORKFLOW_CAPTURE_PATH:path.join(dir,'initial-dashboard.png')};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
 const child=spawn('node_modules/.bin/electron',['scripts/topbar-quality-qa.cjs','--force-device-scale-factor=1',`--user-data-dir=${profile}`],{env,stdio:'inherit'});
 const result=await new Promise(r=>child.on('exit',r));if(result)throw Error('Visual QA failed: '+result);
}finally{await fs.rm(profile,{recursive:true,force:true})}
