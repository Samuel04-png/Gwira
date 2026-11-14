// Real local Auth and PostgREST checks; privileged SQL only sets up membership changes.
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
function denied(result,code,label){if(result.error?.code!==code)throw Error(`${label}: expected ${code}`);}
async function signup(c){
 const result=check(await c.auth.signUp({email:`channel-retry-${randomUUID()}@example.test`,password:`Qa-${randomUUID()}-strong`}), 'signup');
 if(!result.session||!result.user)throw Error('Local signup did not produce a session.');
 return result.user.id;
}
await signup(owner);
const memberId=await signup(member);
await signup(outsider);
const org=check(await owner.schema('gwira').rpc('create_workspace',{p_name:'Channel retry QA',p_request_id:randomUUID()}),'create workspace');
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!idPattern.test(org)||!idPattern.test(memberId))throw Error('Invalid local fixture IDs.');
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_gwira-local-dev','psql','-U','postgres','-v','ON_ERROR_STOP=1','-q'],{input,stdio:['pipe','pipe','pipe']});
sql(`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${org}','${memberId}','member');`);
const id=randomUUID(),request={p_org:org,p_id:id,p_name:'Retry test',p_topic:'',p_visibility:'private',p_members:[memberId]};
const ga=owner.schema('gwira');
if(check(await ga.rpc('create_channel',request),'create channel')!==id)throw Error('Unexpected channel ID.');
sql(`update gwira.organization_memberships set status='suspended' where organization_id='${org}' and user_id='${memberId}';`);
if(check(await ga.rpc('create_channel',request),'retry committed request')!==id)throw Error('Retry returned a different channel.');
denied(await ga.rpc('create_channel',{...request,p_id:randomUUID()}),'42501','new channel with suspended member');
denied(await ga.rpc('create_channel',{...request,p_name:'Different'}),'22023','changed retry');
denied(await member.schema('gwira').rpc('create_channel',request),'42501','suspended actor');
denied(await outsider.schema('gwira').rpc('create_channel',request),'42501','outside actor');
const rows=check(await ga.from('channels').select('id').eq('id',id),'read channel');
if(rows.length!==1)throw Error('Expected exactly one authorized channel.');
sql(`delete from gwira.channel_members where channel_id='${id}' and user_id=(select created_by from gwira.channels where id='${id}');`);
denied(await ga.rpc('create_channel',request),'42501','creator no longer authorized for private channel');
for(const c of [owner,member,outsider])check(await c.auth.signOut(),'sign out');
console.log('LOCAL_CHANNEL_RETRY_HTTP_PASSED: committed retries survive member suspension without bypassing authorization.');
