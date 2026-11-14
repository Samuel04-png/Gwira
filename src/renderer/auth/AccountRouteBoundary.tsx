import React,{useEffect,useRef,useState} from 'react';
import type {AppRoute} from '../../shared/resolveAppRoute.js';
import type {AccountCommand,AccountSnapshot,OnboardingProgress} from '../../shared/accountAuth.js';
import {GwiraLogo} from '../components/GwiraLogo.js';
import {Button} from '../components/Button.js';
import {Field} from '../components/Input.js';
import {OnboardingPage} from '../gwira/onboarding/OnboardingPage.js';
import {workspaceView} from './workspaceView.js';
import {retainedWorkspace,type RetainedWorkspace} from './retainedWorkspace.js';
import {parseInitialConversation,persistInitialConversation} from './initialConversation.js';
import {CloudHome} from './CloudHome.js';
import {buildPlan,renderPlanMarkdown} from '../gwira/onboarding/planDocument.js';

/** Destination outlet. B2/C screens and the cloud repository are intentionally not mounted in B1. */
export function AccountRouteBoundary({route,state,busy,send,quiet,commandError}:{route:AppRoute;state:AccountSnapshot;busy:boolean;send:(command:AccountCommand)=>Promise<void>;quiet:(command:AccountCommand)=>Promise<void>;commandError?:string}):React.ReactElement {
 const heading=useRef<HTMLHeadingElement>(null);
 const retained=useRef<RetainedWorkspace|null>(null);
 useEffect(()=>{heading.current?.focus();setName('');},[route.type]);
 const [name,setName]=useState(''),requestId=useRef(crypto.randomUUID()),resolving=route.type==='ResolvingSession';
 const where=route.type==='WorkspaceSetup'&&route.step==='where_to';const [choice,setChoice]=useState<'choose'|'create'|'join'>('choose'),[link,setLink]=useState(''),[linkError,setLinkError]=useState('');
 const view=route.type==='WorkspaceReady'?workspaceView(state,route.workspaceId):undefined;
 const workspace=view?.organization;
 const title=resolving?'Opening Gwira':route.type==='AboutYou'?'About you':where?'Where do you want to work?':route.type==='WorkspaceHub'?'Choose a workspace':route.type==='WorkspaceReady'?(workspace?.name??'Your workspace'):route.type==='InvitationReview'?'Review your invitation':route.type==='InvitationMismatch'?'Use your invited account':route.type==='InvalidInvitation'?'Invitation unavailable':route.type==='AccessError'?accessTitle(route.reason,state.accessIssue):'Your account is signed in';
 const message=route.type==='AccessError'?route.message:route.type==='InvalidInvitation'?'This invitation is no longer valid. Ask for a new one.':route.type==='InvitationReview'?`You have an invitation to ${route.organizationName}. Review it before joining.`:route.type==='InvitationMismatch'?'This invitation was sent to a different email. Switch account to use the invited address, or continue without joining.':resolving?'Checking your account and workspace access…':route.type==='AboutYou'?'Tell us what to call you.':where?(choice==='create'?'Create a workspace for your business.':choice==='join'?'Join a workspace you were invited to.':'Create a workspace for your business, or join one you were invited to.'):route.type==='WorkspaceHub'?(route.reason==='last_workspace_revoked'?'Your previous workspace is no longer available. Choose a workspace you can access.':'Choose a workspace to continue.'):route.type==='WorkspaceReady'?(view?`You’re signed in as ${view.organization.role}. Business data for this workspace is not connected yet.`:'Workspace access could not be verified. Refresh your access and try again.'):'Workspace setup is not available yet.';
 retained.current=retainedWorkspace(retained.current,route,state);
 const preserved=retained.current;
 if(preserved)return <><div style={{display:resolving?'none':'contents'}} aria-hidden={resolving||undefined}><WorkspaceRoute key={`${preserved.state.user?.id}:${preserved.workspaceId}`} state={resolving?preserved.state:state} busy={busy} send={send} quiet={quiet} commandError={commandError} workspaceReady={preserved.ready}/></div>{resolving?<main className="account-screen" data-auth-surface data-app-route="ResolvingSession"><div className="account-screen__body"><p role="status">Checking your account and workspace access…</p></div></main>:null}</>;
 return <main className="account-screen" data-auth-surface data-app-route={route.type}>
  <header className="account-screen__bar" aria-hidden="true"/>
  <div className="account-screen__body"><section className="account-panel" aria-labelledby="account-route-title" aria-busy={resolving||busy}>
   <div className="account-back-slot"/>
   <div className="account-heading"><GwiraLogo size="empty"/><h1 id="account-route-title" ref={heading} tabIndex={-1}>{title}</h1><p role={route.type==='AccessError'?'alert':'status'}>{message}</p></div>
   {commandError&&<p className="account-error" role="alert">{commandError}</p>}
   {import.meta.env.DEV&&state.backend&&route.type==='AccessError'?<p className="account-status" data-dev-backend>Development: using {state.backend.label==='local'?'local Supabase':'hosted Supabase'} ({state.backend.environment}).{state.backend.label==='hosted'&&state.accessIssue==='setup_unavailable'?' The hosted project does not have the account-setup migration. Run npm run dev:local to use the local test backend.':''}</p>:null}
   {state.error&&route.type==='InvitationReview'?<p className="account-error" role="alert">{state.error}</p>:null}
   {route.type==='AboutYou'?<form onSubmit={e=>{e.preventDefault();if(name.trim())void send({type:'save_profile',name:name.trim()});}}><Field label="Your name" autoComplete="name" value={name} maxLength={100} onChange={e=>setName(e.target.value)} required disabled={busy}/><Button size="form" type="submit" variant="primary" disabled={busy||!name.trim()}>{busy?'Saving…':'Continue'}</Button></form>:null}
   {where&&choice==='choose'?<div className="account-actions"><Button size="form" variant="primary" disabled={busy} onClick={()=>setChoice('create')}>Create a workspace</Button><Button size="form" disabled={busy} onClick={()=>setChoice('join')}>Join a workspace</Button></div>:null}
   {where&&choice==='create'?<form onSubmit={e=>{e.preventDefault();if(name.trim())void send({type:'create_organization',name:name.trim(),requestId:requestId.current});}}><Field label="Workspace name" autoComplete="organization" value={name} maxLength={200} onChange={e=>setName(e.target.value)} required disabled={busy}/><Button size="form" type="submit" variant="primary" disabled={busy||!name.trim()}>{busy?'Creating workspace…':'Create workspace'}</Button><Button variant="ghost" disabled={busy} onClick={()=>setChoice('choose')}>Back</Button></form>:null}
   {where&&choice==='join'?<JoinWorkspace state={state} busy={busy} link={link} setLink={setLink} error={linkError} setError={setLinkError} send={send} back={()=>setChoice('choose')}/>:null}
   {route.type==='WorkspaceHub'?<div className="account-actions" aria-label="Available workspaces">
    {state.organizations.length?state.organizations.map(org=><Button key={org.id} size="form" disabled={busy} onClick={()=>void send({type:'switch',organizationId:org.id})}>{org.name} ({org.role})</Button>):<p className="account-status">No workspaces are available. Refresh your access and try again.</p>}
    {!state.organizations.length?<Button disabled={busy} onClick={()=>void send({type:'refresh'})}>Refresh access</Button>:null}
   </div>:null}
   {route.type==='WorkspaceReady'&&view?<section className="account-team-list" aria-labelledby="account-teams-heading">
    <h2 id="account-teams-heading">Teams</h2>
    {view.teams.length?<ul>{view.teams.map(team=><li key={team.id}>{team.name}</li>)}</ul>:<p>No teams in this workspace.</p>}
   </section>:null}
   {route.type==='WorkspaceReady'&&!view?<div className="account-actions"><Button disabled={busy} onClick={()=>void send({type:'refresh'})}>Refresh access</Button></div>:null}
   {!resolving?<div className="account-actions">
    {route.type==='AccessError'&&state.accessIssue==='session_expired'?<Button size="form" variant="primary" disabled={busy} onClick={()=>void send({type:'sign_out'})}>Sign in again</Button>:null}
    {route.type==='AccessError'&&state.accessIssue!=='session_expired'?<Button size="form" variant="primary" disabled={busy} onClick={()=>void send({type:'refresh'})}>{busy?'Trying again…':'Try again'}</Button>:null}
    {route.type==='InvitationReview'?<Button size="form" variant="primary" disabled={busy} onClick={()=>void send({type:'accept_invitation'})}>{busy?'Joining workspace…':`Join ${route.organizationName}`}</Button>:null}
    {route.type==='InvitationMismatch'?<Button size="form" variant="primary" disabled={busy} onClick={()=>void send({type:'cancel'})}>Switch account</Button>:null}
    {['InvitationReview','InvitationMismatch','InvalidInvitation'].includes(route.type)?<Button disabled={busy} onClick={()=>void send({type:'dismiss_invitation'})}>Continue without joining</Button>:null}
    {state.user?<Button variant="ghost" disabled={busy} onClick={()=>void send({type:'sign_out'})}>Sign out</Button>:null}
   </div>:null}
  </section></div>
 </main>;
}

/** Meet Gwira with progress saved to the organization's setup record. Completion needs the finished brief or an explicit deferral. */
function WorkspaceRoute({state,busy,send,quiet,commandError,workspaceReady}:{state:AccountSnapshot;busy:boolean;send:(c:AccountCommand)=>Promise<void>;quiet:(c:AccountCommand)=>Promise<void>;commandError?:string;workspaceReady:boolean}):React.ReactElement {
 const requested=useRef(false),recoveryChecked=useRef(false),chain=useRef<Promise<void>>(Promise.resolve()),live=useRef(true);
 const [finishing,setFinishing]=useState(false),[starting,setStarting]=useState(false),[recovering,setRecovering]=useState(true),[finishError,setFinishError]=useState('');
 useEffect(()=>{live.current=true;return()=>{live.current=false;}},[]);
 useEffect(()=>{if(!workspaceReady&&!requested.current){requested.current=true;void quiet({type:'load_onboarding'});}},[workspaceReady,quiet]);
 const progress=state.onboardingProgress;
 useEffect(()=>{
  if(workspaceReady||progress===undefined||recoveryChecked.current)return;
  recoveryChecked.current=true;
  void (async()=>{
   try{
    const raw=await window.codexDesktop.scopedPreferences.read('initial-generation');
    const userId=state.user?.id,organizationId=state.activeOrganization?.id;
    if(!userId||!organizationId)throw Error('Workspace access could not be verified.');
    const marker=parseInitialConversation(raw,userId,organizationId);
    if(marker===null)return;
    if(!progress?.goal)throw Error('Initial message recovery is invalid.');
    await persistInitialConversation(window.codexDesktop.conversations,marker,progress.goal);
    if(!live.current)return;
    const completed=await window.codexDesktop.account.command({type:'complete_setup',deferred:true});
    if(completed.user?.id!==marker.userId||completed.activeOrganization?.id!==marker.organizationId||completed.route?.type!=='WorkspaceReady')throw Error('Initial message recovery failed.');
   }catch{if(live.current)setFinishError('Your message could not be opened. Check your connection and try again.');}
   finally{if(live.current)setRecovering(false);}
  })();
 },[progress,state.user?.id,state.activeOrganization?.id,workspaceReady]);
 async function start(next:OnboardingProgress):Promise<void>{
  const userId=state.user?.id,organizationId=state.activeOrganization?.id;
  if(!userId||!organizationId){setFinishError('Workspace access could not be verified. Refresh access and try again.');return;}
  setFinishing(true);setStarting(true);setFinishError('');
  try{
   const existing=parseInitialConversation(await window.codexDesktop.scopedPreferences.read('initial-generation'),userId,organizationId);
   if(existing?.goal&&existing.goal!==next.goal){setFinishError('Your previous message is awaiting confirmation. Restore it and retry before sending a different message.');return;}
   const snapshot=await window.codexDesktop.account.command({type:'save_onboarding',progress:next});
   if(!live.current||snapshot.user?.id!==userId||snapshot.activeOrganization?.id!==organizationId||snapshot.onboardingSaveFailed||snapshot.onboardingProgress?.goal!==next.goal)throw Error('Message could not be saved.');
   const marker=existing??{userId,organizationId,conversationId:crypto.randomUUID(),messageId:crypto.randomUUID(),goal:next.goal};
   if(!existing)await window.codexDesktop.scopedPreferences.write('initial-generation',JSON.stringify(marker));
   if(!live.current)throw Error('Workspace changed.');
   await persistInitialConversation(window.codexDesktop.conversations,marker,next.goal);
   if(!live.current)throw Error('Workspace changed.');
   const completed=await window.codexDesktop.account.command({type:'complete_setup',deferred:true});
   if(completed.user?.id!==userId||completed.activeOrganization?.id!==organizationId||completed.route?.type!=='WorkspaceReady')throw Error('Conversation could not be opened.');
  }catch{if(live.current)setFinishError('Your message could not be opened. Check your connection and try again.');}
  finally{if(live.current){setFinishing(false);setStarting(false);}}
 }
 const save=(next:OnboardingProgress)=>{chain.current=chain.current.then(()=>live.current?quiet({type:'save_onboarding',progress:next}):undefined);};
 const finish=(deferred:boolean)=>{
  if(finishing)return;setFinishing(true);setFinishError('');
  const user=state.user?.id,organization=state.activeOrganization?.id;
  const same=(s:AccountSnapshot)=>live.current&&s.user?.id===user&&s.activeOrganization?.id===organization&&s.route?.type==='MeetGwira';
  void chain.current.then(async()=>{
   if(!live.current)return;
   if(!deferred){
    let snapshot=await window.codexDesktop.account.snapshot();
    if(!same(snapshot)||snapshot.onboardingSaveFailed||snapshot.onboardingProgress?.act!=='result')throw Error('Setup is not ready.');
    const progress=snapshot.onboardingProgress;
    snapshot=await window.codexDesktop.account.command({type:'plan_load'});
    if(!same(snapshot)||snapshot.planError)throw Error('Plan could not be loaded.');
    if(!snapshot.plan){
     const plan=buildPlan(progress);
     snapshot=await window.codexDesktop.account.command({type:'plan_save',title:plan.title,markdown:renderPlanMarkdown(plan),structured:plan,summary:'First plan from Meet Gwira.'});
     if(!same(snapshot)||snapshot.planError||!snapshot.plan)throw Error('Plan could not be saved.');
    }
   }
   if(live.current)await send({type:'complete_setup',deferred});
  }).catch(()=>{if(live.current)setFinishError('Your plan could not be saved. Check your connection and try finishing again.');}).finally(()=>{if(live.current)setFinishing(false);});
 };
 const legacyOnboarding=progress&&progress.act!=='opening'&&!starting&&!recovering?<OnboardingPage embedded initial={progress} onProgress={save} saveFailed={state.onboardingSaveFailed||!!commandError} busy={busy||finishing||recovering} onComplete={()=>finish(false)} completeLabel="Finish setup" onDefer={()=>finish(true)} completionError={finishError}/>:null;
 return <CloudHome state={state} busy={busy||(!workspaceReady&&(finishing||recovering))} send={send} workspaceReady={workspaceReady} firstRunLoading={progress===undefined} firstRunError={commandError||finishError} retryFirstRun={()=>void quiet({type:'load_onboarding'})} onFirstMessage={start} legacyOnboarding={legacyOnboarding}/>;
}

function accessTitle(reason:'backend'|'membership_revoked',issue:AccountSnapshot['accessIssue']):string {
 if(reason==='membership_revoked')return 'You no longer have access';
 return issue==='network'?'Gwira can’t connect':issue==='session_expired'?'Your session ended':issue==='setup_unavailable'?'Account setup isn’t available yet':issue==='access_denied'?'Access needed':'We couldn’t open your workspace';
}

/** Join is invitation-only: no organization-name lookup, and no acceptance while mailbox ownership is unverified. */
function JoinWorkspace({state,busy,link,setLink,error,setError,send,back}:{state:AccountSnapshot;busy:boolean;link:string;setLink:(v:string)=>void;error:string;setError:(v:string)=>void;send:(c:AccountCommand)=>Promise<void>;back:()=>void}):React.ReactElement {
 const invites=state.pendingInvitations??[];
 function submit(e:React.FormEvent):void{e.preventDefault();const token=/[A-Za-z0-9_-]{43}/.exec(link.trim())?.[0];if(!token||link.trim().length>2048){setError('That doesn’t look like a Gwira invitation. Paste the full invitation link from your email.');return;}setError('');void send({type:'invitation',token});}
 return <div>
  {invites.length?<ul aria-label="Pending invitations">{invites.map(i=><li key={i.id}>You’ve been invited to <strong>{i.organizationName}</strong>. Open the invitation link from your email to join.</li>)}</ul>:null}
  {state.unverifiedMailboxes?<p role="status">Joining by invitation is turned off in this development environment because email ownership isn’t verified here. It works once the account’s email is verified (see docs/gwira/development/AUTH_RECOVERY_REPORT.md). You can create a workspace instead.</p>
  :<form onSubmit={submit}><Field label="Invitation link" autoComplete="off" value={link} maxLength={2048} onChange={e=>setLink(e.target.value)} required disabled={busy} error={error||undefined}/><Button size="form" type="submit" variant="primary" disabled={busy||!link.trim()}>{busy?'Checking invitation…':'Continue with invitation'}</Button><p>You can only join with a valid invitation sent to your verified email address.</p></form>}
  <Button variant="ghost" disabled={busy} onClick={back}>Back</Button>
 </div>;
}
