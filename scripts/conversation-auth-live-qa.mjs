// Real local Supabase Auth and PostgREST verification; creates disposable local accounts.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

if (process.env.GWIRA_AUTH_PROFILE !== 'local-dev') throw Error('This test requires the local-dev profile.');
const env=Object.fromEntries((await readFile('.env.auth.dev.local','utf8')).split(/\r?\n/).flatMap(line=>{
 const match=/^(GWIRA_[A-Z_]+)=(.*)$/.exec(line.trim());
 return match?[[match[1],match[2].replace(/^"|"$/g,'')]]:[];
}));
const url=new URL(env.GWIRA_SUPABASE_URL);
if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local Supabase required.');
const key=env.GWIRA_SUPABASE_PUBLISHABLE_KEY;
if(!key)throw Error('Missing local publishable key.');
const authOptions={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
const a=createClient(url.href,key,{auth:authOptions});
const b=createClient(url.href,key,{auth:authOptions});
function check(result,label){if(result.error)throw Error(`${label}: ${result.error.code??'request_failed'}`);return result.data;}
function denied(result,label,code='42501'){if(result.error?.code!==code)throw Error(`${label}: expected ${code}, got ${result.error?.code??'success'}`);}
async function signUp(client){
 const result=check(await client.auth.signUp({email:`conversation-${randomUUID()}@example.test`,password:`Qa-${randomUUID()}-strong`}), 'signup');
 if(!result.session||!result.user)throw Error('Local signup did not produce a session.');
}
await signUp(a);
await signUp(b);
const ga=a.schema('gwira'),gb=b.schema('gwira');
const orgA=check(await ga.rpc('create_workspace',{p_name:'Conversation QA A',p_request_id:randomUUID()}),'create A workspace');
const orgB=check(await gb.rpc('create_workspace',{p_name:'Conversation QA B',p_request_id:randomUUID()}),'create B workspace');
if(orgA===orgB)throw Error('Workspace IDs must differ.');
const id=randomUUID(),message=randomUUID();
check(await ga.rpc('create_conversation',{p_org:orgA,p_id:id,p_title:'Private test',p_visibility:'private'}),'create conversation');
check(await ga.rpc('send_conversation_message',{p_id:id,p_message:message,p_content:'A private test message'}),'send');
check(await ga.rpc('send_conversation_message',{p_id:id,p_message:message,p_content:'A private test message'}),'retry');
const messages=check(await ga.from('conversation_messages').select('id,content').eq('conversation_id',id),'read messages');
if(messages.length!==1||messages[0].id!==message)throw Error('Message retry was not idempotent.');
check(await ga.rpc('update_conversation',{p_id:id,p_action:'rename',p_value:'Renamed test'}),'rename');
check(await ga.rpc('update_conversation',{p_id:id,p_action:'archive',p_value:null}),'archive');
denied(await ga.rpc('send_conversation_message',{p_id:id,p_message:randomUUID(),p_content:'archived'}),'archive prevents send','22023');
check(await ga.rpc('update_conversation',{p_id:id,p_action:'unarchive',p_value:null}),'unarchive');
check(await ga.rpc('pin_conversation',{p_id:id,p_pinned:true}),'pin');
const own=check(await ga.from('conversations').select('title,archived_at').eq('id',id),'read renamed');
if(own.length!==1||own[0].title!=='Renamed test'||own[0].archived_at!==null)throw Error('Conversation changes did not persist.');
const otherConversations=check(await gb.from('conversations').select('id').eq('id',id),'B conversation read');
const otherMessages=check(await gb.from('conversation_messages').select('id').eq('conversation_id',id),'B message read');
const otherPins=check(await gb.from('conversation_pins').select('conversation_id').eq('conversation_id',id),'B pin read');
if(otherConversations.length||otherMessages.length||otherPins.length)throw Error('Cross-account data was visible.');
denied(await gb.rpc('send_conversation_message',{p_id:id,p_message:randomUUID(),p_content:'forged'}),'B send');
denied(await gb.rpc('pin_conversation',{p_id:id,p_pinned:true}),'B pin');
denied(await gb.rpc('update_conversation',{p_id:id,p_action:'delete',p_value:null}),'B delete');
check(await ga.rpc('update_conversation',{p_id:id,p_action:'delete',p_value:null}),'delete');
const deleted=check(await ga.from('conversation_messages').select('id').eq('conversation_id',id),'read deleted messages');
if(deleted.length)throw Error('Deleted conversation still has messages.');
check(await a.auth.signOut(),'A sign out');
check(await b.auth.signOut(),'B sign out');
console.log('LOCAL_CONVERSATION_AUTH_HTTP_PASSED: real signup, CRUD and retry, cross-account read and write denial.');
