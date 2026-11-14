import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Transcript} from '../../components/Transcript.js';
import {MessageComposer,ComposerInput,ComposerSendButton,QuickPrompt} from '../../components/MessageComposer.js';
import {Icon} from '../../components/Icon.js';
import {OpeningWelcome,IdeaGrid} from '../onboarding/OpeningParts.js';
import {TypewriterHint} from '../onboarding/TypewriterHint.js';
import {hintPhrases} from '../onboarding/startingPoints.js';
import {initialMeetState,meetReducer,decide,type MeetState} from '../onboarding/meetGwiraModel.js';
import {applyPlanEdit,buildPlan,classifyPlanMessage,parsePlanDoc,renderPlanMarkdown} from '../onboarding/planDocument.js';
import {planDestination} from '../../auth/planDocuments.js';
import type {FirstRunHost} from '../../auth/FirstRunContext.js';
import type {OnboardingChatEntry,OnboardingProgress,PlanRecord} from '../../../shared/accountAuth.js';
import type {WorkspaceDestination} from '../../workspaceTabs.js';
import {approvedReply,buildFirstRunMessages,editHelp,helpReply,unclearApprovalReply} from './firstRunModel.js';
import './firstRun.css';

const now=():string=>new Date().toISOString();
// Same breakpoint at which the shell turns the right Workspace into an overlay.
const narrowQuery='(max-width: 899px)';
function useNarrow():boolean {
 const [narrow,setNarrow]=useState(()=>window.matchMedia(narrowQuery).matches);
 useEffect(()=>{const query=window.matchMedia(narrowQuery);const update=()=>setNarrow(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
 return narrow;
}
const cap=(text:string):string=>text.length>600?text.slice(0,599)+'…':text;
type Working=''|'plan'|'edit'|'approve';

/** Meet Gwira as Home in first-run mode: the shared Home composer and transcript, with the plan opened in the Files tool. */
export function FirstRunHome({host,onOpenDestination}:{host:FirstRunHost;onOpenDestination:(destination:WorkspaceDestination)=>void}):React.ReactElement {
 const organization=host.snapshot.activeOrganization!;
 const plan:PlanRecord|undefined=host.snapshot.plan??undefined;
 const [loaded,setLoaded]=useState(false),[loadFailed,setLoadFailed]=useState(false);
 const [state,setState]=useState<MeetState>(initialMeetState),[startedAt,setStartedAt]=useState<string>(),[chat,setChat]=useState<OnboardingChatEntry[]>([]);
 const [input,setInput]=useState(''),[focused,setFocused]=useState(false),[more,setMore]=useState(false),[working,setWorking]=useState<Working>(''),[planFailed,setPlanFailed]=useState(false);
 const [notice,setNotice]=useState(''),[menu,setMenu]=useState(false);
 const busy=useRef(false),failed=useRef(false),reviewed=useRef<number|undefined>(undefined),planRef=useRef(plan),composer=useRef<HTMLTextAreaElement>(null),menuButton=useRef<HTMLButtonElement>(null),end=useRef<HTMLDivElement>(null);
 planRef.current=plan;
 const saveFailed=!!host.snapshot.onboardingSaveFailed;
 const narrow=useNarrow(),narrowRef=useRef(narrow);narrowRef.current=narrow;

 function apply(progress:OnboardingProgress|null|undefined):void {
  if(!progress)return;setState({act:progress.act,goal:progress.goal,answers:progress.answers,asked:progress.asked});setStartedAt(progress.startedAt);setChat(progress.chat??[]);
 }
 async function load():Promise<void> {
  setLoadFailed(false);const snapshot=await host.command({type:'load_onboarding'});
  if(!snapshot||snapshot.onboardingProgress===undefined){setLoadFailed(true);return;}
  apply(snapshot.onboardingProgress);setLoaded(true);
 }
 useEffect(()=>{void load();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{end.current?.scrollIntoView?.({block:'end'});},[chat.length,state.answers.length,plan?.version,working]);

 async function persist(next:MeetState,nextChat:OnboardingChatEntry[],started:string|undefined):Promise<void> {
  const progress:OnboardingProgress={act:next.act,goal:next.goal,answers:next.answers,asked:next.asked,...(started?{startedAt:started}:{}),chat:nextChat.slice(-24).map(e=>({...e,text:cap(e.text)}))};
  await host.command({type:'save_onboarding',progress});
 }
 function openPlan(record:PlanRecord):void {reviewed.current=record.version;onOpenDestination(planDestination(organization.id,record));}

 async function createPlan(next:MeetState,started:string,currentChat:OnboardingChatEntry[]):Promise<void> {
  setWorking('plan');setPlanFailed(false);setNotice('');
  try{
   let record=planRef.current;
   if(!record)record=(await host.command({type:'plan_load'}))?.plan??undefined;
   if(!record){
    const doc=buildPlan(next);
    const snapshot=await host.command({type:'plan_save',title:doc.title,markdown:renderPlanMarkdown(doc),structured:doc,summary:'First plan from your conversation.'});
    record=snapshot?.plan??undefined;
    if(!record){setPlanFailed(true);setNotice(snapshot?.planError?.message??'The plan could not be saved right now. Your conversation is kept.');return;}
   }
   // On a narrow window the Workspace would cover the conversation, so the plan is opened on request instead.
   if(!narrowRef.current)openPlan(record);
   await persist(next,currentChat,started);
  }finally{setWorking('');}
 }
 async function answer(text:string):Promise<void> {
  const next=meetReducer(state,{type:'submit',text});if(next===state)return;
  const started=startedAt??now();setState(next);setStartedAt(started);
  await persist(next,chat,started);
  if(next.act==='proposal')await createPlan(next,started,chat);
 }
 async function approve(method:'chat'|'button'):Promise<string> {
  const record=planRef.current;if(!record)return 'The plan isn’t saved yet, so there is nothing to approve. Use Try again first.';
  if(record.status==='approved'&&reviewed.current===record.version)return `Version ${record.version} is already approved.`;
  if(reviewed.current!==record.version){openPlan(record);return `The plan is now version ${record.version}, which you haven’t reviewed yet. I’ve opened it. Read it, then approve again.`;}
  setWorking('approve');
  const snapshot=await host.command({type:'plan_approve',planId:record.id,version:reviewed.current,method});
  if(snapshot?.planError){
   if(snapshot.planError.code==='plan_version_stale')await host.command({type:'plan_load'});
   failed.current=true;return `${snapshot.planError.message} Nothing was approved.`;
  }
  const saved=snapshot?.plan;
  if(!saved||saved.status!=='approved'){failed.current=true;return 'I couldn’t confirm the approval, so nothing was approved. Try again.';}
  const parsed=parsePlanDoc(saved.structured);
  await persist({...state,act:'result'},[...chat],startedAt);setState(current=>({...current,act:'result'}));
  return approvedReply(saved,parsed?.integrations.map(i=>i.name)??[]);
 }
 async function edit(text:string):Promise<string> {
  const record=planRef.current;const doc=record?parsePlanDoc(record.structured):undefined;
  if(!record||!doc)return 'I couldn’t read the saved plan to change it. Reopen Gwira and try again.';
  const result=applyPlanEdit(doc,text);
  if(result.kind==='needs_detail')return result.question;
  if(result.kind==='unsupported')return editHelp;
  setWorking('edit');
  const snapshot=await host.command({type:'plan_save',planId:record.id,expectedVersion:record.version,title:result.plan.title,markdown:renderPlanMarkdown(result.plan),structured:result.plan,summary:result.summary.slice(0,500)});
  if(snapshot?.planError){
   if(snapshot.planError.code==='plan_version_stale')await host.command({type:'plan_load'});
   failed.current=true;return `${snapshot.planError.message} The plan was not changed.`;
  }
  const saved=snapshot?.plan;
  if(!saved||saved.version<=record.version){failed.current=true;return 'I couldn’t save that change, so the plan is unchanged. Try again.';}
  reviewed.current=saved.version;
  return `${result.summary} I saved this as version ${saved.version}, and the document beside us is updated.${record.status==='approved'?' The earlier approval applied to the previous version, so this version needs approval again.':''}`;
 }
 async function planChat(text:string):Promise<void> {
  const asked:OnboardingChatEntry[]=[...chat,{role:'user',text:cap(text),at:now()}];setChat(asked);
  const intent=classifyPlanMessage(text);let reply:string;
  try{
   reply=intent==='approve'?await approve('chat'):intent==='unclear_approval'?unclearApprovalReply:intent==='edit'?await edit(text):helpReply;
  }catch{reply='Something went wrong, so I didn’t change anything. Try again.';}
  const finished=[...asked,{role:'gwira' as const,text:cap(reply),at:now()}];setChat(finished);setWorking('');
  // A failed save keeps the user's message in the composer so it can be sent again.
  if(failed.current){failed.current=false;setInput(text);}
  await persist(planRef.current?.status==='approved'&&intent==='approve'?{...state,act:'result'}:state,finished,startedAt);
 }
 async function submit(value=input):Promise<void> {
  const text=value.trim();if(!text||busy.current||!loaded)return;busy.current=true;setInput('');setNotice('');
  try{if(state.act==='opening'||state.act==='clarifying')await answer(text);else await planChat(text);}finally{busy.current=false;}
 }
 async function approveButton():Promise<void> {
  if(busy.current)return;busy.current=true;
  try{
   const asked:OnboardingChatEntry[]=[...chat,{role:'user',text:'Approve plan',at:now()}];setChat(asked);
   const reply=await approve('button');const finished=[...asked,{role:'gwira' as const,text:cap(reply),at:now()}];setChat(finished);setWorking('');
   await persist(planRef.current?.status==='approved'?{...state,act:'result'}:state,finished,startedAt);
  }finally{busy.current=false;}
 }
 async function retryPlan():Promise<void> {if(busy.current)return;busy.current=true;try{await createPlan(state,startedAt??now(),chat);}finally{busy.current=false;}}
 async function finish(deferred:boolean):Promise<void> {
  if(busy.current)return;busy.current=true;setMenu(false);
  try{const snapshot=await host.command({type:'complete_setup',deferred});if(snapshot?.route?.type==='MeetGwira')setNotice('Setup could not be finished right now. Your conversation is kept. Try again.');}finally{busy.current=false;}
 }
 async function startOver():Promise<void> {
  if(busy.current||planRef.current)return;busy.current=true;setMenu(false);
  try{setState(initialMeetState);setStartedAt(undefined);setChat([]);setInput('');await persist(initialMeetState,[],undefined);}finally{busy.current=false;}
 }
 function closeMenu():void {setMenu(false);menuButton.current?.focus();}

 const opening=state.act==='opening';
 const decision=useMemo(()=>decide(state.goal,state.answers,state.asked-1),[state.goal,state.answers,state.asked]);
 const messages=useMemo(()=>buildFirstRunMessages({state,startedAt,chat,plan,planFailed,planPending:working==='plan',narrow}),[state,startedAt,chat,plan,planFailed,working,narrow]);
 const approved=plan?.status==='approved';const planStage=!opening&&state.act!=='clarifying';
 const status=working==='plan'?'Preparing your plan…':working==='edit'?'Saving your change…':working==='approve'?'Recording your approval…':'';
 const labelId='first-run-status';

 const header=<header className="topbar first-run-bar"><span className="first-run-title">Getting started</span>
  <div className="first-run-menu"><button type="button" ref={menuButton} className="first-run-menu__button" aria-label="Setup options" aria-haspopup="menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)} onKeyDown={e=>{if(e.key==='Escape')closeMenu()}}><Icon name="more"/></button>
   {menu&&<div className="first-run-menu__list" role="menu" aria-label="Setup options" onKeyDown={e=>{if(e.key==='Escape')closeMenu()}}>
    <button type="button" role="menuitem" autoFocus onClick={()=>void finish(true)}>Skip for now</button>
    <button type="button" role="menuitem" disabled={!!plan} title={plan?'A plan is already saved. Change it in the conversation instead.':undefined} onClick={()=>void startOver()}>Start over</button>
    <button type="button" role="menuitem" onClick={()=>{setMenu(false);host.signOut();}}>Sign out</button>
   </div>}</div></header>;

 if(!loaded)return <div className="first-run-home">{header}<div className="content first-run-content">{loadFailed?<div className="first-run-state" role="alert"><h1>We couldn’t load your setup</h1><p>Your saved progress is safe. Check your connection and try again.</p><button type="button" onClick={()=>void load()}>Try again</button></div>:<p className="first-run-state" role="status">Opening your conversation…</p>}</div></div>;

 return <div className="first-run-home">{header}
  <div className="content first-run-content">
   {opening?<div className="meet-gwira meet-gwira--embedded is-opening" aria-label="Meet Gwira"><div className="meet-gwira__layout"><section className="meet-gwira__conversation" aria-label="Conversation">
    <OpeningWelcome/>
    <MessageComposer variant="onboarding" className="meet-gwira__composer" aria-label="Message composer"><label htmlFor="first-run-goal" className="meet-gwira__sr">What would you like help with?</label>
     <div className="meet-gwira__field">{!input&&<TypewriterHint phrases={hintPhrases} paused={focused}/>}<ComposerInput autoGrow id="first-run-goal" ref={composer} value={input} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void submit()}}} placeholder="" rows={3}/></div>
     <div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><div className="composer-actions"><ComposerSendButton disabled={!input.trim()} onClick={()=>void submit()}/></div></div></MessageComposer>
    <IdeaGrid input={input} more={more} onMore={()=>setMore(true)} onPick={p=>{setInput(p);composer.current?.focus()}}/>
   </section></div></div>
   :<div className="first-run-conversation"><Transcript messages={messages} isRunning={false}/><div ref={end}/></div>}
  </div>
  {!opening&&<div className="first-run-dock">
   {state.act==='clarifying'&&<section className="suggestions" aria-label="Quick replies">{decision.options.map(text=><QuickPrompt key={text} disabled={!!working} onClick={()=>void submit(text)}>{text}</QuickPrompt>)}<QuickPrompt disabled={!!working} onClick={()=>void submit('I’m not sure')}>I’m not sure</QuickPrompt><QuickPrompt disabled={!!working} onClick={()=>void submit('Skip')}>Skip</QuickPrompt></section>}
   {planStage&&<div className="first-run-actions" role="group" aria-label="Plan actions">
    {planFailed&&<button type="button" className="is-primary" disabled={!!working} onClick={()=>void retryPlan()}>Try again</button>}
    {plan&&<button type="button" onClick={()=>openPlan(plan)}><Icon name="file"/>Open plan</button>}
    {plan&&!approved&&<button type="button" className="is-primary" disabled={!!working} onClick={()=>void approveButton()}>Approve plan</button>}
    {plan&&approved&&<span className="first-run-approved" role="status">Approved · version {plan.version}</span>}
    {approved&&<button type="button" className="is-primary" disabled={!!working} onClick={()=>void finish(false)}>Continue to your workspace</button>}
   </div>}
   <MessageComposer aria-label="Message composer" aria-busy={!!working} aria-describedby={labelId}>
    <ComposerInput autoGrow value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void submit()}}} aria-label="Message Gwira" placeholder={state.act==='clarifying'?'Reply to Gwira':'Ask for a change, or say you approve the plan'} rows={1}/>
    <div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><div className="composer-actions"><ComposerSendButton disabled={!input.trim()||!!working} onClick={()=>void submit()}/></div></div>
    <p id={labelId} className="conversation-submit" role="status">{status}</p>
    {(notice||saveFailed)&&<p className="composer-notice" role="alert">{notice||'Progress not saved. Check your connection.'}</p>}
   </MessageComposer>
  </div>}
  {opening&&(notice||saveFailed)&&<p className="composer-notice" role="alert">{notice||'Progress not saved. Check your connection.'}</p>}
 </div>;
}
