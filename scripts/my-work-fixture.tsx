/** Disposable Electron QA profile data. This module is not imported by production code. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createEmptyLocalState,type GwiraLocalState,type TaskStatus} from '../src/renderer/gwira/domain/types.js';
import {saveGwiraLocalState} from '../src/renderer/gwira/data/localStore.js';
import {createInboxSampleWork} from '../src/renderer/gwira/inbox/inboxDevSample.js';
import {WorkActivityPanel,WorkProgressChart} from '../src/renderer/gwira/activity/WorkActivity.js';
import {aggregateWorkActivity,activityDateRange,dateInZone,shiftActivityDay} from '../src/renderer/gwira/activity/workActivityModel.js';
export const qaId=(n:number)=>`70000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
export function myWorkFixture(count=64):GwiraLocalState {
 const now=new Date().toISOString(),today=dateInZone(now,'Africa/Lusaka')!,s=createEmptyLocalState({organizationId:qaId(1),workspaceId:qaId(2)},now,'QA organization','QA workspace · isolated fixture');
 s.people=[{id:qaId(10),workspaceId:s.workspace.id,name:'QA reviewer',role:'Operations',createdAt:now},{id:qaId(11),workspaceId:s.workspace.id,name:'QA employee',role:'Research',createdAt:now}];
 const doat=createInboxSampleWork({organizationId:s.organization.id,workspaceId:s.workspace.id}).doats[0];doat.id=qaId(20);doat.identity.name='QA research worker';s.doats=[doat];s.agents=[{id:doat.id,workspaceId:s.workspace.id,name:doat.identity.name,type:'coding',createdAt:now}];
 s.projects=[{id:qaId(30),workspaceId:s.workspace.id,name:'QA operations',createdAt:now},{id:qaId(31),workspaceId:s.workspace.id,name:'QA launch',createdAt:now}];
 const statuses:TaskStatus[]=['todo','in_progress','done','blocked','in_review','backlog'];
 for(let i=0;i<count;i++){
  const day=shiftActivityDay(today,-(i*5%80)),at=`${day}T10:00:00Z`,status=statuses[i%6],agent=i%3===0;
  const task={id:qaId(100+i),workspaceId:s.workspace.id,projectId:s.projects[i%2].id,title:i===0?'Prepare the quarterly operations review with an exceptionally long title for layout and truncation verification':`QA ${i%2?'customer review':'launch brief'} ${i+1}`,description:'Isolated development record used to verify task management and activity calculations.',status,priority:(['medium','high','low','urgent'] as const)[i%4],assignee:{kind:agent?'agent' as const:'person' as const,id:agent?doat.id:s.people[i%2].id},createdAt:at,updatedAt:at,dueDate:shiftActivityDay(today,(i%7)-3),...(agent?{agentRun:{sessionId:`qa-run-${i}`,status:(i%9===0?'error':i%9===3?'completed':'running') as 'error'|'completed'|'running',startedAt:at,...(i%9===6?{}:{completedAt:`${day}T10:03:00Z`})}}:{})};
  s.tasks.push(task);s.activity.push({id:qaId(300+i),workspaceId:s.workspace.id,taskId:task.id,kind:status==='done'?'task_status_changed':'task_updated',occurredAt:at,actor:{kind:'person',id:s.people[i%2].id},summary:status==='done'?`Moved task ${task.title} to done`:`Updated task ${task.title}`});
  if(i%8===0)s.approvals.push({id:qaId(500+i),taskId:task.id,resultId:`qa-result-${i}`,requestedBy:task.assignee,status:i%16===0?'pending':'approved',createdAt:at,...(i%16?{decidedAt:at,decidedBy:{kind:'person' as const,id:s.people[0].id}}:{})});
 }
 return s;
}
export function seedMyWorkFixture(count=64):void {if(!import.meta.env.DEV)throw Error('Development only');saveGwiraLocalState(localStorage,myWorkFixture(count));}
export function showActivityState(mode:'loading'|'error'|'empty'):void {
 if(!import.meta.env.DEV)throw Error('Development only');document.querySelector('#work-activity-state')?.remove();const host=document.createElement('div');host.id='work-activity-state';host.style.cssText='position:fixed;top:100px;right:24px;width:min(520px,90vw);z-index:200;background:var(--gw-surface)';document.body.append(host);const s=myWorkFixture(0),today=dateInZone(new Date().toISOString(),'Africa/Lusaka')!,summary=aggregateWorkActivity(s,{organizationId:s.organization.id,workspaceId:s.workspace.id,timeZone:'Africa/Lusaka',...activityDateRange(today,84)});createRoot(host).render(<><WorkProgressChart summary={summary} onSelect={()=>{}} loading={mode==='loading'} error={mode==='error'?'QA completion source could not be read.':undefined} onRetry={()=>showActivityState('empty')}/><WorkActivityPanel summary={summary} measure="activity" onMeasure={()=>{}} loading={mode==='loading'} error={mode==='error'?'QA activity source could not be read. Retry to reload retained records.':undefined} onRetry={()=>showActivityState('empty')}/></>);
}
