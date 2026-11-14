import {DEFAULT_CRITERIA,type ListCriteria} from './listPreferences.js';
export type {ListRowHeight} from './listPreferences.js';
import { ALL, NO_FILTERS, ownerFilterKey, type FilterOptions, type WorkFilters } from '../workfilters/workFilters.js';
import { buildWorkItems, filterWorkItems, WORK_STATUS_LABELS, type WorkAttentionKind, type WorkItem } from '../workfilters/workModel.js';
import type { WorkGraphRecords, WorkGraphStatus } from '../graph/graphModel.js';

export type ListGroupBy = 'none' | 'status' | 'owner' | 'project' | 'objective' | 'priority';
export type ListSortBy = 'title' | 'status' | 'owner' | 'priority' | 'dueDate' | 'updatedAt' | 'recordOrder';
export type ListAttentionKind = WorkAttentionKind;

export type ListTask = WorkItem & {objectiveIds:string[];objectiveNames:string[]};

export interface ListGroup {
  id: string;
  label: string;
  tasks: ListTask[];
  attentionCount:number;
}

export interface ListModel {
  groups: ListGroup[];
  tasks: ListTask[];
  total: number;
  shown: number;
  hiddenAttention: number;
  options: FilterOptions;
  priorities:string[];
}

export interface ListOptions {
  groupBy: ListGroupBy;
  filters: WorkFilters;
  search: string;
  sortBy: ListSortBy;
  sortDirection: 'asc' | 'desc';
  today?: Date;
  criteria?:ListCriteria;
}

export const LIST_STATUS_LABELS: Record<WorkGraphStatus, string> = WORK_STATUS_LABELS;

const STATUS_ORDER: WorkGraphStatus[] = ['default', 'working', 'waiting', 'blocked', 'failed', 'paused', 'completed'];
const PRIORITY_ORDER=['urgent','high','medium','low'];
const TEXT_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compareText(left: string, right: string): number {
  return TEXT_COLLATOR.compare(left, right);
}

function sortTasks(tasks: readonly ListTask[], sortBy: ListSortBy, direction: 'asc' | 'desc'): ListTask[] {
  if(sortBy==='recordOrder')return direction==='asc'?[...tasks]:[...tasks].reverse();
  const sign = direction === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    let result = 0;
    if (sortBy === 'priority') {const ai=PRIORITY_ORDER.indexOf(a.priority??''),bi=PRIORITY_ORDER.indexOf(b.priority??'');if(ai<0||bi<0)return ai>=0?-1:bi>=0?1:compareText(a.title,b.title);result=ai-bi;}
    else if (sortBy === 'status') result = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    else {
      const left = sortBy === 'owner' ? a.ownerName : sortBy === 'dueDate' ? a.dueDate : sortBy === 'updatedAt' ? a.updatedAt : a.title;
      const right = sortBy === 'owner' ? b.ownerName : sortBy === 'dueDate' ? b.dueDate : sortBy === 'updatedAt' ? b.updatedAt : b.title;
      if (!left || !right) return left ? -1 : right ? 1 : compareText(a.title, b.title);
      result = compareText(left, right);
    }
    return result * sign || compareText(a.title, b.title) || compareText(a.id, b.id);
  });
}

function groupKey(task: ListTask, groupBy: ListGroupBy): { id: string; label: string } {
  if (groupBy === 'status') return { id: `status:${task.status}`, label: task.statusLabel };
  if (groupBy === 'owner') return { id: `owner:${ownerFilterKey(task)}`, label: task.ownerName };
  if (groupBy === 'objective') return {id:`objective:${task.objectiveIds[0]??'none'}`,label:task.objectiveNames[0]??'No objective'};
  if (groupBy === 'priority') return {id:`priority:${task.priority??'none'}`,label:task.priority?task.priority[0].toUpperCase()+task.priority.slice(1):'No priority'};
  if (groupBy === 'project') return { id: `project:${task.projectId ?? (task.projectName ? 'unavailable' : 'none')}`, label: task.projectName ?? 'No project' };
  return { id: 'all', label: 'All tasks' };
}

function compareGroups(a: ListGroup, b: ListGroup, groupBy: ListGroupBy): number {
  if (groupBy === 'status') return STATUS_ORDER.indexOf(a.id.slice('status:'.length) as WorkGraphStatus) - STATUS_ORDER.indexOf(b.id.slice('status:'.length) as WorkGraphStatus);
  if(groupBy==='priority'){const ai=PRIORITY_ORDER.indexOf(a.id.slice(9)),bi=PRIORITY_ORDER.indexOf(b.id.slice(9));return (ai<0?99:ai)-(bi<0?99:bi)||compareText(a.label,b.label);}
  if (groupBy === 'owner' || groupBy === 'project' || groupBy==='objective') {
    const missingA = a.id.endsWith(':none') || a.label.startsWith('Unavailable ');
    const missingB = b.id.endsWith(':none') || b.label.startsWith('Unavailable ');
    if (missingA !== missingB) return missingA ? 1 : -1;
  }
  return compareText(a.label, b.label);
}

/** Builds a read-only projection from the current graph records; no view state or task data is persisted here. */
export function buildList(records: WorkGraphRecords, options: ListOptions): ListModel {
  const projection = buildWorkItems(records, { today: options.today });
  const day=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const todayDate=options.today??new Date(),today=day(todayDate),next=new Date(todayDate);next.setDate(next.getDate()+7);
  const criteria=options.criteria??DEFAULT_CRITERIA;
  const items:ListTask[]=projection.items.map(task=>{const objectives=(records.objectives??[]).filter(objective=>objective.taskIds?.includes(task.id));return {...task,objectiveIds:objectives.map(o=>o.id),objectiveNames:objectives.map(o=>o.title)};});
  const base=filterWorkItems(items,{filters:options.filters});
  const eligible=new Set(base.tasks.map(t=>t.id));
  const search=options.search.trim().toLocaleLowerCase();
  const references=new Map((records.tasks??[]).map(task=>[task.id,[task.id,task.taskId,task.doatRunId,task.humanWorkId,task.resultId].filter(Boolean).join(' ')]));
  const matching=items.filter(task=>{
    if(!eligible.has(task.id))return false;
    if(search&&![task.title,task.description,task.ownerName,task.projectName,task.statusLabel,task.runStatus,...task.objectiveNames,references.get(task.id)].filter(Boolean).join(' ').toLocaleLowerCase().includes(search))return false;
    if(criteria.priority!=='all'&&task.priority!==criteria.priority)return false;
    if(criteria.kind!=='all'&&task.ownerKind!==criteria.kind)return false;
    if(criteria.attention==='needs-attention'&&!task.attention.length)return false;
    const due=task.dueDate?.slice(0,10);
    if(criteria.due==='undated'&&due)return false;
    if(criteria.due==='dated'&&!due)return false;
    if(criteria.due==='today'&&due!==today)return false;
    if(criteria.due==='overdue'&&(!due||due>=today||task.status==='completed'))return false;
    if(criteria.due==='next7'&&(!due||due<today||due>day(next)))return false;
    return true;
  });
  const matchingIds=new Set(matching.map(task=>task.id));
  const sorted = sortTasks(matching, options.sortBy, options.sortDirection);
  const byGroup = new Map<string, ListGroup>();
  for (const task of sorted) {
    const group = groupKey(task, options.groupBy);
    const found = byGroup.get(group.id);
    if (found) found.tasks.push(task);
    else byGroup.set(group.id, { ...group, tasks: [task],attentionCount:0 });
  }
  for(const group of byGroup.values())group.attentionCount=group.tasks.filter(task=>task.attention.length).length;
  const groups = [...byGroup.values()].sort((a, b) => compareGroups(a, b, options.groupBy));
  return {
    groups,
    tasks: sorted,
    total: items.length,
    shown: sorted.length,
    hiddenAttention: items.filter(task=>task.attention.length&&!matchingIds.has(task.id)).length,
    priorities:[...new Set(items.flatMap(task=>task.priority?[task.priority]:[]))].sort((a,b)=>PRIORITY_ORDER.indexOf(a)-PRIORITY_ORDER.indexOf(b)),
    options: projection.options
  };
}

export function resetListOptions(): ListOptions {
  return { groupBy: 'none', filters: NO_FILTERS, search: '', sortBy: 'title', sortDirection: 'asc' };
}

export function attentionAnnouncement(task: ListTask): string {
  return task.attention.map((reason) => `${reason.label}: ${reason.explanation}`).join(' ');
}

export const NO_LIST_FILTERS = NO_FILTERS;
export const LIST_ALL_FILTER = ALL;
