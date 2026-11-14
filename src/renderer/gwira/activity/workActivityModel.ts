import type { Assignee, GwiraLocalState, Task } from '../domain/types.js';
export type ActivityMeasure = 'activity' | 'completed' | 'outcomes';
export interface ActivityScope { organizationId: string; workspaceId: string; subject?: Assignee; from: string; to: string; timeZone: string }
export interface WorkContribution {
  id: string; date: string; at: string; kind: 'update' | 'completion' | 'approval' | 'execution';
  label: string; taskId: string; projectId?: string; projectName?: string; subject?: Assignee;
  run?: { id: string; status: string; durationMs?: number; conversationId?: string };
}
export interface ActivityDay { date: string; activity: number; completed: number; outcomes: null; executions: number; succeeded: number; failed: number; contributions: WorkContribution[] }
export interface WorkActivitySummary { organizationId: string; workspaceId: string; subject?: Assignee; timeZone: string; from: string; to: string; authorized: boolean; partial: boolean; days: ActivityDay[]; contributions: WorkContribution[]; undatedCompleted: number; recordedRuns: number; successfulRuns: number; failedRuns: number; averageDurationMs?: number; lastActiveAt?: string }
const DAY_MS=86_400_000;
export function dateInZone(at: string, timeZone: string): string | undefined {
  const date=new Date(at);if(!Number.isFinite(date.getTime()))return undefined;
  try { const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(k=>p.find(v=>v.type===k)?.value).join('-'); } catch {return undefined;}
}
export function shiftActivityDay(day: string, by: number): string {return new Date(Date.parse(`${day}T12:00:00Z`)+by*DAY_MS).toISOString().slice(0,10);}
export function activityDateRange(to: string, days: number): {from:string;to:string} {return {from:shiftActivityDay(to,1-days),to};}
export function workDurationLabel(ms?:number):string {if(ms===undefined||!Number.isFinite(ms)||ms<0)return 'Not recorded';const seconds=ms/1000;return seconds<60?`${seconds.toFixed(1)} s`:seconds<3600?`${(seconds/60).toFixed(1)} min`:seconds<86400?`${(seconds/3600).toFixed(1)} h`:`${(seconds/86400).toFixed(1)} d`;}
export function activityLevel(count: number): 0|1|2|3|4 {return count===0?0:count===1?1:count<=3?2:count<=6?3:4;}
export function scopedWorkState(state:GwiraLocalState):GwiraLocalState {
  const valid=state.workspace.organizationId===state.organization.id,workspaceId=state.workspace.id;
  const tasks=valid?state.tasks.filter(t=>t.workspaceId===workspaceId):[],ids=new Set(tasks.map(t=>t.id));
  return {...state,tasks,people:valid?state.people.filter(p=>p.workspaceId===workspaceId):[],agents:valid?state.agents.filter(a=>a.workspaceId===workspaceId):[],doats:valid?state.doats.filter(d=>d.workspaceId===workspaceId):[],projects:valid?state.projects.filter(p=>p.workspaceId===workspaceId):[],comments:state.comments.filter(c=>ids.has(c.taskId)),approvals:state.approvals.filter(a=>ids.has(a.taskId)),activity:valid?state.activity.filter(e=>e.workspaceId===workspaceId&&(!e.taskId||ids.has(e.taskId))):[]};
}
const same=(a:Assignee|undefined,b:Assignee):boolean=>a?.kind===b.kind&&a.id===b.id;
/** One pass over the authorized workspace. This projection never stores new business records. */
export function aggregateWorkActivity(input:GwiraLocalState,scope:ActivityScope):WorkActivitySummary {
  const state=scopedWorkState(input),authorized=scope.organizationId===state.organization.id&&scope.workspaceId===state.workspace.id&&state.workspace.organizationId===scope.organizationId&&(!scope.subject||(scope.subject.kind==='person'?state.people:state.agents.concat(state.doats.map(d=>({id:d.id,workspaceId:d.workspaceId,name:d.identity.name,type:'coding' as const,createdAt:d.createdAt})))).some(s=>s.id===scope.subject!.id));
  const result:WorkActivitySummary={...scope,authorized,partial:true,days:[],contributions:[],undatedCompleted:0,recordedRuns:0,successfulRuns:0,failedRuns:0};
  // Bound custom ranges to a year and reject malformed dates/timezones rather than shifting them silently.
  if(!authorized||!/^\d{4}-\d{2}-\d{2}$/.test(scope.from)||!/^\d{4}-\d{2}-\d{2}$/.test(scope.to)||scope.from>scope.to||(!dateInZone(`${scope.from}T12:00:00Z`,scope.timeZone)||!dateInZone(`${scope.to}T12:00:00Z`,scope.timeZone)))return result;
  if(new Date(`${scope.from}T12:00:00Z`).toISOString().slice(0,10)!==scope.from||new Date(`${scope.to}T12:00:00Z`).toISOString().slice(0,10)!==scope.to)return result;
  const distance=Math.round((Date.parse(scope.to)-Date.parse(scope.from))/DAY_MS);if(!Number.isFinite(distance)||distance>366||distance<0)return result;
  const days=new Map<string,ActivityDay>();for(let i=0;i<=distance;i++){const date=shiftActivityDay(scope.from,i);days.set(date,{date,activity:0,completed:0,outcomes:null,executions:0,succeeded:0,failed:0,contributions:[]});}
  const tasks=new Map(state.tasks.map(t=>[t.id,t])),seen=new Set<string>(),completedTasks=new Set<string>(),runs=new Map<string,WorkContribution>();
  const project=(task:Task):string|undefined=>state.projects.some(p=>p.id===task.projectId)?task.projectId:undefined;
  const add=(entry:WorkContribution,key:string):void=>{if(seen.has(key)||(scope.subject&&!same(entry.subject,scope.subject)))return;seen.add(key);if(entry.projectId)entry.projectName=state.projects.find(p=>p.id===entry.projectId)?.name;if(days.has(entry.date))days.get(entry.date)!.contributions.push(entry);};
  for(const event of state.activity){
    const task=event.taskId?tasks.get(event.taskId):undefined;if(!task)continue;
    const date=dateInZone(event.occurredAt,scope.timeZone);if(!date)continue;
    // Completed work needs a retained explicit done transition. updatedAt is not a completion date.
    if(event.kind==='task_status_changed'&&event.summary.endsWith(' to done')&&task.status==='done'){
      if(completedTasks.has(task.id))continue;completedTasks.add(task.id);
      add({id:`completed:${task.id}`,date,at:event.occurredAt,kind:'completion',label:task.title,taskId:task.id,projectId:project(task),subject:task.assignee},`completed:${task.id}`);
    }else if(event.kind==='task_created'||event.kind==='task_updated'||event.kind==='task_status_changed'||event.kind==='comment_added'){
      // Legacy updates have no actor. Do not credit today's assignee with an unknown person's past edits.
      if(scope.subject&&!event.actor)continue;
      add({id:event.id,date,at:event.occurredAt,kind:'update',label:event.summary,taskId:task.id,projectId:project(task),subject:event.actor},`update:${task.id}:${date}:${event.actor?.kind??'unknown'}:${event.actor?.id??'unknown'}`);
    }
  }
  for(const approval of state.approvals){
    const task=tasks.get(approval.taskId),at=approval.decidedAt;if(!task||approval.status==='pending'||!at)continue;
    const date=dateInZone(at,scope.timeZone);if(!date)continue;
    add({id:`approval:${approval.id}`,date,at,kind:'approval',label:`${approval.status==='approved'?'Approved':'Requested changes'} · ${task.title}`,taskId:task.id,projectId:project(task),subject:approval.decidedBy},`approval:${approval.id}`);
  }
  for(const task of state.tasks){
    if(task.status==='done'&&!completedTasks.has(task.id)&&(!scope.subject||same(task.assignee,scope.subject)))result.undatedCompleted++;
    const run=task.agentRun;if(!run||runs.has(run.sessionId)||task.assignee?.kind!=='agent')continue;
    const date=dateInZone(run.startedAt,scope.timeZone);if(!date)continue;
    const duration=run.completedAt?Date.parse(run.completedAt)-Date.parse(run.startedAt):NaN;
    const entry:WorkContribution={id:`run:${run.sessionId}`,date,at:run.startedAt,kind:'execution',label:task.title,taskId:task.id,projectId:project(task),subject:task.assignee,run:{id:run.sessionId,status:run.status,...(Number.isFinite(duration)&&duration>=0?{durationMs:duration}:{}),conversationId:run.codexConversationId}};
    runs.set(run.sessionId,entry);add(entry,entry.id);
  }
  const durations:number[]=[];
  for(const day of days.values()){
    day.activity=day.contributions.length;day.completed=day.contributions.filter(c=>c.kind==='completion').length;
    const executions=day.contributions.filter(c=>c.kind==='execution');day.executions=executions.length;day.succeeded=executions.filter(c=>c.run?.status==='completed').length;day.failed=executions.filter(c=>c.run?.status==='error').length;
    executions.forEach(c=>{if(c.run?.durationMs!==undefined)durations.push(c.run.durationMs);});
    day.contributions.sort((a,b)=>b.at.localeCompare(a.at));result.contributions.push(...day.contributions);
  }
  result.days=[...days.values()];result.recordedRuns=result.days.reduce((n,d)=>n+d.executions,0);result.successfulRuns=result.days.reduce((n,d)=>n+d.succeeded,0);result.failedRuns=result.days.reduce((n,d)=>n+d.failed,0);
  if(durations.length)result.averageDurationMs=durations.reduce((a,b)=>a+b,0)/durations.length;
  result.contributions.sort((a,b)=>b.at.localeCompare(a.at));result.lastActiveAt=result.contributions[0]?.at;return result;
}
export function taskNeedsAttention(task:Task,state:GwiraLocalState,today:string):boolean {return state.approvals.some(a=>a.taskId===task.id&&a.status==='pending')||(task.status!=='done'&&(task.status==='blocked'||task.agentRun?.status==='error'||task.agentRun?.status==='stopped'||!!task.dueDate&&task.dueDate.slice(0,10)<today));}
