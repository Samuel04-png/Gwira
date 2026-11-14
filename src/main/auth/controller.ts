import {classifyFailure,logRoutingFailure} from './accessIssue.js';
import {AccountRoutingCoordinator} from './routingCoordinator.js';
import {parseOnboardingProgress,type AccountCommand,type AccountSnapshot,type AccountIdentity} from '../../shared/accountAuth.js';
import type {OrganizationInvitation} from '../../shared/organizationAccess.js';
import {AccountError,type AuthGateway,type AuthTokens} from './gateway.js';
import type {OAuthAttempt} from './loopback.js';
import type {ConversationRequest,ConversationResult,CloudConversation,CloudMessage,CloudSidebarProject,CloudSidebarSection,CloudSidebarProjectLink} from '../../shared/cloudConversations.js';
import type {ExpectedWorkspace} from '../../shared/scopedPreferences.js';
import type {CloudNotification,NotificationRequest} from '../../shared/cloudNotifications.js';
import type {ApprovalRequest,ApprovalResponse,CloudApprovalTask,CloudApprovalResult} from '../../shared/cloudApprovals.js';
import type {CloudDirectory,CloudEmployee,DirectoryRequest} from '../../shared/cloudDirectory.js';
import type {ChannelRequest,ChannelResult,CloudChannel,CloudChannelMessage} from '../../shared/cloudChannels.js';
export interface AccountPreferences {read():Promise<{mode?:'local'|'cloud';organizations?:Record<string,string>}>;write(value:{mode?:'local'|'cloud';organizations?:Record<string,string>}):Promise<void>;}
type Gateway=Pick<AuthGateway,'json'|'passwordSignIn'|'passwordSignUp'|'recover'|'resendSignup'|'updatePassword'|'exchange'|'listInvitations'|'settings'|'email'|'verify'|'refresh'|'identity'|'logout'|'organizations'|'teams'|'createOrganization'|'saveProfile'|'completeSetup'|'saveOnboarding'|'loadOnboarding'|'server'|'generateAi'|'config'|'routingFacts'|'loadPlan'|'savePlan'|'approvePlan'>;
interface Vault {read():Promise<AuthTokens|undefined>;save(tokens:AuthTokens,assertCurrent?:()=>void):Promise<void>;clear():Promise<void>;readIntent?():Promise<string|undefined>;saveIntent?(token:string):Promise<void>;clearIntent?():Promise<void>;}
const emailValid=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export class AccountController {
 private state:AccountSnapshot={phase:'initializing',configured:false,googleEnabled:false,organizations:[],teams:[],invitationPending:false,invitationSendingEnabled:false};
 private nextEmailAt=0;private recoveryTokens?:AuthTokens;private tokens?:AuthTokens;private queue:Promise<unknown>=Promise.resolve();private renewal?:ReturnType<typeof setTimeout>;private oauth?:OAuthAttempt;private epoch=0;private invitation?:string;private unverifiedMailboxes=false;private settingsVerified=false;
 private planOrganizationId:string|undefined;
 private readonly routing=new AccountRoutingCoordinator(()=>this.emit({}));
 private signingOut=false;
 private readonly listeners=new Set<(state:AccountSnapshot)=>void>();
 constructor(private readonly gateway:Gateway|undefined,private readonly vault:Vault,private readonly preferences:AccountPreferences,private readonly googleConfigured=false,private readonly browser?:()=>Promise<OAuthAttempt>,private readonly openBrowser?:(url:string)=>Promise<void>,private readonly invitationsConfigured=false,private organizationHint?:string,private readonly allowLocal=false){}
 snapshot():AccountSnapshot{const url=this.gateway?.config.url;const local=!!url&&/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url+'/');return structuredClone({...this.state,plan:this.state.plan&&this.state.activeOrganization&&this.state.activeOrganization.id===this.planOrganizationId?this.state.plan:undefined,route:this.routing.destination(),accessIssue:this.routing.issue,pendingInvitations:this.routing.pendingInvitations(),backend:this.gateway?{label:local?'local' as const:'hosted' as const,environment:this.gateway.config.environment}:undefined,localModeAllowed:this.allowLocal});}
 subscribe(listener:(snapshot:AccountSnapshot)=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 async verifiedWorkspace():Promise<{backend:string;userId:string;organizationId:string;role:'owner'|'admin'|'member'}>{
  const gateway=this.gateway,tokens=this.tokens,user=this.state.user,organization=this.state.activeOrganization,epoch=this.epoch;
  if(!gateway||!tokens||tokens.expiresAt<=Date.now()||!user||!organization||this.signingOut||this.state.phase!=='organization_ready')throw new AccountError('session_expired','Sign in and open your workspace again.');
  const identity=await gateway.identity(tokens.accessToken);
  const memberships=await gateway.organizations(tokens.accessToken,identity.id);
  if(epoch!==this.epoch||this.signingOut||this.tokens!==tokens||this.state.user?.id!==user.id||this.state.activeOrganization?.id!==organization.id||identity.id!==user.id)throw new AccountError('context_changed','Your account context changed. Try again.');
  if(tokens.expiresAt<=Date.now())throw new AccountError('session_expired','Sign in and open your workspace again.');
  const membership=memberships.find(item=>item.id===organization.id);
  if(!membership){this.epoch++;this.routing.fail('Your workspace access could not be verified.','access_denied');this.clearContext();this.emit({phase:'access_revoked',organizations:memberships,error:'Your workspace access could not be verified.'});throw new AccountError('access_denied','Your workspace access could not be verified.');}
  if(membership.role!==organization.role){this.epoch++;this.emit({activeOrganization:membership,organizations:memberships});throw new AccountError('context_changed','Your account context changed. Try again.');}
  return {backend:gateway.config.url,userId:user.id,organizationId:organization.id,role:membership.role};
 }
 async directoryOperation(input:DirectoryRequest,expected:ExpectedWorkspace):Promise<CloudDirectory|null>{
  if(!input||typeof input!=='object'||!['list','pin','create'].includes(input.type)||(input.type==='pin'&&(!uuid(input.id)||typeof input.pinned!=='boolean'))||(input.type==='create'&&(!uuid(input.id)||typeof input.name!=='string'||!input.name.trim()||input.name.length>200||typeof input.jobTitle!=='string'||!input.jobTitle.trim()||input.jobTitle.length>200)))throw new AccountError('invalid_request','Invalid directory request.');
  const epoch=this.epoch,scope=await this.verifiedWorkspace(),tokens=this.tokens,gateway=this.gateway;
  if(!expected||expected.userId!==scope.userId||expected.organizationId!==scope.organizationId||!tokens||!gateway||epoch!==this.epoch)throw new AccountError('context_changed','Your account context changed. Try again.');
  let result:CloudDirectory|null=null;
  if(input.type==='list'){
   const org=encodeURIComponent(scope.organizationId);
   const all=async<T,>(route:string):Promise<T[]>=>{
    const records:T[]=[];
    for(let offset=0;offset<10000;offset+=500){
     const page=await gateway.json<T[]>(`${route}&limit=500&offset=${offset}`,undefined,tokens.accessToken,'gwira');
     if(!Array.isArray(page))throw new AccountError('invalid_response','Directory could not be loaded.');
     records.push(...page);if(page.length<500)return records;
    }
    throw new AccountError('result_limit','There are too many directory records to load.');
   };
   const [employees,pins]=await Promise.all([
    all<CloudEmployee>(`/rest/v1/employees?select=id,organization_id,user_id,name,job_title,created_at&organization_id=eq.${org}&order=name.asc,id.asc`),
    all<{employee_id:string}>(`/rest/v1/directory_pins?select=employee_id&organization_id=eq.${org}&user_id=eq.${encodeURIComponent(scope.userId)}&order=employee_id.asc`)
   ]);
   if(employees.some(item=>item.organization_id!==scope.organizationId))throw new AccountError('invalid_response','Directory could not be loaded.');
   const accessible=new Set(employees.map(item=>item.id));result={employees,pins:pins.map(pin=>pin.employee_id).filter(id=>accessible.has(id))};
  }else if(input.type==='pin')await gateway.json('/rest/v1/rpc/pin_directory_employee',{p_org:scope.organizationId,p_employee:input.id,p_pinned:input.pinned},tokens.accessToken,'gwira');
  else {
   const id=await gateway.json<string>('/rest/v1/rpc/create_directory_person',{p_org:scope.organizationId,p_id:input.id,p_name:input.name,p_job_title:input.jobTitle},tokens.accessToken,'gwira');
   if(id!==input.id)throw new AccountError('invalid_response','Person creation could not be confirmed.');
  }
  if(epoch!==this.epoch||this.signingOut||this.tokens!==tokens)throw new AccountError('context_changed','Your account context changed. Try again.');
  return result;
 }
  async channelOperation(input:ChannelRequest,expected:ExpectedWorkspace):Promise<ChannelResult>{
   if(!input||typeof input!=='object'||!['list','messages','create','join','send','read','preference'].includes(input.type))throw new AccountError('invalid_request','Invalid channel request.');
   if(input.type!=='list'&&!uuid(input.id))throw new AccountError('invalid_request','Invalid channel.');
   if(input.type==='create'&&(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80||typeof input.topic!=='string'||input.topic.length>200||!['org','private'].includes(input.visibility)||!Array.isArray(input.members)||input.members.length>100||!input.members.every(uuid)))throw new AccountError('invalid_request','Invalid channel details.');
   if(input.type==='send'&&(!uuid(input.messageId)||typeof input.body!=='string'||!input.body.trim()||input.body.length>4000))throw new AccountError('invalid_request','Invalid channel message.');
   if(input.type==='read'&&(!Number.isSafeInteger(input.seq)||input.seq<1))throw new AccountError('invalid_request','Invalid channel cursor.');
   if(input.type==='preference'&&((input.muted!==undefined&&typeof input.muted!=='boolean')||(input.markRead!==undefined&&typeof input.markRead!=='boolean')||(input.muted===undefined&&input.markRead!==true)))throw new AccountError('invalid_request','Invalid channel preference.');
   const epoch=this.epoch,scope=await this.verifiedWorkspace(),tokens=this.tokens,gateway=this.gateway;
   if(!expected||expected.userId!==scope.userId||expected.organizationId!==scope.organizationId||!tokens||!gateway||epoch!==this.epoch)throw new AccountError('context_changed','Your account context changed. Try again.');
   const all=async<T,>(route:string,body?:unknown):Promise<T[]>=>{
    const records:T[]=[];
    for(let offset=0;offset<10000;offset+=500){
     const page=await gateway.json<T[]>(`${route}${route.includes('?')?'&':'?'}limit=500&offset=${offset}`,body,tokens.accessToken,'gwira');
     if(!Array.isArray(page))throw new AccountError('invalid_response','Channels could not be loaded.');
     records.push(...page);if(page.length<500)return records;
    }
    throw new AccountError('result_limit','There are too many channel records to load.');
   };
   const rpc=<T,>(name:string,body:unknown)=>gateway.json<T>(`/rest/v1/rpc/${name}`,body,tokens.accessToken,'gwira');
   let result:ChannelResult=null;
   if(input.type==='list'){
    const channels=await all<CloudChannel>('/rest/v1/rpc/list_channels',{p_org:scope.organizationId});
    if(channels.some(channel=>channel.organization_id!==scope.organizationId||!uuid(channel.id)||!Number.isSafeInteger(channel.unread)||!Number.isSafeInteger(channel.member_count)))throw new AccountError('invalid_response','Channels could not be loaded.');
    result=channels;
   }else if(input.type==='messages'){
    const channel=await gateway.json<Array<{id:string}>>(`/rest/v1/channels?select=id&organization_id=eq.${encodeURIComponent(scope.organizationId)}&id=eq.${encodeURIComponent(input.id)}&limit=1`,undefined,tokens.accessToken,'gwira');
    if(!Array.isArray(channel)||channel.length!==1)throw new AccountError('access_denied','This channel is unavailable.');
    const messages=await all<CloudChannelMessage>(`/rest/v1/channel_messages?select=id,organization_id,channel_id,seq,author_id,body,created_at&organization_id=eq.${encodeURIComponent(scope.organizationId)}&channel_id=eq.${encodeURIComponent(input.id)}&order=seq.asc`);
    if(messages.some(message=>message.organization_id!==scope.organizationId||message.channel_id!==input.id||!Number.isSafeInteger(message.seq)))throw new AccountError('invalid_response','Channel messages could not be loaded.');
    result=messages;
   }else if(input.type==='create')result=await rpc<string>('create_channel',{p_org:scope.organizationId,p_id:input.id,p_name:input.name,p_topic:input.topic,p_visibility:input.visibility,p_members:input.members});
   else if(input.type==='join')await rpc('join_channel',{p_org:scope.organizationId,p_channel:input.id});
   else if(input.type==='send')result=await rpc<string>('send_channel_message',{p_org:scope.organizationId,p_channel:input.id,p_id:input.messageId,p_body:input.body});
   else if(input.type==='read')await rpc('advance_channel_read',{p_org:scope.organizationId,p_channel:input.id,p_seq:input.seq});
   else await rpc('update_channel_preference',{p_org:scope.organizationId,p_channel:input.id,p_muted:input.muted??null,p_mark_read:input.markRead??false});
   if((input.type==='create'||input.type==='send')&&result!==(input.type==='create'?input.id:input.messageId))throw new AccountError('invalid_response','The channel request could not be confirmed.');
   if(epoch!==this.epoch||this.signingOut||this.tokens!==tokens||this.state.user?.id!==scope.userId||this.state.activeOrganization?.id!==scope.organizationId)throw new AccountError('context_changed','Your account context changed. Try again.');
   return result;
  }
 async approvalOperation(input:ApprovalRequest,expected:ExpectedWorkspace):Promise<ApprovalResponse>{
  if(!input||typeof input!=='object'||!['list','decide'].includes(input.type)||(input.type==='decide'&&(!uuid(input.id)||!['approved','changes_requested'].includes(input.decision))))throw new AccountError('invalid_request','Invalid approval request.');
  const epoch=this.epoch,scope=await this.verifiedWorkspace(),tokens=this.tokens,gateway=this.gateway;
  if(!expected||expected.userId!==scope.userId||expected.organizationId!==scope.organizationId||!tokens||!gateway||epoch!==this.epoch)throw new AccountError('context_changed','Your account context changed. Try again.');
  let result:ApprovalResponse=null;
  if(input.type==='list'){
   const all=async<T,>(table:string):Promise<T[]>=>{
    const records:T[]=[];
    for(let offset=0;offset<10000;offset+=500){
     const page=await gateway.json<T[]>(`/rest/v1/${table}?select=*&organization_id=eq.${encodeURIComponent(scope.organizationId)}&order=id.asc&limit=500&offset=${offset}`,undefined,tokens.accessToken,'gwira');
     if(!Array.isArray(page))throw new AccountError('invalid_response','Approvals could not be loaded.');
     records.push(...page);if(page.length<500)return records;
    }
    throw new AccountError('result_limit','There are too many approvals to load.');
   };
   const [tasks,results]=await Promise.all([all<CloudApprovalTask>('approval_tasks'),all<CloudApprovalResult>('task_approval_results')]);
   if(tasks.some(task=>!task||task.organization_id!==scope.organizationId||!uuid(task.id)||!uuid(task.created_by)||!uuid(task.reviewer_id)||![task.created_by,task.reviewer_id].includes(scope.userId)||typeof task.title!=='string'||!['in_progress','in_review','done'].includes(task.status)||typeof task.created_at!=='string'||typeof task.updated_at!=='string'))throw new AccountError('invalid_response','Approvals could not be loaded.');
   const byId=new Map(tasks.map(task=>[task.id,task]));
   if(byId.size!==tasks.length||new Set(results.map(item=>item?.id)).size!==results.length||results.some(item=>!item||item.organization_id!==scope.organizationId||!uuid(item.id)||!uuid(item.task_id)||!uuid(item.submitted_by)||byId.get(item.task_id)?.created_by!==item.submitted_by||typeof item.result_text!=='string'||!['pending','approved','changes_requested'].includes(item.status)||typeof item.submitted_at!=='string'||!Number.isFinite(Date.parse(item.submitted_at))))throw new AccountError('invalid_response','Approvals could not be loaded.');
   result={tasks,results};
  }else{
   const id=await gateway.json<string>('/rest/v1/rpc/decide_task_approval',{p_org:scope.organizationId,p_id:input.id,p_decision:input.decision},tokens.accessToken,'gwira');
   if(id!==input.id)throw new AccountError('invalid_response','The decision could not be confirmed.');
  }
  if(epoch!==this.epoch||this.signingOut||this.tokens!==tokens||this.state.user?.id!==scope.userId||this.state.activeOrganization?.id!==scope.organizationId)throw new AccountError('context_changed','Your account context changed. Try again.');
  return result;
 }
 async notificationOperation(input:NotificationRequest,expected:ExpectedWorkspace):Promise<CloudNotification[]|null>{
  if(!input||typeof input!=='object'||!['list','mark_read'].includes(input.type)||(input.type==='mark_read'&&!uuid(input.id)))throw new AccountError('invalid_request','Invalid notification request.');
  const epoch=this.epoch,scope=await this.verifiedWorkspace(),tokens=this.tokens,gateway=this.gateway;
  if(!expected||expected.userId!==scope.userId||expected.organizationId!==scope.organizationId||!tokens||!gateway||epoch!==this.epoch)throw new AccountError('context_changed','Your account context changed. Try again.');
  let result:CloudNotification[]|null=null;
  if(input.type==='list'){
   result=[];
   for(let offset=0;offset<10000;offset+=500){
    const page=await gateway.json<CloudNotification[]>(`/rest/v1/notifications?select=id,organization_id,recipient_id,title,body,created_at,read_at&organization_id=eq.${encodeURIComponent(scope.organizationId)}&recipient_id=eq.${encodeURIComponent(scope.userId)}&order=created_at.desc,id.desc&limit=500&offset=${offset}`,undefined,tokens.accessToken,'gwira');
    if(!Array.isArray(page)||page.some(item=>item.organization_id!==scope.organizationId||item.recipient_id!==scope.userId))throw new AccountError('invalid_response','Notifications could not be loaded.');
    result.push(...page);if(page.length<500)break;
    if(offset===9500)throw new AccountError('result_limit','There are too many notifications to load.');
   }
  }else await gateway.json('/rest/v1/rpc/mark_notification_read',{p_id:input.id,p_org:scope.organizationId},tokens.accessToken,'gwira');
  if(epoch!==this.epoch||this.signingOut||this.tokens!==tokens)throw new AccountError('context_changed','Your account context changed. Try again.');
  return result;
 }
 async conversationOperation(input:ConversationRequest,expected?:ExpectedWorkspace):Promise<ConversationResult>{
  if(!input||typeof input!=='object'||!['list','activity','projects','project_change','messages','create','send','generate','save_plan','update','pin','plan','onboarding','link_onboarding'].includes(input.type))throw new AccountError('invalid_request','Invalid conversation request.');
  if(input.type==='project_change'){
   if(!uuid(input.projectId)||!['create','rename','pin','remove','section','move','unlink','archive_chats'].includes(input.action)
    ||(['create','rename','section'].includes(input.action)&&(typeof input.value!=='string'||!input.value.trim()||input.value.length>160))
    ||(input.action==='pin'&&!['true','false'].includes(input.value??''))
    ||(input.action==='section'&&!uuid(input.sectionId))
    ||(['move','unlink'].includes(input.action)&&!uuid(input.conversationId))
    ||(input.sectionId!==undefined&&!uuid(input.sectionId)))throw new AccountError('invalid_request','Invalid project request.');
  }
  if('id' in input&&!uuid(input.id))throw new AccountError('invalid_request','Invalid conversation.');
  if(input.type==='create'&&(!uuid(input.id)||typeof input.title!=='string'||input.title.trim().length<1||input.title.length>200||!['private','shared'].includes(input.visibility)))throw new AccountError('invalid_request','Invalid conversation.');
  if(input.type==='send'&&(!uuid(input.messageId)||typeof input.content!=='string'||input.content.trim().length<1||input.content.length>10000))throw new AccountError('invalid_request','Invalid message.');
  if(input.type==='generate'&&!uuid(input.messageId))throw new AccountError('invalid_request','Invalid message.');
  if(input.type==='link_onboarding'&&!uuid(input.messageId))throw new AccountError('invalid_request','Invalid message.');
  if(input.type==='save_plan'&&(!uuid(input.messageId)||(input.expectedVersion!==null&&(!Number.isInteger(input.expectedVersion)||input.expectedVersion<1))))throw new AccountError('invalid_request','Invalid plan request.');
  if(input.type==='update'&&(!['rename','archive','unarchive','delete'].includes(input.action)||(input.action==='rename'&&(typeof input.value!=='string'||!input.value.trim()||input.value.length>200))))throw new AccountError('invalid_request','Invalid conversation change.');
  if(input.type==='pin'&&typeof input.pinned!=='boolean')throw new AccountError('invalid_request','Invalid pin.');
  const epoch=this.epoch,scope=await this.verifiedWorkspace(),tokens=this.tokens,gateway=this.gateway;
  if((input.type==='projects'||input.type==='project_change'||input.type==='activity')&&!expected)throw new AccountError('context_changed','Your account context changed. Try again.');
  if(expected&&(expected.userId!==scope.userId||expected.organizationId!==scope.organizationId))throw new AccountError('context_changed','Your account context changed. Try again.');
  if(!tokens||!gateway||epoch!==this.epoch)throw new AccountError('context_changed','Your account context changed. Try again.');
  const token=tokens.accessToken,org=encodeURIComponent(scope.organizationId);
  const get=<T,>(path:string)=>gateway.json<T>(path,undefined,token,'gwira');
  const rpc=<T,>(name:string,body:unknown)=>gateway.json<T>(`/rest/v1/rpc/${name}`,body,token,'gwira');
  const all=async<T,>(path:string):Promise<T[]>=>{
   const result:T[]=[];
   for(let offset=0;offset<10000;offset+=500){
    const page=await get<T[]>(`${path}&limit=500&offset=${offset}`);
    if(!Array.isArray(page))throw new AccountError('invalid_response','The conversation data could not be loaded.');
    result.push(...page);if(page.length<500)return result;
   }
   throw new AccountError('result_limit','There are too many records to load. Contact support.');
  };
  if('id' in input&&input.type!=='create'){
   const matches=await get<Array<{id:string}>>(`/rest/v1/conversations?select=id&id=eq.${encodeURIComponent(input.id)}&organization_id=eq.${org}&limit=1`);
   if(!Array.isArray(matches)||matches.length!==1)throw new AccountError('access_denied','This conversation is not available in your workspace.');
   if(epoch!==this.epoch||this.signingOut||this.tokens!==tokens)throw new AccountError('context_changed','Your account context changed. Try again.');
  }
  let result:ConversationResult;
  if(input.type==='list'){
   const [conversations,pins]=await Promise.all([all<CloudConversation>(`/rest/v1/conversations?select=*&organization_id=eq.${org}&order=updated_at.desc,id.desc`),all<{conversation_id:string}>('/rest/v1/conversation_pins?select=conversation_id&order=conversation_id.asc')]);
   if(!Array.isArray(conversations)||!Array.isArray(pins))throw new AccountError('invalid_response','Conversations could not be loaded.');
   const accessible=new Set(conversations.map(c=>c.id));
   result={conversations,pins:pins.map(p=>p.conversation_id).filter(id=>accessible.has(id))};
  }else if(input.type==='projects'){
   const projects=await all<CloudSidebarProject>(`/rest/v1/sidebar_projects?select=*&organization_id=eq.${org}&order=updated_at.desc,id.asc`);
   if(projects.some(project=>!uuid(project.id)||project.organization_id!==scope.organizationId||project.owner_id!==scope.userId))throw new AccountError('invalid_response','Projects could not be loaded.');
   const [sections,links]=await Promise.all([
    all<CloudSidebarSection>(`/rest/v1/sidebar_project_sections?select=*,sidebar_projects!inner(organization_id)&sidebar_projects.organization_id=eq.${org}&order=created_at.asc,id.asc`),
    all<CloudSidebarProjectLink>(`/rest/v1/sidebar_project_conversations?select=*,sidebar_projects!inner(organization_id)&sidebar_projects.organization_id=eq.${org}&order=project_id.asc,conversation_id.asc`)
   ]);
   const ids=new Set(projects.map(project=>project.id));
   if(sections.some(section=>!ids.has(section.project_id))||links.some(link=>!ids.has(link.project_id)))throw new AccountError('invalid_response','Projects could not be loaded.');
   result={projects,sections,links};
  }else if(input.type==='project_change'){
   await rpc('mutate_sidebar_project',{p_org:scope.organizationId,p_project:input.projectId,p_action:input.action,p_value:input.value??null,p_section:input.sectionId??null,p_conversation:input.conversationId??null});result=null;
  }else if(input.type==='activity'){
   const rows=await all<{conversation_id:string}>(`/rest/v1/ai_generations?select=conversation_id&organization_id=eq.${org}&status=eq.generating&order=conversation_id.asc`);
   if(rows.some(row=>!uuid(row.conversation_id)))throw new AccountError('invalid_response','Conversation activity could not be loaded.');
   result={activeConversationIds:[...new Set(rows.map(row=>row.conversation_id))]};
  }else if(input.type==='messages'){
   const rows=await all<CloudMessage>(`/rest/v1/conversation_messages?select=*&conversation_id=eq.${encodeURIComponent(input.id)}&order=created_at.asc,id.asc`);
   if(!Array.isArray(rows))throw new AccountError('invalid_response','Messages could not be loaded.');
   result=rows;
  }else if(input.type==='plan'){
   const links=await get<Array<{plan_id:string}>>(`/rest/v1/conversation_plan_links?select=plan_id&conversation_id=eq.${encodeURIComponent(input.id)}&limit=2`);
   if(!Array.isArray(links)||links.length>1)throw new AccountError('invalid_response','The linked plan could not be loaded.');
   const plan=links.length?await gateway.loadPlan(token,scope.organizationId,links[0].plan_id):null;
   if(links.length&&(!plan||plan.id!==links[0].plan_id))throw new AccountError('access_denied','The linked plan is unavailable.');
   result={plan};
  }else if(input.type==='create')result=await rpc<string>('create_conversation',{p_org:scope.organizationId,p_id:input.id,p_title:input.title,p_visibility:input.visibility});
  else if(input.type==='send')result=await rpc<string>('send_conversation_message',{p_id:input.id,p_message:input.messageId,p_content:input.content});
  else if(input.type==='generate')result=await gateway.generateAi(token,input.id,input.messageId);
  else if(input.type==='save_plan'){await rpc('save_ai_plan',{p_conversation:input.id,p_message:input.messageId,p_expected_version:input.expectedVersion});result=null;}
  else if(input.type==='update'){await rpc('update_conversation',{p_id:input.id,p_action:input.action,p_value:input.value??null});result=null;}
  else if(input.type==='pin'){await rpc('pin_conversation',{p_id:input.id,p_pinned:input.pinned});result=null;}
  else if(input.type==='link_onboarding')result=await rpc<string>('link_initial_conversation',{p_org:scope.organizationId,p_conversation:input.id,p_message:input.messageId});
  else result=await rpc<string|null>('restore_onboarding_conversation',{p_org:scope.organizationId});
  if(epoch!==this.epoch||this.signingOut||this.tokens!==tokens||this.state.user?.id!==scope.userId||this.state.activeOrganization?.id!==scope.organizationId)throw new AccountError('context_changed','Your account context changed. Try again.');
  return result;
 }
 private emit(update:Partial<AccountSnapshot>):void{if(update.phase==='signed_out'||update.phase==='offline_local')this.routing.session('none');else if(update.phase==='session_expired')this.routing.session('expired');else if(['initializing','authenticating','authenticated','authenticating_externally','awaiting_verification','reset_password'].includes(update.phase??''))this.routing.session(update.phase==='awaiting_verification'||update.phase==='reset_password'||update.phase==='authenticating_externally'?'none':'loading');if(('user' in update&&update.user?.id!==this.state.user?.id)||('activeOrganization' in update&&update.activeOrganization?.id!==this.state.activeOrganization?.id))update={...update,onboardingProgress:undefined,onboardingSaveFailed:undefined};if('plan' in update)this.planOrganizationId=update.plan?this.state.activeOrganization?.id:undefined;else if(('user' in update&&!update.user)||(update.activeOrganization&&update.activeOrganization.id!==this.planOrganizationId))update={...update,plan:undefined,planError:undefined};this.state={...this.state,...update};this.listeners.forEach(listener=>listener(this.snapshot()));}
 private clearContext():void{this.emit({organizations:[],teams:[],activeOrganization:undefined,onboardingProgress:undefined,onboardingSaveFailed:undefined,plan:undefined,planError:undefined});}
 private async verifyAuthSettings():Promise<void>{
  const gateway=this.gateway;if(!gateway)throw new AccountError('configuration_required','Configure the Supabase project to sign in.');
  this.settingsVerified=false;
  let settings:Awaited<ReturnType<Gateway['settings']>>;
  try{settings=await gateway.settings();}catch{throw new AccountError('configuration_unavailable','Gwira could not verify the sign-in configuration. Check your connection and try again.');}
  if(typeof settings?.mailer_autoconfirm!=='boolean')throw new AccountError('configuration_unavailable','Gwira could not verify the sign-in configuration. Contact your workspace administrator.');
  const url=new URL(gateway.config.url);
  const isolatedLocal=gateway.config.environment==='development'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
  if(settings.mailer_autoconfirm&&!isolatedLocal)throw new AccountError('unsafe_configuration','This hosted project auto-confirms email. Sign-in is disabled until email confirmation is enabled.');
  this.unverifiedMailboxes=settings.mailer_autoconfirm;this.settingsVerified=true;
  this.emit({unverifiedMailboxes:this.unverifiedMailboxes,googleEnabled:this.googleConfigured&&!!settings.external?.google});
 }
 async initialize():Promise<AccountSnapshot>{
  this.emit({configured:!!this.gateway});
  const preferences=await this.preferences.read();
  if(this.allowLocal&&preferences.mode==='local'){this.emit({phase:'offline_local'});return this.snapshot();}
  if(!this.gateway){this.emit({phase:'signed_out',error:this.allowLocal?'Cloud sign-in is not configured. Continue locally or configure the Supabase project.':'Cloud sign-in is not configured. Contact your workspace administrator.'});return this.snapshot();}
  try{this.invitation=await this.vault.readIntent?.();if(this.invitation){this.routing.intent({status:'loading'});this.emit({invitationPending:true});}await this.verifyAuthSettings();const tokens=await this.vault.read();if(tokens){this.tokens=tokens;await this.restore();}else this.emit({phase:'signed_out',error:undefined});}catch(error){this.fail(error);}
  return this.snapshot();
 }
 command(command:AccountCommand):Promise<AccountSnapshot>{if(!command||typeof command!=='object')return Promise.resolve(this.snapshot());const terminating=command.type==='sign_out'||command.type==='cancel'||command.type==='local'&&this.allowLocal;if(terminating){this.signingOut=true;this.epoch++;this.routing.session('none');this.emit({user:undefined,organizations:[],activeOrganization:undefined,teams:[]});}else if(command.type==='switch'||command.type==='organization_hint'&&uuid(command.organizationId)){this.epoch++;this.routing.session('loading');this.clearContext();this.emit({phase:'authenticated'});}else if(command.type==='google'){this.epoch++;this.oauth?.cancel();}const epoch=this.epoch;const result=this.queue.then(()=>terminating||epoch===this.epoch?this.perform(command):this.snapshot()).catch(error=>{if(terminating||epoch===this.epoch)this.fail(error);return this.snapshot();});this.queue=result;return result;}
 private fail(error:unknown):void{if(this.state.user||this.tokens){const failure=classifyFailure(error);if(failure.issue==='session_expired')this.routing.session('expired');else this.routing.fail(failure.message,failure.issue);logRoutingFailure('account_command',error);}else this.routing.session('none');const expired=error instanceof AccountError&&error.code==='session_expired';if(expired){this.recoveryTokens=undefined;this.tokens=undefined;clearTimeout(this.renewal);this.clearContext();}this.emit({...(expired?{user:undefined}:{}),phase:expired?'session_expired':['awaiting_verification','reset_password','invitation_pending'].includes(this.state.phase)?this.state.phase:'error',error:error instanceof AccountError?error.message:error instanceof Error&&/^Secure account storage|^Your saved account|^Browser sign-in/.test(error.message)?error.message:'The request could not finish. Try again or continue locally.'});}
 private async persist(tokens:AuthTokens,epoch=this.epoch):Promise<void>{const current=()=>{if(epoch!==this.epoch||this.signingOut)throw new AccountError('context_changed','Your account context changed. Try again.');};current();await this.vault.save(tokens,current);current();this.recoveryTokens=undefined;this.tokens=tokens;const prefs=await this.preferences.read();current();await this.preferences.write({...prefs,mode:'cloud'});current();this.schedule();}
 private schedule():void{clearTimeout(this.renewal);if(!this.tokens)return;this.renewal=setTimeout(()=>{const renewal=this.queue.then(()=>this.restore(undefined,true)).catch(error=>this.fail(error));this.queue=renewal;},Math.max(1000,Math.min(60000,this.tokens.expiresAt-Date.now()-60000)));this.renewal.unref();}
 private async access():Promise<string>{if(!this.tokens||!this.gateway)throw new AccountError('session_expired','Sign in again to continue.');if(this.tokens.expiresAt<=Date.now()+60000){const epoch=this.epoch;await this.persist(await this.gateway.refresh(this.tokens.refreshToken),epoch);}return this.tokens.accessToken;}
 private async restore(preferred?:string,quiet=false):Promise<void>{if(!this.gateway)throw Error('Not configured');const epoch=this.epoch;if(this.signingOut)return;this.routing.session('loading');this.emit({});if(!quiet){this.clearContext();this.emit({phase:'authenticating',error:undefined,verificationPurpose:undefined});}const token=await this.access(),user=await this.gateway.identity(token);if(epoch!==this.epoch||this.signingOut)return;if(quiet)this.emit({user});else this.emit({user,phase:'authenticated'});await this.loadOrganizations(user,token,preferred,epoch);if(epoch===this.epoch&&!this.signingOut)this.schedule();}
 private async loadOrganizations(user:AccountIdentity,token:string,preferred?:string,epoch=this.epoch):Promise<void>{
  const organizations=await this.gateway!.organizations(token,user.id),prefs=await this.preferences.read();if(epoch!==this.epoch||this.signingOut)return;
  const target=preferred??this.organizationHint,last=prefs.organizations?.[user.id];
  const active=organizations.find(o=>o.id===(target??last))??(!target&&organizations.length===1?organizations[0]:undefined);
  const teams=active?await this.gateway!.teams(token,active.id):[];if(epoch!==this.epoch||this.signingOut)return;
  if(active){await this.preferences.write({...prefs,organizations:{...prefs.organizations,[user.id]:active.id}});this.organizationHint=undefined;}
  if(epoch!==this.epoch||this.signingOut)return;
  this.emit({organizations,activeOrganization:active,teams,phase:target&&!active?'access_revoked':this.invitation?'invitation_pending':active?'organization_ready':organizations.length>1?'select_organization':'no_organization',error:undefined,invitationSendingEnabled:this.invitationsConfigured});
  if(this.invitation){await this.previewIntent(token);if(epoch!==this.epoch||this.signingOut)return;}
  await this.routing.resolve(user.id,organizations,()=>this.gateway!.routingFacts(token,user.id),last,target); 
 }
 private async previewIntent(bearer=''):Promise<void>{
  if(!this.invitation)return;const epoch=this.epoch;this.routing.intent({status:'loading'});this.emit({});
  try{const preview=await this.gateway!.server<{organization_name:string;assigned_role:'admin'|'member';status:string;expires_at:string}>('invitation/preview',{token:this.invitation},bearer);if(epoch!==this.epoch||this.signingOut)return;
   if(!preview||typeof preview.organization_name!=='string'||!['admin','member'].includes(preview.assigned_role)||preview.status!=='pending'||!Number.isFinite(Date.parse(preview.expires_at))||Date.parse(preview.expires_at)<=Date.now())this.routing.intent({status:'invalid'});
   else{this.routing.intent({status:'review',organizationName:preview.organization_name});this.emit({invitation:{organizationName:preview.organization_name,role:preview.assigned_role,expiresAt:preview.expires_at}});}
  }catch(error){if(epoch!==this.epoch||this.signingOut)return;this.routing.intent(error instanceof AccountError&&['invalid_invitation','invitation_unavailable'].includes(error.code)?{status:'invalid'}:{status:'error',message:'Your invitation could not be checked. Try again.'});}
  this.emit({});
 }
 private async perform(c:AccountCommand):Promise<AccountSnapshot>{
  if(!c||typeof c!=='object')throw Error('Invalid request');
  if(c.type==='organization_hint'){if(!uuid(c.organizationId))throw Error('Invalid organization');this.organizationHint=c.organizationId;if(this.tokens)await this.restore(c.organizationId);else this.emit({phase:'signed_out'});return this.snapshot();}
  if(c.type==='local'&&!this.allowLocal)throw new AccountError('local_disabled','Sign in to open your workspace.');
  if(['local','sign_out','cancel'].includes(c.type)){
   this.signingOut=false;
   this.recoveryTokens=undefined;this.oauth?.cancel();this.oauth=undefined;clearTimeout(this.renewal);const tokens=this.tokens;this.tokens=undefined;if(c.type!=='cancel'){this.invitation=undefined;this.routing.intent({status:'none'});await this.vault.clearIntent?.();}if(c.type==='local'||c.type==='sign_out')this.organizationHint=undefined;await this.vault.clear();this.clearContext();const prefs=await this.preferences.read();await this.preferences.write({...prefs,mode:c.type==='local'?'local':'cloud'});this.emit({phase:c.type==='local'?'offline_local':'signed_out',user:undefined,email:undefined,error:undefined,resendAt:this.nextEmailAt||undefined,invitationPending:!!this.invitation,invitation:c.type==='cancel'?this.state.invitation:undefined,verificationPurpose:undefined});
   if(c.type==='sign_out'&&tokens&&this.gateway){const epoch=this.epoch;void this.gateway.logout(tokens.accessToken).catch(()=>{if(epoch===this.epoch&&this.state.phase==='signed_out')this.emit({error:'Signed out on this device. Server sign-out could not be confirmed; revoke the session from your account if needed.'});});}
   return this.snapshot();
  }
  const commandEpoch=this.epoch;
  const g=this.gateway;if(!g)throw new AccountError('configuration_required',this.allowLocal?'Configure the Supabase project to sign in. Local work remains available.':'Cloud sign-in is not configured. Contact your workspace administrator.');
  if(!this.settingsVerified&&['password_sign_in','password_sign_up','recover','reset_password','email','resend','verify','google','accept_invitation'].includes(c.type))await this.verifyAuthSettings();
  if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();
  if(c.type==='password_sign_in'||c.type==='password_sign_up'||c.type==='recover'){
   if(typeof c.email!=='string'||!emailValid(c.email.trim()))throw new AccountError('invalid_email','Enter a valid email address.');
   const email=c.email.trim().toLowerCase();
   if(c.type==='recover'&&this.unverifiedMailboxes)throw new AccountError('recovery_unavailable','Password reset is unavailable in this development environment because email ownership is not verified.');
   if(c.type!=='recover'&&(typeof c.password!=='string'||c.password.length>4096||!c.password.length||(c.type==='password_sign_up'&&c.password.length<12)))throw new AccountError('invalid_password','Use at least 12 characters for a new password.');
   if(c.type!=='password_sign_in'&&Date.now()<this.nextEmailAt)throw new AccountError('cooldown','Wait before requesting another code.');
   this.recoveryTokens=undefined;this.emit({phase:'authenticating',email,error:undefined,verificationPurpose:undefined});
   const epoch=this.epoch;
   if(c.type==='password_sign_in'){const tokens=await g.passwordSignIn(email,c.password);if(epoch!==this.epoch||this.signingOut)return this.snapshot();await g.identity(tokens.accessToken);await this.persist(tokens,epoch);await this.restore();}
   else {const tokens=c.type==='recover'?(await g.recover(email),undefined):await g.passwordSignUp(email,c.password);if(epoch!==this.epoch||this.signingOut)return this.snapshot();if(tokens){await g.identity(tokens.accessToken);await this.persist(tokens,epoch);await this.restore();}else if(this.unverifiedMailboxes&&c.type==='password_sign_up')throw new AccountError('email_exists','An account with this email already exists. Log in instead.');else{this.nextEmailAt=Date.now()+60000;this.emit({phase:'awaiting_verification',verificationPurpose:c.type==='recover'?'recovery':'signup',resendAt:this.nextEmailAt});}}
  }else if(c.type==='reset_password'){
   if(this.state.phase!=='reset_password'||!this.recoveryTokens)throw new AccountError('session_expired','Request a new password reset code.');
   if(typeof c.password!=='string'||c.password.length<12||c.password.length>4096)throw new AccountError('invalid_password','Use at least 12 characters for a new password.');
   const tokens=this.recoveryTokens;await g.updatePassword(tokens.accessToken,c.password);if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();await g.identity(tokens.accessToken);this.recoveryTokens=undefined;await this.persist(tokens,commandEpoch);await this.restore();
  }else if(c.type==='email'||c.type==='resend'){
   const email=c.type==='email'&&typeof c.email==='string'?c.email.trim().toLowerCase():c.type==='resend'?this.state.email:undefined;
   const purpose=c.type==='resend'?this.state.verificationPurpose??'email':'email';
   if(c.type==='resend'&&this.state.phase!=='awaiting_verification')throw new AccountError('invalid_otp','Start a new sign-in or password reset.');
   if(!emailValid(email))throw new AccountError('invalid_email','Enter a valid email address.');
   if(Date.now()<this.nextEmailAt)throw new AccountError('cooldown','Wait before requesting another code.');
   this.nextEmailAt=Date.now()+60000;this.emit({phase:c.type==='resend'?'awaiting_verification':'authenticating',error:undefined,email,resendAt:this.nextEmailAt});try{if(purpose==='recovery')await g.recover(email);else if(purpose==='signup')await g.resendSignup(email);else await g.email(email);}catch(error){this.emit({phase:c.type==='resend'?'awaiting_verification':'signed_out'});throw error;}
   if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();this.nextEmailAt=Date.now()+60000;this.emit({phase:'awaiting_verification',email,verificationPurpose:purpose,resendAt:this.nextEmailAt});
  }else if(c.type==='verify'){
   if(this.state.phase!=='awaiting_verification'||!this.state.email||typeof c.code!=='string'||!/^\d{6}$/.test(c.code))throw new AccountError('invalid_otp','Enter the six-digit code from your email.');
   const tokens=await g.verify(this.state.email,c.code,this.state.verificationPurpose??'email');if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();await g.identity(tokens.accessToken);if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();if(this.state.verificationPurpose==='recovery'){this.recoveryTokens=tokens;this.emit({phase:'reset_password',error:undefined});}else{await this.persist(tokens,commandEpoch);await this.restore();}
  }else if(c.type==='refresh'){if(this.tokens)await this.restore();else await this.initialize();
  }else if(c.type==='switch'){
   if(!uuid(c.organizationId))throw Error('Invalid organization');this.clearContext();await this.restore(c.organizationId);
  }else if(c.type==='create_organization'){
   if(typeof c.name!=='string'||!c.name.trim()||c.name.trim().length>200||!uuid(c.requestId)||this.invitation)throw new AccountError('invalid_organization','Enter an organization name, or finish the pending invitation.');
   const token=await this.access();await g.identity(token);if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();const id=await g.createOrganization(token,c.name.trim(),c.requestId);if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();await this.restore(id);
  }else if(c.type==='save_profile'){
   if(typeof c.name!=='string'||!c.name.trim()||c.name.trim().length>100)throw new AccountError('invalid_profile','Enter the name you’d like Gwira to use.');
   const token=await this.access();await g.identity(token);if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();await g.saveProfile(token,c.name.trim());if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();await this.restore();
  }else if(c.type==='complete_setup'){
   const organization=this.state.activeOrganization;if(!organization)throw new AccountError('invalid_organization','Open your workspace first.');
   if(this.state.onboardingSaveFailed){this.emit({onboardingSaveFailed:true});return this.snapshot();}
   const epoch=this.epoch,userId=this.state.user?.id;const current=()=>epoch===this.epoch&&!this.signingOut&&this.state.user?.id===userId&&this.state.activeOrganization?.id===organization.id;
   const token=await this.access();await g.identity(token);if(!current())return this.snapshot();await g.completeSetup(token,organization.id,c.deferred===true);if(!current())return this.snapshot();this.emit({onboardingProgress:undefined});await this.restore(organization.id,true);
  }else if(c.type==='load_onboarding'||c.type==='save_onboarding'){
   const organization=this.state.activeOrganization;if(!organization||this.snapshot().route?.type!=='MeetGwira')throw new AccountError('invalid_organization','Open your workspace setup first.');
   const epoch=this.epoch,userId=this.state.user?.id;
   const current=()=>epoch===this.epoch&&!this.signingOut&&this.state.user?.id===userId&&this.state.activeOrganization?.id===organization.id;
   if(c.type==='save_onboarding'){const progress=parseOnboardingProgress(c.progress);if(!progress)throw new AccountError('invalid_onboarding','Your progress could not be saved. Try again.');try{const token=await this.access();await g.identity(token);if(!current())return this.snapshot();await g.saveOnboarding(token,organization.id,progress);if(current())this.emit({onboardingProgress:progress,onboardingSaveFailed:false});}catch(error){if(!current())return this.snapshot();if(error instanceof AccountError&&error.code==='session_expired')throw error;this.emit({onboardingSaveFailed:true});}}
   else{const token=await this.access();await g.identity(token);if(!current())return this.snapshot();const progress=await g.loadOnboarding(token,organization.id);if(current())this.emit({onboardingProgress:progress});}
  }else if(c.type==='plan_load'||c.type==='plan_save'||c.type==='plan_approve'){
   // The organization always comes from the verified session, never from the renderer.
   const organization=this.state.activeOrganization;if(!organization)throw new AccountError('invalid_organization','Open your workspace first.');
   const epoch=this.epoch,userId=this.state.user?.id;
   const current=()=>epoch===this.epoch&&!this.signingOut&&this.state.user?.id===userId&&this.state.activeOrganization?.id===organization.id;
   try{
    const token=await this.access();await g.identity(token);if(!current())return this.snapshot();
    if(c.type==='plan_save'){
     const size=JSON.stringify(c.structured??null).length;
     if(typeof c.title!=='string'||!c.title.trim()||c.title.length>200||typeof c.markdown!=='string'||c.markdown.length>60000||size>60000||(c.planId!==undefined&&typeof c.planId!=='string')||(c.expectedVersion!==undefined&&!Number.isInteger(c.expectedVersion)))throw new AccountError('invalid_plan','The plan could not be saved. Try again.');
     await g.savePlan(token,organization.id,c);
    }else if(c.type==='plan_approve'){
     if(typeof c.planId!=='string'||!Number.isInteger(c.version)||!['chat','button'].includes(c.method))throw new AccountError('invalid_plan','The approval could not be recorded. Try again.');
     await g.approvePlan(token,organization.id,c.planId,c.version,c.method);
    }
    if(!current())return this.snapshot();const plan=await g.loadPlan(token,organization.id);if(current())this.emit({plan,planError:undefined});
   }catch(error){
    if(!current())return this.snapshot();
    if(error instanceof AccountError&&error.code==='session_expired')throw error;
    const known=error instanceof AccountError?error:new AccountError('plan_failed','');
    const message=['plan_version_stale','plan_approval_denied','plan_unavailable','invalid_plan'].includes(known.code)?known.message:'The plan could not be saved right now. Your conversation is kept. Try again.';
    this.emit({planError:{code:known.code,message}});
   }
  }else if(c.type==='dismiss_invitation'){
   this.invitation=undefined;await this.vault.clearIntent?.();this.routing.intent({status:'none'});this.emit({invitationPending:false,invitation:undefined,error:undefined});if(this.tokens)await this.restore();
  }else if(c.type==='invitation'){
   if(typeof c.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(c.token)){this.invitation=undefined;await this.vault.clearIntent?.();this.emit({invitationPending:false,invitation:undefined});this.routing.intent({status:'invalid'});this.emit({});return this.snapshot();}
   // Save before preview/network/auth so a transient failure cannot discard the intent.
   this.routing.intent({status:'loading'});this.emit({});await this.vault.saveIntent?.(c.token);this.invitation=c.token;this.emit({invitationPending:true});await this.previewIntent(this.tokens?await this.access():'');if(this.tokens)await this.restore();
  }else if(c.type==='accept_invitation'){
   if(this.unverifiedMailboxes)throw new AccountError('mailbox_unverified','Invitations cannot be accepted here because this development environment does not verify email ownership.');if(!this.invitation)throw new AccountError('invalid_invitation','Open your invitation first.');const token=await this.access();let result:{organizationId:string};try{result=await g.server<{organizationId:string}>('invitation/accept',{token:this.invitation},token);}catch(error){if(error instanceof AccountError&&error.code==='invitation_email_mismatch'){this.routing.intent({status:'mismatch',organizationName:this.state.invitation?.organizationName??'workspace'});this.emit({error:error.message});return this.snapshot();}throw error;}if(!result||!uuid(result.organizationId))throw new AccountError('invalid_invitation_response','The invitation could not finish. Try again.');this.invitation=undefined;await this.vault.clearIntent?.();this.routing.intent({status:'none'});this.emit({invitationPending:false});await this.restore(result.organizationId);
  }else if(c.type==='google'){
   if(!this.googleConfigured||!this.browser||!this.openBrowser||!(await g.settings()).external?.google)throw new AccountError('configuration_required','Google sign-in and its desktop redirect are not configured.');
   if(commandEpoch!==this.epoch||this.signingOut)return this.snapshot();this.oauth?.cancel();const epoch=commandEpoch;let attempt:OAuthAttempt;try{attempt=await this.browser();}catch{throw new AccountError('callback_unavailable','Gwira couldn’t open its secure sign-in connection. Close any other Gwira sign-in window and try again.');}if(epoch!==this.epoch||this.signingOut){attempt.cancel();return this.snapshot();}this.oauth=attempt;this.emit({phase:'authenticating_externally',googleEnabled:true,error:undefined});
   try{await this.openBrowser(attempt.url);}catch{attempt.cancel();throw new AccountError('browser_unavailable','Your browser could not be opened. Try Google again or continue with Email.');}
   void attempt.result.then(({code,verifier})=>{const completion=this.queue.then(async()=>{if(epoch!==this.epoch)return;const tokens=await g.exchange(code,verifier);if(epoch!==this.epoch)return;await g.identity(tokens.accessToken);await this.persist(tokens,epoch);await this.restore();});this.queue=completion.catch(error=>{if(epoch===this.epoch)this.fail(error);});return this.queue;}).catch(error=>{if(epoch===this.epoch)this.fail(error);});
  }else throw Error('Unsupported account action');
  return this.snapshot();
 }
 invitationOperation(action:'list'|'invite'|'resend'|'revoke',input:unknown):Promise<OrganizationInvitation[]|void>{
  const operation=this.queue.then(()=>this.invitationRequest(action,input));this.queue=operation.catch(()=>{});return operation;
 }
 private async invitationRequest(action:'list'|'invite'|'resend'|'revoke',input:unknown):Promise<OrganizationInvitation[]|void>{
  const epoch=this.epoch,organizationId=this.state.activeOrganization?.id,userId=this.state.user?.id;
  const assertCurrent=()=>{if(epoch!==this.epoch||this.signingOut||!userId||this.state.user?.id!==userId||!organizationId||this.state.activeOrganization?.id!==organizationId)throw Error('Account context changed');};
  const token=await this.access(),user=await this.gateway!.identity(token),organizations=await this.gateway!.organizations(token,user.id);
  assertCurrent();
  const org=organizations.find(o=>o.id===this.state.activeOrganization?.id);
  if(!org){this.routing.fail('Your workspace membership was revoked. Choose a workspace you can access.');this.clearContext();this.emit({phase:'access_revoked',organizations,error:'Your organization access changed. Choose an authorized organization.'});throw Error('Organization access revoked');}
  if(!['owner','admin'].includes(org.role))throw Error('Organization admin required');
  if(action==='list'||action==='invite'){if(!input||typeof input!=='object'||!('organizationId'in input)||input.organizationId!==org.id)throw Error('Organization scope mismatch');}
  if(action==='list'){const result=await this.gateway!.listInvitations(token,org.id);assertCurrent();return result;}
  if(action==='resend'||action==='revoke'){const id=typeof input==='object'&&input&&'id'in input?input.id:undefined;if(typeof id!=='string'||!(await this.gateway!.listInvitations(token,org.id)).some(row=>row.id===id))throw Error('Invitation scope mismatch');}
  assertCurrent();
  await this.gateway!.server(`invitation/${action}`,input,token);
  assertCurrent();
 }

 dispose():void{this.routing.dispose();this.recoveryTokens=undefined;this.epoch++;clearTimeout(this.renewal);this.oauth?.cancel();this.listeners.clear();}
}
