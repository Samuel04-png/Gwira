import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {authConfiguration} from '../src/main/auth/config.js';
import {AuthGateway,AccountError,type AuthTokens} from '../src/main/auth/gateway.js';
import {AccountController,type AccountPreferences} from '../src/main/auth/controller.js';
import {parseOnboardingProgress} from '../src/shared/accountAuth.js';
import {SessionVault} from '../src/main/auth/vault.js';
import {organizationFromLink} from '../src/main/auth/organizationLink.js';
import {beginOAuth} from '../src/main/auth/loopback.js';
const env={GWIRA_SUPABASE_URL:'https://project.supabase.co',GWIRA_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_public_key_123456',GWIRA_AUTH_ENVIRONMENT:'development'};
const config=authConfiguration(env)!;
const uid='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
function setup(backend=config){let tokens:AuthTokens|undefined;let prefs:Awaited<ReturnType<AccountPreferences['read']>>={organizations:{[uid]:a}};let emailRequests=0;let invalid=false;let offline=false;let memberships=[{organization_id:a,role:'owner'},{organization_id:b,role:'member'}];let requests:string[]=[];const bodies:Array<{path:string;method?:string;body:Record<string,unknown>}>=[];
 const request:typeof fetch=async(url,options)=>{if(offline)throw Error('fixture offline');const route=new URL(String(url));requests.push(route.pathname+route.search);bodies.push({path:route.pathname,method:options?.method,body:options?.body?JSON.parse(String(options.body)):{}});let body:unknown={};
 if(route.pathname.endsWith('/otp')){emailRequests++;}
 else if(route.pathname.endsWith('/verify')&&invalid)return new Response('{}',{status:403});
 else if(route.pathname.endsWith('/verify')||route.pathname.endsWith('/token'))body={access_token:'fixture-access-not-a-real-credential',refresh_token:'fixture-refresh-not-a-real-credential',expires_in:3600,user:{id:uid,email:'qa@example.test',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-11-03'}};
 else if(route.pathname.endsWith('/user'))body={id:uid,email:'qa@example.test',email_confirmed_at:'2026-11-03'};
 else if(route.pathname.endsWith('/organization_memberships'))body=memberships;
 else if(route.pathname.endsWith('/organizations'))body=[{id:a,name:'Organization A'},{id:b,name:'Organization B'}];
 else if(route.pathname.endsWith('/teams'))body=[{id:'team-'+route.searchParams.get('organization_id'),organization_id:route.searchParams.get('organization_id')!.slice(3),name:'Scoped team'}];
 else if(route.pathname.endsWith('/settings'))body={external:{google:false,email:true},mailer_autoconfirm:false};
 else if(route.pathname.endsWith('/create_organization_once'))body=a;
 return new Response(JSON.stringify(body),{status:200});};
 const gateway=new AuthGateway(backend,request),vault={read:async()=>tokens,save:async(t:AuthTokens)=>{tokens=t;},clear:async()=>{tokens=undefined;}},preferences:AccountPreferences={read:async()=>prefs,write:async p=>{prefs=p;}};
 const controller=new AccountController(gateway,vault,preferences,false,undefined,undefined,false,undefined,true);
 return {controller,gateway,bodies,get tokens(){return tokens;},get emailRequests(){return emailRequests;},get prefs(){return prefs;},get requests(){return requests;},setPreferences:(value:typeof prefs)=>{prefs=value;},setOffline:(value:boolean)=>{offline=value;},setInvalid:(v:boolean)=>invalid=v,setMemberships:(value:typeof memberships)=>memberships=value};
}
describe('account configuration',()=>{
 it('does not invent a backend when configuration is absent',()=>expect(authConfiguration({})).toBeUndefined());
 it.each(['sb_secret_private','eyJhbGciOiJIUzI1NiJ9.payload.signature','service_role'])('rejects privileged or unknown key formats %s',key=>expect(()=>authConfiguration({...env,GWIRA_SUPABASE_PUBLISHABLE_KEY:key})).toThrow());
 it.each(['http://untrusted.test','https://user:password@project.supabase.co','https://project.supabase.co/path','https://project.supabase.co/#token'])('rejects unsafe project URL %s',url=>expect(()=>authConfiguration({...env,GWIRA_SUPABASE_URL:url})).toThrow());
 it('accepts loopback only for explicit development and Google only with configured callbacks',()=>{expect(authConfiguration({...env,GWIRA_SUPABASE_URL:'http://127.0.0.1:4321'})).toBeDefined();expect(()=>authConfiguration({...env,GWIRA_SUPABASE_URL:'http://127.0.0.1:4321',GWIRA_AUTH_ENVIRONMENT:'production'})).toThrow();expect(authConfiguration({...env,GWIRA_GOOGLE_AUTH_ENABLED:'true'})!.google).toBe(false);});
 it('requires production configuration in packaged applications',()=>{for(const environment of ['development','staging'])expect(()=>authConfiguration({...env,GWIRA_AUTH_ENVIRONMENT:environment},{packaged:true})).toThrow(/production/);expect(authConfiguration({...env,GWIRA_AUTH_ENVIRONMENT:'production'},{packaged:true})?.environment).toBe('production');expect(()=>authConfiguration({...env,GWIRA_SUPABASE_URL:'http://127.0.0.1:4321'},{packaged:true})).toThrow();});
});
describe('main-owned account transitions',()=>{
 it('runs a new sign-in queued while sign-out is still finishing',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const logout=s.controller.command({type:'sign_out'});
  const login=s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  await Promise.all([logout,login]);expect(s.controller.snapshot().user?.id).toBe(uid);expect(s.tokens).toBeDefined();s.controller.dispose();
 });
 it('does not persist or restore a password login completed after sign-out',async()=>{
  const s=setup();await s.controller.initialize();const original=s.gateway.passwordSignIn.bind(s.gateway);let resume!:()=>void,started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});
  vi.spyOn(s.gateway,'passwordSignIn').mockImplementation(async(email,password)=>{started();await new Promise<void>(resolve=>{resume=resolve;});return original(email,password);});
  const login=s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});await waiting;
  const logout=s.controller.command({type:'sign_out'});resume();await Promise.all([login,logout]);
  expect(s.tokens).toBeUndefined();expect(s.controller.snapshot().user).toBeUndefined();expect(s.controller.snapshot().phase).toBe('signed_out');s.controller.dispose();
 });
 it('revalidates identity and active membership before issuing a workspace context',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const grant=await s.controller.verifiedWorkspace();expect(grant.userId).toBe(uid);expect(grant.organizationId).toBe(a);
  s.setMemberships([{organization_id:b,role:'member'}]);
  await expect(s.controller.verifiedWorkspace()).rejects.toThrow(/access could not be verified/);
  expect(s.controller.snapshot().phase).toBe('access_revoked');expect(s.controller.snapshot().activeOrganization).toBeUndefined();
  await s.controller.command({type:'sign_out'});await expect(s.controller.verifiedWorkspace()).rejects.toThrow();s.controller.dispose();
 });
 it('invalidates an old grant and updates the role when backend membership changes',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  s.setMemberships([{organization_id:a,role:'member'},{organization_id:b,role:'member'}]);
  await expect(s.controller.verifiedWorkspace()).rejects.toThrow(/context changed/);
  expect(s.controller.snapshot().activeOrganization?.role).toBe('member');
  expect((await s.controller.verifiedWorkspace()).role).toBe('member');s.controller.dispose();
 });
 it('does not issue a workspace context when sign-out occurs during membership lookup',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.organizations.bind(s.gateway);let resume!:()=>void,started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});
  vi.spyOn(s.gateway,'organizations').mockImplementation(async(token,id)=>{started();await new Promise<void>(resolve=>{resume=resolve;});return original(token,id);});
  const grant=s.controller.verifiedWorkspace();await waiting;
  const signingOut=s.controller.command({type:'sign_out'});resume();
  await expect(grant).rejects.toThrow(/context changed/);await signingOut;s.controller.dispose();
 });
 it.each([{type:'switch',organizationId:b} as const,{type:'organization_hint',organizationId:b} as const])('invalidates pending workspace grants when switching with $type',async command=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.organizations.bind(s.gateway);let resume!:()=>void,started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});let first=true;
  vi.spyOn(s.gateway,'organizations').mockImplementation(async(token,id)=>{if(first){first=false;started();await new Promise<void>(resolve=>{resume=resolve;});}return original(token,id);});
  const grant=s.controller.verifiedWorkspace();await waiting;
  const switching=s.controller.command(command);resume();
  await expect(grant).rejects.toThrow(/context changed/);await switching;s.controller.dispose();
 });
 it('does not offer local mode when packaged sign-in is not configured',async()=>{const c=new AccountController(undefined,{read:async()=>undefined,save:async()=>{},clear:async()=>{}},{read:async()=>({}),write:async()=>{}});expect((await c.initialize()).error).not.toMatch(/locally/i);expect((await c.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'})).error).not.toMatch(/local/i);c.dispose();});
 it('keeps signed-out users out of cloud context and local preference never authenticates',async()=>{const s=setup();expect((await s.controller.initialize()).phase).toBe('signed_out');expect((await s.controller.command({type:'local'})).phase).toBe('offline_local');expect(s.controller.snapshot().user).toBeUndefined();expect(s.tokens).toBeUndefined();expect(s.prefs.mode).toBe('local');s.controller.dispose();});
 it('prevents duplicate OTP submissions and preserves recoverable invalid-code state',async()=>{const s=setup();await s.controller.initialize();await Promise.all([s.controller.command({type:'email',email:'qa@example.test'}),s.controller.command({type:'email',email:'qa@example.test'})]);expect(s.emailRequests).toBe(1);s.setInvalid(true);expect((await s.controller.command({type:'verify',code:'000000'})).phase).toBe('awaiting_verification');expect(s.tokens).toBeUndefined();s.controller.dispose();});
 it('validates identity/membership, partitions teams and omits all credentials from IPC snapshots',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'email',email:'qa@example.test'});await s.controller.command({type:'verify',code:'000000'});let snapshot=s.controller.snapshot();expect(snapshot.phase).toBe('organization_ready');expect(snapshot.activeOrganization?.id).toBe(a);expect(snapshot.teams.every(t=>t.organizationId===a)).toBe(true);expect(JSON.stringify(snapshot)).not.toMatch(/fixture-access|fixture-refresh|accessToken|refreshToken/);snapshot=await s.controller.command({type:'switch',organizationId:b});expect(snapshot.activeOrganization?.role).toBe('member');expect(snapshot.teams.every(t=>t.organizationId===b)).toBe(true);expect(s.prefs.organizations?.[uid]).toBe(b);await s.controller.command({type:'sign_out'});expect(s.controller.snapshot().organizations).toEqual([]);expect(s.tokens).toBeUndefined();s.controller.dispose();});
 it('does not authorize a forged organization selection',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'email',email:'qa@example.test'});await s.controller.command({type:'verify',code:'000000'});s.setMemberships([]);const state=await s.controller.command({type:'switch',organizationId:a});expect(state.phase).toBe('access_revoked');expect(state.activeOrganization).toBeUndefined();expect(state.teams).toEqual([]);s.controller.dispose();});
 it('blocks invitations after the current role is revoked',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'email',email:'qa@example.test'});await s.controller.command({type:'verify',code:'000000'});s.setMemberships([{organization_id:a,role:'member'}]);await expect(s.controller.invitationOperation('invite',{organizationId:a})).rejects.toThrow('admin');s.controller.dispose();});
 it('maps network failures without surfacing server responses or tokens',async()=>{const gateway=new AuthGateway(config,async()=>{throw Error('private raw network details');});await expect(gateway.identity('never-return-this')).rejects.toThrow('Check your connection');});
});
describe('password accounts and code recovery',()=>{
 it('requires a strong new password before making a signup request',async()=>{const s=setup();await s.controller.initialize();const state=await s.controller.command({type:'password_sign_up',email:'qa@example.test',password:'short'});expect(state.error).toContain('12 characters');expect(s.requests).not.toContain('/auth/v1/signup');s.controller.dispose();});
 it('confirms signup with the signup OTP purpose and never includes the password in snapshots',async()=>{const s=setup();await s.controller.initialize();let state=await s.controller.command({type:'password_sign_up',email:'qa@example.test',password:'long-fixture-password'});expect(state.phase).toBe('awaiting_verification');expect(state.verificationPurpose).toBe('signup');expect(s.tokens).toBeUndefined();state=await s.controller.command({type:'verify',code:'000000'});expect(state.phase).toBe('organization_ready');expect(s.bodies.find(r=>r.path.endsWith('/verify'))?.body.type).toBe('signup');expect(JSON.stringify(state)).not.toContain('long-fixture-password');s.controller.dispose();});
 it('uses password grant and rechecks server identity and membership',async()=>{const s=setup();await s.controller.initialize();const state=await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});expect(state.phase).toBe('organization_ready');expect(s.requests).toContain('/auth/v1/token?grant_type=password');expect(s.requests).toContain('/auth/v1/user');expect(JSON.stringify(state)).not.toMatch(/fixture-password|fixture-access|fixture-refresh/);s.controller.dispose();});
 it('keeps recovery sessions out of the vault until the new password is saved',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'recover',email:'qa@example.test'});s.setInvalid(true);expect((await s.controller.command({type:'verify',code:'111111'})).phase).toBe('awaiting_verification');expect(s.tokens).toBeUndefined();s.setInvalid(false);let state=await s.controller.command({type:'verify',code:'000000'});expect(state.phase).toBe('reset_password');expect(s.bodies.find(r=>r.path.endsWith('/verify'))?.body.type).toBe('recovery');expect(s.tokens).toBeUndefined();expect(state.organizations).toEqual([]);expect((await s.controller.command({type:'reset_password',password:'short'})).phase).toBe('reset_password');state=await s.controller.command({type:'reset_password',password:'new-fixture-password'});expect(state.phase).toBe('organization_ready');expect(s.bodies.find(r=>r.path.endsWith('/user')&&r.method==='PUT')?.body).toEqual({password:'new-fixture-password'});expect(s.tokens).toBeDefined();s.controller.dispose();});
 it('cancels a recovery session without saving it or permitting a later password change',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'recover',email:'qa@example.test'});await s.controller.command({type:'verify',code:'000000'});await s.controller.command({type:'cancel'});const state=await s.controller.command({type:'reset_password',password:'new-fixture-password'});expect(state.phase).toBe('session_expired');expect(s.tokens).toBeUndefined();expect(s.bodies.some(r=>r.method==='PUT')).toBe(false);s.controller.dispose();});
 it('resends the original recovery purpose and enforces a cooldown',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'recover',email:'qa@example.test'});const state=await s.controller.command({type:'resend'});expect(state.phase).toBe('awaiting_verification');expect(state.error).toContain('Wait');expect(s.requests.filter(r=>r==='/auth/v1/recover')).toHaveLength(1);s.controller.dispose();});
 it('maps invalid password errors without exposing provider payloads',async()=>{const gateway=new AuthGateway(config,async()=>new Response(JSON.stringify({code:'invalid_credentials',message:'private provider details'}),{status:400,headers:{'x-supabase-api-version':'2024-01-01'}}));await expect(gateway.passwordSignIn('qa@example.test','wrong')).rejects.toThrow('email or password is incorrect');});
});
describe('sign-out and automatic email confirmation',()=>{
 it('returns signed out and clears the vault without waiting for the network',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});let rejectLogout!:(e:Error)=>void;s.gateway.logout=()=>new Promise<void>((_,reject)=>{rejectLogout=reject;});const result=await Promise.race([s.controller.command({type:'sign_out'}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('Sign out blocked on the network')),100);timer.unref();})]);expect(result.phase).toBe('signed_out');expect(result.user).toBeUndefined();expect(s.tokens).toBeUndefined();await s.controller.command({type:'local'});rejectLogout(Error('Offline'));await Promise.resolve();expect(s.controller.snapshot().error).toBeUndefined();s.controller.dispose();});
 it('accepts the real session returned by auto-confirmed signup without a code step',async()=>{const s=setup();s.gateway.passwordSignUp=async()=>({accessToken:'autoconfirm-fixture-access',refreshToken:'autoconfirm-fixture-refresh',expiresAt:Date.now()+3600000});await s.controller.initialize();const result=await s.controller.command({type:'password_sign_up',email:'qa@example.test',password:'fixture-password'});expect(result.phase).toBe('organization_ready');expect(result.verificationPurpose).toBeUndefined();expect(s.requests.some(r=>r.includes('/verify'))).toBe(false);expect(s.tokens).toBeDefined();s.controller.dispose();});
});
describe('encrypted vault boundary',()=>{
 it('writes private encrypted bytes atomically and rejects project mismatch',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'gwira-vault-unit-'));try{const encryptor={available:async()=>true,encrypt:async(s:string)=>Buffer.from(Buffer.from(s).map(n=>n^123)),decrypt:async(b:Buffer)=>Buffer.from(b.map(n=>n^123)).toString()};const file=path.join(dir,'account.session-vault'),tokens={accessToken:'private-access',refreshToken:'private-refresh',expiresAt:Date.now()+1000},vault=new SessionVault(file,config.url,encryptor);await vault.save(tokens);expect((await readFile(file)).includes(Buffer.from('private-refresh'))).toBe(false);expect((await stat(file)).mode&0o777).toBe(0o600);expect(await vault.read()).toEqual(tokens);await expect(new SessionVault(file,'https://other.test',encryptor).read()).rejects.toThrow('could not be unlocked');await vault.clear();expect(await vault.read()).toBeUndefined();}finally{await rm(dir,{recursive:true,force:true});}});
 it('never falls back to plaintext when secure storage is unavailable',async()=>{const vault=new SessionVault('/tmp/unused-gwira-vault','project',{available:async()=>false,encrypt:async()=>{throw Error('must not run');},decrypt:async()=>''});await expect(vault.save({accessToken:'a',refreshToken:'r',expiresAt:1})).rejects.toThrow('Secure account storage');});
});
describe('real loopback callback lifecycle',()=>{
 it('requires the exact nonce path and consumes one PKCE callback',async()=>{const attempt=await beginOAuth('https://project.supabase.co',0,5000);const authorize=new URL(attempt.url),callback=new URL(authorize.searchParams.get('redirect_to')!);expect(authorize.searchParams.get('code_challenge_method')).toBe('s256');const invalid=new URL(callback);invalid.pathname='/auth/callback/incorrect';expect((await fetch(invalid)).status).toBe(400);callback.searchParams.set('code','one-time-code');expect((await fetch(callback)).status).toBe(200);const result=await attempt.result;expect(result.code).toBe('one-time-code');expect(result.verifier.length).toBeGreaterThan(43);await expect(fetch(callback)).rejects.toThrow();});
 it('rejects timeout and cancellation rather than leaving a reusable callback',async()=>{const cancelled=await beginOAuth('https://project.supabase.co',0);cancelled.cancel();await expect(cancelled.result).rejects.toThrow('cancelled');const expired=await beginOAuth('https://project.supabase.co',0,20);await expect(expired.result).rejects.toThrow('expired');});
});

describe('desktop organization hints',()=>{it('accepts only a scoped organization hint, never credentials or arbitrary URLs',()=>{expect(organizationFromLink('gwira://organization/'+a)).toBe(a);for(const url of ['https://example.test/'+a,'gwira://organization/'+a+'?access_token=bad','gwira://organization/'+a+'#token','gwira://organization/'+a+'/other','gwira://evil/'+a])expect(organizationFromLink(url)).toBeUndefined();});});


describe('authentication recovery invariants',()=>{
 it('keeps the resend cooldown when changing email or returning to options',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'email',email:'qa@example.test'});const resendAt=s.controller.snapshot().resendAt;await s.controller.command({type:'cancel'});expect(s.controller.snapshot().resendAt).toBe(resendAt);const state=await s.controller.command({type:'email',email:'other@example.test'});expect(s.emailRequests).toBe(1);expect(state.error).toContain('Wait');s.controller.dispose();});
 it('requires a choice on first sign-in with multiple memberships and restores that choice',async()=>{const s=setup();s.setPreferences({});await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});expect(s.controller.snapshot().phase).toBe('select_organization');expect(s.controller.snapshot().activeOrganization).toBeUndefined();await s.controller.command({type:'switch',organizationId:b});expect(s.controller.snapshot().activeOrganization?.id).toBe(b);expect(s.prefs.organizations?.[uid]).toBe(b);await s.controller.command({type:'refresh'});expect(s.controller.snapshot().phase).toBe('organization_ready');s.controller.dispose();});
});

describe('verification retry preservation',()=>{
 it('keeps email, purpose and verification state when an eligible resend fails',async()=>{const s=setup();const clock=vi.spyOn(Date,'now');const start=clock.getMockImplementation()?0:Date.now();try{clock.mockReturnValue(start);await s.controller.initialize();await s.controller.command({type:'email',email:'qa@example.test'});clock.mockReturnValue(start+61000);s.setOffline(true);const state=await s.controller.command({type:'resend'});expect(state.phase).toBe('awaiting_verification');expect(state.email).toBe('qa@example.test');expect(state.verificationPurpose).toBe('email');expect(state.error).toContain('Check your connection');expect(state.resendAt).toBeGreaterThan(start+61000);}finally{clock.mockRestore();s.controller.dispose();}});
 it('retains a validated invitation across account switching without exposing its token',async()=>{const s=setup();vi.spyOn(s.gateway,'server').mockResolvedValue({organization_name:'Invited workspace',assigned_role:'member',status:'pending',expires_at:new Date(Date.now()+86400000).toISOString()});await s.controller.initialize();await s.controller.command({type:'invitation',token:'a'.repeat(43)});await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});expect(s.controller.snapshot().phase).toBe('invitation_pending');const state=await s.controller.command({type:'cancel'});expect(state.invitationPending).toBe(true);expect(state.invitation?.organizationName).toBe('Invited workspace');expect(state.user).toBeUndefined();expect(JSON.stringify(state)).not.toContain('a'.repeat(43));s.controller.dispose();});
});

describe('session expiry and external cancellation',()=>{
 it('clears stale identity and organization context when a session expires',async()=>{const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});vi.spyOn(s.gateway,'identity').mockRejectedValue(new AccountError('session_expired','Sign in again to continue.'));const state=await s.controller.command({type:'refresh'});expect(state.phase).toBe('session_expired');expect(state.user).toBeUndefined();expect(state.activeOrganization).toBeUndefined();expect(state.organizations).toEqual([]);s.controller.dispose();});
 it('exposes a cancellable browser handoff and does not authorize a cancelled attempt',async()=>{const s=setup();vi.spyOn(s.gateway,'settings').mockResolvedValue({external:{google:true},mailer_autoconfirm:false});const controller=new AccountController(s.gateway,{read:async()=>undefined,save:async()=>{},clear:async()=>{}},{read:async()=>({}),write:async()=>{}},true,()=>beginOAuth('https://project.supabase.co',0,5000),async()=>{});try{await controller.initialize();expect((await controller.command({type:'google'})).phase).toBe('authenticating_externally');await controller.command({type:'cancel'});await new Promise(resolve=>setTimeout(resolve,10));expect(controller.snapshot().phase).toBe('signed_out');expect(controller.snapshot().user).toBeUndefined();expect(controller.snapshot().error).toBeUndefined();}finally{controller.dispose();s.controller.dispose();}});
});

describe('invitation acceptance recovery',()=>{
 it('keeps invitation review available after wrong-email acceptance fails',async()=>{const s=setup();const server=vi.spyOn(s.gateway,'server').mockResolvedValue({organization_name:'Invited workspace',assigned_role:'member',status:'pending',expires_at:new Date(Date.now()+86400000).toISOString()});await s.controller.initialize();await s.controller.command({type:'invitation',token:'b'.repeat(43)});await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});server.mockRejectedValueOnce(new AccountError('invitation_email_mismatch','Switch account and sign in with the invited address.'));const state=await s.controller.command({type:'accept_invitation'});expect(state.phase).toBe('invitation_pending');expect(state.invitationPending).toBe(true);expect(state.error).toContain('Switch account');expect(state.invitation?.organizationName).toBe('Invited workspace');s.controller.dispose();});
 it('maps trusted invitation error codes without reflecting raw response details',async()=>{const gateway=new AuthGateway({...config,apiUrl:'https://accept.example.test'},async()=>new Response(JSON.stringify({code:'invitation_email_mismatch',error:'private raw server details'}),{status:400}));await expect(gateway.server('invitation/accept',{},'fixture-bearer')).rejects.toThrow('Switch account');});
 it('reports an unconfigured AI provider without exposing server details',async()=>{
  const gateway=new AuthGateway({...config,apiUrl:'https://accept.example.test'},async()=>new Response(JSON.stringify({code:'configuration_required',error:'private server details'}),{status:400}));
  await expect(gateway.generateAi('fixture-bearer','conversation','message')).rejects.toMatchObject({code:'configuration_required',message:'AI is unavailable: the trusted AI provider is not configured.'});
 });
});

describe('signup validation feedback',()=>{
 it.each([{body:{code:'email_exists'},message:'already exists'},{body:{code:422,msg:'User already registered'},message:'already exist'},{body:{error_code:'validation_failed'},message:'details were not accepted'},{body:{code:'unknown_reason',message:'private raw data'},message:'Account creation was rejected'}])('handles signup 422 without exposing raw provider data',async({body,message})=>{const g=new AuthGateway(config,async()=>new Response(JSON.stringify(body),{status:422,headers:{'x-supabase-api-version':'2024-01-01'}}));await expect(g.passwordSignUp('qa@example.test','fixture-password')).rejects.toThrow(message);});
});

describe('workspace schema failure',()=>{it('reports backend setup failure instead of treating it as an empty account',async()=>{const g=new AuthGateway(config,async()=>new Response(JSON.stringify({code:'PGRST106',message:'Invalid schema: gwira'}),{status:406}));await expect(g.organizations('fixture-token',uid)).rejects.toThrow('workspace service needs to be configured');});});

describe('B1 coordinator integrated with the existing account session',()=>{
 const readyFacts={profileComplete:true,pendingInvitations:[],setup:[]};
 it('gates missing backend facts instead of mounting the legacy console or zero-workspace setup',async()=>{
  const s=setup();await s.controller.initialize();const state=await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  expect(state.route?.type).toBe('AccessError');expect(state.organizations).toHaveLength(2);s.controller.dispose();
 });
 it('recognizes AboutYou only from a successful server profile response',async()=>{
  const s=setup();s.gateway.routingFacts=async()=>({...readyFacts,profileComplete:false});await s.controller.initialize();const state=await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});expect(state.route?.type).toBe('AboutYou');s.controller.dispose();
 });
 it('routes a selected authorized workspace and remembers it after restoring the session',async()=>{
  const s=setup();s.setPreferences({});s.gateway.routingFacts=async()=>readyFacts;
  await s.controller.initialize();expect((await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'})).route).toEqual({type:'WorkspaceHub',reason:'choose'});
  const selected=await s.controller.command({type:'switch',organizationId:b});expect(selected.route).toMatchObject({type:'WorkspaceReady',workspaceId:b});expect(selected.activeOrganization?.id).toBe(b);
  expect(s.prefs.organizations?.[uid]).toBe(b);expect((await s.controller.command({type:'refresh'})).route).toMatchObject({type:'WorkspaceReady',workspaceId:b});s.controller.dispose();
 });
 it('does not open a selected workspace if membership was revoked since it was listed',async()=>{
  const s=setup();s.setPreferences({});s.gateway.routingFacts=async()=>readyFacts;await s.controller.initialize();
  await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});s.setMemberships([{organization_id:a,role:'owner'}]);
  const state=await s.controller.command({type:'switch',organizationId:b});expect(state.route).toMatchObject({type:'AccessError',reason:'membership_revoked'});expect(state.activeOrganization).toBeUndefined();expect(s.prefs.organizations?.[uid]).not.toBe(b);s.controller.dispose();
 });
 it('prioritizes an explicit invitation over existing authorized memberships',async()=>{
  const s=setup();s.gateway.routingFacts=async()=>({...readyFacts,setup:[{organizationId:a,creatorUserId:uid,step:'complete'}]});
  vi.spyOn(s.gateway,'server').mockResolvedValue({organization_name:'Invited workspace',assigned_role:'member',status:'pending',expires_at:new Date(Date.now()+86400000).toISOString()});
  await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  expect(s.controller.snapshot().route?.type).toBe('WorkspaceReady');const state=await s.controller.command({type:'invitation',token:'c'.repeat(43)});
  expect(state.route?.type).toBe('InvitationReview');expect(state.organizations).toHaveLength(2);expect(s.requests.filter(p=>p.includes('create_organization'))).toEqual([]);s.controller.dispose();
 });
 it('keeps network errors separate from an empty authorized membership result',async()=>{
  const s=setup();s.gateway.routingFacts=async()=>readyFacts;await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  s.setOffline(true);const state=await s.controller.command({type:'refresh'});expect(state.route?.type).toBe('AccessError');expect(state.route?.type).not.toBe('WorkspaceSetup');s.controller.dispose();
 });
 it('invalidates the route immediately when sign-out interrupts a bootstrap read',async()=>{
  const s=setup();let finish!:(value:typeof readyFacts)=>void;s.gateway.routingFacts=()=>new Promise(resolve=>{finish=resolve;});await s.controller.initialize();
  const login=s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});for(let i=0;!finish&&i<50;i++)await new Promise(r=>setTimeout(r,1));
  const logout=s.controller.command({type:'sign_out'});expect(s.controller.snapshot().route?.type).toBe('AuthEntry');expect(s.controller.snapshot().user).toBeUndefined();
  finish(readyFacts);await Promise.all([login,logout]);expect(s.controller.snapshot().route?.type).toBe('AuthEntry');expect(s.tokens).toBeUndefined();s.controller.dispose();
 });
 it('ignores a saved local preference unless the main process explicitly allows local development',async()=>{
  const s=setup();const controller=new AccountController(s.gateway,{read:async()=>undefined,save:async()=>{},clear:async()=>{}},{read:async()=>({mode:'local'}),write:async()=>{}});
  try{expect((await controller.initialize()).phase).toBe('signed_out');expect((await controller.command({type:'local'})).phase).not.toBe('offline_local');expect(controller.snapshot().localModeAllowed).toBe(false);}finally{controller.dispose();s.controller.dispose();}
 });
 it('preserves encrypted intent separately from sessions and excludes it from IPC',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'gwira-intent-unit-'));try{
   const encryption={available:async()=>true,encrypt:async(s:string)=>Buffer.from(Buffer.from(s).map(n=>n^123)),decrypt:async(b:Buffer)=>Buffer.from(b.map(n=>n^123)).toString()};
   const file=path.join(dir,'session'),vault=new SessionVault(file,config.url,encryption),raw='d'.repeat(43);await vault.saveIntent(raw);await vault.clear();
   expect(await new SessionVault(file,config.url,encryption).readIntent()).toBe(raw);expect((await readFile(file+'.invitation-intent')).includes(Buffer.from(raw))).toBe(false);expect((await stat(file+'.invitation-intent')).mode&0o777).toBe(0o600);
   await expect(new SessionVault(file,'other-project',encryption).readIntent()).rejects.toThrow('unlocked');await vault.clearIntent();expect(await vault.readIntent()).toBeUndefined();
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('does not replace the vault when authorization changes before the atomic commit',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'gwira-vault-revoked-'));
  try{
   const vault=new SessionVault(path.join(dir,'session'),config.url,{available:async()=>true,encrypt:async text=>Buffer.from(text),decrypt:async bytes=>bytes.toString()});
   const original={accessToken:'original',refreshToken:'original-refresh',expiresAt:Date.now()+60000};
   await vault.save(original);
   await expect(vault.save({...original,accessToken:'revoked'},()=>{throw Error('context changed');})).rejects.toThrow('context changed');
   expect(await vault.read()).toEqual(original);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('restores invitation review after restart and account-switch cancellation, then removes it on ordinary sign-out',async()=>{
  const s=setup();s.gateway.routingFacts=async()=>readyFacts;
  vi.spyOn(s.gateway,'server').mockResolvedValue({organization_name:'Invited workspace',assigned_role:'member',status:'pending',expires_at:new Date(Date.now()+86400000).toISOString()});
  let intent:string|undefined='e'.repeat(43);const controller=new AccountController(s.gateway,{read:async()=>undefined,save:async()=>{},clear:async()=>{},readIntent:async()=>intent,saveIntent:async value=>{intent=value;},clearIntent:async()=>{intent=undefined;}},{read:async()=>({}),write:async()=>{}});
  try{await controller.initialize();await controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});expect(controller.snapshot().route?.type).toBe('InvitationReview');expect(JSON.stringify(controller.snapshot())).not.toContain(intent);await controller.command({type:'cancel'});expect(intent).toBeDefined();expect(controller.snapshot().invitationPending).toBe(true);await controller.command({type:'sign_out'});expect(intent).toBeUndefined();}finally{controller.dispose();s.controller.dispose();}
 });
});

describe('B1 read-only routing facts contract',()=>{
 it('rejects missing organization rows and malformed or duplicate memberships instead of fabricating empty access',async()=>{
  const cases=[
   {memberships:[{organization_id:a,role:'owner'}],organizations:[]},
   {memberships:[{organization_id:a,role:'invalid'}],organizations:[{id:a,name:'A'}]},
   {memberships:[{organization_id:a,role:'owner'},{organization_id:a,role:'owner'}],organizations:[{id:a,name:'A'}]},
   {memberships:[{organization_id:a,role:'owner'}],organizations:[{id:a,name:'A'},{id:a,name:'A'}]},
   {memberships:{},organizations:[]},
  ];
  for(const item of cases){const gateway=new AuthGateway(config,async url=>new Response(JSON.stringify(new URL(String(url)).pathname.endsWith('/organization_memberships')?item.memberships:item.organizations)));await expect(gateway.organizations('fixture',uid)).rejects.toThrow('could not be verified');}
 });
 it('rejects malformed, duplicate or cross-organization team results',async()=>{
  for(const rows of [{},[{id:'1',organization_id:b,name:'Wrong organization'}],[{id:'1',organization_id:a,name:'One'},{id:'1',organization_id:a,name:'Duplicate'}],[{id:'1',organization_id:a,name:''}]]){
   const gateway=new AuthGateway(config,async()=>new Response(JSON.stringify(rows)));await expect(gateway.teams('fixture',a)).rejects.toThrow('could not be verified');
  }
 });
 it('loads all team pages in deterministic order without treating the first page as complete',async()=>{
  const rows=Array.from({length:1001},(_,i)=>({id:String(i).padStart(4,'0'),organization_id:a,name:`Team ${i}`}));
  const offsets:number[]=[];
  const gateway=new AuthGateway(config,async url=>{
   const params=new URL(String(url)).searchParams,offset=Number(params.get('offset'));
   expect(params.get('order')).toBe('id.asc');expect(params.get('limit')).toBe('500');
   offsets.push(offset);return new Response(JSON.stringify(rows.slice(offset,offset+500)));
  });
  const result=await gateway.teams('fixture',a);
  expect(result).toHaveLength(1001);expect(result[1000]).toEqual({id:'1000',organizationId:a,name:'Team 1000'});expect(offsets).toEqual([0,500,1000]);
 });
 it('rejects duplicate teams across pages and oversized results rather than returning a partial list',async()=>{
  const gateway=new AuthGateway(config,async url=>{
   const offset=Number(new URL(String(url)).searchParams.get('offset'));
   const rows=Array.from({length:500},(_,i)=>({id:String(offset+i),organization_id:a,name:'Team'}));
   if(offset===500)rows[0]!.id='0';
   return new Response(JSON.stringify(rows));
  });
  await expect(gateway.teams('fixture',a)).rejects.toThrow('could not be verified');
  const oversized=new AuthGateway(config,async url=>{
   const offset=Number(new URL(String(url)).searchParams.get('offset'));
   return new Response(JSON.stringify(Array.from({length:500},(_,i)=>({id:String(offset+i),organization_id:a,name:'Team'}))));
  });
  await expect(oversized.teams('fixture',a)).rejects.toThrow('too many workspace teams');
 });
 it('routes missing organization records as an access error, not workspace setup',async()=>{
  const s=setup();s.setMemberships([{organization_id:'44444444-4444-4444-8444-444444444444',role:'owner'}]);await s.controller.initialize();
  const state=await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});expect(state.route?.type).toBe('AccessError');expect(state.route?.type).not.toBe('WorkspaceSetup');s.controller.dispose();
 });
 it('loads persisted profile, recipient invitations and creator setup rather than inferring from Google name',async()=>{
  const requests:string[]=[];const gateway=new AuthGateway(config,async url=>{const route=new URL(String(url));requests.push(route.pathname);const body=route.pathname.endsWith('account_profiles')?[{preferred_name:'Alex',completed_at:'2026-11-04'}]:route.pathname.endsWith('list_my_pending_invitations')?[{id:'invite',organization_id:b,organization_name:'B'}]:[{organization_id:a,creator_user_id:uid,current_step:'meet_gwira',completed_at:null}];return new Response(JSON.stringify(body));});
  expect(await gateway.routingFacts('fixture-bearer',uid)).toEqual({profileComplete:true,pendingInvitations:[{id:'invite',organizationId:b,organizationName:'B'}],setup:[{organizationId:a,creatorUserId:uid,step:'meet_gwira'}]});expect(requests).toHaveLength(3);
 });
 it('rejects malformed bootstrap data instead of treating it as an empty account',async()=>{
  const gateway=new AuthGateway(config,async()=>new Response('{}'));await expect(gateway.routingFacts('fixture-bearer',uid)).rejects.toThrow('invalid response');
 });
 it('turns a real session expiry into AuthEntry and removes authorized context',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});vi.spyOn(s.gateway,'identity').mockRejectedValue(new AccountError('session_expired','Sign in again.'));const state=await s.controller.command({type:'refresh'});expect(state.route).toEqual({type:'AuthEntry',reason:'expired'});expect(state.organizations).toEqual([]);expect(state.activeOrganization).toBeUndefined();s.controller.dispose();
 });
});
describe('autoconfirmed development environment',()=>{
 const unverified=()=>{const local=authConfiguration({...env,GWIRA_SUPABASE_URL:'http://127.0.0.1:54321'})!;const s=setup(local);vi.spyOn(s.gateway,'settings').mockResolvedValue({external:{google:false,email:true},mailer_autoconfirm:true});return s;};
 it('flags unverified mailboxes and blocks recovery',async()=>{const s=unverified();const init=await s.controller.initialize();expect(init.unverifiedMailboxes).toBe(true);const r=await s.controller.command({type:'recover',email:'qa@example.test'});expect(r.phase).toBe('error');expect(s.requests.some(x=>x.includes('/recover'))).toBe(false);s.controller.dispose();});
 it('blocks invitation acceptance',async()=>{const s=unverified();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});const r=await s.controller.command({type:'accept_invitation'});expect(r.phase).toBe('error');expect(r.error).toMatch(/does not verify email ownership/);s.controller.dispose();});
 it('refuses autoconfirm against a production configuration',async()=>{const prod=authConfiguration({...env,GWIRA_SUPABASE_URL:'https://project.supabase.co',GWIRA_AUTH_ENVIRONMENT:'production'})!;const s=setup();const gateway=new AuthGateway(prod,async()=>new Response(JSON.stringify({external:{email:true},mailer_autoconfirm:true}),{status:200}));const c=new AccountController(gateway,{read:async()=>undefined,save:async()=>{},clear:async()=>{}},{read:async()=>({}),write:async()=>{}},false,undefined,undefined,false,undefined,true);await c.initialize();const r=await c.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});expect(r.phase).toBe('error');expect(r.user).toBeUndefined();c.dispose();s.controller.dispose();});
 it('refuses hosted autoconfirm even when labeled development and blocks every sign-in entry',async()=>{
  const s=setup();vi.spyOn(s.gateway,'settings').mockResolvedValue({mailer_autoconfirm:true});
  expect((await s.controller.initialize()).error).toMatch(/auto-confirms email/);
  const actions=[{type:'password_sign_in',email:'qa@example.test',password:'fixture-password'},{type:'password_sign_up',email:'qa@example.test',password:'fixture-password'},{type:'recover',email:'qa@example.test'},{type:'email',email:'qa@example.test'},{type:'google'},{type:'accept_invitation'}] as const;
  for(const action of actions)expect((await s.controller.command(action)).error).toMatch(/auto-confirms email/);
  expect(s.requests.every(path=>path.startsWith('/auth/v1/settings'))).toBe(true);expect(s.tokens).toBeUndefined();s.controller.dispose();
 });
 it('fails closed when settings are missing or unavailable and retries when the service recovers',async()=>{
  const s=setup();const settings=vi.spyOn(s.gateway,'settings').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({}).mockResolvedValue({mailer_autoconfirm:false});
  expect((await s.controller.initialize()).error).toMatch(/could not verify/);
  expect((await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'})).error).toMatch(/could not verify/);
  expect(s.requests).not.toContain('/auth/v1/token?grant_type=password');
  await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  expect(s.tokens).toBeDefined();expect(settings).toHaveBeenCalledTimes(3);s.controller.dispose();
 });
 it('rechecks blocked hosted settings while signed out without sending credentials',async()=>{
  const s=setup();const settings=vi.spyOn(s.gateway,'settings').mockResolvedValue({mailer_autoconfirm:true});
  expect((await s.controller.initialize()).error).toMatch(/auto-confirms email/);
  const stillBlocked=await s.controller.command({type:'refresh'});expect(stillBlocked.error).toMatch(/auto-confirms email/);expect(stillBlocked.user).toBeUndefined();
  settings.mockResolvedValue({mailer_autoconfirm:false});const recovered=await s.controller.command({type:'refresh'});
  expect(recovered.phase).toBe('signed_out');expect(recovered.error).toBeUndefined();expect(recovered.user).toBeUndefined();expect(s.tokens).toBeUndefined();
  expect(s.requests.every(path=>path.startsWith('/auth/v1/settings'))).toBe(true);expect(settings).toHaveBeenCalledTimes(3);s.controller.dispose();
 });
 it('allows a signed-out settings retry after a network failure without inventing a session',async()=>{
  const s=setup();vi.spyOn(s.gateway,'settings').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({mailer_autoconfirm:false});
  expect((await s.controller.initialize()).error).toMatch(/could not verify/);
  const recovered=await s.controller.command({type:'refresh'});expect(recovered.phase).toBe('signed_out');expect(recovered.error).toBeUndefined();expect(s.tokens).toBeUndefined();s.controller.dispose();
 });
 it('does not restore saved sessions when settings cannot be verified',async()=>{
  const gateway=new AuthGateway(config,async()=>new Response('{}'));const read=vi.fn(async()=>({accessToken:'fixture',refreshToken:'fixture',expiresAt:Date.now()+3600000}));
  const c=new AccountController(gateway,{read,save:async()=>{},clear:async()=>{}},{read:async()=>({}),write:async()=>{}});
  expect((await c.initialize()).error).toMatch(/could not verify/);expect(read).not.toHaveBeenCalled();c.dispose();
 });
});
describe('onboarding progress contract',()=>{
 const valid={act:'clarifying',goal:'Follow up on overdue payments',answers:[{question:'q',answer:'a'}],asked:1};
 it('distinguishes empty, valid, inaccessible, and malformed backend progress',async()=>{
  let rows:unknown=[{onboarding:{}}];
  const gateway=new AuthGateway(config,async()=>new Response(JSON.stringify(rows),{status:200}));
  expect(await gateway.loadOnboarding('fixture',a)).toBeNull();
  rows=[{onboarding:valid}];expect(await gateway.loadOnboarding('fixture',a)).toEqual(valid);
  rows=[];await expect(gateway.loadOnboarding('fixture',a)).rejects.toMatchObject({code:'access_denied'});
  rows=[{onboarding:{act:'invalid'}}];await expect(gateway.loadOnboarding('fixture',a)).rejects.toMatchObject({code:'setup_unavailable'});
 });
 it('accepts a well-formed progress record and strips unknown fields',()=>expect(parseOnboardingProgress({...valid,extra:'x'})).toEqual(valid));
 it.each([null,'x',{...valid,act:'done'},{...valid,goal:'x'.repeat(2001)},{...valid,answers:Array(11).fill({question:'q',answer:'a'})},{...valid,answers:[{question:1,answer:'a'}]},{...valid,asked:-1}])('rejects malformed progress %#',value=>expect(parseOnboardingProgress(value)).toBeUndefined());
 it('rejects malformed saves in the main process without calling the backend',async()=>{const s=setup();const save=vi.spyOn(s.gateway,'saveOnboarding');await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});await s.controller.command({type:'save_onboarding',progress:{act:'bogus'} as never});expect(save).not.toHaveBeenCalled();s.controller.dispose();});
 it('does not complete setup after a failed save, and permits completion after retry',async()=>{
  const s=setup();
  vi.spyOn(s.gateway,'routingFacts').mockResolvedValue({profileComplete:true,pendingInvitations:[],setup:[{organizationId:a,creatorUserId:uid,step:'meet_gwira'}]});
  const save=vi.spyOn(s.gateway,'saveOnboarding').mockRejectedValueOnce(new AccountError('network','offline')).mockResolvedValue();
  const complete=vi.spyOn(s.gateway,'completeSetup').mockResolvedValue();
  await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const progress=parseOnboardingProgress(valid)!;
  await s.controller.command({type:'save_onboarding',progress});
  expect(s.controller.snapshot().onboardingSaveFailed).toBe(true);
  await s.controller.command({type:'complete_setup',deferred:true});expect(complete).not.toHaveBeenCalled();
  await s.controller.command({type:'save_onboarding',progress});
  expect(save).toHaveBeenCalledTimes(2);expect(s.controller.snapshot().onboardingSaveFailed).toBe(false);
  await s.controller.command({type:'complete_setup',deferred:true});expect(complete).toHaveBeenCalledOnce();s.controller.dispose();
 });
 it('removes the workspace after membership is revoked during setup completion',async()=>{
  const s=setup();
  vi.spyOn(s.gateway,'routingFacts').mockResolvedValue({profileComplete:true,pendingInvitations:[],setup:[{organizationId:a,creatorUserId:uid,step:'meet_gwira'}]});
  vi.spyOn(s.gateway,'completeSetup').mockImplementation(async()=>{s.setMemberships([{organization_id:b,role:'member'}]);});
  await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const result=await s.controller.command({type:'complete_setup',deferred:true});
  expect(result.phase).toBe('access_revoked');expect(result.activeOrganization).toBeUndefined();
  await expect(s.controller.verifiedWorkspace()).rejects.toThrow();s.controller.dispose();
 });
 it('clears onboarding progress immediately when switching organizations or signing out',async()=>{
  const s=setup();
  vi.spyOn(s.gateway,'routingFacts').mockResolvedValue({profileComplete:true,pendingInvitations:[],setup:[a,b].map(organizationId=>({organizationId,creatorUserId:uid,step:'meet_gwira' as const}))});
  vi.spyOn(s.gateway,'loadOnboarding').mockResolvedValue(parseOnboardingProgress(valid)!);
  await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  await s.controller.command({type:'load_onboarding'});expect(s.controller.snapshot().onboardingProgress?.goal).toBe(valid.goal);
  await s.controller.command({type:'switch',organizationId:b});expect(s.controller.snapshot().onboardingProgress).toBeUndefined();
  await s.controller.command({type:'load_onboarding'});const signingOut=s.controller.command({type:'sign_out'});
  expect(s.controller.snapshot().onboardingProgress).toBeUndefined();await signingOut;s.controller.dispose();
 });
 it('discards an onboarding load that finishes after sign-out was requested',async()=>{
  const s=setup();
  vi.spyOn(s.gateway,'routingFacts').mockResolvedValue({profileComplete:true,pendingInvitations:[],setup:[{organizationId:a,creatorUserId:uid,step:'meet_gwira'}]});
  let release!:(value:NonNullable<ReturnType<typeof parseOnboardingProgress>>)=>void;
  let started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});
  vi.spyOn(s.gateway,'loadOnboarding').mockImplementation(()=>{started();return new Promise(resolve=>{release=resolve;});});
  await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const loading=s.controller.command({type:'load_onboarding'});await waiting;
  const signingOut=s.controller.command({type:'sign_out'});release(parseOnboardingProgress(valid)!);
  expect((await loading).onboardingProgress).toBeUndefined();expect((await signingOut).onboardingProgress).toBeUndefined();s.controller.dispose();
 });
});

describe('trusted conversation boundary',()=>{
 it('scopes project reads and changes to the verified workspace',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);const json=vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/sidebar_projects?'))return [{id:b,organization_id:a,owner_id:uid,name:'Project',pinned:false}] as never;
   if(route.startsWith('/rest/v1/sidebar_project_sections?')||route.startsWith('/rest/v1/sidebar_project_conversations?'))return [] as never;
   if(route==='/rest/v1/rpc/mutate_sidebar_project')return null as never;
   return original(route,...args);
  });
  const expected={userId:uid,organizationId:a};
  await expect(s.controller.conversationOperation({type:'projects'},expected)).resolves.toMatchObject({projects:[{id:b}],sections:[],links:[]});
  const routes=json.mock.calls.map(call=>call[0]);
  expect(routes.find(route=>route.startsWith('/rest/v1/sidebar_projects?'))).toContain(`organization_id=eq.${a}`);
  expect(routes.find(route=>route.startsWith('/rest/v1/sidebar_project_sections?'))).toContain(`sidebar_projects.organization_id=eq.${a}`);
  await s.controller.conversationOperation({type:'project_change',projectId:b,action:'rename',value:'New name'},expected);
  expect(json.mock.calls.find(call=>call[0]==='/rest/v1/rpc/mutate_sidebar_project')?.[1]).toMatchObject({p_org:a,p_project:b,p_action:'rename',p_value:'New name'});
  await expect(s.controller.conversationOperation({type:'project_change',projectId:b,action:'move',conversationId:'bad'},expected)).rejects.toMatchObject({code:'invalid_request'});
  await expect(s.controller.conversationOperation({type:'projects'},{userId:uid,organizationId:b})).rejects.toMatchObject({code:'context_changed'});
  await expect(s.controller.conversationOperation({type:'projects'})).rejects.toMatchObject({code:'context_changed'});
  s.controller.dispose();
 });
 it('loads only recorded generating activity for the verified workspace',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);const json=vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/ai_generations?'))return [{conversation_id:b},{conversation_id:b}] as never;
   return original(route,...args);
  });
  await expect(s.controller.conversationOperation({type:'activity'},{userId:uid,organizationId:a})).resolves.toEqual({activeConversationIds:[b]});
  const route=json.mock.calls.find(call=>call[0].startsWith('/rest/v1/ai_generations?'))?.[0];
  expect(route).toContain(`organization_id=eq.${a}`);expect(route).toContain('status=eq.generating');
  await expect(s.controller.conversationOperation({type:'activity'},{userId:uid,organizationId:b})).rejects.toMatchObject({code:'context_changed'});
  s.controller.dispose();
 });
 it('derives organization from the active account and rejects forged or foreign resources',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);const json=vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/conversations?'))return [] as never;
   return original(route,...args);
  });
  await expect(s.controller.conversationOperation({type:'messages',id:b})).rejects.toMatchObject({code:'access_denied'});
  expect(json.mock.calls.find(call=>call[0].startsWith('/rest/v1/conversations?'))?.[0]).toContain(`organization_id=eq.${a}`);
  await expect(s.controller.conversationOperation({type:'messages',id:'invalid'})).rejects.toMatchObject({code:'invalid_request'});
  s.controller.dispose();
 });
 it('discards a result arriving after sign-out',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/conversations?')){started();await new Promise<void>(resolve=>{release=resolve;});return [] as never;}
   if(route.startsWith('/rest/v1/conversation_pins?'))return [] as never;
   return original(route,...args);
  });
  const request=s.controller.conversationOperation({type:'list'});await waiting;
  const signout=s.controller.command({type:'sign_out'});release();
  await expect(request).rejects.toMatchObject({code:'context_changed'});await signout;s.controller.dispose();
 });
 it('does not return an old organization response after switching',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/conversations?')){started();await new Promise<void>(resolve=>{release=resolve;});return [] as never;}
   if(route.startsWith('/rest/v1/conversation_pins?'))return [] as never;
   return original(route,...args);
  });
  const request=s.controller.conversationOperation({type:'list'});await waiting;
  const switching=s.controller.command({type:'switch',organizationId:b});release();
  await expect(request).rejects.toMatchObject({code:'context_changed'});await switching;s.controller.dispose();
 });
});

describe('trusted directory boundary',()=>{
 it('scopes directory reads and pins to the verified account and workspace',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);
  const json=vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/employees?')||route.startsWith('/rest/v1/directory_pins?'))return [] as never;
   if(route==='/rest/v1/rpc/pin_directory_employee')return null as never;
   if(route==='/rest/v1/rpc/create_directory_person')return b as never;
   return original(route,...args);
  });
  const scope={userId:uid,organizationId:a};
  expect(await s.controller.directoryOperation({type:'list'},scope)).toEqual({employees:[],pins:[]});
  expect(json.mock.calls.find(call=>call[0].startsWith('/rest/v1/employees?'))?.[0]).toContain(`organization_id=eq.${a}`);
  await s.controller.directoryOperation({type:'pin',id:b,pinned:true},scope);
  expect(json.mock.calls.find(call=>call[0]==='/rest/v1/rpc/pin_directory_employee')?.[1]).toEqual({p_org:a,p_employee:b,p_pinned:true});
  await s.controller.directoryOperation({type:'create',id:b,name:'Test person',jobTitle:'Designer'},scope);
  expect(json.mock.calls.find(call=>call[0]==='/rest/v1/rpc/create_directory_person')?.[1]).toEqual({p_org:a,p_id:b,p_name:'Test person',p_job_title:'Designer'});
  await expect(s.controller.directoryOperation({type:'create',id:b,name:' ',jobTitle:'Designer'},scope)).rejects.toMatchObject({code:'invalid_request'});
  await expect(s.controller.directoryOperation({type:'create',id:b,name:'Test',jobTitle:'Designer'},{userId:uid,organizationId:b})).rejects.toMatchObject({code:'context_changed'});
  await expect(s.controller.directoryOperation({type:'pin',id:b,pinned:true},{userId:uid,organizationId:b})).rejects.toMatchObject({code:'context_changed'});
  await expect(s.controller.directoryOperation({type:'pin',id:'invalid',pinned:true},scope)).rejects.toMatchObject({code:'invalid_request'});
  s.controller.dispose();
 });
 it('does not confirm a person when the backend returns another id',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>route==='/rest/v1/rpc/create_directory_person'?a as never:original(route,...args));
  await expect(s.controller.directoryOperation({type:'create',id:b,name:'Test person',jobTitle:'Designer'},{userId:uid,organizationId:a})).rejects.toMatchObject({code:'invalid_response'});
  s.controller.dispose();
 });
 it('does not confirm a pending creation after a workspace switch',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route==='/rest/v1/rpc/create_directory_person'){started();await new Promise<void>(resolve=>{release=resolve;});return b as never;}
   return original(route,...args);
  });
  const request=s.controller.directoryOperation({type:'create',id:b,name:'Test person',jobTitle:'Designer'},{userId:uid,organizationId:a});await waiting;
  const switching=s.controller.command({type:'switch',organizationId:b});release();
  await expect(request).rejects.toMatchObject({code:'context_changed'});await switching;s.controller.dispose();
 });
});

describe('trusted channel boundary',()=>{
 it('binds channel requests to the verified account and workspace',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);
  const json=vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/rpc/list_channels?'))return [] as never;
   if(route==='/rest/v1/rpc/create_channel')return b as never;
   if(route==='/rest/v1/rpc/send_channel_message')return b as never;
   return original(route,...args);
  });
  const scope={userId:uid,organizationId:a};
  expect(await s.controller.channelOperation({type:'list'},scope)).toEqual([]);
  expect(json.mock.calls.find(call=>call[0].startsWith('/rest/v1/rpc/list_channels?'))?.[1]).toEqual({p_org:a});
  await s.controller.channelOperation({type:'create',id:b,name:'Team',topic:'',visibility:'private',members:[]},scope);
  expect(json.mock.calls.find(call=>call[0]==='/rest/v1/rpc/create_channel')?.[1]).toMatchObject({p_org:a,p_id:b});
  await expect(s.controller.channelOperation({type:'list'},{userId:uid,organizationId:b})).rejects.toMatchObject({code:'context_changed'});
  await expect(s.controller.channelOperation({type:'send',id:b,messageId:'invalid',body:'Hello'},scope)).rejects.toMatchObject({code:'invalid_request'});
  await expect(s.controller.channelOperation({type:'create',id:b,name:' ',topic:'',visibility:'org',members:[]},scope)).rejects.toMatchObject({code:'invalid_request'});
  s.controller.dispose();
 });
 it('discards channel responses after a workspace switch',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/rpc/list_channels?')){started();await new Promise<void>(resolve=>{release=resolve;});return [] as never;}
   return original(route,...args);
  });
  const request=s.controller.channelOperation({type:'list'},{userId:uid,organizationId:a});await waiting;
  const switching=s.controller.command({type:'switch',organizationId:b});release();
  await expect(request).rejects.toMatchObject({code:'context_changed'});await switching;s.controller.dispose();
 });
});

describe('trusted notification boundary',()=>{
 it('scopes reads and mark-read requests to the verified account and workspace',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);
  const json=vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/notifications?'))return [] as never;
   if(route==='/rest/v1/rpc/mark_notification_read')return null as never;
   return original(route,...args);
  });
  const scope={userId:uid,organizationId:a};
  expect(await s.controller.notificationOperation({type:'list'},scope)).toEqual([]);
  expect(json.mock.calls.find(call=>call[0].startsWith('/rest/v1/notifications?'))?.[0]).toContain(`organization_id=eq.${a}&recipient_id=eq.${uid}`);
  await s.controller.notificationOperation({type:'mark_read',id:b},scope);
  expect(json.mock.calls.find(call=>call[0]==='/rest/v1/rpc/mark_notification_read')?.[1]).toEqual({p_id:b,p_org:a});
  await expect(s.controller.notificationOperation({type:'mark_read',id:b},{userId:uid,organizationId:b})).rejects.toMatchObject({code:'context_changed'});
  await expect(s.controller.notificationOperation({type:'mark_read',id:'invalid'},scope)).rejects.toMatchObject({code:'invalid_request'});
  s.controller.dispose();
 });
 it('scopes approval requests and verifies decision confirmations',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);
  const json=vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/approval_tasks?')||route.startsWith('/rest/v1/task_approval_results?'))return [] as never;
   if(route==='/rest/v1/rpc/decide_task_approval')return b as never;
   return original(route,...args);
  });
  const scope={userId:uid,organizationId:a};
  expect(await s.controller.approvalOperation({type:'list'},scope)).toEqual({tasks:[],results:[]});
  expect(json.mock.calls.find(call=>call[0].startsWith('/rest/v1/approval_tasks?'))?.[0]).toContain(`organization_id=eq.${a}`);
  await s.controller.approvalOperation({type:'decide',id:b,decision:'approved'},scope);
  expect(json.mock.calls.find(call=>call[0]==='/rest/v1/rpc/decide_task_approval')?.[1]).toEqual({p_org:a,p_id:b,p_decision:'approved'});
  await expect(s.controller.approvalOperation({type:'decide',id:'invalid',decision:'approved'},scope)).rejects.toMatchObject({code:'invalid_request'});
  await expect(s.controller.approvalOperation({type:'list'},{userId:uid,organizationId:b})).rejects.toMatchObject({code:'context_changed'});
  s.controller.dispose();
 });
 it('rejects approval records outside the verified participant scope',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/approval_tasks?'))return [{id:b,organization_id:a,created_by:b,reviewer_id:b,title:'Not yours',status:'in_review',created_at:'2026-01-01',updated_at:'2026-01-01'}] as never;
   if(route.startsWith('/rest/v1/task_approval_results?'))return [] as never;
   return original(route,...args);
  });
  await expect(s.controller.approvalOperation({type:'list'},{userId:uid,organizationId:a})).rejects.toMatchObject({code:'invalid_response'});
  s.controller.dispose();
 });
 it('discards approval data returned after a workspace switch',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);let release!:()=>void,started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/approval_tasks?')){started();await new Promise<void>(resolve=>{release=resolve;});return [] as never;}
   if(route.startsWith('/rest/v1/task_approval_results?'))return [] as never;
   return original(route,...args);
  });
  const request=s.controller.approvalOperation({type:'list'},{userId:uid,organizationId:a});await waiting;
  const switching=s.controller.command({type:'switch',organizationId:b});release();
  await expect(request).rejects.toMatchObject({code:'context_changed'});await switching;s.controller.dispose();
 });
 it('does not return notification records from a different recipient or workspace',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>route.startsWith('/rest/v1/notifications?')?[{organization_id:b,recipient_id:uid}] as never:original(route,...args));
  await expect(s.controller.notificationOperation({type:'list'},{userId:uid,organizationId:a})).rejects.toMatchObject({code:'invalid_response'});
  s.controller.dispose();
 });
 it('discards notification results that arrive after an account switch',async()=>{
  const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;});
  const original=s.gateway.json.bind(s.gateway);
  vi.spyOn(s.gateway,'json').mockImplementation(async(route,...args)=>{
   if(route.startsWith('/rest/v1/notifications?')){started();await new Promise<void>(resolve=>{release=resolve;});return [] as never;}
   return original(route,...args);
  });
  const request=s.controller.notificationOperation({type:'list'},{userId:uid,organizationId:a});await waiting;
  const switching=s.controller.command({type:'switch',organizationId:b});release();
  await expect(request).rejects.toMatchObject({code:'context_changed'});await switching;s.controller.dispose();
 });
});

describe('first-run plans',()=>{
 const plan={id:'11111111-1111-4111-8111-111111111111',title:'Plan',version:1,status:'draft' as const,markdown:'# Plan',structured:{},summary:'',updatedAt:'2026-11-07T00:00:00Z'};
 async function signedIn(){const s=setup();await s.controller.initialize();await s.controller.command({type:'password_sign_in',email:'qa@example.test',password:'fixture-password'});return s;}
 it('saves against the verified active organization, never one supplied by the renderer',async()=>{
  const s=await signedIn();const save=vi.spyOn(s.gateway,'savePlan').mockResolvedValue();vi.spyOn(s.gateway,'loadPlan').mockResolvedValue(plan);
  const r=await s.controller.command({type:'plan_save',title:'Plan',markdown:'# Plan',structured:{},organizationId:'99999999-9999-4999-8999-999999999999'} as never);
  expect(save).toHaveBeenCalledTimes(1);expect(save.mock.calls[0][1]).toBe(r.activeOrganization!.id);expect(r.plan?.version).toBe(1);s.controller.dispose();
 });
 it.each([{title:'',markdown:'x',structured:{}},{title:'x'.repeat(201),markdown:'x',structured:{}},{title:'t',markdown:'x'.repeat(60001),structured:{}},{title:'t',markdown:'x',structured:{big:'x'.repeat(60001)}}])('rejects malformed plans before the backend %#',async body=>{
  const s=await signedIn();const save=vi.spyOn(s.gateway,'savePlan').mockResolvedValue();
  const r=await s.controller.command({type:'plan_save',...body} as never);
  expect(save).not.toHaveBeenCalled();expect(r.planError?.code).toBe('invalid_plan');s.controller.dispose();
 });
 it('reports a stale approval without leaving the workspace route or approving anything',async()=>{
  const s=await signedIn();const before=(await s.controller.command({type:'plan_load'})).route?.type;
  vi.spyOn(s.gateway,'approvePlan').mockRejectedValue(new AccountError('plan_version_stale','The plan changed since you last reviewed it. Review the current version first.'));
  const r=await s.controller.command({type:'plan_approve',planId:plan.id,version:1,method:'chat'});
  expect(r.planError?.code).toBe('plan_version_stale');expect(r.planError?.message).toMatch(/Review the current version/);expect(r.route?.type).toBe(before);expect(r.plan?.status).not.toBe('approved');s.controller.dispose();
 });
 it('does not expose backend internals when a plan operation fails',async()=>{
  const s=await signedIn();vi.spyOn(s.gateway,'savePlan').mockRejectedValue(new AccountError('network','relation gwira.plan_versions does not exist'));
  const r=await s.controller.command({type:'plan_save',title:'t',markdown:'x',structured:{}});
  expect(r.planError?.message).not.toMatch(/relation|gwira\./);expect(r.planError?.message).toMatch(/conversation is kept/);s.controller.dispose();
 });
 it('validates approval arguments in the main process',async()=>{
  const s=await signedIn();const approve=vi.spyOn(s.gateway,'approvePlan').mockResolvedValue();
  await s.controller.command({type:'plan_approve',planId:plan.id,version:1.5,method:'chat'});await s.controller.command({type:'plan_approve',planId:plan.id,version:1,method:'robot' as never});
  expect(approve).not.toHaveBeenCalled();s.controller.dispose();
 });
 it('clears the plan on sign out',async()=>{
  const s=await signedIn();vi.spyOn(s.gateway,'loadPlan').mockResolvedValue(plan);
  expect((await s.controller.command({type:'plan_load'})).plan?.id).toBe(plan.id);
  expect((await s.controller.command({type:'sign_out'})).plan).toBeUndefined();s.controller.dispose();
 });
 it('maps backend plan errors to specific codes at the gateway',async()=>{
  const failing=(message:string,code:string)=>new AuthGateway(config,async()=>new Response(JSON.stringify({code,message}),{status:code==='42501'?403:400,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}}));
  await expect(failing('plan_version_stale','22023').approvePlan('t','o','p',1,'chat')).rejects.toMatchObject({code:'plan_version_stale'});
  await expect(failing('plan_approval_denied','42501').approvePlan('t','o','p',1,'chat')).rejects.toMatchObject({code:'plan_approval_denied'});
  await expect(failing('plan_access_denied','42501').savePlan('t','o',{title:'t',markdown:'x',structured:{}})).rejects.toMatchObject({code:'plan_unavailable'});
 });
 it('keeps optional chat history in saved onboarding progress and rejects abuse',()=>{
  const base={act:'proposal',goal:'g',answers:[],asked:0};
  const chat=[{role:'user',text:'hi',at:'2026-11-07T00:00:00Z'},{role:'gwira',text:'hello',at:'2026-11-07T00:00:01Z'}];
  expect(parseOnboardingProgress({...base,startedAt:'2026-11-07T00:00:00Z',chat})).toEqual({...base,startedAt:'2026-11-07T00:00:00Z',chat});
  expect(parseOnboardingProgress({...base,chat:Array(25).fill(chat[0])})).toBeUndefined();
  expect(parseOnboardingProgress({...base,chat:[{role:'system',text:'x',at:chat[0].at}]})).toBeUndefined();
  expect(parseOnboardingProgress({...base,chat:[{...chat[0],text:'x'.repeat(601)}]})).toBeUndefined();
 });
});
