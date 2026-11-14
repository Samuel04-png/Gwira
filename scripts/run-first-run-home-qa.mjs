// Real-Electron QA for first-run Home against LOCAL Supabase. Requires `supabase start`, `npm run build` and a Vite dev server
// (GWIRA_QA_RENDERER_URL) because first-run Home renders in development only.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
execFileSync('node',['scripts/local-supabase-env.mjs'],{stdio:'inherit'});
const out=path.resolve('artifacts/workflow/polish/home-first-run-onboarding');
await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-first-run-qa-'));
const env={...process.env,GWIRA_AUTH_PROFILE:'local-dev',AUTH_QA_PROFILE:profile,AUTH_QA_OUTPUT:out,ELECTRON_RENDERER_URL:process.env.GWIRA_QA_RENDERER_URL};
const status=execFileSync('supabase',['status','-o','env'],{encoding:'utf8'});const apiUrl=/API_URL="?([^"\n]+)/.exec(status)?.[1];const anon=/(?:ANON_KEY|PUBLISHABLE_KEY)="?([^"\n]+)/.exec(status)?.[1];
env.QA_API_URL=apiUrl;env.QA_API_KEY=anon;
const phases=(process.env.FR_PHASES??'journey,resume,returning').split(',');
let failed=false;
try{for(const phase of phases){
 const code=await new Promise(resolve=>spawn('node_modules/.bin/electron',['scripts/first-run-home-qa.cjs'],{env:{...env,FR_PHASE:phase},stdio:'inherit'}).on('exit',resolve));
 if(code!==0){failed=true;break;}
}}finally{await fs.rm(profile,{recursive:true,force:true});}
process.exit(failed?1:0);
