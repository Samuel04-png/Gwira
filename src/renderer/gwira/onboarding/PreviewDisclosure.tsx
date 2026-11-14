import React,{useEffect,useId,useRef,useState} from 'react';

/** Small secondary disclosure that explains the preview honestly. Opens on hover, focus or click; Esc closes. */
export function PreviewDisclosure({saved}:{saved:boolean}):React.ReactElement {
 const id=useId();const [pinned,setPinned]=useState(false);const [hover,setHover]=useState(false);const [focus,setFocus]=useState(false);const root=useRef<HTMLSpanElement>(null);
 const open=pinned||hover||focus;
 useEffect(()=>{if(!pinned)return;const away=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setPinned(false)};document.addEventListener('pointerdown',away);return()=>document.removeEventListener('pointerdown',away)},[pinned]);
 return <span className="meet-gwira__preview" ref={root} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
  <button type="button" className="meet-gwira__preview-button" aria-expanded={open} aria-controls={id} aria-describedby={open?id:undefined} onClick={()=>setPinned(value=>!value)} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)} onKeyDown={event=>{if(event.key==='Escape'){setPinned(false);setHover(false);setFocus(false);event.stopPropagation()}}}>Rules-based guidance</button>
  <span id={id} role="tooltip" className="meet-gwira__tooltip" hidden={!open}>Suggestions use predefined rules, not a live AI model. No external actions run during setup.{saved?' Your progress is saved to your workspace.':' Progress lasts for this visit.'}</span>
 </span>;
}
