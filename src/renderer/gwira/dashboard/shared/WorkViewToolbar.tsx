import React, {useEffect, useRef, useState} from 'react';
import {Icon} from '../../../components/Icon.js';

/** Common toolbar anatomy. Secondary controls move together, retaining their state. */
export function WorkViewToolbar({children, secondary, className='', label='Work controls'}:{children:React.ReactNode;secondary?:React.ReactNode;className?:string;label?:string}):React.ReactElement {
 const root=useRef<HTMLDivElement>(null), more=useRef<HTMLDetailsElement>(null);
 const [compact,setCompact]=useState(false);
 useEffect(()=>{const element=root.current;if(!element)return;const measure=()=>setCompact(element.clientWidth<parseFloat(getComputedStyle(element).getPropertyValue('--gw-dashboard-toolbar-breakpoint')));measure();let frame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);});observer.observe(element);return()=>{cancelAnimationFrame(frame);observer.disconnect();};},[]);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(more.current&&!more.current.contains(event.target as Node))more.current.open=false;};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 return <div ref={root} className={`gw-work-toolbar ${className}`} aria-label={label} onKeyDown={event=>{if(event.key==='Escape'&&more.current?.open){event.preventDefault();event.stopPropagation();more.current.open=false;more.current.querySelector('summary')?.focus();}}}>
  <div className="gw-work-toolbar__primary">{children}</div>
  {secondary?compact?<details ref={more} className="gw-work-toolbar__more"><summary aria-label={`More ${label.toLowerCase()}`}><Icon name="more"/><span>More</span></summary><div className="gw-work-toolbar__options" role="group" aria-label="View options">{secondary}</div></details>:<div className="gw-work-toolbar__secondary">{secondary}</div>:null}
 </div>;
}
