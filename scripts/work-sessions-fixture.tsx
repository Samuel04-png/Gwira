import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkSessions} from '../src/renderer/workSessions/WorkSessions.js';
import {projectWorkSessions,restoreWorkPreferences,type WorkSessionView} from '../src/renderer/workSessions/model.js';
import {createEmptyLocalState,type Task} from '../src/renderer/gwira/domain/types.js';
const at=new Date().toISOString();
let setRows:(rows:WorkSessionView[])=>void;
let original:WorkSessionView[];
export function changeFixture(mode:'empty'|'completed'|'overflow'):void{if(mode==='empty')setRows([]);else if(mode==='completed')setRows(original.map(r=>r.id==='task:run-0'?{...r,status:'Run completed',group:'resolved'}:r));else setRows([...original,...Array.from({length:50},(_,i)=>({...original[0],id:`extra-${i}`,title:`Recorded workload ${i} with a deliberately long supervision title for overflow review`}))]);}
export function showWorkFixture():void{
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 const state=createEmptyLocalState({organizationId:'qa',workspaceId:'qa'},at);state.agents=[{id:'agent',workspaceId:'qa',name:'Recorded coding agent',type:'coding',createdAt:at}];state.projects=[{id:'project',workspaceId:'qa',name:'Development review',createdAt:at}];
 state.tasks=Array.from({length:5},(_,i):Task=>({id:`run-${i}`,workspaceId:'qa',title:['Inspect recorded source changes','Review the recorded result','Investigate an interrupted operation','Finish a documentation pass','Stop a requested local operation'][i],description:'A development-only recorded objective. Review the saved work and its actual process outcome.',projectId:'project',assignee:{kind:'agent',id:'agent'},status:'in_progress',priority:'medium',createdAt:at,updatedAt:at,agentRun:{sessionId:`fixture-${i}`,status:['running','completed','error','completed','stopped'][i] as 'running'|'completed'|'error'|'stopped',startedAt:at}}));
 state.approvals=[{id:'approval',taskId:'run-1',resultId:'recorded-result-1',requestedBy:{kind:'agent',id:'agent'},status:'pending',createdAt:at}];
 state.activity=[{id:'event-1',workspaceId:'qa',taskId:'run-0',kind:'agent_run_updated',occurredAt:at,summary:'Local execution started.'},{id:'event-2',workspaceId:'qa',taskId:'run-1',kind:'approval_requested',occurredAt:at,summary:'A result was submitted for review.'}];
 original=projectWorkSessions(state,[{id:'fixture-0',cwd:'/development-only',context:'coding',status:'running',messages:[{id:'step',role:'system',text:'Ran inspect-source\nProcess exited with code 0\nTOKEN=not-for-display',createdAt:at}],model:'fixture',reasoningEffort:'high',permissionMode:'default',webSearch:false,startedAt:at,updatedAt:at}]);
 const node=document.body.appendChild(Object.assign(document.createElement('div'),{id:'work-session-fixture'}));Object.assign(node.style,{position:'fixed',inset:'38px 0 0 324px',zIndex:'1000',pointerEvents:'none'});
 createRoot(node).render(<Fixture/>);
}
function Fixture():React.ReactElement{
 const [rows,updateRows]=useState(original),[pref,updatePref]=useState({...restoreWorkPreferences(null),open:true}),[expanded,setExpanded]=useState(false),[stopping,setStopping]=useState(new Set<string>()),[closed,setClosed]=useState(false);
 setRows=updateRows;
 return <><style>{`#work-session-fixture .work-sessions:not(.is-expanded){position:relative;top:auto;right:auto;bottom:auto;width:100%;height:100%;grid-area:auto;}`}</style><div data-dev-only="true" style={{position:'absolute',top:0,bottom:0,right:0,width:expanded?'100%':pref.width,pointerEvents:'auto'}}>{!closed?<WorkSessions rows={rows} preferences={pref} onPreferences={updatePref} expanded={expanded} onClose={()=>{if(expanded)setExpanded(false);else setClosed(true);}} onExpand={()=>setExpanded(true)} onChat={()=>{}} onConversation={()=>{}} canOpenConversation={()=>false} onReview={()=>{}} onRefresh={async()=>{if((window as unknown as {workRefreshFailure?:boolean}).workRefreshFailure)throw Error('fixture');}} onCancel={async row=>{setStopping(new Set([row.task!.id]));return true;}} stopping={stopping}/>:null}<span style={{position:'absolute',bottom:0,right:0,pointerEvents:'none',fontSize:10}}>Development fixture · isolated</span></div></>;
}
