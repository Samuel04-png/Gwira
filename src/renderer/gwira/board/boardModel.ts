import type {WorkGraphRecords,WorkGraphStatus} from '../graph/graphModel.js';
import {buildWorkItems,WORK_STATUS_LABELS,type WorkItem} from '../workfilters/workModel.js';
import {ownerFilterKey,type FilterOptions,type WorkFilters} from '../workfilters/workFilters.js';
import {buildList,resetListOptions} from '../list/listModel.js';
import type {ListCriteria} from '../list/listPreferences.js';
import type {BoardGroupBy,BoardSortBy} from './boardPreferences.js';
export interface BoardColumn {id:string;status?:WorkGraphStatus;label:string;tasks:WorkItem[];total:number}
export interface BoardModel {columns:BoardColumn[];total:number;shown:number;hiddenAttention:number;options:FilterOptions;priorities:string[]}
export const BOARD_STATUS_ORDER:readonly WorkGraphStatus[]=['default','working','waiting','blocked','failed','paused','completed'];
export function buildBoard(records:WorkGraphRecords,options:{filters:WorkFilters;search?:string;criteria?:ListCriteria;groupBy?:BoardGroupBy;sortBy?:BoardSortBy}):BoardModel{
 const all=buildWorkItems(records).items,groupBy=options.groupBy??'status';
 const list=buildList(records,{...resetListOptions(),filters:options.filters,search:options.search??'',criteria:options.criteria,sortBy:options.sortBy??'title'});
 const key=(task:WorkItem)=>groupBy==='owner'?`${task.ownerKind}:${ownerFilterKey(task)}`:groupBy==='project'?task.projectId??'unassigned-project':task.status;
 const byColumn=new Map<string,BoardColumn>(groupBy==='status'?BOARD_STATUS_ORDER.map(id=>[id,{id,status:id,label:WORK_STATUS_LABELS[id],tasks:[],total:0}]):[]);
 for(const task of all){const id=key(task);if(!byColumn.has(id))byColumn.set(id,{id,label:groupBy==='owner'?task.ownerName:task.projectName??'No project',tasks:[],total:0});byColumn.get(id)!.total++;}
 for(const task of list.tasks)byColumn.get(key(task))!.tasks.push(task);
 const columns=[...byColumn.values()];if(groupBy!=='status')columns.sort((a,b)=>a.label.localeCompare(b.label));
 return {columns,total:list.total,shown:list.shown,hiddenAttention:list.hiddenAttention,options:list.options,priorities:list.priorities};
}
