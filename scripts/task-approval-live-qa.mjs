// Real local Auth and PostgREST; privileged SQL only provisions test memberships.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
if(process.env.GWIRA_AUTH_PROFILE!=='local-dev')throw Error('Local profile required.');
const env=Object.fromEntries((await readFile('.env.auth.dev.local','utf8')).split(/\r?\n/).flatMap(line=>{
 const match=/^(GWIRA_[A-Z_]+)=(.*)$/.exec(line.trim());return match?[[match[1],match[2].replace(/^"|"$/g,'')]]:[];
}));
const url=new URL(env.GWIRA_SUPABASE_URL);
if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||!env.GWIRA_SUPABASE_PUBLISHABLE_KEY)throw Error('Local Supabase required.');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const client=()=>createClient(url.href,env.GWIRA_SUPABASE_PUBLISHABLE_KEY,options);
const owner=client(),reviewer=client(),other=client(),foreign=client();
function check(result,label){if(result.error)throw Error(`${label}: ${result.error.code??'request_failed'}`);return result.data;}
function denied(result,code,label){if(result.error?.code!==code)throw Error(`${label}: expected ${code}, got ${result.error?.code??'success'}`);}
async function signup(c){
 const result=check(await c.auth.signUp({email:`approval-qa-${randomUUID()}@example.test`,password:`Qa-${randomUUID()}-strong`}),'signup');
 if(!result.session||!result.user)throw Error('Local signup did not produce a session.');
 return result.user.id;
}
const ownerId=await signup(owner),reviewerId=await signup(reviewer),otherId=await signup(other);
await signup(foreign);
const a=owner.schema('gwira'),b=reviewer.schema('gwira'),c=other.schema('gwira'),d=foreign.schema('gwira');
const org=check(await a.rpc('create_workspace',{p_name:'Approval QA',p_request_id:randomUUID()}),'create workspace');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(![org,ownerId,reviewerId,otherId].every(value=>uuid.test(value)))throw Error('Invalid local fixture IDs.');
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-q'],{input,stdio:['pipe','pipe','pipe']});
sql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${org}','${reviewerId}','member'),('${org}','${otherId}','member');`);
const task=randomUUID(),approval=randomUUID(),create={p_org:org,p_id:task,p_title:'Review actual work',p_reviewer:reviewerId};
check(await a.rpc('create_approval_task',create),'create task');
check(await a.rpc('create_approval_task',create),'retry task');
denied(await a.rpc('create_approval_task',{...create,p_title:'Changed'}),'22023','task conflict');
denied(await a.rpc('create_approval_task',{...create,p_id:randomUUID(),p_reviewer:ownerId}),'22023','self review');
denied(await d.rpc('create_approval_task',{...create,p_id:randomUUID()}),'42501','foreign task');
const submit={p_org:org,p_task:task,p_id:approval,p_result:'Completed the requested human work.'};
denied(await b.rpc('submit_task_approval',submit),'42501','reviewer submit');
check(await a.rpc('submit_task_approval',submit),'submit');
check(await a.rpc('submit_task_approval',submit),'retry submit');
denied(await a.rpc('submit_task_approval',{...submit,p_result:'Changed'}),'22023','submit conflict');
denied(await a.rpc('submit_task_approval',{...submit,p_id:randomUUID()}),'22023','second pending result');
denied(await c.rpc('decide_task_approval',{p_org:org,p_id:approval,p_decision:'approved'}),'42501','other member decision');
denied(await a.rpc('decide_task_approval',{p_org:org,p_id:approval,p_decision:'approved'}),'42501','owner decision');
const notifications=async(client,title)=>check(await client.schema('gwira').from('notifications').select('id,title,body,read_at').eq('organization_id',org).eq('title',title),'notifications');
if((await notifications(reviewer,'Task approval requested')).length!==1||(await notifications(owner,'Task approval requested')).length!==0)throw Error('Request notification isolation or retry failed.');
if(check(await c.from('approval_tasks').select('*').eq('id',task),'other task read').length
 ||check(await c.from('task_approval_results').select('*').eq('id',approval),'other result read').length
 ||check(await d.from('task_approval_results').select('*').eq('id',approval),'foreign result read').length)throw Error('Private approval exposed.');
denied(await a.from('task_approval_results').insert({id:randomUUID(),organization_id:org,task_id:task,submitted_by:ownerId,result_text:'forged'}),'42501','direct result insert');
denied(await a.from('notifications').insert({organization_id:org,recipient_id:reviewerId,title:'Forged',body:'Forged'}),'42501','direct notification insert');
const decision={p_org:org,p_id:approval,p_decision:'changes_requested'};
check(await b.rpc('decide_task_approval',decision),'request changes');
check(await b.rpc('decide_task_approval',decision),'retry decision');
denied(await b.rpc('decide_task_approval',{...decision,p_decision:'approved'}),'22023','changed decision');
if((await notifications(owner,'Task review completed')).length!==1)throw Error('Decision notification missing or duplicated.');
const second=randomUUID();
check(await a.rpc('submit_task_approval',{...submit,p_id:second,p_result:'Revised human work.'}),'submit revision');
check(await b.rpc('decide_task_approval',{p_org:org,p_id:second,p_decision:'approved'}),'approve revision');
const rows=check(await a.from('approval_tasks').select('status').eq('id',task),'task status');
if(rows.length!==1||rows[0].status!=='done'||(await notifications(owner,'Task review completed')).length!==2)throw Error('Approval did not persist correctly.');
sql(`update gwira.organization_memberships set status='suspended' where organization_id='${org}' and user_id='${reviewerId}';`);
denied(await b.rpc('decide_task_approval',{p_org:org,p_id:second,p_decision:'approved'}),'42501','suspended reviewer');
for(const client of [owner,reviewer,other,foreign])check(await client.auth.signOut(),'sign out');
console.log('LOCAL_TASK_APPROVAL_HTTP_PASSED: real results, authorized decisions, recipient isolation and idempotent notifications.');
