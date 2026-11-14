import {describe,it,expect} from 'vitest';
import {buildCalendar,calendarDayNumber,parseCalendarDay} from '../../src/renderer/gwira/calendar/calendarModel.js';
import {parseCalendarPrefs,validTimeZone} from '../../src/renderer/gwira/calendar/calendarPreferences.js';
import {NO_FILTERS} from '../../src/renderer/gwira/workfilters/workFilters.js';
const options={view:'week' as const,anchorDay:calendarDayNumber(2026,9,30),filters:NO_FILTERS,timeZone:'UTC'};
describe('Operational Calendar date integrity',()=>{
 it('preserves civil deadlines across zones while placing timestamps on the chosen regional day',()=>{
  expect(parseCalendarDay('2026-10-30','Pacific/Kiritimati')).toBe(parseCalendarDay('2026-10-30','America/Los_Angeles'));
  expect(parseCalendarDay('2026-10-30T00:30:00Z','America/Los_Angeles')).toBe(calendarDayNumber(2026,9,29));
  expect(parseCalendarDay('2026-10-30T23:30:00Z','Pacific/Kiritimati')).toBe(calendarDayNumber(2026,9,31));
 });
 it('keeps cross-midnight recorded execution separate from planning and due dates',()=>{
  const task={id:'a',title:'Run',status:'completed' as const,plannedStart:'2026-10-29',plannedEnd:'2026-10-30',dueDate:'2026-10-30',startedAt:'2026-10-29T23:00:00Z',completedAt:'2026-10-30T01:00:00Z'};
  const model=buildCalendar({tasks:[task]},options);expect(model.events.map(e=>e.kind)).toEqual(['planned','due','actual']);expect(model.events[2].end-model.events[2].start).toBe(1);expect(model.total).toBe(1);expect(task.status).toBe('completed');
 });
 it('projects explicit approval requests and decisions as checkpoints, never deadlines',()=>{
  const model=buildCalendar({tasks:[{id:'a',title:'Review'}],approvals:[{id:'gate',taskId:'a',title:'Review',status:'completed',createdAt:'2026-10-29T10:00:00Z',decidedAt:'2026-10-30T10:00:00Z'}]},options);
  expect(model.events.map(e=>[e.kind,e.label])).toEqual([['approval','Approval requested'],['approval','Approval decision recorded']]);expect(model.unscheduled).toHaveLength(0);
 });
 it('hidden date categories do not turn dated work into unscheduled work',()=>{
  const model=buildCalendar({tasks:[{id:'a',title:'Due',dueDate:'2026-10-30'}]},{...options,categories:[]});expect(model.events).toEqual([]);expect(model.unscheduled).toEqual([]);expect(model.shown).toBe(1);
 });
 it('does not turn a future Doat deadline into a scheduled execution or working state',()=>{
  const model=buildCalendar({tasks:[{id:'d',title:'Future',ownerKind:'doat',ownerName:'QA',status:'default',dueDate:'2027-01-01'}]},options);expect(model.events[0].kind).toBe('due');expect(model.events[0].task.status).toBe('default');expect(model.events[0].task.runStatus).toBeUndefined();
 });
 it('handles DST boundaries using named zones rather than fixed offsets',()=>{
  expect(parseCalendarDay('2026-03-08T06:30:00Z','America/New_York')).toBe(calendarDayNumber(2026,2,8));expect(parseCalendarDay('2026-03-08T07:30:00Z','America/New_York')).toBe(calendarDayNumber(2026,2,8));
 });
 it('repairs timezone and display preferences without restoring deliberately hidden categories',()=>{
  expect(validTimeZone('not/a-zone')).toBe(false);expect(parseCalendarPrefs({timeZone:'bad',categories:[],unscheduledOpen:false}).categories).toEqual([]);expect(parseCalendarPrefs({timeZone:'UTC',view:'week'})).toMatchObject({timeZone:'UTC',view:'week',unscheduledOpen:true});
 });
});
