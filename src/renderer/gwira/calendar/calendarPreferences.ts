import {parseWorkFilters,type WorkFilters} from '../workfilters/workFilters.js';
import {DEFAULT_CRITERIA,parseListPrefs,type ListCriteria} from '../list/listPreferences.js';
import type {CalendarViewMode} from './calendarModel.js';
export const CALENDAR_CATEGORIES=['planned','due','actual','approval'] as const;
export const CATEGORY_LABELS:Record<string,string>={planned:'Planned',due:'Due',actual:'Actual',approval:'Approval checkpoints'};
export interface CalendarPrefs {view:CalendarViewMode;filters:WorkFilters;criteria:ListCriteria;categories:string[];unscheduledOpen:boolean;timeZone:string}
export function validTimeZone(value:unknown):value is string{if(typeof value!=='string')return false;try{new Intl.DateTimeFormat(undefined,{timeZone:value}).format();return true;}catch{return false;}}
export function defaultCalendarPrefs():CalendarPrefs{return {view:'month',filters:parseWorkFilters(undefined),criteria:{...DEFAULT_CRITERIA},categories:[...CALENDAR_CATEGORIES],unscheduledOpen:true,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};}
export function parseCalendarPrefs(value:unknown):CalendarPrefs{const d=defaultCalendarPrefs(),raw=(value&&typeof value==='object'?value:{}) as Partial<CalendarPrefs>;return {...d,view:raw.view==='week'?'week':'month',filters:parseWorkFilters(raw.filters),criteria:parseListPrefs({criteria:raw.criteria}).criteria,categories:Array.isArray(raw.categories)?CALENDAR_CATEGORIES.filter(id=>raw.categories!.includes(id)):d.categories,unscheduledOpen:raw.unscheduledOpen!==false,timeZone:validTimeZone(raw.timeZone)?raw.timeZone:d.timeZone};}
