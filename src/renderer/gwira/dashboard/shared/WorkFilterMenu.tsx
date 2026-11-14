import React,{useEffect,useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from '../../../components/Icon.js';
import {ALL,WORK_FILTER_KEYS,activeFilterCount,type FilterOptions,type WorkFilters,type WorkFilterKey} from '../../workfilters/workFilters.js';
/** One filter UI over the existing shared status/owner/project contract. */
export function WorkFilterMenu({filters,options,onChange,onClear,open,onOpenChange,extra,extraCount=0}:{extra?:React.ReactNode;extraCount?:number;filters:WorkFilters;options:FilterOptions;onChange:(key:WorkFilterKey,value:string)=>void;onClear:()=>void;open:boolean;onOpenChange:(open:boolean)=>void}):React.ReactElement {
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [position,setPosition]=React.useState({top:0,left:0});
 const count=activeFilterCount(filters)+extraCount;
 const close=(restore=true)=>{onOpenChange(false);if(restore)trigger.current?.focus();};
 useLayoutEffect(()=>{if(!open||!trigger.current||!panel.current)return;const a=trigger.current.getBoundingClientRect(),b=panel.current.getBoundingClientRect(),gap=parseFloat(getComputedStyle(panel.current).getPropertyValue('--gw-space-2'));setPosition({left:Math.max(gap,Math.min(a.left,innerWidth-b.width-gap)),top:Math.max(gap,Math.min(a.bottom+gap,innerHeight-b.height-gap))});panel.current.querySelector('select')?.focus();},[open]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close(false);};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}};const resize=()=>close(false);document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);window.addEventListener('resize',resize);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',resize);};},[open]);
 return <><button ref={trigger} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={()=>onOpenChange(!open)}><Icon name="filter"/>Filter{count?<span className="gw-work-toolbar__badge">{count}</span>:null}</button>{open?createPortal(<div ref={panel} role="dialog" aria-label="Filter work" className="gw-work-filter-menu gw-sidebar-overlay" style={position}>
 {WORK_FILTER_KEYS.map(key=>{const choices=key==='status'?options.statuses:key==='owner'?options.owners:options.projects;return <label key={key}>{key==='owner'?'Assignee':key==='status'?'Status':'Project'}<select aria-label={`Filter by ${key}`} value={filters[key]} onChange={event=>onChange(key,event.target.value)}><option value={ALL}>All {key==='status'?'statuses':key==='owner'?'assignees':'projects'}</option>{filters[key]!==ALL&&!choices.some(item=>item.id===filters[key])?<option value={filters[key]}>Unavailable selection</option>:null}{choices.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;})}
 {extra}
 <div><button type="button" disabled={!count} onClick={onClear}>Clear filters</button><button type="button" onClick={()=>close()}>Done</button></div>
 </div>,document.body):null}</>;
}
