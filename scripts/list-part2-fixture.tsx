import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ListView} from '../src/renderer/gwira/list/ListView.js';
import type {WorkGraphRecords} from '../src/renderer/gwira/graph/graphModel.js';
export function probe(mode='edit'){
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 document.querySelector('#list-part2-probe')?.remove();
 const node=document.body.appendChild(Object.assign(document.createElement('div'),{id:'list-part2-probe',className:'gwira-dashboard--workflow'}));Object.assign(node.style,{position:'fixed',inset:'38px 0 0 64px',zIndex:'2000',background:'var(--gw-surface)'});
 function Probe(){const [records,setRecords]=useState<WorkGraphRecords>({tasks:mode==='empty'?[]:[{id:'editable',title:'A long recorded work title used to verify truncation and local editing without sending any instruction or starting any execution',status:'default',priority:'medium',ownerKind:'person',ownerName:'QA employee'},{id:'running',title:'Running work stays read-only',status:'working',ownerKind:'doat',ownerName:'QA Doat',runStatus:'running'}]});return <ListView records={records} loading={mode==='loading'} error={mode==='error'?'QA unavailable source':undefined} onSelectTask={()=>{}} editableTaskIds={new Set(['editable'])} onPatchTasks={(ids,patch)=>{if(mode==='reject')throw Error('QA update rejected');setRecords(current=>({...current,tasks:current.tasks?.map(t=>ids.includes(t.id)?{...t,...patch,dueDate:patch.dueDate===null?undefined:patch.dueDate??t.dueDate}:t)}));}}/>;}
 createRoot(node).render(<Probe/>);
}
