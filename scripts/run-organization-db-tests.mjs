import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
const name=`gwira-organization-qa-${process.pid}`;
async function run(args,input){const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.stdin.end(input);const code=await new Promise(r=>child.on('exit',r));if(code)throw Error(output);return output;}
try{
 await run(['run','--rm','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-d','postgres:17-alpine']);
 let ready=false;for(let n=0;n<60;n++){try{await run(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break}catch{await new Promise(r=>setTimeout(r,250));}}if(!ready)throw Error('Disposable Postgres did not start.');
 for(const file of ['supabase/tests/auth-fixture.sql','supabase/migrations/20261102090000_organization_access.sql','supabase/migrations/20261103190000_organization_creation_idempotency.sql','supabase/tests/organization-access.sql']){process.stdout.write(`Testing ${file}\n`);const output=await run(['exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1'],await fs.readFile(file));process.stdout.write(output);}
 const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222';
 const sql=statement=>run(['exec',name,'psql','-h','127.0.0.1','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',statement]);
 const created=await sql(`select set_config('request.jwt.claim.sub','${owner}',false);select gwira.create_organization('Concurrent acceptance QA');`);
 const org=created.trim().split('\n').at(-1);if(!/^[a-f0-9-]{36}$/.test(org))throw Error('Missing fixture org');
 await sql(`set role service_role;select gwira.create_invitation('${owner}','${org}','existing@example.test','member',repeat('7',64));`);
 const accept=`set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);select gwira.accept_invitation(repeat('7',64));`;
 const accepted=await Promise.allSettled([sql(accept),sql(accept)]);
 if(accepted.filter(r=>r.status==='fulfilled').length!==1||!accepted.some(r=>r.status==='rejected'&&String(r.reason).includes('invitation_unavailable')))throw Error('Concurrent acceptance was not single-use');
 process.stdout.write('PASS: concurrent acceptance has exactly one winner\n');
 await sql(`select set_config('request.jwt.claim.sub','${owner}',false);select gwira.change_member_role('${org}','${member}','owner');`);
 const demote=actor=>sql(`set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);select gwira.change_member_role('${org}','${actor}','member');`);
 const demotions=await Promise.allSettled([demote(owner),demote(member)]);
 if(demotions.filter(r=>r.status==='fulfilled').length!==1||!demotions.some(r=>r.status==='rejected'&&String(r.reason).includes('final_owner_required')))throw Error('Concurrent owner protection failed');
 process.stdout.write('PASS: concurrent owner demotions preserve one active owner\n');
 const request='99999999-9999-4999-8999-999999999999';
 const once=`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);select gwira.create_organization_once('Idempotent QA','${request}');`;
 const createdOnce=await Promise.all([sql(once),sql(once)]);
 if(createdOnce[0].trim().split('\n').at(-1)!==createdOnce[1].trim().split('\n').at(-1))throw Error('Organization creation duplicated');
 const count=await sql("select count(*) from gwira.organizations where name='Idempotent QA'");if(count.trim()!=='1')throw Error('Duplicate organization');
 process.stdout.write('PASS: concurrent organization retries create one owner/organization\n');
 process.stdout.write('ORGANIZATION_POSTGRES_RLS_QA_PASSED (Auth fixture, not Supabase Auth)\n');
}finally{await run(['stop',name]).catch(()=>{});}
