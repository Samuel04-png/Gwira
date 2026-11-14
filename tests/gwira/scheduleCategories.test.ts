import { describe, expect, it } from 'vitest';
import { categoryRows, scheduleIssues, scheduleLoadMessage } from '../../src/renderer/gwira/schedule/categoryModel.js';
import { createInitialLocalState } from '../../src/renderer/gwira/data/localStore.js';
import type { Schedule, ScheduleSnapshot } from '../../src/shared/schedules.js';
const now = Date.parse('2026-10-31T12:00:00Z');
const state = () => createInitialLocalState('o','w','2026-10-31T12:00:00Z');
const schedule: Schedule = {id:'s',workspaceId:'w',title:'Review',instructions:'Review work',ownerId:'owner',doatId:'doat',status:'registered',version:1,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),nextRun:'2026-10-31T13:00:00.000Z',recurrence:{frequency:'daily',time:'09:00',weekday:1,timeZone:'America/New_York'}};
const snap = (schedules: Schedule[] = [schedule]): ScheduleSnapshot => ({schedules,runs:[],audit:[]});
const options = {now,end:now+7*86400000,search:'',owner:'',doat:'',status:'',sort:'next'};
describe('schedule categories share scoped records', () => {
 it('isolates workspaces and excludes deleted schedules', () => { expect(categoryRows(snap([schedule,{...schedule,id:'other',workspaceId:'other'},{...schedule,id:'deleted',status:'deleted'}]),state(),'all',options)).toHaveLength(1); });
 it('keeps paused records out of enabled and upcoming views', () => { const snapshot=snap([{...schedule,status:'paused',nextRun:undefined}]);expect(categoryRows(snapshot,state(),'active',options)).toEqual([]);expect(categoryRows(snapshot,state(),'upcoming',options)).toEqual([]);expect(categoryRows(snapshot,state(),'paused',options)).toHaveLength(1); });
 it('sorts enabled first, then next trigger with stable identity', () => { const snapshot=snap([{...schedule,id:'p',status:'paused',nextRun:undefined}, {...schedule,id:'later',nextRun:'2026-11-03T14:00:00Z'},schedule]);expect(categoryRows(snapshot,state(),'all',options).map(r=>r.schedule.id)).toEqual(['s','later','p']); });
 it('combines search, owner, Doat and status filters', () => { expect(categoryRows(snap(),state(),'all',{...options,search:'review',owner:'owner',doat:'doat',status:'registered'})).toHaveLength(1);for(const key of ['search','owner','doat','status'] as const)expect(categoryRows(snap(),state(),'all',{...options,[key]:'missing'})).toEqual([]); });
 it('expands multiple occurrences using the engine across DST', () => {const rows=categoryRows(snap(),state(),'upcoming',options);expect(rows.length).toBe(7);expect(rows[0]?.at).toBe('2026-10-31T13:00:00.000Z');expect(rows[1]?.at).toBe('2026-11-01T14:00:00.000Z');expect(schedule.nextRun).toBe('2026-10-31T13:00:00.000Z');});
 it('honors custom start and range end without overdue preview entries', () => { const rows=categoryRows(snap(),state(),'upcoming',{...options,start:Date.parse('2026-11-02T00:00:00Z'),end:Date.parse('2026-11-03T23:59:00Z')});expect(rows.map(r=>r.at)).toEqual(['2026-11-02T14:00:00.000Z','2026-11-03T14:00:00.000Z']); });
 it('resolves review attention when dismissed while retaining history', () => {const snapshot=snap();snapshot.runs.push({id:'run',scheduleId:'s',workspaceId:'w',source:'manual',dueAt:new Date(now).toISOString(),createdAt:new Date(now).toISOString(),status:'awaiting_review',instructions:'Review work',doatId:'doat'});expect(scheduleIssues(schedule,snapshot,state()).some(i=>i.kind==='review')).toBe(true);snapshot.runs[0]!.status='dismissed';expect(scheduleIssues(schedule,snapshot,state()).some(i=>i.kind==='review')).toBe(false);expect(snapshot.runs).toHaveLength(1); });
 it('uses recorded execution failure and clears it after a later completed run', () => {
  const local = state(), snapshot = snap();
  for (const [id,createdAt,status] of [['first','2026-10-30T12:00:00Z','error'],['latest','2026-10-31T12:00:00Z','completed']] as const) {
   snapshot.runs.push({id,scheduleId:'s',workspaceId:'w',source:'manual',dueAt:createdAt,createdAt,status:'dismissed',instructions:'Review',doatId:'doat'});
   local.tasks.push({id,workspaceId:'w',title:'Review',status:'todo',priority:'medium',createdAt,updatedAt:createdAt,agentRun:{sessionId:id,status,startedAt:createdAt}});
  }
  expect(scheduleIssues(schedule,snapshot,local).some(i=>i.kind==='failure')).toBe(false);
  local.tasks.pop();expect(scheduleIssues(schedule,snapshot,local).some(i=>i.kind==='failure')).toBe(true);
 });
 it('uses only approvals correlated to tasks in this workspace', () => {
  const local=state(),snapshot=snap();const at=new Date(now).toISOString();
  snapshot.runs.push({id:'run',scheduleId:'s',workspaceId:'w',source:'manual',dueAt:at,createdAt:at,status:'dismissed',instructions:'Review',doatId:'doat'});
  local.tasks.push({id:'run',workspaceId:'other',title:'Review',status:'todo',priority:'medium',createdAt:at,updatedAt:at});
  local.approvals.push({id:'a',taskId:'run',resultId:'r',status:'pending',createdAt:at,requestedBy:{kind:'person',id:'owner'}});
  expect(scheduleIssues(schedule,snapshot,local).some(i=>i.kind==='approval')).toBe(false);
  local.tasks[0]!.workspaceId='w';expect(scheduleIssues(schedule,snapshot,local).some(i=>i.kind==='approval')).toBe(true);
  local.approvals[0]!.status='approved';expect(scheduleIssues(schedule,snapshot,local).some(i=>i.kind==='approval')).toBe(false);
 });
 it('reports missing configuration without inventing missed runs or failures', () => { expect(scheduleIssues(schedule,snap(),state()).map(i=>i.kind)).toEqual(['configuration']); });
});
describe('actionable schedule load failures', () => {
 it('identifies an outdated preload and a missing main IPC handler', () => {expect(scheduleLoadMessage(new TypeError('Cannot read properties of undefined'))).toContain('Restart Gwira');expect(scheduleLoadMessage(new Error("No handler registered for gwira:schedules:read"))).toContain('Restart Gwira');expect(scheduleLoadMessage('unknown',false)).toContain('Restart Gwira');});
 it('distinguishes a lock from damaged storage without displaying raw data', () => {expect(scheduleLoadMessage(new Error('Schedule storage is locked by another app.'))).toContain('busy');expect(scheduleLoadMessage(new SyntaxError('Unexpected token private content'))).toContain('original file has been preserved');expect(scheduleLoadMessage(new Error('private content'))).not.toContain('private content');});
});
