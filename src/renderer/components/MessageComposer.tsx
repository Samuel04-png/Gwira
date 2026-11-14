import React,{forwardRef,useLayoutEffect,useRef} from 'react';
import {Icon} from './Icon.js';
import {composerTextareaHeight} from '../composerTextarea.js';

/** Shared Home composer surface. Domain actions remain owned by each caller. */
export function MessageComposer({variant='home',className='',children,...props}:React.ComponentProps<'section'>&{variant?:'home'|'onboarding'}):React.ReactElement {
 return <section {...props} className={`composer-panel${variant==='onboarding'?' composer-panel--onboarding':''} ${className}`}>{children}</section>;
}
export const ComposerInput=forwardRef<HTMLTextAreaElement,React.ComponentProps<'textarea'>&{autoGrow?:boolean;autoGrowMinHeight?:number}>(function ComposerInput({autoGrow=false,autoGrowMinHeight=64,...props},ref){
 const local=useRef<HTMLTextAreaElement|null>(null);
 useLayoutEffect(()=>{const e=local.current;if(!autoGrow||!e)return;const resize=()=>{e.style.height='0px';const next=composerTextareaHeight({scrollHeight:e.scrollHeight,containerHeight:window.innerHeight,minHeight:autoGrowMinHeight});e.style.height=`${next.height}px`;e.style.overflowY=next.overflowY};resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[autoGrow,autoGrowMinHeight,props.value]);
 return <textarea {...props} ref={e=>{local.current=e;if(typeof ref==='function')ref(e);else if(ref)ref.current=e}}/>;
});
export function ComposerSendButton(props:Omit<React.ComponentProps<'button'>,'children'>):React.ReactElement {return <button type="button" {...props} className={`send ${props.className??''}`} aria-label={props['aria-label']??'Send message'}><Icon name="send"/></button>}
export function QuickPrompt({children,...props}:React.ComponentProps<'button'>):React.ReactElement {return <button type="button" {...props}>{children}</button>}
