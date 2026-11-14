import {describe,it,expect,vi} from 'vitest';
import {AiError,AiService,DeepSeekProvider,type AiGateway,type AiProvider} from '../server/hostedAuth/aiService.js';

const ids={conversationId:'11111111-1111-4111-8111-111111111111',messageId:'22222222-2222-4222-8222-222222222222',requestId:'33333333-3333-4333-8333-333333333333'};
function setup(){
 const gateway:AiGateway={
  identity:vi.fn().mockResolvedValue('user'),
  history:vi.fn().mockResolvedValue([{id:ids.messageId,author_type:'user',content:'Question'}]),
  linkedPlan:vi.fn().mockResolvedValue(undefined),
  begin:vi.fn().mockResolvedValue('started'),
  finish:vi.fn().mockResolvedValue('completed'),
  fail:vi.fn().mockResolvedValue(undefined)
 };
 const provider:AiProvider={generate:vi.fn().mockResolvedValue({content:'Answer',inputTokens:10,outputTokens:4})};
 return {gateway,provider,service:new AiService(gateway,provider,'model',20)};
}
describe('trusted AI generation service',()=>{
 it('checks identity and conversation before generating and saves usage',async()=>{
  const {gateway,provider,service}=setup();
  await expect(service.generate('token',ids)).resolves.toEqual({status:'completed'});
  expect(provider.generate).toHaveBeenCalledOnce();
  expect(gateway.begin).toHaveBeenCalledWith('user',ids.conversationId,ids.messageId,ids.requestId,'model',20);
  expect(gateway.finish).toHaveBeenCalledWith(ids.requestId,'Answer',10,4);
 });
 it('does not make a second provider call for an existing request',async()=>{
  const {gateway,provider,service}=setup();vi.mocked(gateway.begin).mockResolvedValue('completed');
  await expect(service.generate('token',ids)).resolves.toEqual({status:'completed'});
  expect(provider.generate).not.toHaveBeenCalled();
 });
 it('refuses inaccessible or stale history before reservation',async()=>{
  const {gateway,provider,service}=setup();vi.mocked(gateway.history).mockResolvedValue([]);
  await expect(service.generate('token',ids)).rejects.toMatchObject({code:'generation_failed'});
  expect(gateway.fail).toHaveBeenCalledWith(ids.requestId,'provider_error');expect(provider.generate).not.toHaveBeenCalled();
 });
 it('records a failed provider call without retrying',async()=>{
  const {gateway,provider,service}=setup();vi.mocked(provider.generate).mockRejectedValue(Error('provider details'));
  await expect(service.generate('token',ids)).rejects.toMatchObject({code:'generation_failed'});
  expect(gateway.fail).toHaveBeenCalledWith(ids.requestId,'provider_error');
  expect(gateway.finish).not.toHaveBeenCalled();
 });
 it('records invalid provider responses separately without saving or exposing details',async()=>{
  const {gateway,provider,service}=setup();vi.mocked(provider.generate).mockRejectedValue(new AiError('invalid_response','provider details'));
  await expect(service.generate('token',ids)).rejects.toMatchObject({code:'generation_failed',message:'Gwira could not generate a response. Your message is saved.'});
  expect(gateway.fail).toHaveBeenCalledWith(ids.requestId,'invalid_response');
  expect(gateway.finish).not.toHaveBeenCalled();
 });
 it('sends bounded history and no unrelated workspace data',async()=>{
  const {gateway,provider,service}=setup();
  vi.mocked(gateway.history).mockResolvedValue([...Array.from({length:25},(_,i)=>({id:String(i),author_type:'user' as const,content:'x'.repeat(2000)})),{id:ids.messageId,author_type:'user',content:'Question'}]);
  await service.generate('token',ids);
  const history=vi.mocked(provider.generate).mock.calls[0]![0];
  expect(history.length).toBeLessThanOrEqual(20);
  expect(history.reduce((total,m)=>total+m.content.length,0)).toBeLessThanOrEqual(24000);
  expect(history.at(-1)?.id).toBe(ids.messageId);
 });
 it('uses the server provider without exposing credentials in output',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'Answer'}}],usage:{prompt_tokens:2,completion_tokens:3}}),{status:200}));
  const provider=new DeepSeekProvider('server-only','deepseek-flash',request);
  await expect(provider.generate([{id:'1',author_type:'user',content:'Question'}],'Private plan')).resolves.toEqual({content:'Answer',inputTokens:2,outputTokens:3});
  expect(request).toHaveBeenCalledOnce();
  const [url,options]=request.mock.calls[0]!;
  expect(url).toBe('https://api.deepseek.com/chat/completions');
  expect(options).toMatchObject({method:'POST',redirect:'error',headers:{Authorization:'Bearer server-only','Content-Type':'application/json'}});
  const body=JSON.parse(options.body);
  expect(body).toMatchObject({model:'deepseek-flash',max_tokens:1000,thinking:{type:'disabled'}});
  expect(body).not.toHaveProperty('max_completion_tokens');
  expect(body.messages).toEqual([
   expect.objectContaining({role:'system'}),
   {role:'user',content:expect.stringContaining('Private plan')},
   {role:'user',content:'Question'}
  ]);
  expect(JSON.stringify(body)).not.toContain('server-only');
 });
 it('rejects malformed or invalid provider responses',async()=>{
  const responses=[
   'not json',
   JSON.stringify({choices:[{message:{content:''}}],usage:{prompt_tokens:2,completion_tokens:3}}),
   JSON.stringify({choices:[{message:{content:'Answer'}}],usage:{prompt_tokens:-1,completion_tokens:3}}),
   JSON.stringify({choices:[{message:{content:'x'.repeat(10001)}}],usage:{prompt_tokens:2,completion_tokens:3}})
  ];
  for(const body of responses){
   const provider=new DeepSeekProvider('server-only','model',vi.fn().mockResolvedValue(new Response(body,{status:200})));
   await expect(provider.generate([{id:'1',author_type:'user',content:'Question'}])).rejects.toMatchObject({code:'invalid_response'});
  }
 });
 it('treats a provider HTTP failure as an error without exposing the response body',async()=>{
  const provider=new DeepSeekProvider('server-only','model',vi.fn().mockResolvedValue(new Response('provider secret',{status:503})));
  await expect(provider.generate([{id:'1',author_type:'user',content:'Question'}])).rejects.toMatchObject({code:'provider_error',message:'The AI provider did not complete the request.'});
 });
});
