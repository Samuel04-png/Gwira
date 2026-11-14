import type { WorkGraphRecords } from '../graph/graphModel.js';
import { buildWorkItems, type WorkItem } from '../workfilters/workModel.js';
import type { FilterOptions } from '../workfilters/workFilters.js';
import {buildList,resetListOptions} from '../list/listModel.js';
import type {ListCriteria} from '../list/listPreferences.js';
import type { WorkFilters } from '../workfilters/workFilters.js';

const DAY_MS = 86_400_000;

export type CalendarViewMode = 'month' | 'week';
export type CalendarEventKind = 'planned' | 'due' | 'actual' | 'due-marker' | 'approval';

export interface CalendarEvent {
  id: string;
  task: WorkItem;
  kind: CalendarEventKind;
  start: number;
  end: number;
  dueDay?: number;
  timestamp?:string;
  endTimestamp?:string;
  label?:string;
  warning?: string;
}

export interface CalendarWarning {
  taskId: string;
  message: string;
}

export interface CalendarModel {
  days: number[];
  events: CalendarEvent[];
  unscheduled: WorkItem[];
  warnings: CalendarWarning[];
  options: FilterOptions;
  total: number;
  shown: number;
  hiddenAttention: number;
  selectedDay: number;
  priorities:string[];
  rangeStart: number;
  rangeEnd: number;
}

export function calendarDayNumber(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / DAY_MS);
}

export function calendarDayOfDate(date: Date,timeZone?:string): number {
  if(!timeZone)return calendarDayNumber(date.getFullYear(), date.getMonth(), date.getDate());
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);
  const part=(name:string)=>Number(parts.find(p=>p.type===name)?.value);
  return calendarDayNumber(part('year'),part('month')-1,part('day'));
}

export function calendarDayDate(day: number): Date {
  return new Date(day * DAY_MS);
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = calendarDayDate(calendarDayNumber(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Date-only strings retain their stated calendar day; zoned timestamps use the viewer's local day. */
export function parseCalendarDay(value?: string,timeZone?:string): number | undefined {
  if (!value) return undefined;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    return validCalendarDate(year, month, day) ? calendarDayNumber(year, month - 1, day) : undefined;
  }

  const timestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!timestamp) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = timestamp;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (!validCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return undefined;
  if (zone !== 'Z') {
    const [zoneHour, zoneMinute] = zone.slice(1).split(':').map(Number);
    if (zoneHour > 23 || zoneMinute > 59) return undefined;
  }
  const timestampMs = Date.parse(value);
  return Number.isNaN(timestampMs) ? undefined : calendarDayOfDate(new Date(timestampMs),timeZone);
}

export function formatCalendarDay(day: number, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(calendarDayDate(day));
}

export function startOfCalendarWeek(day: number): number {
  const weekday = calendarDayDate(day).getUTCDay();
  return day - ((weekday + 6) % 7);
}

export function startOfCalendarMonth(day: number): number {
  const date = calendarDayDate(day);
  return calendarDayNumber(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function calendarRange(view: CalendarViewMode, anchorDay: number): { start: number; end: number; days: number[] } {
  if (view === 'week') {
    const start = startOfCalendarWeek(anchorDay);
    return { start, end: start + 6, days: Array.from({ length: 7 }, (_, index) => start + index) };
  }
  const start = startOfCalendarWeek(startOfCalendarMonth(anchorDay));
  return { start, end: start + 41, days: Array.from({ length: 42 }, (_, index) => start + index) };
}

function addWarning(warnings: CalendarWarning[], task: WorkItem, message: string): void {
  warnings.push({ taskId: task.id, message });
}

function projectItem(task:WorkItem,warnings:CalendarWarning[],timeZone?:string):CalendarEvent[]{
 const events:CalendarEvent[]=[],parse=(value?:string)=>parseCalendarDay(value,timeZone);
 const from=parse(task.plannedStart),to=parse(task.plannedEnd),due=parse(task.dueDate),started=parse(task.startedAt),completed=parse(task.completedAt);
 for(const [value,parsed,label] of [[task.plannedStart,from,'planned start'],[task.plannedEnd,to,'planned end'],[task.dueDate,due,'due'],[task.startedAt,started,'actual start'],[task.completedAt,completed,'actual completion']] as const)if(value&&parsed===undefined)addWarning(warnings,task,`The ${label} date is invalid and was not placed on the calendar.`);
 if(from!==undefined&&to!==undefined){if(to<from)addWarning(warnings,task,'The planned end is before the planned start; no planned range is shown.');else events.push({id:`planned:${task.id}`,task,kind:'planned',start:from,end:to,timestamp:task.plannedStart,endTimestamp:task.plannedEnd});}
 else if(from!==undefined||to!==undefined){const day=from??to!,warning='Only one valid planned date is recorded; showing a one-day marker.';addWarning(warnings,task,warning);events.push({id:`planned:${task.id}`,task,kind:'planned',start:day,end:day,timestamp:from!==undefined?task.plannedStart:task.plannedEnd,warning});}
 if(due!==undefined)events.push({id:`due:${task.id}`,task,kind:'due',start:due,end:due,timestamp:task.dueDate});
 if(started!==undefined||completed!==undefined){if(started!==undefined&&completed!==undefined&&(completed<started||Date.parse(task.completedAt!)<Date.parse(task.startedAt!)))addWarning(warnings,task,'The recorded completion precedes the start; showing only the recorded start marker.');const start=started??completed!,end=started!==undefined&&completed!==undefined&&completed>=started&&Date.parse(task.completedAt!)>=Date.parse(task.startedAt!)?completed:start;events.push({id:`actual:${task.id}`,task,kind:'actual',start,end,timestamp:task.startedAt??task.completedAt,endTimestamp:completed!==undefined&&started!==undefined&&Date.parse(task.completedAt!)>=Date.parse(task.startedAt!)?task.completedAt:undefined,label:started!==undefined?'Recorded execution':'Recorded completion'});}
 return events;
}

/** Projects only recorded dates. Plan, due, and actual facts remain distinct and task totals are unique. */
export function buildCalendar(records: WorkGraphRecords, options: {
  view: CalendarViewMode;
  anchorDay: number;
  filters: WorkFilters;
  search?: string;
  criteria?:ListCriteria;
  categories?:readonly string[];
  timeZone?:string;
}): CalendarModel {
  const projection = buildWorkItems(records);
  const filtered=buildList(records,{...resetListOptions(),filters:options.filters,search:options.search??'',criteria:options.criteria});
  const range = calendarRange(options.view, options.anchorDay);
  const events: CalendarEvent[] = [];
  const unscheduled: WorkItem[] = [];
  const warnings: CalendarWarning[] = [];

  const taskById=new Map(filtered.tasks.map(task=>[task.id,task]));
  const dated=new Set<string>();
  for(const task of filtered.tasks){const facts=projectItem(task,warnings,options.timeZone);if(facts.length)dated.add(task.id);events.push(...facts);}
  for(const approval of records.approvals??[]){const task=approval.taskId?taskById.get(approval.taskId):undefined;if(!task)continue;for(const [label,timestamp,suffix] of [['Approval requested',approval.createdAt,'requested'],['Approval decision recorded',approval.decidedAt,'decision']] as const){if(!timestamp)continue;const day=parseCalendarDay(timestamp,options.timeZone);if(day===undefined){addWarning(warnings,task,'An approval checkpoint date is invalid and was not placed on the calendar.');continue;}events.push({id:`approval:${approval.id}:${suffix}`,task,kind:'approval',start:day,end:day,timestamp,label});dated.add(task.id);}}
  for(const task of filtered.tasks)if(!dated.has(task.id))unscheduled.push(task);
  const visibleEvents=options.categories?events.filter(event=>options.categories!.includes(event.kind)):events;

  return {
    days: range.days,
    events:visibleEvents,
    unscheduled,
    warnings,
    options: projection.options,
    total: filtered.total,
    shown: filtered.shown,
    hiddenAttention: filtered.hiddenAttention,
    selectedDay: options.anchorDay,
    priorities:filtered.priorities,
    rangeStart: range.start,
    rangeEnd: range.end
  };
}
