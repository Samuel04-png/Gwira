// Local Auth and PostgREST test. The local database administrator grants the test membership.
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
const a=createClient(url.href,env.GWIRA_SUPABASE_PUBLISHABLE_KEY,options);
const b=createClient(url.href,env.GWIRA_SUPABASE_PUBLISHABLE_KEY,options);
function check(result,label){if(result.error)throw Error(`${label}: ${result.error.code??'request_failed'}`);return result.data;}
function denied(result,label){if(result.error?.code!=='42501')throw Error(`${label}: expected access denial`);}
async function signup(client){
 const result=check(await client.auth.signUp({email:`plan-privacy-${randomUUID()}@example.test`,password:`Qa-${randomUUID()}-strong`}), 'signup');
 if(!result.session||!result.user)throw Error('Local signup did not produce a session.');
 return result.user.id;
}
await signup(a);
const bId=await signup(b);
const ga=a.schema('gwira'),gb=b.schema('gwira');
const org=check(await ga.rpc('create_workspace',{p_name:'Plan privacy QA',p_request_id:randomUUID()}),'create workspace');
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!idPattern.test(org)||!idPattern.test(bId))throw Error('Invalid local fixture IDs.');
execFileSync('docker',['exec','-i','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-q'],{
 input:`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${org}','${bId}','admin');`,
 stdio:['pipe','pipe','pipe']
});
const saved=check(await ga.rpc('save_plan_draft',{p_org:org,p_plan:null,p_title:'Private test',p_markdown:'Private content',p_structured:{},p_expected_version:null,p_summary:''}),'save private plan');
if(!Array.isArray(saved)||saved.length!==1)throw Error('Unexpected plan response.');
const plan=saved[0].plan_id,conversation=randomUUID();
check(await ga.rpc('create_conversation',{p_org:org,p_id:conversation,p_title:'Private',p_visibility:'private'}),'create conversation');
check(await ga.rpc('link_conversation_plan',{p_id:conversation,p_plan:plan}),'link plan');
const own=check(await ga.from('plan_documents').select('id,visibility').eq('id',plan),'owner read');
if(own.length!==1||own[0].visibility!=='private')throw Error('Owner cannot read private plan.');
for(const [table,column,id] of [['plan_documents','id',plan],['plan_versions','plan_id',plan],['plan_approvals','plan_id',plan],['conversation_plan_links','plan_id',plan],['conversations','id',conversation]]){
 const rows=check(await gb.from(table).select('*').eq(column,id),`admin ${table} read`);
 if(rows.length)throw Error(`Private ${table} visible to same-organization admin.`);
}
denied(await gb.rpc('save_plan_draft',{p_org:org,p_plan:plan,p_title:'Forged',p_markdown:'x',p_structured:{},p_expected_version:1,p_summary:''}),'admin edit');
denied(await gb.rpc('approve_plan',{p_org:org,p_plan:plan,p_version:1,p_method:'button'}),'admin approval');
check(await a.auth.signOut(),'owner sign out');
check(await b.auth.signOut(),'admin sign out');
console.log('LOCAL_PLAN_PRIVACY_HTTP_PASSED: real same-organization admin cannot read, edit or approve private plan.');
