import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {TaskPriority} from '../domain/types.js';
export interface ListPatch {priority?:TaskPriority;dueDate?:string|null}
export interface ListEditTarget {ids:string[];field:'priority'|'dueDate';left:number;top:number;initial:string;origin:HTMLElement}
/** Small property editor. Existing Dashboard callbacks own validation and local updates. */
export function ListPropertyEditor({target,pending,error,onSubmit,onClose}:{target:ListEditTarget;pending:boolean;error:string;onSubmit:(patch:ListPatch)=>void;onClose:()=>void}):React.ReactElement {
 const panel=useRef<HTMLFormElement>(null),[value,setValue]=useState(target.initial),[position,setPosition]=useState({left:target.left,top:target.top});
 useLayoutEffect(()=>{const element=panel.current;if(!element)return;const box=element.getBoundingClientRect(),gap=parseFloat(getComputedStyle(element).getPropertyValue('--gw-space-2'));setPosition({left:Math.max(gap,Math.min(target.left,innerWidth-box.width-gap)),top:Math.max(gap,Math.min(target.top+gap,innerHeight-box.height-gap))});element.querySelector<HTMLInputElement|HTMLSelectElement>('input,select')?.focus();},[]);
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}};document.addEventListener('keydown',close,true);return()=>document.removeEventListener('keydown',close,true);},[onClose]);
 return createPortal(<form ref={panel} className="gw-work-filter-menu gw-sidebar-overlay gwira-list__editor" role="dialog" aria-label={`Change ${target.field==='priority'?'priority':'due date'}`} style={position} onSubmit={event=>{event.preventDefault();onSubmit(target.field==='priority'?{priority:value as TaskPriority}:{dueDate:value||null});}}>
 <strong>{target.ids.length>1?`${target.ids.length} selected tasks`:'Task property'}</strong><label>{target.field==='priority'?'Priority':'Due date'}{target.field==='priority'?<select aria-label="New priority" value={value} disabled={pending} onChange={event=>setValue(event.target.value)}>{['urgent','high','medium','low'].map(priority=><option key={priority} value={priority}>{priority[0].toUpperCase()+priority.slice(1)}</option>)}</select>:<input type="date" aria-label="New due date" value={value} disabled={pending} onChange={event=>setValue(event.target.value)}/>}</label>
 <small>Updates this local workspace only.</small>{error?<p role="alert">{error}</p>:null}<div><button type="button" onClick={onClose} disabled={pending}>Cancel</button><button type="submit" disabled={pending}>{pending?'Updating…':'Apply'}</button></div>
 </form>,document.body);
}
