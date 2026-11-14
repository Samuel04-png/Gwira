import React,{useEffect,useRef,useState} from 'react';
import type {AccountSnapshot,OnboardingProgress} from '../../shared/accountAuth.js';
import {GwiraLogo} from '../components/GwiraLogo.js';
import {Icon} from '../components/Icon.js';
import {ComposerInput,ComposerSendButton,MessageComposer} from '../components/MessageComposer.js';
import {TypewriterHint} from '../gwira/onboarding/TypewriterHint.js';
import {hintPhrases,startingPoints} from '../gwira/onboarding/startingPoints.js';
import {initialMeetState,meetReducer} from '../gwira/onboarding/meetGwiraModel.js';
import './authenticatedHome.css';

export function AuthenticatedHome({state,busy,onStart,canStart,commandError,children}:{state:AccountSnapshot;busy:boolean;canStart:boolean;onStart:(progress:OnboardingProgress)=>Promise<void>;commandError?:string;children?:React.ReactNode}):React.ReactElement {
 const [input,setInput]=useState(''),[focused,setFocused]=useState(false);
 const pending=useRef(false),textarea=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{pending.current=false;},[state.onboardingSaveFailed,state.onboardingProgress]);
 async function submit():Promise<void>{
  const text=input.trim();if(!text||text.length>2000||busy||pending.current||!canStart)return;
  pending.current=true;
  try{await onStart(meetReducer(initialMeetState,{type:'submit',text}));}finally{pending.current=false;}
 }
 return <>{children??<section className="authenticated-home__content">
    <div className="authenticated-home__inner"><div className="authenticated-home__welcome"><GwiraLogo size="empty"/><h1>What would you like Gwira to help with?</h1><p>Start with a problem, a project, or an idea.</p></div>
     <MessageComposer aria-label="Message composer" className="authenticated-home__composer">
      <label className="authenticated-home__sr" htmlFor="home-goal">What would you like help with?</label>
      <div className="meet-gwira__field">{!input&&canStart&&<TypewriterHint phrases={hintPhrases} paused={focused}/>}
       <ComposerInput id="home-goal" ref={textarea} autoGrow value={input} maxLength={2000} disabled={!canStart||busy} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}} placeholder={canStart?'':'Starting a new conversation is not available yet.'} rows={3}/>
      </div>
      <div className="composer-footer"><span>{focused&&input?'Enter to send · Shift+Enter for a new line':''}</span><div className="composer-actions"><ComposerSendButton disabled={!canStart||busy||!input.trim()} onClick={()=>void submit()}/></div></div>
     </MessageComposer>
     {state.onboardingSaveFailed&&<p role="alert" className="authenticated-home__error">Your goal could not be saved. Check your connection and try again.</p>}
     {commandError&&<p role="alert" className="authenticated-home__error">{commandError}</p>}
     {!canStart&&<p className="authenticated-home__notice">New conversations are not available in this workspace yet.</p>}
     {canStart&&<section className="authenticated-home__ideas" aria-label="Starting ideas">{startingPoints.map(point=><button key={point.id} type="button" onClick={()=>{setInput(point.prompt);textarea.current?.focus();}}><Icon name={point.icon}/><span><strong>{point.title}</strong><small>{point.description}</small></span></button>)}</section>}
    </div>
   </section>}
 </>;
}
