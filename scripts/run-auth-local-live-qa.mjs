// Runs the real-Electron auth QA against the local Supabase stack. Requires `supabase start`, `npm run build`
// and (for the development preview check) the Vite dev server via GWIRA_QA_RENDERER_URL.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

execFileSync('node',['scripts/local-supabase-env.mjs'],{stdio:'inherit'});
const out=path.resolve('artifacts/workflow/authentication-supabase/local-live');
await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-live-qa-'));
const env={...process.env,GWIRA_AUTH_PROFILE:'local-dev',AUTH_QA_PROFILE:profile,AUTH_QA_OUTPUT:out};
if(process.env.GWIRA_QA_RENDERER_URL)env.ELECTRON_RENDERER_URL=process.env.GWIRA_QA_RENDERER_URL;
let failed=false;
try{
  for(const phase of ['flow','resume','returning','noworkspace','noworkspace2','offline','setup-missing','revoked']){
    const code=await new Promise(resolve=>{
      const child=spawn('node_modules/.bin/electron',['scripts/auth-local-live-qa.cjs'],{env:{...env,AUTH_QA_PHASE:phase,...(phase==='revoked'?{QA_ORG_COUNT_BEFORE:execFileSync('docker',['exec','supabase_db_gwira-local-dev','psql','-U','postgres','-tAc','select count(*) from gwira.organizations'],{encoding:'utf8'}).trim()}:{})},stdio:'inherit'});
      child.on('exit',resolve);
    });
    if(code!==0){failed=true;break;}
  }
}finally{await fs.rm(profile,{recursive:true,force:true});}
process.exit(failed?1:0);
