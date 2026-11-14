import {parseWorkFilters,type WorkFilters} from '../workfilters/workFilters.js';
import {DEFAULT_CRITERIA,parseListPrefs,type ListCriteria} from '../list/listPreferences.js';
export type BoardGroupBy='status'|'owner'|'project';
export type BoardSortBy='title'|'priority'|'dueDate';
export interface BoardPrefs {filters:WorkFilters;criteria:ListCriteria;collapsed:string[];hidden:string[];hideEmpty:boolean;groupBy:BoardGroupBy;sortBy:BoardSortBy}
export function defaultBoardPrefs():BoardPrefs{return {filters:parseWorkFilters(undefined),criteria:{...DEFAULT_CRITERIA},collapsed:[],hidden:[],hideEmpty:false,groupBy:'status',sortBy:'title'};}
export function parseBoardPrefs(value:unknown):BoardPrefs{
 const raw=(value&&typeof value==='object'?value:{}) as Partial<BoardPrefs>;
 const ids=(v:unknown)=>Array.isArray(v)?v.filter((id):id is string=>typeof id==='string'):[];
 return {...defaultBoardPrefs(),filters:parseWorkFilters(raw.filters),criteria:parseListPrefs({criteria:raw.criteria}).criteria,collapsed:ids(raw.collapsed),hidden:ids(raw.hidden),hideEmpty:raw.hideEmpty===true,groupBy:raw.groupBy==='owner'||raw.groupBy==='project'?raw.groupBy:'status',sortBy:raw.sortBy==='priority'||raw.sortBy==='dueDate'?raw.sortBy:'title'};
}
