import React,{useEffect,useRef,useState} from 'react';
import type {AccountCommand,AccountSnapshot,OnboardingProgress,PlanRecord} from '../../shared/accountAuth.js';
import type {CloudConversation,CloudMessage,ConversationList} from '../../shared/cloudConversations.js';
import {AuthenticatedShell} from './AuthenticatedShell.js';
import {AuthenticatedGlobalChat} from './AuthenticatedGlobalChat.js';
import {Icon} from '../components/Icon.js';
import {MessageComposer,ComposerInput,ComposerSendButton,QuickPrompt} from '../components/MessageComposer.js';
import {Welcome} from '../components/ProjectControls.js';
import {AssistantResponse} from '../components/AssistantResponse.js';
import {UserMessage} from '../components/Transcript.js';
import {CompactActionMenu} from '../components/CompactActionMenu.js';
import {AuthenticatedSidebarSections} from './AuthenticatedSidebarSections.js';
import {HomeSidebarContent} from '../components/HomeSidebarContent.js';
import {AuthenticatedWorkspace} from './AuthenticatedWorkspace.js';
import {WorkspaceMarkdown} from '../workspaceTools/WorkspaceMarkdown.js';
import {activeAuthenticatedConversation,closeAuthenticatedConversationTabs,closeAuthenticatedTab,homeTabId,initialAuthenticatedTabs,restoreAuthenticatedTabs,selectAuthenticatedTab,serializeAuthenticatedTabs} from './authenticatedTabs.js';
import {reorderWorkspaceTab} from '../workspaceTabs.js';
import {startingPoints} from '../gwira/onboarding/startingPoints.js';
import {initialMeetState,meetReducer} from '../gwira/onboarding/meetGwiraModel.js';
import {parseSidebarLayout} from './sidebarLayout.js';
import '../workspaceTools/workspaceTools.css';
import './cloudHome.css';

type Pending={conversationId:string;messageId:string;content:string;title:string;create:boolean};
type Saved={last:string|null;drafts:Record<string,string>;pending:Pending|null};
const empty:Saved={last:null,drafts:{},pending:null};
const key=(id:string|null)=>id??'new';
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function parseSaved(raw:string|null):Saved {
 if(!raw)return empty;
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object')throw Error('Invalid saved conversation state.');
 const v=value as Partial<Saved>;
 if(v.last!==null&&!validId(v.last))throw Error('Invalid saved conversation state.');
 if(!v.drafts||typeof v.drafts!=='object'||Array.isArray(v.drafts))throw Error('Invalid saved conversation state.');
 const drafts:Record<string,string>={};
 for(const [id,text] of Object.entries(v.drafts)){if((id!=='new'&&!validId(id))||typeof text!=='string'||text.length>10000)throw Error('Invalid saved draft.');drafts[id]=text;}
 const p=v.pending;
 if(p!==null&&(!p||!validId(p.conversationId)||!validId(p.messageId)||typeof p.content!=='string'||p.content.length>10000||typeof p.title!=='string'||p.title.length>200||typeof p.create!=='boolean'))throw Error('Invalid pending message.');
 return {last:v.last??null,drafts,pending:p??null};
}
export function CloudHome({state,busy,send,workspaceReady=true,firstRunLoading=false,firstRunError,retryFirstRun,onFirstMessage,legacyOnboarding}:{state:AccountSnapshot;busy:boolean;send:(c:AccountCommand)=>Promise<void>;workspaceReady?:boolean;firstRunLoading?:boolean;firstRunError?:string;retryFirstRun?:()=>void;onFirstMessage?:(progress:OnboardingProgress)=>Promise<void>;legacyOnboarding?:React.ReactNode}):React.ReactElement {
 const [items,setItems]=useState<CloudConversation[]>([]),[pins,setPins]=useState<string[]>([]),[selected,setSelected]=useState<string|null>(null);
 const [messages,setMessages]=useState<CloudMessage[]>([]),[saved,setSaved]=useState<Saved>(empty),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[working,setWorking]=useState(false);
 const [error,setError]=useState(''),[sidebarActionError,setSidebarActionError]=useState(''),[search,setSearch]=useState(''),[showArchived,setShowArchived]=useState(false),[sidebar,setSidebar]=useState(false);
 const [searchOpen,setSearchOpen]=useState(false);
 const [layoutLoaded,setLayoutLoaded]=useState(false),[layoutError,setLayoutError]=useState('');
 const layout=useRef<Record<string,unknown>>({}),layoutRevision=useRef(0),layoutWrites=useRef<Promise<void>>(Promise.resolve());
 const [plan,setPlan]=useState<PlanRecord|null>(null),[planOpen,setPlanOpen]=useState(false);
 const [workspaceWidth,setWorkspaceWidth]=useState(360);
 const [generating,setGenerating]=useState(false),[retryGeneration,setRetryGeneration]=useState(false);
 const [activeConversationIds,setActiveConversationIds]=useState<ReadonlySet<string>>(new Set()),[activityError,setActivityError]=useState('');
 const [tabs,setTabs]=useState(initialAuthenticatedTabs),tabsRef=useRef(tabs);
 const [tabsLoaded,setTabsLoaded]=useState(false),[tabsError,setTabsError]=useState(''),[tabsRetry,setTabsRetry]=useState(0);
 const tabsRevision=useRef(0),tabsWrites=useRef<Promise<void>>(Promise.resolve());
 const [renameValue,setRenameValue]=useState<string|null>(null),[confirmDelete,setConfirmDelete]=useState(false);
 const [firstInput,setFirstInput]=useState('');
 const firstPending=useRef(false),textarea=useRef<HTMLTextAreaElement>(null);
 const live=useRef(true),loadId=useRef(0),savedRef=useRef<Saved>(empty),lock=useRef(false),writes=useRef<Promise<void>>(Promise.resolve()),revision=useRef(0),transcript=useRef<HTMLDivElement>(null);
 const initialMessage=useRef<string|null>(null);
 const api=window.codexDesktop.conversations,preferences=window.codexDesktop.scopedPreferences;
 useEffect(()=>{
  const userId=state.user?.id,organizationId=state.activeOrganization?.id;
  if(!workspaceReady||!sidebar||!userId||!organizationId){setActiveConversationIds(new Set());setActivityError('');return;}
  let active=true,timer:ReturnType<typeof setTimeout>;
  const refresh=async()=>{
   try{
    const result=await api.request({type:'activity'},{userId,organizationId});
    if(!result||Array.isArray(result)||typeof result!=='object'||!('activeConversationIds'in result)||!Array.isArray(result.activeConversationIds)||result.activeConversationIds.some(id=>typeof id!=='string'))throw Error('Invalid conversation activity.');
    if(active){setActiveConversationIds(new Set(result.activeConversationIds));setActivityError('');}
   }catch{if(active){setActiveConversationIds(new Set());setActivityError('Activity status is unavailable. Check your connection.');}}
   finally{if(active)timer=setTimeout(()=>void refresh(),10000);}
  };
  void refresh();
  return()=>{active=false;clearTimeout(timer);};
 },[api,workspaceReady,sidebar,state.user?.id,state.activeOrganization?.id]);
 useEffect(()=>{
  let active=true;
  void preferences.read('layout').then(raw=>{
   const value=parseSidebarLayout(raw);
   if(!active)return;
   layout.current=value;
   if(layoutRevision.current===0&&typeof value.sidebarExpanded==='boolean')setSidebar(value.sidebarExpanded);
   setLayoutLoaded(true);
  }).catch(()=>{if(active)setLayoutError('Sidebar layout could not be loaded. Your changes cannot be saved until the app is restarted.');});
  return()=>{active=false;};
 },[preferences]);
 useEffect(()=>{
  if(!layoutLoaded||layoutRevision.current===0)return;
  let active=true;
  const version=layoutRevision.current;
  const task=layoutWrites.current.catch(()=>{}).then(async()=>{
   if(!active||version!==layoutRevision.current)return;
   const next={...layout.current,sidebarExpanded:sidebar};
   await preferences.write('layout',JSON.stringify(next));
   layout.current=next;
  });
  layoutWrites.current=task;
  void task.then(()=>{if(active)setLayoutError('');}).catch(()=>{if(active)setLayoutError('Sidebar layout could not be saved. Check storage and try again.');});
  return()=>{active=false;};
 },[sidebar,layoutLoaded,preferences]);
 const me=state.user?.id, current=items.find(c=>c.id===selected), draft=saved.drafts[key(selected)]??'';
 function updateTabs(next:typeof tabs){tabsRevision.current++;tabsRef.current=next;setTabs(next);}
 useEffect(()=>{
  if(!tabsLoaded||!tabsRevision.current||!state.user?.id||!state.activeOrganization?.id)return;
  const expected={userId:state.user.id,organizationId:state.activeOrganization.id},version=tabsRevision.current;
  let active=true;
  const task=tabsWrites.current.catch(()=>{}).then(async()=>{
   if(!live.current||version!==tabsRevision.current)return;
   await preferences.write('tabs',serializeAuthenticatedTabs(tabs),expected);
  });
  tabsWrites.current=task;
  void task.then(()=>{if(active)setTabsError('');}).catch(()=>{if(active)setTabsError('Open tabs could not be saved. Try again.');});
  return()=>{active=false;};
 },[tabs,tabsLoaded,tabsRetry,state.user?.id,state.activeOrganization?.id,preferences]);
 useEffect(()=>{const node=transcript.current;if(node)node.scrollTop=node.scrollHeight;},[selected,messages,generating]);
 useEffect(()=>{
  const node=transcript.current;if(!node)return;
  let atBottom=true;
  const track=()=>{atBottom=node.scrollHeight-node.clientHeight-node.scrollTop<24;};
  const observer=new ResizeObserver(()=>{if(atBottom)node.scrollTop=node.scrollHeight;});
  node.addEventListener('scroll',track);observer.observe(node);
  return()=>{observer.disconnect();node.removeEventListener('scroll',track);};
 },[workspaceReady]);
 const updateSaved=(next:Saved)=>{revision.current++;savedRef.current=next;setSaved(next);};
 function writeState(next:Saved,version:number):Promise<void>{
  const task=writes.current.catch(()=>{}).then(async()=>{if(!live.current)throw Error('Account context changed.');if(version!==revision.current)return;await preferences.write('conversation-state',JSON.stringify(next));});
  writes.current=task;return task;
 }
 async function persist(next:Saved){updateSaved(next);await writeState(next,revision.current);}
 async function list():Promise<ConversationList>{
  const result=await api.request({type:'list'});
  if(!result||Array.isArray(result)||typeof result!=='object'||!('conversations'in result))throw Error('Invalid conversation list.');
  if(live.current){setItems(result.conversations);setPins(result.pins);}
  return result;
 }
 async function open(id:string|null,activate=true){
  const request=++loadId.current;setSelected(id);setMessages([]);setPlan(null);setPlanOpen(false);setRenameValue(null);setConfirmDelete(false);setError('');setRetryGeneration(false);
  if(activate)updateTabs(selectAuthenticatedTab(tabsRef.current,id));
  if(!id){setLoading(false);return;}
  setLoading(true);
  try{const [result,linked]=await Promise.all([api.request({type:'messages',id}),api.request({type:'plan',id})]);if(!Array.isArray(result)||!linked||typeof linked!=='object'||Array.isArray(linked)||!('plan'in linked))throw Error('Invalid conversation.');if(live.current&&request===loadId.current){setMessages(result);setPlan(linked.plan);}}
  catch{if(live.current&&request===loadId.current)setError('Could not load this conversation. Check your connection and try again.');}
  finally{if(live.current&&request===loadId.current)setLoading(false);}
 }
 useEffect(()=>{
  if(!workspaceReady)return;
  live.current=true;
  void (async()=>{try{
   const expected=state.user?.id&&state.activeOrganization?.id?{userId:state.user.id,organizationId:state.activeOrganization.id}:undefined;
   if(!expected)throw Error('Workspace unavailable.');
   const local=parseSaved(await preferences.read('conversation-state',expected));
   let tabsRaw:string|null=null,tabsReadable=false;
   try{tabsRaw=await preferences.read('tabs',expected);tabsReadable=true;}
   catch{if(live.current)setTabsError('Saved tabs could not be loaded. Restart or check workspace access.');}
   const initialRaw=await preferences.read('initial-generation');
   const initial:unknown=initialRaw===null?null:JSON.parse(initialRaw);
   if(initial!==null&&(!initial||typeof initial!=='object'||!('userId'in initial)||!('organizationId'in initial)||initial.userId!==state.user?.id||initial.organizationId!==state.activeOrganization?.id))throw Error('Invalid initial message state.');
   const onboarding=await api.request({type:'onboarding'});
   const result=await list();
   if(!live.current)return;
   updateSaved(local);
   let restored:ReturnType<typeof restoreAuthenticatedTabs>=null;
   if(tabsReadable)try{restored=restoreAuthenticatedTabs(tabsRaw,new Set(result.conversations.filter(item=>!item.archived_at).map(item=>item.id)));}
   catch{tabsReadable=false;setTabsError('Saved tabs are invalid and were not overwritten.');}
   if(restored&&tabsRevision.current===0){tabsRef.current=restored.state;setTabs(restored.state);if(restored.removed){tabsRevision.current++;setTabsError('Some saved tabs are no longer available in this workspace.');}}
   setTabsLoaded(tabsReadable);
   const activeTab=tabsRef.current.globalTabs?.find(tab=>tab.id===tabsRef.current.activeGlobalTabId);
   const candidate=activeTab?.destination.type==='conversation'?activeTab.destination.conversationId:restored&&activeTab?.destination.type==='view'&&activeTab.destination.view==='home'?null:initial&&typeof onboarding==='string'?onboarding:local.pending?.create?null:(local.pending?.conversationId??local.last??(typeof onboarding==='string'?onboarding:null));
   const choice=result.conversations.find(c=>c.id===candidate&&!c.archived_at)?.id??null;
   setReady(true);await open(choice,!restored&&tabsRef.current.activeGlobalTabId===homeTabId);
   if(live.current&&choice&&choice===onboarding&&initial){
    const history=await api.request({type:'messages',id:choice});
    if(!Array.isArray(history))throw Error('Invalid conversation history.');
    const first=history[0];
    if(first?.author_type!=='user')throw Error('Initial message is unavailable.');
    if(live.current){
     initialMessage.current=first.id;
     if(history.length===1)await generate(choice,first.id);
     else {await preferences.write('initial-generation','null');initialMessage.current=null;}
    }
   }
  }catch{if(live.current)setError('Conversations could not be loaded. Check your connection and workspace access, then try again.');}
  finally{if(live.current)setLoading(false);}})();
  return()=>{live.current=false;loadId.current++;};
 },[workspaceReady]);
 async function select(id:string|null){
  if(working||generating)return;
  updateTabs(selectAuthenticatedTab(tabsRef.current,id));
  const loadingConversation=open(id,false);
  try{await persist({...savedRef.current,last:id});await loadingConversation;setSearchOpen(false);setSearch('');setShowArchived(false);}
  catch{if(live.current)setError('The selected conversation could not be saved on this device. Try again.');}
 }
 function changeDraft(text:string){if(lock.current)return;updateSaved({...savedRef.current,drafts:{...savedRef.current.drafts,[key(selected)]:text},pending:null});}
 async function generate(id:string,messageId:string){
  if(!live.current)return;
  setGenerating(true);setRetryGeneration(false);
  try{
   const result=await api.request({type:'generate',id,messageId});
   if(!result||typeof result!=='object'||Array.isArray(result)||!('status'in result))throw Error('Invalid generation result.');
   if(result.status==='completed'){if(live.current){if(initialMessage.current===messageId){await preferences.write('initial-generation','null');initialMessage.current=null;}await open(id);}}
   else if(live.current){setError(result.status==='generating'?'Gwira is still working. Check the response again shortly.':'The AI request failed. Your message is saved; send a new message to try again.');setRetryGeneration(result.status==='generating');}
  }catch(error){
   if(live.current){
    const text=error instanceof Error?error.message:'';
    const known=['AI is unavailable: the trusted AI server is not configured.','AI is unavailable: the trusted AI provider is not configured.','Your daily AI request limit has been reached.','Another response is being generated in this workspace. Check again shortly.'];
    setError(known.find(message=>text.includes(message))??'The AI response could not be confirmed. Your message is saved; check the response again.');setRetryGeneration(true);
   }
  }finally{if(live.current)setGenerating(false);}
 }
 useEffect(()=>{
  if(!ready)return;
  const snapshot=saved,version=revision.current;
  const timer=setTimeout(()=>{void writeState(snapshot,version).catch(()=>{if(live.current)setError('Your draft could not be saved on this device. Check storage and try again.');});},500);
  return()=>clearTimeout(timer);
 },[saved,ready]);
 async function submit(){
  if(!workspaceReady){
   const text=firstInput.trim();if(!text||text.length>2000||busy||firstPending.current||!onFirstMessage)return;
   firstPending.current=true;
   try{await onFirstMessage(meetReducer(initialMeetState,{type:'submit',text}));}finally{firstPending.current=false;}
   return;
  }
  const content=draft.trim();if(!content||content.length>10000||working||generating||lock.current)return;
  lock.current=true;setWorking(true);setError('');setRetryGeneration(false);
  const old=savedRef.current.pending;
  const p:Pending=old&&old.content===content&&(old.conversationId===selected||!selected&&old.create)?old:{conversationId:selected??crypto.randomUUID(),messageId:crypto.randomUUID(),content,title:content.slice(0,200),create:!selected};
  try{
   await persist({...savedRef.current,pending:p});
   if(p.create)await api.request({type:'create',id:p.conversationId,title:p.title,visibility:'private'});
   await api.request({type:'send',id:p.conversationId,messageId:p.messageId,content:p.content});
   const drafts={...savedRef.current.drafts};delete drafts[key(selected)];
   await persist({last:p.conversationId,drafts,pending:null});
   await list();if(live.current){await open(p.conversationId);await generate(p.conversationId,p.messageId);}
  }catch{if(live.current)setError('Message not confirmed. Your draft is kept; retry to send it safely.');}
  finally{lock.current=false;if(live.current)setWorking(false);}
 }
 async function action(input:Parameters<typeof api.request>[0]){
  if(working||generating||lock.current)return;lock.current=true;setWorking(true);setError('');setSidebarActionError('');setRetryGeneration(false);
  try{await api.request(input);await list();if(input.type==='update'&&['archive','delete'].includes(input.action))await selectAfterAction(input.id);}
  catch{if(live.current){const message='The conversation update could not be confirmed or refreshed. Check your access and try again.';setError(message);setSidebarActionError(message);}}
  finally{lock.current=false;if(live.current)setWorking(false);}
 }
 async function savePlan(messageId:string){
  if(!current||working||generating||lock.current)return;
  lock.current=true;setWorking(true);setError('');setRetryGeneration(false);
  try{
   await api.request({type:'save_plan',id:current.id,messageId,expectedVersion:plan?.version??null});
   const result=await api.request({type:'plan',id:current.id});
   if(!result||typeof result!=='object'||Array.isArray(result)||!('plan'in result)||!result.plan)throw Error('Saved plan could not be loaded.');
   if(live.current){setPlan(result.plan);setPlanOpen(true);}
  }catch{if(live.current)setError('The plan could not be saved or loaded. Check access and the current plan version, then try again.');}
  finally{lock.current=false;if(live.current)setWorking(false);}
 }
 async function selectAfterAction(id:string){const active=activeAuthenticatedConversation(tabsRef.current)===id;const next=closeAuthenticatedConversationTabs(tabsRef.current,id);updateTabs(next);if(active){const fallback=activeAuthenticatedConversation(next);await persist({...savedRef.current,last:fallback});await open(fallback,false);}}
 async function closeArchivedProjectTabs(ids:string[]){const active=activeAuthenticatedConversation(tabsRef.current);let next=tabsRef.current;for(const id of ids)next=closeAuthenticatedConversationTabs(next,id);updateTabs(next);if(active&&ids.includes(active)){const fallback=activeAuthenticatedConversation(next);await persist({...savedRef.current,last:fallback});await open(fallback,false);}}
 const visible=items.filter(c=>!!c.archived_at===showArchived&&c.title.toLowerCase().includes(search.toLowerCase()));
 const conversationActions=workspaceReady&&current?<CompactActionMenu label="Conversation options" actions={[
  ...(plan?[{label:planOpen?'Close plan':'Review plan',onSelect:()=>setPlanOpen(v=>!v)}]:[]),
  {label:pins.includes(current.id)?'Unpin':'Pin',disabled:working||generating,onSelect:()=>void action({type:'pin',id:current.id,pinned:!pins.includes(current.id)})},
  ...(current.created_by===me?[
   {label:'Rename',disabled:working||generating,onSelect:()=>{setRenameValue(current.title);setConfirmDelete(false);}},
   {label:current.archived_at?'Unarchive':'Archive',disabled:working||generating,onSelect:()=>void action({type:'update',id:current.id,action:current.archived_at?'unarchive':'archive'})},
   {label:'Delete',destructive:true,disabled:working||generating,onSelect:()=>{setConfirmDelete(true);setRenameValue(null);}}
  ]:[])
 ]}/>:undefined;
 const chatContext=state.user&&state.activeOrganization?{workspace:state.activeOrganization.name,scope:{userId:state.user.id,organizationId:state.activeOrganization.id}}:undefined;
 return <AuthenticatedShell state={state} busy={busy||working} navigationBusy={generating} send={send} tabError={tabsError} onRetryTabs={()=>tabsLoaded?setTabsRetry(value=>value+1):window.location.reload()} globalChat={workspaceReady&&chatContext?(open,onClose)=><AuthenticatedGlobalChat open={open} {...chatContext} onClose={onClose} onConversationsChanged={async()=>{await list();}}/>:undefined} conversationActions={conversationActions} tabs={items.filter(item=>!item.archived_at||item.id===selected).map(item=>({id:item.id,title:item.title}))} tabState={tabs} updateTabState={updateTabs} sidebar={sidebar} onToggleSidebar={()=>{layoutRevision.current++;setSidebar(v=>!v);}} onToggleWorkspace={()=>setPlanOpen(v=>!v)} workspaceOpen={planOpen} workspaceWidth={workspaceWidth} workspacePlanId={plan?.id} workspaceContent={(destination,onOpenTool,onCloseTool)=><AuthenticatedWorkspace plan={plan} open={planOpen} destination={destination} onOpenTool={onOpenTool} width={workspaceWidth} onWidthChange={setWorkspaceWidth} onCloseTool={onCloseTool}/>} onSelect={workspaceReady?id=>void select(id):undefined} onReorder={workspaceReady?(id,target)=>updateTabs(reorderWorkspaceTab(tabsRef.current,id,target)):undefined} onClose={id=>{const wasActive=tabsRef.current.activeGlobalTabId===id;const next=closeAuthenticatedTab(tabsRef.current,id);updateTabs(next);if(wasActive){const fallback=activeAuthenticatedConversation(next);const nextTab=next.globalTabs?.find(tab=>tab.id===next.activeGlobalTabId);if(fallback&&items.some(item=>item.id===fallback&&!item.archived_at))void select(fallback);else if(nextTab?.destination.type==='view'&&nextTab.destination.view==='home')void select(null);}}} sidebarContent={(navigate,view,selectHome)=>
    <div className="gwira-secondary-sidebar cloud-home__sidebar" aria-label="Conversations" hidden={!sidebar||!['home','library'].includes(view)}><HomeSidebarContent workspaceLabel="Gwira workspace" onNewWork={()=>selectHome(null)} newWorkDisabled={!workspaceReady||working||generating} newWorkDisabledReason={!workspaceReady?'Send your first message to start a conversation.':undefined} onLibrary={()=>navigate('library')} libraryActive={view==='library'} onSearch={()=>setSearchOpen(v=>{if(v){setSearch('');setShowArchived(false);}return !v;})} searchOpen={searchOpen} sections={<>
    {searchOpen&&<div onKeyDown={e=>{if(e.key==='Escape'){setSearchOpen(false);setSearch('');setShowArchived(false);document.querySelector<HTMLButtonElement>('.cloud-home__sidebar .sidebar-search')?.focus();}}}><label>Search conversations<input autoFocus type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search titles"/></label><button type="button" aria-pressed={showArchived} onClick={()=>setShowArchived(v=>!v)}>{showArchived?'Show active conversations':'Show archived conversations'}</button></div>}
    {!visible.length&&search&&<p>No conversations found.</p>}
    <AuthenticatedSidebarSections key={`${me}:${state.activeOrganization?.id}`} items={visible} projectItems={items} pins={pins} activeConversationIds={activeConversationIds} selected={selected} workspace={state.activeOrganization?.name} userId={me} organizationId={state.activeOrganization?.id} disabled={!workspaceReady||working||generating} loading={!ready&&loading} loadFailed={workspaceReady&&!ready&&!loading} actionError={sidebarActionError} activityError={activityError} onSelect={selectHome} onPin={(id,pinned)=>void action({type:'pin',id,pinned})} onArchive={(id,archived)=>void action({type:'update',id,action:archived?'archive':'unarchive'})} onConversationsChanged={list} onArchived={closeArchivedProjectTabs}/>
    </>} footer={<footer className="sidebar-account" aria-label="Account status"><span className="account-avatar" aria-hidden="true">{(state.user?.displayName||state.user?.email||'?').slice(0,1).toUpperCase()}</span><span><strong>{state.activeOrganization?.name}</strong><small>{state.user?.displayName||state.user?.email}</small></span></footer>}/></div>}>
   <>
    {!current&&<header className="topbar"/>}
    <div className="content" ref={transcript}>
    {!current&&!legacyOnboarding&&<Welcome projectName={state.activeOrganization?.name??'your workspace'} open={false} codingProject={false} unavailableReason="Projects are unavailable for authenticated workspaces." onToggle={()=>{}}/>}
    {current&&renameValue!==null&&<form className="cloud-home__rename" onSubmit={e=>{e.preventDefault();const title=renameValue.trim();if(title){setRenameValue(null);void action({type:'update',id:current.id,action:'rename',value:title});}}} onKeyDown={e=>{if(e.key==='Escape')setRenameValue(null);}}><label>Conversation name<input autoFocus maxLength={200} value={renameValue} onChange={e=>setRenameValue(e.target.value)}/></label><button type="submit" disabled={!renameValue.trim()||working}>Save name</button><button type="button" onClick={()=>setRenameValue(null)}>Cancel</button></form>}
    {current&&confirmDelete&&<div role="alert" className="cloud-home__confirm"><span>Delete this conversation and all its messages? This cannot be undone.</span><button type="button" disabled={working} onClick={()=>{setConfirmDelete(false);void action({type:'update',id:current.id,action:'delete'});}}>Delete permanently</button><button type="button" onClick={()=>setConfirmDelete(false)}>Cancel</button></div>}
    {legacyOnboarding}
    <div hidden={!workspaceReady} className="cloud-home__transcript transcript" data-message-style="refined" aria-live="polite">
     {loading&&<p role="status">Loading conversations…</p>}
     {!loading&&messages.map(m=>m.author_type==='user'?<article className="message user cloud-home__user" data-message-id={m.id} key={m.id}><UserMessage text={m.content} compact={false} restricted/></article>:<AssistantResponse key={m.id}><small>{m.author_type==='rules'?'Rules-based guidance':'Gwira'}</small>{m.author_type==='assistant'?<WorkspaceMarkdown source={m.content}/>:<p>{m.content}</p>}{m.author_type==='assistant'&&current&&current.created_by===me&&<button type="button" disabled={working||!!current.archived_at} onClick={()=>void savePlan(m.id)}>{plan?'Save as new plan version':'Save as plan'}</button>}</AssistantResponse>)}
     {generating&&<p role="status">Gwira is working…</p>}
    </div>
    {error&&<p role="alert" className="authenticated-home__error">{error} {!ready&&<button type="button" onClick={()=>window.location.reload()}>Retry</button>}{retryGeneration&&ready&&current&&!current.archived_at&&messages.at(-1)?.author_type==='user'&&<button type="button" disabled={working||generating} onClick={()=>{const last=messages.at(-1);if(last){setError('');setWorking(true);void generate(current.id,last.id).finally(()=>{if(live.current)setWorking(false);});}}}>Check response</button>}</p>}
    {layoutError&&<p role="alert" className="authenticated-home__error">{layoutError}</p>}
    {!workspaceReady&&firstRunLoading&&<p role="status">Opening Home…</p>}
    {!workspaceReady&&firstRunError&&<p role="alert" className="authenticated-home__error">{firstRunError}{firstRunLoading&&<button type="button" onClick={retryFirstRun}>Try again</button>}</p>}
    </div>
    {!workspaceReady&&!legacyOnboarding&&!firstRunLoading&&<section className="suggestions" aria-label="Starting ideas">{startingPoints.map(point=><QuickPrompt key={point.id} disabled={busy} onClick={()=>{setFirstInput(point.prompt);textarea.current?.focus();}}><Icon name={point.icon}/><span>{point.title}</span></QuickPrompt>)}</section>}
     <MessageComposer hidden={!!legacyOnboarding||(!workspaceReady&&firstRunLoading)||workspaceReady&&!ready} aria-label="Message composer">
      <div className="composer-context"><span>{state.activeOrganization?.name}</span><button type="button" disabled title="Projects are unavailable for authenticated workspaces."><Icon name="folder"/><span>Choose project</span><Icon name="chevron-down"/></button></div>
      <label className="authenticated-home__sr" htmlFor={workspaceReady?'cloud-goal':'home-goal'}>Your message</label>
      <ComposerInput id={workspaceReady?'cloud-goal':'home-goal'} ref={textarea} autoGrow autoGrowMinHeight={32} rows={2} maxLength={workspaceReady?10000:2000} value={workspaceReady?draft:firstInput} disabled={busy||working||generating||!!current?.archived_at} onChange={e=>workspaceReady?changeDraft(e.target.value):setFirstInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void submit();}}} placeholder={current?.archived_at?'Unarchive to continue':'Ask Gwira anything…'}/>
      <div className="composer-footer"><div className="composer-tools"><button type="button" disabled title="Attachments are unavailable for authenticated workspaces." aria-label="Attachments unavailable"><Icon name="plus"/></button></div><span>{generating?'Generating…':working||busy?'Saving…':''}</span><div className="composer-actions"><ComposerSendButton disabled={!(workspaceReady?draft:firstInput).trim()||busy||working||generating||!!current?.archived_at} onClick={()=>void submit()}/></div></div>
     </MessageComposer>
     <footer className="footer-status"><div className="footer-left"><span>{state.activeOrganization?.name}</span></div></footer>
   </>
 </AuthenticatedShell>;
}
