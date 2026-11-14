import { nextOccurrence, type Schedule, type ScheduleSnapshot } from '../../../shared/schedules.js';
import type { GwiraLocalState } from '../domain/types.js';
export const categories = [
 { id: 'all', label: 'All schedules', icon: 'calendar', description: 'Recurring work, together in one place.' },
 { id: 'upcoming', label: 'Upcoming', icon: 'clock', description: 'Expected review triggers in the selected date range.' },
 { id: 'active', label: 'Active', icon: 'play', description: 'Enabled review triggers. Enabled does not mean executing.' },
 { id: 'attention', label: 'Needs attention', icon: 'warning', description: 'Recorded reviews, approvals, failures and configuration issues.' },
 { id: 'paused', label: 'Paused', icon: 'paused', description: 'Schedules that will not produce new review triggers.' },
] as const;
export type Category = typeof categories[number]['id'];
export type ScheduleIssue = { kind: 'review' | 'approval' | 'failure' | 'configuration'; reason: string; at?: string };
export function scheduleIssues(schedule: Schedule, snapshot: ScheduleSnapshot, state: GwiraLocalState): ScheduleIssue[] {
 const issues: ScheduleIssue[] = [];
 const runs = snapshot.runs.filter(r => r.scheduleId === schedule.id && r.workspaceId === state.workspace.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
 const tasks = state.tasks.filter(t => t.workspaceId === state.workspace.id && runs.some(r => r.id === t.id));
 if (runs.some(r => r.status === 'awaiting_review')) issues.push({kind:'review', reason:'An occurrence is waiting for review.', at:runs.find(r => r.status === 'awaiting_review')!.createdAt});
 const approvals = state.approvals.filter(a => a.status === 'pending' && tasks.some(t => t.id === a.taskId));
 if (approvals.length) issues.push({kind:'approval', reason:`${approvals.length} pending approval${approvals.length === 1 ? '' : 's'} in My Work.`});
 const latest = runs.map(r => tasks.find(t => t.id === r.id)).find(t => t?.agentRun);
 if (latest?.agentRun?.status === 'error') issues.push({kind:'failure',reason:latest.agentRun.error || 'The most recent recorded Doat execution failed.',at:latest.agentRun.completedAt || latest.agentRun.startedAt});
 if (!state.doats.some(d => d.id === schedule.doatId && d.workspaceId === state.workspace.id && !d.archivedAt) || !state.people.some(p => p.id === schedule.ownerId && p.workspaceId === state.workspace.id)) issues.push({kind:'configuration',reason:'The assigned Doat or owner is no longer available.'});
 return issues;
}
export type Occurrence = { schedule: Schedule; at?: string };
export function categoryRows(snapshot: ScheduleSnapshot, state: GwiraLocalState, category: Category, options: { now: number; end: number; start?: number; search: string; owner: string; doat: string; status: string; sort: string }): Occurrence[] {
 const schedules = snapshot.schedules.filter(s => s.workspaceId === state.workspace.id && s.status !== 'deleted' && `${s.title} ${s.instructions}`.toLowerCase().includes(options.search.toLowerCase()) && (!options.owner || s.ownerId === options.owner) && (!options.doat || s.doatId === options.doat) && (!options.status || s.status === options.status));
 const rows: Occurrence[] = [];
 const previews = new Map<string,string[]>();
 for (const schedule of schedules) {
  if (category === 'paused' && schedule.status !== 'paused' || category === 'active' && schedule.status !== 'registered' || category === 'attention' && !scheduleIssues(schedule,snapshot,state).length) continue;
  if (category !== 'upcoming') { rows.push({schedule}); continue; }
  if (schedule.status !== 'registered' || !schedule.nextRun) continue;
  const key = JSON.stringify([schedule.nextRun,schedule.recurrence]);
  let times = previews.get(key);
  if (!times) {
   times = [];
   let at = schedule.nextRun;
   // The interface limits previews to 31 days; identical rules share calculation.
   for (let count = 0; Date.parse(at) <= options.end && count < 32; count++) {
    if (Date.parse(at) >= Math.max(options.now,options.start ?? options.now)) times.push(at);
    at = nextOccurrence(schedule.recurrence,at);
   }
   previews.set(key,times);
  }
  for (const at of times) rows.push({schedule,at});
 }
 return rows.sort((a,b) => category === 'upcoming' ? a.at!.localeCompare(b.at!) || a.schedule.id.localeCompare(b.schedule.id) : options.sort === 'updated' ? b.schedule.updatedAt.localeCompare(a.schedule.updatedAt) : options.sort === 'name' ? a.schedule.title.localeCompare(b.schedule.title) : Number(a.schedule.status === 'paused') - Number(b.schedule.status === 'paused') || (a.schedule.nextRun ?? '~').localeCompare(b.schedule.nextRun ?? '~') || a.schedule.title.localeCompare(b.schedule.title));
}
export function scheduleLoadMessage(error: unknown, bridgeAvailable = true): string {
 const message = error instanceof Error ? error.message : String(error);
 if (!bridgeAvailable || /No handler registered|Cannot read properties of undefined|not a function/.test(message)) return 'The scheduling service is not loaded in this app session. Restart Gwira to load the updated service.';
 if (/locked by another app/.test(message)) return 'Schedule storage is busy in another Gwira instance. Close that instance, then retry.';
 if (/Invalid|JSON|Unexpected token|Duplicate|storage limit/.test(message)) return 'Saved schedules could not be read. The original file has been preserved. Check the local schedule file before retrying.';
 return 'Schedules could not be loaded. Check access to local storage, then retry.';
}
