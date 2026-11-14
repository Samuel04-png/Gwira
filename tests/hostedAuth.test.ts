import {describe,it,expect} from 'vitest';
import {aiConfiguration,createHostedServer,hostedConfig} from '../server/hostedAuth/server.js';
import {InvitationService} from '../server/organizationInvitations/service.js';
import type {InvitationGateway} from '../server/organizationInvitations/service.js';
describe('trusted hosted invitation boundary',()=>{
 it('requires HTTPS hosting and server credentials at startup',()=>{expect(()=>hostedConfig({})).toThrow();expect(()=>hostedConfig({GWIRA_AUTH_API_URL:'http://example.test',SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'})).toThrow();});
 it('enables DeepSeek only with a server key and supports model and quota configuration',()=>{
  expect(aiConfiguration({})).toBeUndefined();
  expect(aiConfiguration({GWIRA_AI_MODEL:'custom-model'})).toBeUndefined();
  expect(aiConfiguration({DEEPSEEK_API_KEY:' '})).toBeUndefined();
  expect(aiConfiguration({OPENAI_API_KEY:'old-key'})).toBeUndefined();
  expect(aiConfiguration({DEEPSEEK_API_KEY:'test-key'})).toEqual({key:'test-key',model:'deepseek-flash',limit:20});
  expect(aiConfiguration({DEEPSEEK_API_KEY:'test-key',GWIRA_AI_MODEL:'custom-model',GWIRA_AI_DAILY_LIMIT:'8'})).toEqual({key:'test-key',model:'custom-model',limit:8});
  expect(()=>aiConfiguration({DEEPSEEK_API_KEY:'test-key',GWIRA_AI_DAILY_LIMIT:'101'})).toThrow();
 });
 it('rejects foreign origins, constrains bodies and never returns server secrets',async()=>{
  const gateway={preview:async()=>({organization_name:'Test organization',assigned_role:'member',status:'pending',expires_at:'2026-12-01'}),verifyUser:async()=>({id:'actor',verified:true}),accept:async()=>{throw Error('internal-secret-data');}} as unknown as InvitationGateway;
  const service=new InvitationService(gateway,{send:async()=>{}},{externalSendingEnabled:false});
  const server=createHostedServer({origin:'https://accept.example.test',supabaseUrl:'https://project.supabase.co',publishableKey:'public-key',serviceKey:'server-secret'},service);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Server did not listen');const base=`http://127.0.0.1:${address.port}`;
  try{
   expect((await fetch(base+'/api/invitation/preview',{method:'POST',headers:{Origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'})).status).toBe(403);
   const preview=await fetch(base+'/api/invitation/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'A'.repeat(43)})});expect(preview.status).toBe(200);expect(preview.headers.get('referrer-policy')).toBe('no-referrer');expect(preview.headers.get('cache-control')).toBe('no-store');
   const publicConfig=await fetch(base+'/public-config.json').then(r=>r.text());expect(publicConfig).not.toContain('server-secret');expect(publicConfig).toContain('public-key');
   const ai=await fetch(base+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});expect(await ai.json()).toMatchObject({code:'configuration_required',error:'AI is unavailable: the trusted AI provider is not configured.'});
   const accept=await fetch(base+'/api/invitation/accept',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture'},body:JSON.stringify({token:'A'.repeat(43)})});expect(await accept.text()).not.toContain('internal-secret-data');
   const large=await fetch(base+'/api/invitation/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'A'.repeat(20000)})});expect(large.status).toBe(400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
});
