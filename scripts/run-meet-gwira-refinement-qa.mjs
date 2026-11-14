// Runs the Meet Gwira refinement QA in real Electron against local Supabase. Requires `supabase start`, `npm run build`,
// and the Vite dev server via GWIRA_QA_RENDERER_URL (so renderer changes are picked up).
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

execFileSync('node',['scripts/local-supabase-env.mjs'],{stdio:'inherit'});
const out=path.resolve('artifacts/workflow/polish/meet-gwira-refinement');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-meet-qa-'));
const env={...process.env,GWIRA_AUTH_PROFILE:'local-dev',AUTH_QA_PROFILE:profile,AUTH_QA_OUTPUT:out};
if(process.env.GWIRA_QA_RENDERER_URL)env.ELECTRON_RENDERER_URL=process.env.GWIRA_QA_RENDERER_URL;
const code=await new Promise(resolve=>spawn('node_modules/.bin/electron',['scripts/meet-gwira-refinement-qa.cjs'],{env,stdio:'inherit'}).on('exit',resolve));
await fs.rm(profile,{recursive:true,force:true});
process.exit(code);
