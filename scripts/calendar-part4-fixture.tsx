import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CalendarView} from '../src/renderer/gwira/calendar/CalendarView.js';
import {calendarDayNumber,calendarDayDate} from '../src/renderer/gwira/calendar/calendarModel.js';
import type {WorkGraphRecords} from '../src/renderer/gwira/graph/graphModel.js';
export function probe(mode='dated'){
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 document.querySelector('#calendar-part4-probe')?.remove();const node=document.body.appendChild(Object.assign(document.createElement('div'),{id:'calendar-part4-probe',className:'gwira-dashboard--workflow'}));Object.assign(node.style,{position:'fixed',inset:'38px 0 0 64px',zIndex:'2000',background:'var(--gw-surface)',display:'flex',flexDirection:'column'});
 const now=new Date(),day=calendarDayNumber(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()),date=(offset=0)=>calendarDayDate(day+offset).toISOString().slice(0,10),at=date()+'T10:00:00Z';
 localStorage.setItem('gwira.calendar.prefs.v1',JSON.stringify({view:'month',timeZone:'UTC',unscheduledOpen:true}));
 function Probe(){const [records,setRecords]=useState<WorkGraphRecords>({tasks:mode==='empty'?[]:[{id:'undated',title:'Undated local planning work',ownerKind:'person',ownerName:'QA employee',status:'default'},{id:'running',title:'Running work cannot be date edited',ownerKind:'doat',ownerName:'QA Doat',status:'working',runStatus:'running'},{id:'all-facts',title:'Plan, due and actual facts remain separate',ownerKind:'doat',ownerName:'QA Doat',status:'completed',plannedStart:date(-1),plannedEnd:date(1),dueDate:date(),startedAt:date(-1)+'T23:30:00Z',completedAt:date()+'T01:00:00Z'},...Array.from({length:mode==='overflow'?60:8},(_,i)=>({id:'due-'+i,title:'Recorded deadline '+i+' with a deliberately long work title for overflow verification',ownerKind:'person' as const,ownerName:'QA employee with a long name',status:'default' as const,dueDate:date()}))],approvals:[{id:'qa-checkpoint',taskId:'all-facts',title:'Approval checkpoint',status:'completed',createdAt:at,decidedAt:date()+'T11:00:00Z'}]});return <CalendarView records={records} loading={mode==='loading'} error={mode==='error'?'The QA source is unavailable.':undefined} editableTaskIds={new Set(['undated'])} onSelectTask={()=>{}} onPatchTasks={(ids,patch)=>{if(mode==='reject')throw Error('QA due-date update rejected');setRecords(current=>({...current,tasks:current.tasks?.map(task=>ids.includes(task.id)?{...task,dueDate:patch.dueDate??undefined}:task)}));}}/>;}
 createRoot(node).render(<Probe/>);
}
