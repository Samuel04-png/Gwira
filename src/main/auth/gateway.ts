import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import type {AccountRoutingFacts} from './routingCoordinator.js';
import {isMissingContract} from './accessIssue.js';
import type {AuthConfiguration} from './config.js';
import {parseOnboardingProgress,type OnboardingProgress,type AccountIdentity,type PlanRecord} from '../../shared/accountAuth.js';
import type {CloudOrganization,CloudTeam,OrganizationInvitation} from '../../shared/organizationAccess.js';
export interface AuthTokens {accessToken:string;refreshToken:string;expiresAt:number;}
export class AccountError extends Error {constructor(readonly code:string,message:string){super(message);}}
/** Single main-process transport. Server errors and credentials never cross IPC. */
export class AuthGateway {
 private readonly sdk:SupabaseClient;
 constructor(readonly config:AuthConfiguration,private readonly request:typeof fetch=fetch){
  // Stateless: sessions live only in the main-process vault, never in the SDK.
  this.sdk=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>this.request(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)})}});
 }
 async json<T>(route:string,body?:unknown,bearer?:string,schema?:string,method?:'PUT'):Promise<T>{
  let response:Response;try{response=await this.request(this.config.url+route,{method:method??(body===undefined?'GET':'POST'),headers:{apikey:this.config.publishableKey,...(bearer?{Authorization:`Bearer ${bearer}`}:{}) ,'Content-Type':'application/json',...(schema?{'Accept-Profile':schema,'Content-Profile':schema}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new AccountError('network','Could not reach Gwira. Check your connection and try again.');}
  if(!response.ok){if(route==='/auth/v1/otp'&&response.status>=500)throw new AccountError('provider_email_failed','We couldn’t send your sign-in code. Your email is saved. Try again shortly; if this continues, contact your workspace administrator.');let code='';try{const payload=await response.json() as {code?:unknown;error_code?:unknown;msg?:unknown;message?:unknown};const raw=typeof payload.code==='string'?payload.code:payload.error_code;code=typeof raw==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(raw)?raw:'';const legacy=typeof payload.msg==='string'?payload.msg:payload.message;if(!code&&legacy==='User already registered')code='user_already_exists';if(route.startsWith('/rest/v1/rpc/')&&typeof legacy==='string'&&/^plan_(version_stale|approval_denied|unavailable|access_denied)$/.test(legacy))code=legacy;}catch{}
   throw this.reject(route,response.status,code);}
  return (response.status===204?undefined:await response.json()) as T;
 }
 private reject(route:string,status:number,code:string):AccountError{
   // Only endpoint, status and bounded provider identifier: never request bodies, email, password or tokens.
   if(route==='/auth/v1/signup')console.warn('Gwira account signup rejected',JSON.stringify({status:status,code:code||'unclassified'}));
   const known:Record<string,string>={PGRST106:'Your account is signed in, but workspace setup is unavailable. Gwira’s workspace service needs to be configured before you can create or join a workspace.',email_exists:'An account with this email already exists. Log in, or use Forgot password to set or reset its password.',validation_failed:'Your account details were not accepted. Check your email address and password, then try again.',request_timeout:'Account creation took too long. Try logging in before submitting again.',invalid_credentials:'The email or password is incorrect. Try again or reset your password.',email_not_confirmed:'Verify your email before signing in. You can use an email code instead.',weak_password:'Choose a stronger password that meets the project’s password requirements.',same_password:'Choose a different password from your current one.',user_already_exists:'An account may already exist. Sign in or reset your password.',signup_disabled:'New accounts are disabled for this project.',email_address_not_authorized:'This email is not allowed by the project’s email delivery settings.',email_address_invalid:'Enter an email address accepted by the authentication provider.',email_provider_disabled:'Email sign-in is disabled for this project.',captcha_failed:'This project requires CAPTCHA. Desktop CAPTCHA support must be configured before signing in.',unexpected_failure:'We couldn’t send or verify your email. Try again shortly or contact your workspace administrator.'};
   if(route.startsWith('/rest/')){
    if(code==='plan_version_stale')return new AccountError(code,'The plan changed since you last reviewed it. Review the current version first.');
    if(code==='plan_approval_denied')return new AccountError(code,'Only a workspace owner or admin can approve a plan.');
    if(code==='plan_unavailable'||code==='plan_access_denied')return new AccountError('plan_unavailable','This plan is not available to your account.');
    if(isMissingContract(code))return new AccountError('setup_unavailable',known[code]??'Workspace setup is not available on this server.');
    if(code==='42501'&&status!==401)return new AccountError('access_denied','Workspace access was denied.');
    if(/^PGRST30[1-3]$/.test(code))return new AccountError('session_expired','Your session expired or access was revoked. Sign in again.');
   }
   if(known[code])return new AccountError(code,known[code]);
   if(status===429)return new AccountError('rate_limited','Too many attempts. Wait a moment before trying again.');
   if(route.startsWith('/auth/v1/verify'))return new AccountError('invalid_otp','That code is invalid or expired. Check it or request a new code.');
   if(status===401||status===403)return new AccountError('session_expired','Your session expired or access was revoked. Sign in again.');
   if(route==='/auth/v1/signup'&&status===422)return new AccountError('signup_rejected','Account creation was rejected. Check your email and password. If you have used this email with Gwira before, choose Log in or Forgot password.');
   return new AccountError('backend_unavailable',route.startsWith('/rest/')?'Your workspace could not be opened. Try again or ask your workspace administrator to check your access.':'Sign-in could not finish. Your progress is saved. Try again or contact your workspace administrator.');
 }
 async settings():Promise<{external?:{google?:boolean;email?:boolean};mailer_autoconfirm?:boolean}>{return this.json('/auth/v1/settings');}
 async email(email:string):Promise<void>{await this.json('/auth/v1/otp',{email,create_user:true});}
 private tokens(value:{access_token?:string;refresh_token?:string;expires_in?:number}):AuthTokens{if(!value.access_token||!value.refresh_token||!Number.isFinite(value.expires_in)||value.expires_in!<=0)throw new AccountError('invalid_session','Authentication returned an incomplete session. Sign in again.');return {accessToken:value.access_token,refreshToken:value.refresh_token,expiresAt:Date.now()+value.expires_in!*1000};}
 async verify(email:string,token:string,type:'email'|'signup'|'recovery'='email'):Promise<AuthTokens>{return this.tokens(await this.json('/auth/v1/verify',{email,token,type}));}
 private sdkTokens(route:string,result:{data:{session:{access_token:string;refresh_token:string;expires_in:number}|null};error:null|{status?:number;code?:string;message?:string}}):AuthTokens|undefined{
  if(result.error){const e=result.error;if(!e.status)throw new AccountError('network','Could not reach Gwira. Check your connection and try again.');const code=/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(e.code??'')?e.code!:e.message==='User already registered'?'user_already_exists':'';if(route==='/auth/v1/signup')console.warn('Gwira account signup rejected',JSON.stringify({status:e.status,code:code||'unclassified'}));throw this.reject(route,e.status,code);}
  const session=result.data.session;return session?this.tokens(session):undefined;
 }
 async passwordSignIn(email:string,password:string):Promise<AuthTokens>{const tokens=this.sdkTokens('/auth/v1/token',await this.sdk.auth.signInWithPassword({email,password}));if(!tokens)throw new AccountError('invalid_session','Authentication returned an incomplete session. Sign in again.');return tokens;}
 async passwordSignUp(email:string,password:string):Promise<AuthTokens|undefined>{return this.sdkTokens('/auth/v1/signup',await this.sdk.auth.signUp({email,password}));}
 async recover(email:string):Promise<void>{await this.json('/auth/v1/recover',{email});}
 async resendSignup(email:string):Promise<void>{await this.json('/auth/v1/resend',{type:'signup',email});}
 async updatePassword(token:string,password:string):Promise<void>{await this.json('/auth/v1/user',{password},token,undefined,'PUT');}
 async refresh(refreshToken:string):Promise<AuthTokens>{return this.tokens(await this.json('/auth/v1/token?grant_type=refresh_token',{refresh_token:refreshToken}));}
 async exchange(code:string,verifier:string):Promise<AuthTokens>{return this.tokens(await this.json('/auth/v1/token?grant_type=pkce',{auth_code:code,code_verifier:verifier}));}
 async identity(token:string):Promise<AccountIdentity>{const user=await this.json<{id?:string;email?:string;email_confirmed_at?:string;user_metadata?:{full_name?:string}}>('/auth/v1/user',undefined,token);if(!user.id||!user.email||!user.email_confirmed_at)throw new AccountError('unverified','Verify your email before continuing.');return {id:user.id,email:user.email,displayName:typeof user.user_metadata?.full_name==='string'?user.user_metadata.full_name:undefined};}
 async logout(token:string):Promise<void>{await this.json('/auth/v1/logout?scope=local',{},token);}
 async organizations(token:string,userId:string):Promise<CloudOrganization[]>{
  const memberships=await this.json<Array<{organization_id:string;role:'owner'|'admin'|'member'}>>(`/rest/v1/organization_memberships?select=organization_id,role&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`,undefined,token,'gwira');
  const orgs=await this.json<Array<{id:string;name:string}>>('/rest/v1/organizations?select=id,name',undefined,token,'gwira');
  if(!Array.isArray(memberships)||!Array.isArray(orgs))throw new AccountError('invalid_workspace_response','Your workspace access could not be verified. Try again.');
  const seen=new Set<string>();
  return memberships.map(m=>{
   if(!m||typeof m.organization_id!=='string'||!m.organization_id||!['owner','admin','member'].includes(m.role)||seen.has(m.organization_id))throw new AccountError('invalid_workspace_response','Your workspace access could not be verified. Try again.');
   seen.add(m.organization_id);
   const matches=orgs.filter(o=>o&&o.id===m.organization_id);
   if(matches.length!==1||typeof matches[0].name!=='string'||!matches[0].name.trim())throw new AccountError('invalid_workspace_response','Your workspace access could not be verified. Try again.');
   return {id:matches[0].id,name:matches[0].name,role:m.role};
  });
 }
 async teams(token:string,organizationId:string):Promise<CloudTeam[]>{
  const teams:CloudTeam[]=[],seen=new Set<string>();
  for(let offset=0;offset<10000;offset+=500){
   const rows=await this.json<Array<{id:string;organization_id:string;name:string}>>(`/rest/v1/teams?select=id,organization_id,name&organization_id=eq.${encodeURIComponent(organizationId)}&order=id.asc&limit=500&offset=${offset}`,undefined,token,'gwira');
   if(!Array.isArray(rows))throw new AccountError('invalid_workspace_response','Your workspace teams could not be verified. Try again.');
   for(const r of rows){
    if(!r||typeof r.id!=='string'||!r.id||seen.has(r.id)||r.organization_id!==organizationId||typeof r.name!=='string'||!r.name.trim())throw new AccountError('invalid_workspace_response','Your workspace teams could not be verified. Try again.');
    seen.add(r.id);teams.push({id:r.id,organizationId:r.organization_id,name:r.name});
   }
   if(rows.length<500)return teams;
  }
  throw new AccountError('result_limit','There are too many workspace teams to load.');
 }
 async listInvitations(token:string,organizationId:string):Promise<OrganizationInvitation[]>{
  const rows=await this.json<Array<{id:string;organization_id:string;email:string;assigned_role:'admin'|'member';invited_by:string;created_at:string;expires_at:string;status:OrganizationInvitation['status'];delivery_status:OrganizationInvitation['delivery']}>>(`/rest/v1/organization_invitations?select=id,organization_id,email,assigned_role,invited_by,created_at,expires_at,status,delivery_status&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,undefined,token,'gwira');
  const teams=await this.json<Array<{invitation_id:string;team_id:string}>>(`/rest/v1/invitation_teams?select=invitation_id,team_id&organization_id=eq.${encodeURIComponent(organizationId)}`,undefined,token,'gwira');
  return rows.map(r=>({id:r.id,organizationId:r.organization_id,email:r.email,role:r.assigned_role,invitedBy:r.invited_by,createdAt:r.created_at,expiresAt:r.expires_at,status:r.status==='pending'&&Date.parse(r.expires_at)<=Date.now()?'expired':r.status,delivery:r.delivery_status,teamIds:teams.filter(t=>t.invitation_id===r.id).map(t=>t.team_id)}));
 }
 /** Read-only B1 contract. Missing B2 tables/RPCs fail closed, never synthesize completion. */
 async routingFacts(token:string,userId:string):Promise<AccountRoutingFacts>{
  const stage=<T,>(name:string,work:Promise<T>):Promise<T>=>work.catch(error=>{throw Object.assign(error instanceof Error?error:Error('unknown'),{stage:name});});
  const [profile,invitations,setup]=await Promise.all([
   stage('profile',this.json<Array<{preferred_name:string;completed_at:string|null}>>(`/rest/v1/account_profiles?select=preferred_name,completed_at&user_id=eq.${encodeURIComponent(userId)}`,undefined,token,'gwira')),
   stage('pending_invitations',this.json<Array<{id:string;organization_id:string;organization_name:string}>>('/rest/v1/rpc/list_my_pending_invitations',{},token,'gwira')),
   stage('workspace_setup',this.json<Array<{organization_id:string;creator_user_id:string;current_step:string;completed_at:string|null}>>(`/rest/v1/workspace_setup?select=organization_id,creator_user_id,current_step,completed_at&creator_user_id=eq.${encodeURIComponent(userId)}`,undefined,token,'gwira'))
  ]);
  if(!Array.isArray(profile)||profile.length>1||!Array.isArray(invitations)||!Array.isArray(setup)||invitations.some(i=>typeof i.id!=='string'||typeof i.organization_id!=='string'||typeof i.organization_name!=='string')||setup.some(s=>typeof s.organization_id!=='string'||s.creator_user_id!==userId||!['invite_team','meet_gwira','complete'].includes(s.current_step)))throw new AccountError('invalid_routing_facts','Account setup returned an invalid response. Try again.');
  return {profileComplete:!!(profile[0]&&typeof profile[0].preferred_name==='string'&&profile[0].preferred_name.trim()&&profile[0].completed_at),pendingInvitations:invitations.map(i=>({id:i.id,organizationId:i.organization_id,organizationName:i.organization_name})),setup:setup.map(s=>({organizationId:s.organization_id,creatorUserId:s.creator_user_id,step:s.completed_at?'complete':s.current_step as 'invite_team'|'meet_gwira'|'complete'}))};
 }
 async createOrganization(token:string,name:string,requestId:string):Promise<string>{return this.json('/rest/v1/rpc/create_workspace',{p_name:name,p_request_id:requestId},token,'gwira');}
 async saveProfile(token:string,name:string):Promise<void>{await this.json('/rest/v1/rpc/save_account_profile',{p_name:name},token,'gwira');}
 async completeSetup(token:string,organizationId:string,deferred=false):Promise<void>{await this.json('/rest/v1/rpc/complete_workspace_setup',{p_org:organizationId,p_deferred:deferred},token,'gwira');}
 async saveOnboarding(token:string,organizationId:string,progress:OnboardingProgress):Promise<void>{await this.json('/rest/v1/rpc/save_onboarding_progress',{p_org:organizationId,p_state:progress},token,'gwira');}
 async loadOnboarding(token:string,organizationId:string):Promise<OnboardingProgress|null>{const rows=await this.json<Array<{onboarding:unknown}>>(`/rest/v1/workspace_setup?select=onboarding&organization_id=eq.${encodeURIComponent(organizationId)}`,undefined,token,'gwira');if(!Array.isArray(rows)||rows.length!==1)throw new AccountError('access_denied','Your workspace setup could not be verified. Refresh your access and try again.');const value=rows[0].onboarding;if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0)return null;const progress=parseOnboardingProgress(value);if(!progress)throw new AccountError('setup_unavailable','Your workspace progress could not be loaded. Try again.');return progress;}
 async loadPlan(token:string,organizationId:string,planId?:string):Promise<PlanRecord|null>{
  const org=encodeURIComponent(organizationId);
  const filter=planId?`id=eq.${encodeURIComponent(planId)}`:'source=eq.onboarding';
  const docs=await this.json<Array<{id:string;title:string;status:string;current_version:number;updated_at:string}>>(`/rest/v1/plan_documents?select=id,title,status,current_version,updated_at&organization_id=eq.${org}&${filter}&order=updated_at.desc&limit=1`,undefined,token,'gwira');
  if(!Array.isArray(docs)||docs.length===0)return null;const d=docs[0];
  if(typeof d.id!=='string'||typeof d.title!=='string'||!['draft','approved'].includes(d.status)||!Number.isInteger(d.current_version)||typeof d.updated_at!=='string')throw new AccountError('invalid_plan','The saved plan could not be read.');
  const id=encodeURIComponent(d.id);
  const [versions,approvals]=await Promise.all([
   this.json<Array<{content_markdown:string;structured:unknown;change_summary:string}>>(`/rest/v1/plan_versions?select=content_markdown,structured,change_summary&plan_id=eq.${id}&version=eq.${d.current_version}`,undefined,token,'gwira'),
   this.json<Array<{approved_at:string}>>(`/rest/v1/plan_approvals?select=approved_at&plan_id=eq.${id}&version=eq.${d.current_version}`,undefined,token,'gwira')]);
  if(!Array.isArray(versions)||versions.length!==1||typeof versions[0].content_markdown!=='string')throw new AccountError('invalid_plan','The saved plan could not be read.');
  const approvedAt=Array.isArray(approvals)&&approvals[0]&&typeof approvals[0].approved_at==='string'?approvals[0].approved_at:undefined;
  return {id:d.id,title:d.title,version:d.current_version,status:d.status as 'draft'|'approved',markdown:versions[0].content_markdown,structured:versions[0].structured,summary:typeof versions[0].change_summary==='string'?versions[0].change_summary:'',updatedAt:d.updated_at,...(d.status==='approved'&&approvedAt?{approvedAt}:{})};
 }
 async savePlan(token:string,organizationId:string,plan:{planId?:string;expectedVersion?:number;title:string;markdown:string;structured:unknown;summary?:string}):Promise<void>{
  await this.json('/rest/v1/rpc/save_plan_draft',{p_org:organizationId,p_plan:plan.planId??null,p_title:plan.title,p_markdown:plan.markdown,p_structured:plan.structured,p_expected_version:plan.expectedVersion??null,p_summary:plan.summary??''},token,'gwira');
 }
 async approvePlan(token:string,organizationId:string,planId:string,version:number,method:'chat'|'button'):Promise<void>{
  await this.json('/rest/v1/rpc/approve_plan',{p_org:organizationId,p_plan:planId,p_version:version,p_method:method},token,'gwira');
 }
 async generateAi(token:string,conversationId:string,messageId:string):Promise<{status:'generating'|'completed'|'failed'}>{
  if(!this.config.apiUrl)throw new AccountError('configuration_required','AI is unavailable: the trusted AI server is not configured.');
  let response:Response;
  try{
   response=await this.request(`${this.config.apiUrl}/api/ai/generate`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({conversationId,messageId,requestId:messageId}),redirect:'error',signal:AbortSignal.timeout(45000)});
  }catch{throw new AccountError('generation_unconfirmed','The AI response could not be confirmed. Your message is saved; check again.');}
  const payload:unknown=await response.json().catch(()=>null);
  if(!response.ok){
   const code=payload&&typeof payload==='object'&&'code' in payload&&typeof payload.code==='string'?payload.code:'generation_failed';
   const messages:Record<string,string>={
    configuration_required:'AI is unavailable: the trusted AI provider is not configured.',
    generation_limit_reached:'Your daily AI request limit has been reached.',
    generation_busy:'Another response is being generated in this workspace. Check again shortly.',
    generation_failed:'The AI request failed. Your message is saved.',
    message_unavailable:'The message is no longer available for AI generation.',
    access_denied:'The conversation is not available to your account.',
    generation_request_conflict:'The generation request conflicts with an earlier request.'
   };
   throw new AccountError(code,messages[code]??'AI could not respond. Your message is saved; check your connection and workspace access.');
  }
  if(!payload||typeof payload!=='object'||!('status' in payload)||!['generating','completed','failed'].includes(String(payload.status)))
   throw new AccountError('invalid_response','The AI response could not be confirmed. Your message is saved; check again.');
  const status=payload.status;
  if(status!=='generating'&&status!=='completed'&&status!=='failed')throw new AccountError('invalid_response','The AI response could not be confirmed.');
  return {status};
 }
 async server<T>(operation:string,body:unknown,token:string):Promise<T>{if(!this.config.apiUrl)throw new AccountError('configuration_required','The trusted invitation API is not deployed.');let r:Response;try{r=await this.request(`${this.config.apiUrl}/api/${operation}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new AccountError('network','The invitation service could not be reached. Try again.');}if(!r.ok){let code='';try{const body=await r.json() as {code?:string};code=body.code??'';}catch{}const messages:Record<string,string>={invitation_email_mismatch:'This invitation was sent to a different email. Switch account and sign in with the invited address.',invitation_unavailable:'This invitation has expired, was revoked, or is no longer available. Ask your workspace administrator for a new invitation.',inviter_no_longer_authorized:'This invitation can no longer be accepted. Ask a workspace administrator to send a new invitation.',sign_in_required:'Sign in again before accepting this invitation.',invitation_not_permitted:'You cannot accept this invitation with this account. Switch account or ask your workspace administrator for help.',invitation_rate_limited:'Too many invitation attempts. Wait a moment and try again.'};throw new AccountError(code in messages?code:'invitation_failed',messages[code]??'The invitation request could not finish. Your progress is saved. Try again or ask your workspace administrator to check the invitation.');}return await r.json() as T;}
}
