import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CloudChannel, CloudChannelMessage } from '../../shared/cloudChannels.js';
import type { CloudEmployee } from '../../shared/cloudDirectory.js';
import type { CloudApprovalTask, CloudApprovalResult } from '../../shared/cloudApprovals.js';
import type { ExpectedWorkspace } from '../../shared/scopedPreferences.js';
import { InboxHeading } from '../gwira/inbox/InboxPage.js';
import { InboxNav } from '../gwira/inbox/InboxNav.js';
import { NeedsReviewPresentation } from '../gwira/inbox/NeedsReviewPage.js';
import { approvalAsk, APPROVAL_REASON, type ReviewEntry, type ReviewSource } from '../gwira/inbox/needsReviewModel.js';
import { ConversationHeader } from '../gwira/inbox/ConversationHeader.js';
import { MessageFeed } from '../gwira/inbox/MessageFeed.js';
import { Composer } from '../gwira/inbox/Composer.js';
import type { InboxDestination } from '../gwira/inbox/inboxNavModel.js';
import type { ConversationListItem, FeedView, MessageView } from '../gwira/messaging/domain/selectors.js';
import type { Conversation, Message } from '../gwira/messaging/domain/types.js';
import type { DispatchResult } from '../gwira/messaging/data/localRepository.js';
import type { SendInput } from '../gwira/messaging/domain/reducer.js';
import type { useAuthenticatedChannels } from './useAuthenticatedChannels.js';
import { getInboxResponsiveLayout } from '../gwira/inbox/inboxResponsiveModel.js';
import {Icon} from '../components/Icon.js';
import '../gwira/inbox/inbox.css';

type Pending = { channelId:string; messageId:string; body:string };
type Saved = { drafts:Record<string,string>; pending:Pending|null };
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function parseSaved(raw:string|null):Saved {
 if(raw===null)return {drafts:{},pending:null};
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value)||!('drafts'in value)||!value.drafts||typeof value.drafts!=='object'||Array.isArray(value.drafts)||!('pending'in value))throw Error('Invalid channel drafts.');
 const drafts:Record<string,string>={};
 for(const [id,body] of Object.entries(value.drafts)){if(!uuid(id)||typeof body!=='string'||body.length>4000)throw Error('Invalid channel draft.');drafts[id]=body;}
 const pending=value.pending;
 if(pending===null)return {drafts,pending:null};
 if(!pending||typeof pending!=='object'||!('channelId'in pending)||!uuid(pending.channelId)||!('messageId'in pending)||!uuid(pending.messageId)||!('body'in pending)||typeof pending.body!=='string'||!pending.body.trim()||pending.body.length>4000)throw Error('Invalid pending channel message.');
 return {drafts,pending:{channelId:pending.channelId,messageId:pending.messageId,body:pending.body}};
}
function conversation(channel:CloudChannel):Conversation {
 return {id:channel.id,organizationId:channel.organization_id,workspaceId:channel.organization_id,kind:'channel',name:channel.name,topic:channel.topic,visibility:channel.visibility,createdAt:channel.created_at,createdBy:{kind:'human',id:channel.created_by},lastMessageSeq:0,lastMessageAt:channel.updated_at};
}
function listItem(channel:CloudChannel):ConversationListItem {
 return {conversation:conversation(channel),title:`#${channel.name}`,members:[],isMember:channel.is_member,unread:channel.unread,mentionUnread:0,sortAt:channel.updated_at,hasDoatMember:false};
}

export function AuthenticatedInbox({scope,channels,requestedChannel,active}:{scope:ExpectedWorkspace;channels:ReturnType<typeof useAuthenticatedChannels>;requestedChannel?:{id:string;nonce:number};active:boolean}):React.ReactElement {
 const [destination,setDestination]=useState<InboxDestination>({kind:'utility',view:'unread'});
 const [messages,setMessages]=useState<CloudChannelMessage[]>([]),[employees,setEmployees]=useState<CloudEmployee[]>([]);
 const [loadedChannel,setLoadedChannel]=useState<string>();
 const [saved,setSaved]=useState<Saved>({drafts:{},pending:null}),[draftReady,setDraftReady]=useState(false),[restoredPending,setRestoredPending]=useState<Pending|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(false),[joining,setJoining]=useState(false);
 const [actionError,setActionError]=useState(''),[participantError,setParticipantError]=useState(''),[participantRetry,setParticipantRetry]=useState(0);
 const [approvalData,setApprovalData]=useState<{tasks:CloudApprovalTask[];results:CloudApprovalResult[]}>();
 const [approvalError,setApprovalError]=useState(''),[approvalBusy,setApprovalBusy]=useState(false);
 const approvalSequence=useRef(0);
 const [draftError,setDraftError]=useState(''),[draftRetry,setDraftRetry]=useState(0);
 const [containerWidth,setContainerWidth]=useState(1200),[reviewWidth,setReviewWidth]=useState(900),[listOpen,setListOpen]=useState(true);
 const rootRef=useRef<HTMLElement>(null);
 const live=useRef(true),loadSequence=useRef(0),savedRef=useRef<Saved>({drafts:{},pending:null}),writes=useRef<Promise<void>>(Promise.resolve());
 const channelId=destination.kind==='conversation'?destination.id:undefined;
 const channel=channels.channels.find(item=>item.id===channelId);
 const responsive=getInboxResponsiveLayout({contentWidth:containerWidth,activityMode:false,contextOpen:false});
 const detailShown=responsive.isMasterDetail&&!listOpen;
 useEffect(()=>{
  const root=rootRef.current;if(!root||typeof ResizeObserver==='undefined')return;
  const main=root.querySelector<HTMLElement>('.gw-inbox-main');
  const update=()=>{setContainerWidth(root.clientWidth);if(main?.clientWidth)setReviewWidth(main.clientWidth);};
  const observer=new ResizeObserver(update);
  observer.observe(root);if(main)observer.observe(main);update();return()=>observer.disconnect();
 },[]);
 useEffect(()=>{if(requestedChannel){setDestination({kind:'conversation',id:requestedChannel.id});setListOpen(false);}},[requestedChannel?.nonce]);
 useEffect(()=>{
  live.current=true;
  return()=>{live.current=false;loadSequence.current++;approvalSequence.current++;};
 },[scope.userId,scope.organizationId]);
 const loadApprovals=useCallback(async()=>{
  const sequence=++approvalSequence.current;
  try{
   const data=await window.codexDesktop.approvals.request({type:'list'},scope);
   if(!data)throw Error('Invalid approval response.');
   if(live.current&&sequence===approvalSequence.current){setApprovalData(data);setApprovalError('');}
  }catch{if(live.current&&sequence===approvalSequence.current){setApprovalData(undefined);setApprovalError('Review requests could not be loaded. Check your workspace access and try again.');}}
 },[scope.userId,scope.organizationId]);
 useEffect(()=>{
  if(!active)return;
  void loadApprovals();const timer=setInterval(()=>void loadApprovals(),15000);
  return()=>{clearInterval(timer);approvalSequence.current++;};
 },[active,loadApprovals]);
 useEffect(()=>{
  let cancelled=false;
  void window.codexDesktop.directory.request({type:'list'},scope).then(result=>{
   if(!result)throw Error('Invalid directory response.');
   if(!cancelled){setEmployees(result.employees);setParticipantError('');}
  }).catch(()=>{if(!cancelled)setParticipantError('Channel participant names could not be loaded.');});
  return()=>{cancelled=true;};
 },[scope.userId,scope.organizationId,participantRetry]);
 useEffect(()=>{
  let cancelled=false;
  void window.codexDesktop.scopedPreferences.read('channel-drafts',scope).then(raw=>{
   const value=parseSaved(raw);if(cancelled)return;savedRef.current=value;setSaved(value);setRestoredPending(value.pending);setDraftReady(true);setDraftError('');
  }).catch(()=>{if(!cancelled)setDraftError('Channel drafts could not be loaded. Check your connection and try again.');});
  return()=>{cancelled=true;};
 },[scope.userId,scope.organizationId,draftRetry]);
 const save=useCallback((update:(current:Saved)=>Saved):Promise<void>=>{
  const task=writes.current.catch(()=>{}).then(async()=>{
   if(!live.current)throw Error('Workspace changed.');
   const next=update(savedRef.current);
   await window.codexDesktop.scopedPreferences.write('channel-drafts',JSON.stringify(next),scope);
   if(!live.current)throw Error('Workspace changed.');
   savedRef.current=next;setSaved(next);
  });
  writes.current=task;return task;
 },[scope.userId,scope.organizationId]);
 const load=useCallback(async()=>{
  if(!channelId||!active||(responsive.isMasterDetail&&listOpen))return;
  const request=++loadSequence.current;
  try{
   const rows=await window.codexDesktop.channels.request({type:'messages',id:channelId},scope);
   if(!live.current||request!==loadSequence.current)return;
   setMessages(rows);setLoadedChannel(channelId);setError('');setLoading(false);
   if(channel?.is_member&&rows.length){
    await window.codexDesktop.channels.request({type:'read',id:channelId,seq:rows[rows.length-1]!.seq},scope);
    if(live.current&&request===loadSequence.current)await channels.refresh();
   }
  }catch{if(live.current&&request===loadSequence.current){setError('Channel messages or read status could not be loaded. Try again.');setLoading(false);}}
 },[channelId,channel?.is_member,scope.userId,scope.organizationId,channels.refresh,active,responsive.isMasterDetail,listOpen]);
 useEffect(()=>{
  setMessages([]);
  if(!channelId||!active||(responsive.isMasterDetail&&listOpen))return;
  setLoading(true);void load();
  const timer=setInterval(()=>void load(),15000);
  return()=>{clearInterval(timer);loadSequence.current++;};
 },[load,active,responsive.isMasterDetail,listOpen]);
 const persistDraft=async(id:string,body:string):Promise<DispatchResult>=>{
  try{await save(current=>({ ...current,drafts:{...current.drafts,[id]:body} }));return {ok:true,value:{},durable:true};}
  catch{return {ok:false,error:{code:'unsupported',message:'Draft could not be saved.'}};}
 };
 const confirmSend=async(pending:Pending):Promise<DispatchResult>=>{
  try{
   await window.codexDesktop.channels.request({type:'send',id:pending.channelId,messageId:pending.messageId,body:pending.body},scope);
   await save(current=>({...current,pending:current.pending?.messageId===pending.messageId?null:current.pending}));
   setRestoredPending(null);void load();void channels.refresh();
   return {ok:true,value:{messageId:pending.messageId},durable:true};
  }catch{return {ok:true,value:{messageId:pending.messageId},durable:false};}
 };
 const send=async(input:SendInput):Promise<DispatchResult>=>{
  if(savedRef.current.pending)return {ok:false,error:{code:'unsupported',message:'Confirm the pending channel message before sending another.'}};
  const pending={channelId:input.conversationId,messageId:crypto.randomUUID(),body:input.body};
  try{await save(current=>({...current,pending}));}catch{return {ok:false,error:{code:'unsupported',message:'The message could not be prepared for a safe retry.'}};}
  return confirmSend(pending);
 };
 const retry=async(id:string):Promise<DispatchResult>=>{
  const pending=savedRef.current.pending;
  if(!pending||pending.messageId!==id||pending.channelId!==channelId)return {ok:false,error:{code:'not_found',message:'The pending message is unavailable.'}};
  return confirmSend(pending);
 };
 const feed=useMemo<FeedView|undefined>(()=>{
  if(!channel)return undefined;
  const conv=conversation(channel);
  const views:MessageView[]=(loadedChannel===channel.id?messages:[]).map(row=>{
   const person=employees.find(item=>item.user_id===row.author_id);
   const author={ref:{kind:'human' as const,id:row.author_id},name:person?.name??'Workspace member',available:true};
   const message:Message={id:row.id,clientId:row.id,conversationId:row.channel_id,organizationId:row.organization_id,workspaceId:row.organization_id,seq:row.seq,author:author.ref,type:'text',body:row.body,createdAt:row.created_at,mentions:[],attachments:[],refs:[],sendState:'server_saved'};
   return {message,author,isOwn:row.author_id===scope.userId,isDeleted:false,reactions:[],savedByActor:false,mentionsActor:false,unread:false,refs:[],replyCount:0,canEdit:false,canDelete:false,failed:false};
  });
  return {conversation:conv,title:`#${channel.name}`,members:[],canPost:channel.is_member,messages:views,doatNotConnected:false,unread:{unread:channel.unread,mentionUnread:0}};
 },[channel,messages,loadedChannel,employees,scope.userId]);
 const join=async()=>{
  if(!channel||joining)return;setJoining(true);setActionError('');
  try{await window.codexDesktop.channels.request({type:'join',id:channel.id},scope);await channels.refresh();}
  catch{if(live.current)setActionError('Could not join this channel. Check your workspace access and try again.');}
  finally{if(live.current)setJoining(false);}
 };
 const changeChannel=async(id:string,update:{muted?:boolean;markRead?:boolean})=>{
  try{await window.codexDesktop.channels.request({type:'preference',id,...update},scope);await channels.refresh();if(live.current)setActionError('');}
  catch{if(live.current)setActionError('The channel preference could not be saved. Try the action again.');}
 };
 const reviewEntries=useMemo<ReviewEntry[]>(()=>{
  if(!approvalData)return [];
  const tasks=new Map(approvalData.tasks.filter(task=>task.reviewer_id===scope.userId&&task.status==='in_review').map(task=>[task.id,task]));
  return approvalData.results.flatMap(result=>{
   const task=tasks.get(result.task_id);
   if(!task||result.status!=='pending')return [];
   const person=employees.find(item=>item.user_id===result.submitted_by);
   return [{key:`approval:${result.id}`,kind:'approval' as const,id:result.id,at:result.submitted_at,title:approvalAsk(task.title),preview:`${task.title} · ${APPROVAL_REASON}`,requester:{name:person?.name??'Workspace member',isDoat:false,id:result.submitted_by},taskId:task.id,taskTitle:task.title,taskStatus:'in_review' as const,stale:false}];
  }).sort((a,b)=>b.at.localeCompare(a.at)||a.key.localeCompare(b.key));
 },[approvalData,scope.userId,employees]);
 const resolveApproval=(entry:ReviewEntry|undefined):ReviewSource=>!entry?{status:'unselected'}:entry.stale?{status:'stale',entry}:{status:'available',entry};
 const decide=async(id:string,decision:'approved'|'changes_requested')=>{
  if(approvalBusy)return;setApprovalBusy(true);setApprovalError('');
  try{await window.codexDesktop.approvals.request({type:'decide',id,decision},scope);await loadApprovals();}
  catch{if(live.current)setApprovalError('The decision could not be confirmed. Retry the same decision.');}
  finally{if(live.current)setApprovalBusy(false);}
 };
 return <section ref={rootRef} className={`gwira-inbox-workspace${responsive.isMasterDetail?' is-master-detail':''}${responsive.isNarrow?' is-narrow':''}`} aria-label="Inbox" data-testid="inbox-workspace" data-layout={responsive.isMasterDetail?'master-detail':responsive.isNarrow?'two-pane':'three-pane'}>
  {detailShown&&<div className="gw-inbox-compact-header"><InboxHeading headingClass={!channel?'gw-visually-hidden':undefined} leading={!channel?<button type="button" className="gw-inbox-header-back" aria-label="Back to Inbox navigation" onClick={()=>setListOpen(true)}><Icon name="back"/> Inbox</button>:undefined}/></div>}
  {actionError&&<p className="gw-inbox-alert" role="alert">{actionError}</p>}
  {participantError&&<p className="gw-inbox-alert" role="alert">{participantError} <button type="button" onClick={()=>setParticipantRetry(value=>value+1)}>Retry</button></p>}
  <div className="gw-inbox-layout">
   <aside className={`gw-inbox-master${detailShown?' is-hidden':''}`} aria-label="Inbox navigation"><InboxNav ephemeral conversations={channels.channels.map(listItem)} directory={{participants:[],unavailableSections:['group','dm','doat'],personalPinsAvailable:false,mutedIds:new Set(channels.channels.filter(item=>item.muted).map(item=>item.id)),allowMarkUnread:false,onMute:(id,muted)=>void changeChannel(id,{muted}),onRead:id=>void changeChannel(id,{markRead:true})}} pendingApprovals={reviewEntries.length} hideEmptyHint destination={destination} onSelectDestination={next=>{setDestination(next);setListOpen(false);}} header={!detailShown?<InboxHeading/>:undefined}/></aside>
   <main className={`gw-inbox-main${responsive.isMasterDetail&&!detailShown?' is-hidden':''}`}>
    {channel&&feed?<><ConversationHeader feed={feed} storageScope="workspace" memberCount={channel.member_count} onBack={detailShown?()=>setListOpen(true):undefined}/>
     {error&&<p role="alert">{error} <button type="button" onClick={()=>void load()}>Retry</button></p>}
     {channels.error&&<p role="alert">{channels.error} <button type="button" onClick={()=>void channels.refresh()}>Retry</button></p>}
     {loading?<p role="status">Loading channel…</p>:<MessageFeed feed={feed} storageScope="workspace" scrollScopeKey={`${scope.userId}:${scope.organizationId}`}/>}
     {!channel.is_member?<button type="button" disabled={joining} onClick={()=>void join()}>Join channel</button>:
      draftReady?<Composer key={channel.id} conversationId={channel.id} conversationTitle={channel.name} actor={{kind:'human',id:scope.userId}} mentionCandidates={[]} initialDraft={saved.drafts[channel.id]??(saved.pending?.channelId===channel.id?saved.pending.body:'')} pendingMessageId={restoredPending?.channelId===channel.id?restoredPending.messageId:undefined} onSendMessage={send} onSetDraft={persistDraft} onRetry={retry} onFlush={()=>true} storageScope="workspace"/>:draftError?<p role="alert">{draftError} <button type="button" onClick={()=>setDraftRetry(value=>value+1)}>Retry</button></p>:<p role="status">Loading drafts…</p>}
    </>:destination.kind==='utility'&&destination.view==='needs-review'?<>
     {approvalError?<p role="alert">{approvalError} <button type="button" onClick={()=>void loadApprovals()}>Retry</button></p>:null}
     {approvalData?<NeedsReviewPresentation entries={reviewEntries} resolveSource={resolveApproval} conversationTitles={new Map()} masterDetail={responsive.isMasterDetail||reviewWidth<700} onOpenTask={()=>{}} onOpenMessage={()=>{}} approvalContent={id=>{
      const result=approvalData.results.find(item=>item.id===id&&item.status==='pending');
      return result?<section className="gw-review__block" aria-label="Submitted result"><h4>Submitted result</h4><p className="gw-review__result">{result.result_text}</p><div className="gw-review__actions"><button type="button" className="gw-review__open" disabled={approvalBusy} onClick={()=>void decide(id,'approved')}>Approve</button><button type="button" className="gw-review__open" disabled={approvalBusy} onClick={()=>void decide(id,'changes_requested')}>Request changes</button></div></section>:null;
     }}/>:!approvalError?<p role="status">Loading review requests…</p>:null}
    </>:<div className="gw-inbox-empty-selection"><h2>{channelId?'Channel unavailable':'Inbox'}</h2><p>{channelId?'This channel may have been removed or your access changed.':'Select a channel. Other Inbox features are not connected yet.'}</p>{channels.error&&<p role="alert">{channels.error}</p>}</div>}
   </main>
  </div>
 </section>;
}
