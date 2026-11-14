import {describe,expect,it} from 'vitest';
import {createEmptyLocalState,type GwiraLocalState,type Task} from '../../src/renderer/gwira/domain/types.js';
import {activityDateRange,activityLevel,workDurationLabel,aggregateWorkActivity,dateInZone,scopedWorkState,taskNeedsAttention} from '../../src/renderer/gwira/activity/workActivityModel.js';
function fixture():GwiraLocalState {
 const s=createEmptyLocalState({organizationId:'org',workspaceId:'ws'},'2026-01-01T00:00:00Z');
 s.people=[{id:'p',workspaceId:'ws',name:'Person',role:'Reviewer',createdAt:s.workspace.createdAt}];s.agents=[{id:'a',workspaceId:'ws',name:'Agent',type:'coding',createdAt:s.workspace.createdAt}];
 s.projects=[{id:'project',workspaceId:'ws',name:'Project',createdAt:s.workspace.createdAt}];
 s.tasks=[{id:'task',workspaceId:'ws',projectId:'project',title:'Task',status:'done',priority:'medium',assignee:{kind:'person',id:'p'},createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-30T23:30:00Z'}];
 s.activity=[{id:'done',workspaceId:'ws',kind:'task_status_changed',taskId:'task',actor:{kind:'person',id:'p'},summary:'Moved task Task to done',occurredAt:'2026-10-30T23:30:00Z'}];return s;
}
const scope={organizationId:'org',workspaceId:'ws',from:'2026-10-01',to:'2026-11-01',timeZone:'Africa/Lusaka'};
describe('shared Work Activity aggregation',()=>{
 it('formats recorded duration without claiming a value for missing data',()=>{expect(workDurationLabel()).toBe('Not recorded');expect(workDurationLabel(-1)).toBe('Not recorded');expect(workDurationLabel(86400000)).toBe('1.0 d');expect(workDurationLabel(180000)).toBe('3.0 min');});
 it('uses an explicit timezone at midnight and across DST, not timestamp slicing',()=>{
  expect(dateInZone('2026-10-30T23:30:00Z','Africa/Lusaka')).toBe('2026-10-31');
  expect(dateInZone('2026-11-01T06:30:00Z','America/New_York')).toBe('2026-11-01');
  expect(dateInZone('bad','UTC')).toBeUndefined();expect(dateInZone('2026-01-01','invalid/zone')).toBeUndefined();
  expect(activityDateRange('2024-03-01',3)).toEqual({from:'2024-02-28',to:'2024-03-01'});
 });
 it('counts a completion once from explicit retained evidence and preserves task identity',()=>{
  const s=fixture();s.activity.push({...s.activity[0],id:'retry'});
  const summary=aggregateWorkActivity(s,scope),day=summary.days.find(d=>d.date==='2026-10-31')!;
  expect(day.completed).toBe(1);expect(day.activity).toBe(1);expect(day.contributions[0].taskId).toBe('task');expect(summary.undatedCompleted).toBe(0);
 });
 it('does not turn edited timestamps or unverified run success into completed tasks',()=>{
  const s=fixture();s.activity=[];s.tasks[0].assignee={kind:'agent',id:'a'};s.tasks[0].status='in_review';s.tasks[0].agentRun={sessionId:'run',status:'completed',startedAt:'2026-10-30T00:00:00Z',completedAt:'2026-10-30T00:01:00Z'};
  const a=aggregateWorkActivity(s,scope);expect(a.successfulRuns).toBe(1);expect(a.days.reduce((n,d)=>n+d.completed,0)).toBe(0);expect(a.averageDurationMs).toBe(60000);
  s.tasks[0].status='done';expect(aggregateWorkActivity(s,scope).undatedCompleted).toBe(1);
 });
 it('collapses repeated task edits and status churn on one day',()=>{
  const s=fixture();s.activity=Array.from({length:80},(_,i)=>({id:`edit-${i}`,workspaceId:'ws',kind:'task_updated',taskId:'task',occurredAt:'2026-10-30T12:00:00Z',actor:{kind:'person',id:'p'},summary:'Updated Task'}));
  expect(aggregateWorkActivity(s,scope).contributions).toHaveLength(1);
 });
 it('keeps human actor activity separate from current assignment',()=>{
  const s=fixture();s.tasks[0].assignee={kind:'agent',id:'a'};s.activity=[{...s.activity[0],kind:'task_updated',summary:'Updated Task'}];
  expect(aggregateWorkActivity(s,{...scope,subject:{kind:'person',id:'p'}}).contributions).toHaveLength(1);
  expect(aggregateWorkActivity(s,{...scope,subject:{kind:'agent',id:'a'}}).contributions).toHaveLength(0);
 });
 it('does not credit unknown edit actors to the current assignee',()=>{
  const s=fixture();s.activity=[{...s.activity[0],kind:'task_updated',summary:'Updated Task',actor:undefined}];
  expect(aggregateWorkActivity(s,{...scope,subject:{kind:'person',id:'p'}}).contributions).toHaveLength(0);
  expect(aggregateWorkActivity(s,scope).contributions).toHaveLength(1);
 });
 it('counts approvals from decision records once and attributes to the recorded reviewer',()=>{
  const s=fixture();s.activity=[];s.approvals=[{id:'approval',taskId:'task',resultId:'result',requestedBy:{kind:'agent',id:'a'},status:'approved',createdAt:'2026-10-29T12:00:00Z',decidedAt:'2026-10-30T12:00:00Z',decidedBy:{kind:'person',id:'p'}}];
  const r=aggregateWorkActivity(s,{...scope,subject:{kind:'person',id:'p'}});expect(r.contributions[0].kind).toBe('approval');expect(r.days.every(d=>d.outcomes===null)).toBe(true);
 });
 it('deduplicates a shared run identifier and omits unknown duration',()=>{
  const s=fixture();s.activity=[];s.tasks[0].assignee={kind:'agent',id:'a'};s.tasks[0].agentRun={sessionId:'same',status:'running',startedAt:'2026-10-30T12:00:00Z'};s.tasks.push({...s.tasks[0],id:'other'});
  const r=aggregateWorkActivity(s,scope);expect(r.recordedRuns).toBe(1);expect(r.averageDurationMs).toBeUndefined();expect(r.failedRuns).toBe(0);
 });
 it('rejects foreign organizations, workspaces and subjects',()=>{
  const s=fixture();for(const patch of [{organizationId:'foreign'},{workspaceId:'foreign'},{subject:{kind:'person' as const,id:'foreign'}}]){const r=aggregateWorkActivity(s,{...scope,...patch});expect(r.authorized).toBe(false);expect(r.contributions).toEqual([]);}
  s.workspace.organizationId='different';expect(aggregateWorkActivity(s,scope).authorized).toBe(false);
 });
 it('does not expose records or events from another workspace',()=>{
  const s=fixture();s.tasks.push({...s.tasks[0],id:'private',workspaceId:'other',title:'Private title'});s.activity.push({...s.activity[0],id:'leak',taskId:'private',summary:'Private title'});s.people.push({...s.people[0],id:'foreign',workspaceId:'other'});
  expect(scopedWorkState(s).tasks).toHaveLength(1);expect(JSON.stringify(aggregateWorkActivity(s,scope))).not.toContain('Private title');expect(scopedWorkState(s).people).toHaveLength(1);
 });
 it('bounds ranges and rejects invalid/custom ranges without generating fake cells',()=>{
  for(const patch of [{from:'bad'},{to:'2026-99-99'},{from:'2026-02-31'},{from:'2026-12-01'},{from:'2020-01-01'},{timeZone:'bad/zone'}])expect(aggregateWorkActivity(fixture(),{...scope,...patch}).days).toHaveLength(0);
  expect(aggregateWorkActivity(fixture(),{...scope,from:'2026-10-30',to:'2026-10-30'}).days).toHaveLength(1);
 });
 it('retains pending review attention even when a task is already marked done',()=>{const s=fixture();s.approvals=[{id:'pending',taskId:'task',resultId:'result',requestedBy:{kind:'agent',id:'a'},status:'pending',createdAt:'2026-10-30T12:00:00Z'}];expect(taskNeedsAttention(s.tasks[0],s,'2026-10-30')).toBe(true);});
 it('distinguishes attention from done work and treats undated tasks honestly',()=>{
  const s=fixture(),task={...s.tasks[0],status:'todo' as const,dueDate:'2026-10-29'};
  expect(taskNeedsAttention(task,s,'2026-10-30')).toBe(true);expect(taskNeedsAttention({...task,status:'done'},s,'2026-10-30')).toBe(false);
  expect(taskNeedsAttention({...task,dueDate:undefined},s,'2026-10-30')).toBe(false);
  expect([0,1,2,4,7].map(activityLevel)).toEqual([0,1,2,3,4]);
 });
});
