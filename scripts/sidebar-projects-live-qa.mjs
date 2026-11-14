// Real local Auth and PostgREST project checks. Only the generated fixtures are removed.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

if(process.env.GWIRA_AUTH_PROFILE!=='local-dev')throw Error('Local development profile required.');
const env=Object.fromEntries((await readFile('.env.auth.dev.local','utf8')).split(/\r?\n/).flatMap(line=>{
 const match=/^(GWIRA_[A-Z_]+)=(.*)$/.exec(line.trim());
 return match?[[match[1],match[2].replace(/^"|"$/g,'')]]:[];
}));
const url=new URL(env.GWIRA_SUPABASE_URL);
if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||!env.GWIRA_SUPABASE_PUBLISHABLE_KEY)throw Error('Local Supabase configuration required.');
const client=()=>createClient(url.href,env.GWIRA_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const owner=client(),other=client(),users=[],orgs=[];
const check=(result,label)=>{if(result.error)throw Error(`${label}: ${result.error.code??'request_failed'}`);return result.data;};
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_gwira-local-dev','psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-q'],{input,stdio:['pipe','pipe','pipe']});
async function signup(c){
 const email=`project-qa-${randomUUID()}@example.test`,password=`Qa-${randomUUID()}-strong`;
 const result=check(await c.auth.signUp({email,password}),'signup');
 if(result.user)users.push(result.user.id);
 if(!result.user||!result.session)throw Error('Local signup did not produce a session.');
 return {email,password};
}
try{
 const credentials=await signup(owner);await signup(other);
 const a=owner.schema('gwira'),b=other.schema('gwira');
 const org=check(await a.rpc('create_workspace',{p_name:'Project API QA',p_request_id:randomUUID()}),'create workspace');orgs.push(org);
 const otherOrg=check(await b.rpc('create_workspace',{p_name:'Other project API QA',p_request_id:randomUUID()}),'create other workspace');orgs.push(otherOrg);
 const project=randomUUID(),section=randomUUID(),conversation=randomUUID(),person=randomUUID(),channel=randomUUID(),message=randomUUID();
 const change=(action,extra={})=>a.rpc('mutate_sidebar_project',{p_org:org,p_project:project,p_action:action,...extra});
 check(await change('create',{p_value:'Operations'}),'create project');
 check(await change('section',{p_value:'Planning',p_section:section}),'create section');
 check(await a.rpc('create_conversation',{p_org:org,p_id:conversation,p_title:'Project conversation',p_visibility:'private'}),'create conversation');
 check(await change('move',{p_section:section,p_conversation:conversation}),'associate conversation');
 check(await a.rpc('create_directory_person',{p_org:org,p_id:person,p_name:'QA person',p_job_title:'Designer'}),'create directory person');
 check(await a.rpc('create_channel',{p_org:org,p_id:channel,p_name:'qa-channel',p_topic:'',p_visibility:'private',p_members:[]}),'create channel');
 check(await a.rpc('send_channel_message',{p_org:org,p_channel:channel,p_id:message,p_body:'QA message'}),'send channel message');
 const read=async()=>{
  const projects=check(await a.from('sidebar_projects').select('*').eq('organization_id',org).order('updated_at',{ascending:false}).order('id'),'project list');
  const sections=check(await a.from('sidebar_project_sections').select('*,sidebar_projects!inner(organization_id)').eq('sidebar_projects.organization_id',org).order('created_at').order('id'),'section list');
  const links=check(await a.from('sidebar_project_conversations').select('*,sidebar_projects!inner(organization_id)').eq('sidebar_projects.organization_id',org).order('project_id').order('conversation_id'),'link list');
  if(!projects.some(p=>p.id===project)||!sections.some(s=>s.id===section)||!links.some(l=>l.project_id===project&&l.conversation_id===conversation&&l.section_id===section))throw Error('Project or association missing.');
  const people=check(await a.from('employees').select('id,organization_id,user_id,name,job_title,created_at').eq('organization_id',org).order('name').order('id'),'directory list');
  const pins=check(await a.from('directory_pins').select('employee_id').eq('organization_id',org).eq('user_id',users[0]).order('employee_id'),'directory pins');
  const channels=check(await a.rpc('list_channels',{p_org:org}),'channel list');
  const messages=check(await a.from('channel_messages').select('id,organization_id,channel_id,seq,author_id,body,created_at').eq('organization_id',org).eq('channel_id',channel).order('seq'),'channel messages');
  if(!people.some(p=>p.id===person)||!Array.isArray(pins)||!channels.some(c=>c.id===channel)||!messages.some(m=>m.id===message))throw Error('Directory, channel or message missing.');
 };
 await read();
 const hidden=check(await b.from('sidebar_projects').select('id').eq('id',project),'other workspace project read');
 if(hidden.length)throw Error('Project exposed across workspaces.');
 if(check(await b.from('employees').select('id').eq('id',person),'other workspace directory read').length)throw Error('Directory exposed across workspaces.');
 if(check(await b.from('channel_messages').select('id').eq('id',message),'other workspace channel read').length)throw Error('Channel message exposed across workspaces.');
 const denied=await b.rpc('mutate_sidebar_project',{p_org:org,p_project:project,p_action:'rename',p_value:'Unauthorized'});
 if(denied.error?.code!=='42501')throw Error('Cross-workspace project mutation was not denied.');
 check(await owner.auth.signOut(),'sign out');
 check(await owner.auth.signInWithPassword(credentials),'sign in again');
 await read();
}finally{
 for(const c of [owner,other])await c.auth.signOut();
 const ids=values=>values.map(id=>`'${id}'::uuid`).join(',');
 const cleanup=[orgs.length?`delete from gwira.channel_messages where organization_id in (${ids(orgs)}); delete from gwira.organizations where id in (${ids(orgs)});`:'',users.length?`delete from auth.users where id in (${ids(users)});`:''].join(' ');
 if(cleanup)sql(`begin; ${cleanup} commit;`);
}
console.log('LOCAL_WORKSPACE_HTTP_PASSED: projects, directory, channels and messages persist across sign-in; cross-workspace access denied; fixtures cleaned.');
