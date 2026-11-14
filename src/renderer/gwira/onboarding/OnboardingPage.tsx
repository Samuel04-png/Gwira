import {AssistantResponse} from '../../components/AssistantResponse.js';
import {MessageComposer,ComposerInput,ComposerSendButton,QuickPrompt} from '../../components/MessageComposer.js';
import {UserMessage} from '../../components/Transcript.js';
import {DoatAvatar} from '../doats/ui/DoatAvatar.js';
import {createProceduralAvatarSpec} from '../doats/ui/avatarModel.js';
import type {LocalOnboardingState} from './onboardingModel.js';
import './meetGwira.css';
import React,{useEffect,useReducer,useRef,useState} from 'react';
import {GwiraLogo} from '../../components/GwiraLogo.js';
import {Icon} from '../../components/Icon.js';
import {IntegrationLogo} from '../integrations/ui/IntegrationLogo.js';
import {TypewriterHint} from './TypewriterHint.js';
import {PreviewDisclosure} from './PreviewDisclosure.js';
import {hintPhrases} from './startingPoints.js';
import {OpeningWelcome,IdeaGrid} from './OpeningParts.js';
import {initialMeetState,meetReducer,decide,propose,brief,type MeetState} from './meetGwiraModel.js';
export interface OnboardingPageProps {state?:LocalOnboardingState;onChange?:(state:LocalOnboardingState)=>void;onBack?:()=>void;onContinue?:()=>void;onFinish?:()=>void;finishLabel?:string;initial?:MeetState;onProgress?:(state:MeetState)=>void;saveFailed?:boolean;busy?:boolean;onComplete?:()=>void;completeLabel?:string;onDefer?:()=>void;onSignOut?:()=>void;completionError?:string;embedded?:boolean}
/** Rules-based conversation; the caller owns persistence and completion. */
export function OnboardingPage({initial,onProgress,saveFailed,busy,onComplete,completeLabel,onDefer,onSignOut,completionError,embedded=false}:OnboardingPageProps):React.ReactElement {
 const [state,dispatch]=useReducer(meetReducer,initial??initialMeetState);const saved=useRef(initial??initialMeetState);
 useEffect(()=>{if(onProgress&&state!==saved.current){saved.current=state;onProgress(state);}},[state,onProgress]);const [input,setInput]=useState('');const [focused,setFocused]=useState(false);const [more,setMore]=useState(false);const sending=useRef(false);const [error,setError]=useState('');const composer=useRef<HTMLTextAreaElement>(null);const summary=useRef<HTMLHeadingElement>(null);
 const opening=state.act==='opening';const proposed=['proposal','review','result'].includes(state.act);const decision=decide(state.goal,state.answers,state.asked-1);const plan=propose(state);
 useEffect(()=>{if(state.act==='clarifying')composer.current?.focus();else if(!opening)summary.current?.focus()},[state.act,opening]);
 useEffect(()=>{sending.current=false},[state]);
 function submit(value=input){if(!value.trim()||busy||sending.current)return;sending.current=true;dispatch({type:'submit',text:value});setInput('');setError('')}
 function pick(prompt:string){setInput(prompt);setError('');composer.current?.focus()}
 function edit(){setInput(state.goal);dispatch({type:'edit'});setError('')}
 function download(){try{const url=URL.createObjectURL(new Blob([brief(state)],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='gwira-first-work-brief.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);dispatch({type:'export'})}catch{setError('The brief could not be downloaded. Your proposal is still here. Try again.')}}
 return <main className={`meet-gwira ${embedded?'is-embedded':''} ${opening?'is-opening':'is-conversation'} ${proposed?'has-proposal':''}`} aria-label="Meet Gwira">
  <div className={embedded?'meet-gwira__inline-actions':'meet-gwira__bar'}><div className="meet-gwira__bar-start">{!embedded&&<><span className="meet-gwira__title">Meet Gwira</span><PreviewDisclosure saved={!!onProgress&&!saveFailed}/></>}{saveFailed&&<span role="alert" className="meet-gwira__alert">Progress not saved. Check your connection. {onProgress&&<button type="button" disabled={busy} onClick={()=>onProgress(state)}>Retry save</button>}</span>}{completionError&&<span role="alert" className="meet-gwira__alert">{completionError}</span>}</div>
   <div className="meet-gwira__bar-actions">{!opening&&<button type="button" className="is-ghost" onClick={()=>{dispatch({type:'reset'});setInput('');setError('')}}>Start over</button>}{onComplete&&state.act==='result'&&<button type="button" className="is-primary" disabled={busy||saveFailed} onClick={onComplete}>{completeLabel??'Continue'}</button>}{onDefer&&<button type="button" className="is-skip" disabled={busy||saveFailed} onClick={onDefer}>Skip for now</button>}{onSignOut&&!embedded&&<button type="button" className="is-ghost" disabled={busy} onClick={onSignOut}>Sign out</button>}</div></div>
  <div className="meet-gwira__layout"><section className="meet-gwira__conversation" aria-label="Conversation">
   {opening?<OpeningWelcome/>:<div className="meet-gwira__transcript"><div className="meet-gwira__user"><UserMessage text={state.goal} compact/><button type="button" onClick={edit}>Edit goal</button></div>{state.answers.map((a,i)=><React.Fragment key={i}><div className="meet-gwira__message"><GwiraLogo size="header"/><AssistantResponse><small>{embedded?'Rules-based guidance':'Gwira'}</small><p>{a.question}</p></AssistantResponse></div><div className="meet-gwira__user"><UserMessage text={a.answer==='Skip'?'Continue with what we know':a.answer} compact/></div></React.Fragment>)}<div className="meet-gwira__message" role="status"><GwiraLogo size="header"/><AssistantResponse><small>{embedded?'Rules-based guidance':'Gwira'}</small><p>{proposed?plan.rationale:decision.question}</p></AssistantResponse></div></div>}
   {!proposed&&<MessageComposer variant="onboarding" className="meet-gwira__composer" aria-label="Message composer"><label htmlFor="meet-goal" className="meet-gwira__sr">{opening?'What would you like help with?':'Your answer'}</label><div className="meet-gwira__field">{opening&&!input&&<TypewriterHint phrases={hintPhrases} paused={focused}/>}<ComposerInput autoGrow id="meet-goal" ref={composer} value={input} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit()}}} placeholder={opening?'':'Add the context that matters…'} rows={3}/></div><div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><div className="composer-actions"><ComposerSendButton disabled={!input.trim()||!!busy} onClick={()=>submit()}/></div></div></MessageComposer>}
   {opening&&<IdeaGrid input={input} more={more} onMore={()=>setMore(true)} onPick={pick}/>}
   {!opening&&!proposed&&<div className="meet-gwira__suggestions" aria-label="Suggested responses">{decision.options.map(text=><QuickPrompt key={text} onClick={()=>embedded?pick(text):submit(text)}>{text}</QuickPrompt>)}<button type="button" onClick={()=>embedded?pick('I’m not sure'):submit('I’m not sure')}>I’m not sure</button><button type="button" onClick={()=>{dispatch({type:'skip'});setInput('')}}>Skip</button></div>}
  </section>
  {proposed&&<aside className="meet-gwira__workspace" aria-label="Suggested workspace"><header><span>Suggested workflow</span><small>Proposal · nothing running</small></header><h2 tabIndex={-1} ref={summary}>{state.act==='result'?'Your brief is ready to continue with':plan.name}</h2><p className="meet-gwira__goal">Your goal: {state.goal}</p>
   <ol className="meet-gwira__nodes">{plan.steps.map(([title,description],i)=><li key={title}><span className="meet-gwira__node-icon"><Icon name={(['file','steps','policies'] as const)[i]}/></span><div><small>STEP {i+1} · PROPOSED</small><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
   <details className="meet-gwira__object"><summary><DoatAvatar spec={createProceduralAvatarSpec(plan.doat)} status="unavailable" size={36} label={`${plan.doat} — proposed, not active`}/> <span className="meet-gwira__worker-name">{plan.doat}<small>{plan.role}</small></span> <small>Proposed</small></summary><p>Suggested responsibility: {plan.name.toLowerCase()}. Capabilities to configure: planning, analysis and drafting. This Doat has not been created or given tool access.</p></details>
   <div className="meet-gwira__approval"><Icon name="policies"/><p>You review the plan before any task is assigned, message is sent, or website is published.</p></div>
   {plan.integrations.map(integration=><details className="meet-gwira__object" key={integration.id}><summary><IntegrationLogo integrationId={integration.id} name={integration.name}/><span>{integration.name}<small>Suggested tool</small></span><small>Unavailable</small></summary><p>{integration.reason} No account is connected. This integration is not available yet.</p></details>)}
   {state.act==='proposal'&&<div className="meet-gwira__actions"><button type="button" onClick={edit}>Edit goal</button><button type="button" className="is-primary" onClick={()=>dispatch({type:'review'})}>Review plan <Icon name="arrow-right"/></button></div>}
   {state.act==='review'&&<section className="meet-gwira__review"><h3>A useful first brief, ready for your review</h3><p>The download includes your goal, your answers, these three steps, a suggested responsibility and the human-review boundary. It creates no tasks, Doats or connections.</p><div className="meet-gwira__actions"><button type="button" onClick={()=>dispatch({type:'back'})}>Back to proposal</button><button type="button" className="is-primary" onClick={download}>Download brief</button></div></section>}
   {state.act==='result'&&<section role="status"><p>{onComplete?'Download requested. Finish setup to save your plan to your workspace.':'Download requested. Keep the Markdown brief to continue planning.'}</p><div className="meet-gwira__actions"><button type="button" onClick={download}>Download again</button><button type="button" onClick={()=>dispatch({type:'back'})}>Return to proposal</button></div></section>}
   {error&&<p role="alert">{error}</p>}
  </aside>}
  </div>
 </main>
}
