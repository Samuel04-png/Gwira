import {parseWorkFilters,type WorkFilters} from '../workfilters/workFilters.js';
import type {ListGroupBy,ListSortBy} from './listModel.js';
export type ListColumn='assignee'|'priority'|'dueDate'|'project'|'schedule'|'attention'|'updatedAt';
export type ListRowHeight=44|48|52;
export interface ListCriteria {priority:string;due:'all'|'overdue'|'today'|'next7'|'dated'|'undated';attention:'all'|'needs-attention';kind:'all'|'person'|'doat'|'unassigned'}
export const DEFAULT_CRITERIA:ListCriteria={priority:'all',due:'all',attention:'all',kind:'all'};
export const LIST_GROUPS:Array<{id:ListGroupBy;label:string}>=[{id:'none',label:'None'},{id:'status',label:'Status'},{id:'owner',label:'Assignee'},{id:'project',label:'Project'},{id:'objective',label:'Objective'},{id:'priority',label:'Priority'}];
export const LIST_SORTS:Array<{id:ListSortBy;label:string}>=[{id:'recordOrder',label:'Source order'},{id:'title',label:'Task name'},{id:'updatedAt',label:'Recently updated'},{id:'dueDate',label:'Due date'},{id:'priority',label:'Priority'},{id:'status',label:'Status'},{id:'owner',label:'Assignee'}];
export const LIST_COLUMNS:Array<{id:ListColumn;label:string}>=[{id:'updatedAt',label:'Updated'},{id:'assignee',label:'Assignee'},{id:'priority',label:'Priority'},{id:'dueDate',label:'Due date'},{id:'project',label:'Project'},{id:'schedule',label:'Planned / actual'},{id:'attention',label:'Attention'}];
export interface ListPrefs {groupBy:ListGroupBy;sortBy:ListSortBy;sortDirection:'asc'|'desc';filters:WorkFilters;criteria:ListCriteria;collapsed:string[];rowHeight:ListRowHeight;columns:ListColumn[]}
export function defaultListPrefs():ListPrefs {return {groupBy:'none',sortBy:'title',sortDirection:'asc',filters:parseWorkFilters(undefined),criteria:{...DEFAULT_CRITERIA},collapsed:[],rowHeight:48,columns:['assignee','priority','dueDate']};}
/** Repair existing v1 preferences; old 32/36/40px values migrate to compact grid density. */
export function parseListPrefs(value:unknown):ListPrefs {
 const defaults=defaultListPrefs(),raw=(value&&typeof value==='object'?value:{}) as Partial<ListPrefs>,criteria=raw.criteria??{} as Partial<ListCriteria>;
 return {...defaults,groupBy:LIST_GROUPS.some(o=>o.id===raw.groupBy)?raw.groupBy!:defaults.groupBy,sortBy:LIST_SORTS.some(o=>o.id===raw.sortBy)?raw.sortBy!:defaults.sortBy,sortDirection:raw.sortDirection==='desc'?'desc':'asc',filters:parseWorkFilters(raw.filters),criteria:{priority:typeof criteria.priority==='string'?criteria.priority:'all',due:['all','overdue','today','next7','dated','undated'].includes(criteria.due??'')?criteria.due!:'all',attention:criteria.attention==='needs-attention'?'needs-attention':'all',kind:['person','doat','unassigned'].includes(criteria.kind??'')?criteria.kind!:'all'},collapsed:Array.isArray(raw.collapsed)?raw.collapsed.filter((id):id is string=>typeof id==='string'):[],rowHeight:raw.rowHeight===44||raw.rowHeight===52?raw.rowHeight:48,columns:Array.isArray(raw.columns)?LIST_COLUMNS.map(c=>c.id).filter(id=>raw.columns!.includes(id)):defaults.columns};
}
export function criteriaCount(criteria:ListCriteria):number{return Object.values(criteria).filter(value=>value!=='all').length;}
