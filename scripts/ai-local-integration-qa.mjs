// Real local Auth, PostgREST and server gateway; provider is a test double, not live AI.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {SupabaseAiGateway} from '../dist-server/server/hostedAuth/aiGateway.js';
import {AiService,DeepSeekProvider} from '../dist-server/server/hostedAuth/aiService.js';
if(process.env.GWIRA_AUTH_PROFILE!=='local-dev')throw Error('Local profile required.');
const raw=execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const env=Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=/^([A-Z_]+)="(.*)"$/.exec(line);return m?[[m[1],m[2]]]:[];}));
const url=new URL(env.API_URL);
if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Local Supabase required.');
if(!env.ANON_KEY||!env.SERVICE_ROLE_KEY)throw Error('Local Supabase keys unavailable.');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const a=createClient(url.href,env.ANON_KEY,options),b=createClient(url.href,env.ANON_KEY,options);
function check(result,label){if(result.error)throw Error(`${label}: ${result.error.code??'failed'}`);return result.data;}
async function signup(client){
 const result=check(await client.auth.signUp({email:`ai-qa-${randomUUID()}@example.test`,password:`Qa-${randomUUID()}-strong`}),'signup');
 if(!result.user||!result.session)throw Error('Local signup needs a session.');
 return result;
}
const aUser=await signup(a),bUser=await signup(b),ga=a.schema('gwira'),gb=b.schema('gwira');
const org=check(await ga.rpc('create_workspace',{p_name:'AI gateway QA',p_request_id:randomUUID()}),'create workspace');
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!idPattern.test(org)||!idPattern.test(bUser.user.id))throw Error('Invalid local fixture IDs.');
execFileSync('docker',['exec','-i','supabase_db_gwira-local-dev','psql','-U','postgres','-q','-v','ON_ERROR_STOP=1'],{
 input:`insert into gwira.organization_memberships(organization_id,user_id,role) values ('${org}','${bUser.user.id}','admin');`,stdio:['pipe','pipe','pipe']
});
const conversationId=randomUUID(),messageId=randomUUID();
check(await ga.rpc('create_conversation',{p_org:org,p_id:conversationId,p_title:'Private gateway QA',p_visibility:'private'}),'create conversation');
check(await ga.rpc('send_conversation_message',{p_id:conversationId,p_message:messageId,p_content:'First question'}),'send question');
let calls=0;const requests=[];
const provider=new DeepSeekProvider('test-provider-key','deepseek-flash',async (endpoint,options)=>{
 if(endpoint!=='https://api.deepseek.com/chat/completions'||options.headers.Authorization!=='Bearer test-provider-key')throw Error('Incorrect provider request.');
 const body=JSON.parse(options.body);
 if(body.model!=='deepseek-flash'||body.max_tokens!==1000||body.thinking?.type!=='disabled')throw Error('Incorrect provider configuration.');
 calls++;requests.push(body);
 return new Response(JSON.stringify({choices:[{message:{content:'Test double response'}}],usage:{prompt_tokens:10,completion_tokens:4}}),{status:200});
});
const service=new AiService(new SupabaseAiGateway(url.origin,env.ANON_KEY,env.SERVICE_ROLE_KEY),provider,'deepseek-flash',20);
const request={conversationId,messageId,requestId:messageId};
try{await service.generate(bUser.session.access_token,request);throw Error('Same-organization admin accessed private conversation.');}
catch(error){if(error.message==='Same-organization admin accessed private conversation.')throw error;}
if(calls!==0)throw Error('Unauthorized request reached provider.');
if((await service.generate(aUser.session.access_token,request)).status!=='completed')throw Error('Generation did not complete.');
if((await service.generate(aUser.session.access_token,request)).status!=='completed'||calls!==1)throw Error('Retry repeated provider request.');
const rows=check(await ga.from('conversation_messages').select('id,author_type,content').eq('conversation_id',conversationId),'read messages');
if(rows.filter(row=>row.author_type==='assistant').length!==1)throw Error('Expected exactly one saved assistant message.');
if(check(await gb.from('conversation_messages').select('id').eq('conversation_id',conversationId),'other read').length)throw Error('Private message leaked.');
const assistant=rows.find(row=>row.author_type==='assistant');
const saved=check(await ga.rpc('save_ai_plan',{p_conversation:conversationId,p_message:assistant.id,p_expected_version:null}),'save plan');
if(!Array.isArray(saved)||saved.length!==1)throw Error('Plan save returned invalid result.');
const repeated=check(await ga.rpc('save_ai_plan',{p_conversation:conversationId,p_message:assistant.id,p_expected_version:null}),'repeat plan save');
if(repeated[0].plan_id!==saved[0].plan_id||repeated[0].version!==1)throw Error('Plan retry created another version.');
if(check(await gb.from('plan_documents').select('id').eq('id',saved[0].plan_id),'other plan read').length)throw Error('Private plan leaked.');
const followup=randomUUID();check(await ga.rpc('send_conversation_message',{p_id:conversationId,p_message:followup,p_content:'Follow-up'}),'send followup');
if((await service.generate(aUser.session.access_token,{conversationId,messageId:followup,requestId:followup})).status!=='completed')throw Error('Follow-up failed.');
if(!requests[1].messages.some(row=>row.content==='First question')||!requests[1].messages.some(row=>row.content==='Test double response'))throw Error('Follow-up omitted prior context.');
if(!requests[1].messages.some(row=>row.content.includes('authorized linked plan')&&row.content.includes('Test double response')))throw Error('Authorized linked plan missing from context.');
await a.auth.signOut();await b.auth.signOut();
console.log('LOCAL_DEEPSEEK_GATEWAY_TEST_DOUBLE_PASSED: real Auth/RLS, DeepSeek request adapter, linked private plan, bounded context, idempotency and same-org denial; no real provider call.');
