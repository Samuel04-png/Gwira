import {AiError,type AiGateway,type AiHistoryMessage} from './aiService.js';

export class SupabaseAiGateway implements AiGateway {
 constructor(private readonly url:string,private readonly publishableKey:string,private readonly serviceKey:string,private readonly request:typeof fetch=fetch){}
 private async call<T>(path:string,key:string,bearer:string,body?:unknown):Promise<T>{
  let response:Response;
  try{
   response=await this.request(`${this.url}${path}`,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{apikey:key,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json','Accept-Profile':'gwira','Content-Profile':'gwira'},
    body:body===undefined?undefined:JSON.stringify(body)});
  }catch{throw new AiError('backend_unavailable','The workspace service could not be reached.');}
  if(!response.ok){
   let message='';
   try{const data:unknown=await response.json();if(data&&typeof data==='object'&&'message' in data&&typeof data.message==='string')message=data.message;}catch{message='';}
   if(message==='generation_limit_reached')throw new AiError('generation_limit_reached','Your daily AI request limit has been reached.');
   if(message==='generation_busy')throw new AiError('generation_busy','Another response is being generated in this workspace.');
   if(message==='generation_request_conflict')throw new AiError('generation_request_conflict','This generation request conflicts with an earlier request.');
   if(response.status===401||response.status===403)throw new AiError('access_denied','The conversation is unavailable to this account.');
   throw new AiError('backend_unavailable','The generation request could not be verified.');
  }
  return await response.json() as T;
 }
 async identity(bearer:string):Promise<string>{
  const user=await this.call<{id?:unknown}>('/auth/v1/user',this.publishableKey,bearer);
  if(typeof user.id!=='string')throw new AiError('sign_in_required','Sign in again to continue.');
  return user.id;
 }
 async history(bearer:string,conversationId:string):Promise<AiHistoryMessage[]>{
  const rows=await this.call<AiHistoryMessage[]>(`/rest/v1/conversation_messages?select=id,author_type,content&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.desc,id.desc&limit=20`,this.publishableKey,bearer);
  if(!Array.isArray(rows))throw new AiError('invalid_history','Conversation history could not be read.');
  return rows.reverse();
 }
 async linkedPlan(bearer:string,conversationId:string):Promise<string|undefined>{
  const links=await this.call<Array<{plan_id:string}>>(`/rest/v1/conversation_plan_links?select=plan_id&conversation_id=eq.${encodeURIComponent(conversationId)}&limit=2`,this.publishableKey,bearer);
  if(!Array.isArray(links)||links.length>1)throw new AiError('invalid_plan','The linked plan could not be verified.');
  if(!links.length)return undefined;
  const id=encodeURIComponent(links[0].plan_id);
  const docs=await this.call<Array<{current_version:number}>>(`/rest/v1/plan_documents?select=current_version&id=eq.${id}&limit=1`,this.publishableKey,bearer);
  if(!Array.isArray(docs)||docs.length!==1||!Number.isInteger(docs[0].current_version))throw new AiError('invalid_plan','The linked plan could not be verified.');
  const versions=await this.call<Array<{content_markdown:string}>>(`/rest/v1/plan_versions?select=content_markdown&plan_id=eq.${id}&version=eq.${docs[0].current_version}&limit=1`,this.publishableKey,bearer);
  if(!Array.isArray(versions)||versions.length!==1||typeof versions[0].content_markdown!=='string')throw new AiError('invalid_plan','The linked plan could not be verified.');
  if(versions[0].content_markdown.length>6000)throw new AiError('invalid_plan','The linked plan is too long to use as conversation context.');
  return versions[0].content_markdown;
 }
 private rpc<T>(name:string,body:unknown):Promise<T>{return this.call<T>(`/rest/v1/rpc/${name}`,this.serviceKey,this.serviceKey,body);}
 begin(actor:string,conversationId:string,messageId:string,requestId:string,model:string,limit:number):Promise<string>{
  return this.rpc('begin_ai_generation',{p_actor:actor,p_conversation:conversationId,p_message:messageId,p_request:requestId,p_model:model,p_daily_limit:limit});
 }
 finish(requestId:string,content:string,inputTokens:number,outputTokens:number):Promise<string>{
  return this.rpc('finish_ai_generation',{p_request:requestId,p_content:content,p_input_tokens:inputTokens,p_output_tokens:outputTokens});
 }
 async fail(requestId:string,code:'provider_error'|'invalid_response'):Promise<void>{
  await this.rpc('fail_ai_generation',{p_request:requestId,p_code:code});
 }
}
