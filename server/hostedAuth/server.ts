import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {invitationConfiguration} from '../organizationInvitations/config.js';
import {InvitationService,SupabaseInvitationGateway,AccessError} from './serviceExports.js';
import {AiError,AiService,DeepSeekProvider} from './aiService.js';
import {SupabaseAiGateway} from './aiGateway.js';

interface HostedConfig {origin:string;supabaseUrl:string;publishableKey:string;serviceKey:string;}
export function hostedConfig(env:NodeJS.ProcessEnv):HostedConfig {
 const origin=new URL(env.GWIRA_AUTH_API_URL??''),supabase=new URL(env.SUPABASE_URL??'');
 if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||supabase.protocol!=='https:'||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Configure trusted HTTPS hosting and server-only Supabase credentials.');
 return {origin:origin.origin,supabaseUrl:supabase.origin,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY};
}
export function createHostedServer(config:HostedConfig,service:InvitationService,ai?:AiService){
 const rates=new Map<string,{count:number;expires:number}>();
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Strict-Transport-Security','max-age=31536000');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' ${config.supabaseUrl}; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  if(req.headers.origin&&req.headers.origin!==config.origin){res.writeHead(403).end();return;}
  const route=new URL(req.url??'/',config.origin).pathname;
  try{
   if(req.method==='GET'&&route==='/public-config.json'){json(res,200,{url:config.supabaseUrl,publishableKey:config.publishableKey});return;}
   const asset=route==='/accept'||route==='/'?'accept.html':route==='/accept.js'?'accept.js':route==='/accept.css'?'accept.css':route==='/tokens.css'?'tokens.css':route==='/gwira-logo.png'?'gwira-logo.png':undefined;
   if(req.method==='GET'&&asset){res.setHeader('Content-Type',asset.endsWith('.png')?'image/png':asset.endsWith('.js')?'text/javascript; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(await readFile(new URL(asset,import.meta.url)));return;}
   if(req.method!=='POST'||!(route.startsWith('/api/invitation/')||route==='/api/ai/generate')){res.writeHead(404).end();return;}
   if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'Use JSON requests.'});return;}
   // Bound memory; reverse proxy must also enforce distributed limits before production.
   const now=Date.now();for(const [key,r]of rates)if(r.expires<now)rates.delete(key);
   const ip=req.socket.remoteAddress??'unknown',rate=rates.get(ip)??{count:0,expires:now+60000};rates.set(ip,rate);if(++rate.count>30){json(res,429,{error:'Please wait before trying again.'});return;}
   const body=await bodyJson(req),bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')?.[1]??'';
   if(route==='/api/ai/generate'){
    if(!ai)throw new AiError('configuration_required','AI is unavailable: the trusted AI provider is not configured.');
    json(res,200,await ai.generate(bearer,{conversationId:body.conversationId,messageId:body.messageId,requestId:body.requestId}));return;
   }
   if(route==='/api/invitation/preview'){const preview=await service.preview(string(body.token));if(!preview){json(res,404,{code:'invitation_unavailable',error:'This invitation is unavailable. Ask your workspace administrator for a new invitation.'});return;}json(res,200,preview);}
   else if(route==='/api/invitation/accept')json(res,200,{organizationId:await service.accept(bearer,string(body.token))});
   else if(route==='/api/invitation/invite'){if(!Array.isArray(body.teamIds)||body.teamIds.some(v=>typeof v!=='string'))throw Error('Invalid teams');json(res,200,await service.invite(bearer,{organizationId:string(body.organizationId),email:string(body.email),role:body.role as 'admin'|'member',teamIds:body.teamIds as string[]}));}
   else if(route==='/api/invitation/resend')json(res,200,await service.resend(bearer,string(body.id)));
   else if(route==='/api/invitation/revoke'){await service.revoke(bearer,string(body.id));json(res,200,{ok:true});}
   else res.writeHead(404).end();
  }catch(error){json(res,error instanceof AccessError&&error.code==='invitation_rate_limited'?429:400,{code:error instanceof AccessError||error instanceof AiError?error.code:'request_failed',error:error instanceof AccessError||error instanceof AiError?error.message:'The request could not finish. Try again.'});}
 });
}
function string(value:unknown):string{if(typeof value!=='string'||value.length>8192)throw Error('Invalid input');return value;}
function json(res:ServerResponse,status:number,value:unknown):void{res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));}
async function bodyJson(req:IncomingMessage):Promise<Record<string,unknown>>{let size=0,text='';for await(const chunk of req){size+=chunk.length;if(size>16384)throw Error('Request too large');text+=chunk.toString();}const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid request');return value;}
export function aiConfiguration(env:NodeJS.ProcessEnv):{key:string;model:string;limit:number}|undefined{
 const rawLimit=env.GWIRA_AI_DAILY_LIMIT??'20',limit=Number(rawLimit);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('GWIRA_AI_DAILY_LIMIT must be an integer from 1 to 100.');
 const key=env.DEEPSEEK_API_KEY?.trim(),model=env.GWIRA_AI_MODEL?.trim()||'deepseek-flash';
 return key?{key,model,limit}:undefined;
}
export function startHostedServer():void{
 const config=hostedConfig(process.env),delivery=invitationConfiguration(process.env),gateway=new SupabaseInvitationGateway(config.supabaseUrl,config.publishableKey,config.serviceKey);
 // Preview/accept work without mail credentials. Sending stays fail-closed.
 const service=delivery.enabled?delivery.create():new InvitationService(gateway,{send:async()=>{throw Error('Invitation delivery is not configured');}},{externalSendingEnabled:false});
 const aiConfig=aiConfiguration(process.env);
 const ai=aiConfig?new AiService(new SupabaseAiGateway(config.supabaseUrl,config.publishableKey,config.serviceKey),new DeepSeekProvider(aiConfig.key,aiConfig.model),aiConfig.model,aiConfig.limit):undefined;
 const server=createHostedServer(config,service,ai);server.requestTimeout=45000;server.headersTimeout=15000;
 server.listen(Number(process.env.PORT??8080),'127.0.0.1');
}
if(process.argv[1]===fileURLToPath(import.meta.url))startHostedServer();
