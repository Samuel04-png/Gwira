import type { CodexSession } from '../../shared/types.js';
import type { GwiraLocalState, Approval, Task } from '../gwira/domain/types.js';
import { parseTraceSteps } from '../activityTraceModel.js';
import { activityKindLabel } from '../gwira/inbox/activityModel.js';

export type WorkGroup = 'waiting' | 'assigned' | 'working' | 'attention' | 'review' | 'resolved';
export const workGroups: {id:WorkGroup;label:string}[] = [{id:'waiting',label:'Waiting on you'},{id:'working',label:'Working'},{id:'assigned',label:'Assigned work'},{id:'review',label:'Review required'},{id:'attention',label:'Needs attention'},{id:'resolved',label:'Resolved'}];
export interface WorkEvent {id:string;title:string;at:string;status:string;detail:string}
export interface WorkSessionView {id:string;title:string;objective?:string;owner:string;workerKind?:'person'|'doat'|'agent'|'unknown';ownerId?:string;project?:string;group:WorkGroup;status:string;startedAt?:string;updatedAt:string;task?:Task;session?:CodexSession;approvals:Approval[];events:WorkEvent[];children:WorkSessionView[]}
export interface WorkPreferences {open:boolean;width:number;workspaceWidth:number;tab:'threads'|'library'|'scheduled';selected?:string;query:string;filter:'all'|WorkGroup;collapsed:WorkGroup[]}
export const workPreferenceKey='gwira.work-sessions.preferences.v1';
export function clampWorkWidth(value:number):number{return Number.isFinite(value)?Math.max(320,Math.min(460,value)):390;}
export function clampWorkspaceWidth(value:number):number{return Number.isFinite(value)?Math.max(260,Math.min(650,Math.round(value))):340;}
export function restoreWorkPreferences(value:string|null):WorkPreferences {
 const base:WorkPreferences={open:false,width:390,workspaceWidth:340,tab:'threads',query:'',filter:'all',collapsed:[]};
 try {const v=JSON.parse(value??'null');if(!v||typeof v!=='object')return base;const legacyWorkspaceWidth=v.width===base.width?base.workspaceWidth:v.width??base.workspaceWidth;return {...base,open:v.open===true,width:clampWorkWidth(v.width),workspaceWidth:clampWorkspaceWidth(v.workspaceWidth??legacyWorkspaceWidth),tab:['threads','library','scheduled'].includes(v.tab)?v.tab:'threads',query:typeof v.query==='string'?v.query:'',filter:['all',...workGroups.map(g=>g.id)].includes(v.filter)?v.filter:'all',collapsed:Array.isArray(v.collapsed)?v.collapsed.filter((g:unknown)=>workGroups.some(x=>x.id===g)):[],selected:typeof v.selected==='string'?v.selected:undefined};}catch{return base;}
}
/** Display projection only; business records, execution state and history stay authoritative. */
export function projectWorkSessions(state:GwiraLocalState,sessions:readonly CodexSession[]):WorkSessionView[] {
 const localTasks=state.tasks.filter(t=>t.workspaceId===state.workspace.id);
 const linked=new Set(state.tasks.flatMap(t=>t.agentRun?[t.agentRun.sessionId]:[]));
 const records:WorkSessionView[]=localTasks.filter(t=>t.agentRun || (t.assignee?.kind==='person' && state.people.some(p=>p.workspaceId===state.workspace.id&&p.id===t.assignee?.id))).map(task=>{
  const run=task.agentRun,session=run?sessions.find(s=>s.id===run.sessionId):undefined;
  const approvals=state.approvals.filter(a=>a.taskId===task.id);
  const pending=approvals.some(a=>a.status==='pending');
  const owner=task.assignee?.kind==='person'?state.people.find(p=>p.workspaceId===state.workspace.id&&p.id===task.assignee?.id)?.name:state.doats.find(d=>d.workspaceId===state.workspace.id&&d.id===task.assignee?.id)?.identity.name??state.agents.find(a=>a.workspaceId===state.workspace.id&&a.id===task.assignee?.id)?.name;
  // No assigned approver identity exists in the current contract. Never claim "you".
  const group:WorkGroup=run?.status==='error'||(!run&&task.status==='blocked')?'attention':run?.status==='running'?'working':pending||(!run&&task.status==='in_review')?'review':run||task.status==='done'?'resolved':'assigned';
  const status=run?.status==='error'?'Run failed':run?.status==='running'?'Running':pending?'Approval needs an assigned reviewer':run?.status==='stopped'?'Stopped':run?'Run completed':`Task ${task.status.replaceAll('_',' ')} · reported`;
  const events=state.activity.filter(e=>e.workspaceId===state.workspace.id&&e.taskId===task.id).map(e=>({id:e.id,title:activityKindLabel(e.kind).replace(/^./,letter=>letter.toUpperCase()),at:e.occurredAt,status:e.kind==='approval_requested'?'Waiting':'Recorded',detail:e.summary}));
  const workerKind = task.assignee?.kind==='person'?'person':state.doats.some(d=>d.workspaceId===state.workspace.id&&d.id===task.assignee?.id)?'doat':task.assignee?'agent':'unknown';
  return {workerKind,ownerId:task.assignee?.id,id:`task:${task.id}`,title:task.title,objective:task.description,task,session,owner:owner??'Owner not recorded',project:state.projects.find(p=>p.workspaceId===state.workspace.id&&p.id===task.projectId)?.name,group,status,startedAt:run?.startedAt,updatedAt:run?.completedAt??session?.updatedAt??task.updatedAt,approvals,events:events.sort(byTime),children:[]};
 });
 for(const session of sessions){
  if(linked.has(session.id)||session.context!=='coding')continue;
  const steps=parseTraceSteps(session.messages.filter(m=>m.role==='system'),session.status==='running');
  if(!steps.some(s=>s.intent!=='output'))continue; // Ordinary chat is not operational work.
  const status=session.status==='running'?'Running':session.status==='error'?'Run failed':session.exitCode===0?'Process completed':'Process idle · outcome unconfirmed';
  records.push({id:`session:${session.id}`,title:session.messages.find(m=>m.role==='user')?.text.split('\n')[0].slice(0,160)||'Coding work',owner:'Local coding agent',workerKind:'agent',group:session.status==='running'?'working':session.status==='error'?'attention':session.exitCode===0?'resolved':'review',status,session,startedAt:session.startedAt,updatedAt:session.updatedAt,approvals:[],events:[],children:[]});
 }
 // parentStepId is a workflow relation, not an execution-parent contract. Do not infer delegation.
 return records.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id));
}
function byTime(a:WorkEvent,b:WorkEvent):number{return Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id);}
export function filterWorkSessions(rows:readonly WorkSessionView[],query:string,filter:WorkPreferences['filter']):WorkSessionView[]{const q=query.trim().toLocaleLowerCase();return rows.filter(r=>(filter==='all'||filter===r.group)&&(!q||[r.title,r.owner,r.project,r.id,r.task?.id,r.session?.id].some(v=>v?.toLocaleLowerCase().includes(q))));}
/** Raw tool payloads are intentionally excluded: their schema has no secret-redaction contract. */
export function recordedSteps(row:WorkSessionView):WorkEvent[]{
 const messages=row.session?.messages.filter(m=>m.role==='system')??[];
 return messages.flatMap(m=>parseTraceSteps([m],row.session?.status==='running'&&m.id===messages.at(-1)?.id).filter(s=>s.intent!=='output').map(s=>({id:s.id,title:s.status==='failed'?'Recorded operation failed':s.label,at:m.createdAt,status:s.status==='done'?'Completed':s.status==='failed'?'Failed':s.status==='running'?'Running':s.status==='waiting'?'Waiting':'Queued',detail:'Recorded local tool activity. Raw command and output are withheld here because this source has no credential-redaction contract.'}))).sort(byTime);
}
