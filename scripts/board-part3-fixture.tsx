import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BoardView} from '../src/renderer/gwira/board/BoardView.js';
import {DashboardPage} from '../src/renderer/gwira/dashboard/DashboardPage.js';
import {createEmptyLocalState,type GwiraLocalState} from '../src/renderer/gwira/domain/types.js';
import {reduceGwira} from '../src/renderer/gwira/domain/reducer.js';
const at='2026-10-30T08:00:00Z';
export function probe(mode='work'){
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 document.querySelector('#board-part3-probe')?.remove();const node=document.body.appendChild(Object.assign(document.createElement('div'),{id:'board-part3-probe',className:'gwira-dashboard--workflow'}));Object.assign(node.style,{position:'fixed',inset:'38px 0 0 64px',zIndex:'2000',background:'var(--gw-surface)'});
 function Probe(){const [state,setState]=useState<GwiraLocalState>(()=>{const s=createEmptyLocalState({organizationId:'qa-o',workspaceId:'qa-w'},at);s.people=[{id:'qa-p',workspaceId:'qa-w',name:'QA planning employee with a long recorded name',role:'Manager',createdAt:at}];s.tasks=[{id:'plan',workspaceId:'qa-w',title:'Plan supplier delivery with a deliberately long title to verify two line truncation and readable metadata',description:'Recorded planning description. No work has been executed.',status:'todo',assignee:{kind:'person',id:'qa-p'},priority:'high',dueDate:'2026-11-05',createdAt:at,updatedAt:at},{id:'review',workspaceId:'qa-w',title:'Approval remains a recorded decision',status:'in_review',assignee:{kind:'person',id:'qa-p'},priority:'medium',createdAt:at,updatedAt:at},{id:'failed',workspaceId:'qa-w',title:'Failed execution cannot be completed by a card move',status:'in_review',assignee:{kind:'person',id:'qa-p'},priority:'low',agentRun:{status:'error',sessionId:'qa-run',startedAt:at,error:'QA recorded failure'},createdAt:at,updatedAt:at}];s.approvals=[{id:'qa-a',taskId:'review',status:'pending',resultId:'qa-r',requestedBy:{kind:'person',id:'qa-p'},createdAt:at}];return s;});
 if(['empty','loading','error','overflow'].includes(mode))return <BoardView records={{tasks:mode==='overflow'?Array.from({length:60},(_,i)=>({id:'overflow-'+i,title:'Recorded stress fixture task '+i,status:'working',ownerKind:'person',ownerName:'QA employee'})):[]}} loading={mode==='loading'} error={mode==='error'?'The QA source is unavailable.':undefined} onSelectTask={()=>{}}/>;
 return <DashboardPage state={state} panelOpen={false} onPanelOpenChange={()=>{}} onStartConversation={async()=>false} onAskAboutRecord={()=>{}} onOpenTask={()=>{}} onCreateTask={()=>''} onUpdateTask={(id,input)=>{if(mode==='reject')throw Error('QA property update rejected');setState(s=>reduceGwira(s,{type:'UPDATE_TASK',taskId:id,...input,at,activityId:'qa-edit'}));}} onTransitionTask={(id,status)=>{if(mode==='reject')throw Error('QA move rejected');setState(s=>reduceGwira(s,{type:'TRANSITION_TASK',taskId:id,status,at,activityId:'qa-move',actor:{kind:'person',id:'qa-p'}}));}}/>;
 }
 localStorage.setItem('gwira.dashboard.view.v1','board');createRoot(node).render(<Probe/>);
}
