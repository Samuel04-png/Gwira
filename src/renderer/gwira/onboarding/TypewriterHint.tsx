import React,{useEffect,useState} from 'react';
import {advanceHint,hintDelay,initialHintState,visibleHint} from './typewriterModel.js';

function usePrefersReducedMotion():boolean {
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
 return reduced;
}
function useDocumentVisible():boolean {
 const [visible,setVisible]=useState(()=>!document.hidden);
 useEffect(()=>{const update=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[]);
 return visible;
}

/**
 * Decorative overlay that types example requests. The real textarea is never changed,
 * and the animation is hidden from assistive technology. It owns its own timer state so
 * ticks never re-render the page.
 */
export function TypewriterHint({phrases,paused}:{phrases:readonly string[];paused:boolean}):React.ReactElement {
 const reduced=usePrefersReducedMotion();const visible=useDocumentVisible();
 const [state,setState]=useState(initialHintState);
 const running=!paused&&!reduced&&visible;
 useEffect(()=>{if(!running)return;const id=window.setTimeout(()=>setState(current=>advanceHint(current,phrases)),hintDelay(state));return()=>window.clearTimeout(id)},[running,state,phrases]);
 const text=visibleHint(state,phrases,!running);
 return <span className={`meet-gwira__hint${running?' is-typing':''}`} aria-hidden="true" data-hint>{text}</span>;
}
