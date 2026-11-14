// Local Auth and PostgREST test; privileged SQL only sets up test memberships.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

if(process.env.GWIRA_AUTH_PROFILE!=='local-dev')throw Error('This test requires the local-dev profile.');
const env=Object.fromEntries((await readFile('.env.auth.dev.local','utf8')).split(/\r?\n/).flatMap(line=>{
 const match=/^(GWIRA_[A-Z_]+)=(.*)$/.exec(line.trim());
 return match?[[match[1],match[2].replace(/^"|"$/g,'')]]:[];
}));
const url=new URL(env.GWIRA_SUPABASE_URL);
if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local Supabase required.');
if(!env.GWIRA_SUPABASE_PUBLISHABLE_KEY)throw Error('Missing local publishable key.');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const client=()=>createClient(url.href,env.GWIRA_SUPABASE_PUBLISHABLE_KEY,options);
const owner=client(),member=client(),outsider=client();
function check(result,label){if(result.error)throw Error(`${label}: ${result.error.code??'request_failed'}`);return result.data;}
function denied(result,code,label){if(result.error?.code!==code)throw Error(`${label}: expected ${code}, got ${result.error?.code??'success'}`);}
async function signup(c){
 const result=check(await c.auth.signUp({email:`directory-create-${randomUUID()}@example.test`,password:`Qa-${randomUUID()}-strong`}), 'signup');
 if(!result.session||!result.user)throw Error('Local signup did not produce a session.');
 return result.user.id;
}
await signup(owner);const memberId=await signup(member);await signup(outsider);
const ga=owner.schema('gwira'),gm=member.schema('gwira'),go=outsider.schema('gwira');
const org=check(await ga.rpc('create_workspace',{p_name:'Directory create QA',p_request_id:randomUUID()}),'create workspace');
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!idPattern.test(org)||!idPattern.test(memberId))throw Error('Invalid local fixture IDs.');
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-q'],{input,stdio:['pipe','pipe','pipe']});
sql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${org}','${memberId}','member');`);
const id=randomUUID(),request={p_org:org,p_id:id,p_name:' QA person ',p_job_title:' Designer '};
if(check(await ga.rpc('create_directory_person',request),'create person')!==id)throw Error('Unexpected person ID.');
if(check(await ga.rpc('create_directory_person',request),'retry person')!==id)throw Error('Retry returned a different person.');
denied(await ga.rpc('create_directory_person',{...request,p_name:'Changed'}),'22023','conflicting retry');
denied(await ga.rpc('create_directory_person',{...request,p_id:randomUUID(),p_name:'qa PERSON',p_job_title:'designer'}),'23505','duplicate person');
denied(await gm.rpc('create_directory_person',{...request,p_id:randomUUID(),p_name:'Member attempt'}),'42501','member create');
denied(await go.rpc('create_directory_person',{...request,p_id:randomUUID(),p_name:'Outsider attempt'}),'42501','outsider create');
const concurrent={...request,p_id:randomUUID(),p_name:'Concurrent person'};
const concurrentResults=await Promise.all([ga.rpc('create_directory_person',concurrent),ga.rpc('create_directory_person',concurrent)]);
if(concurrentResults.some(result=>check(result,'concurrent idempotent retry')!==concurrent.p_id))throw Error('Concurrent retries were not idempotent.');
const competing={...request,p_name:'Competing person'};
const competingResults=await Promise.all([ga.rpc('create_directory_person',{...competing,p_id:randomUUID()}),ga.rpc('create_directory_person',{...competing,p_id:randomUUID()})]);
if(competingResults.filter(result=>!result.error).length!==1||competingResults.filter(result=>result.error?.code==='23505').length!==1)throw Error('Concurrent duplicate names were not rejected.');
const rows=check(await gm.from('employees').select('id,user_id,name,job_title').eq('id',id),'member read');
if(rows.length!==1||rows[0].user_id!==null||rows[0].name!=='QA person'||rows[0].job_title!=='Designer')throw Error('Invalid directory record.');
const hidden=check(await go.from('employees').select('id').eq('id',id),'outsider read');
if(hidden.length)throw Error('Directory person exposed to outsider.');
denied(await gm.from('employees').insert({id:randomUUID(),organization_id:org,name:'Forged',job_title:'Admin'}),'42501','direct insert');
sql(`update gwira.organization_memberships set status='suspended' where organization_id='${org}' and user_id='${memberId}';`);
denied(await gm.rpc('create_directory_person',request),'42501','suspended member');
for(const c of [owner,member,outsider])check(await c.auth.signOut(),'sign out');
console.log('LOCAL_DIRECTORY_CREATE_HTTP_PASSED: admin-only, idempotent directory creation with workspace isolation and no membership grant.');
