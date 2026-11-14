import type {GwiraLocalState,Task} from '../domain/types.js';
import {scopedWorkState,taskNeedsAttention} from '../activity/workActivityModel.js';
import {defaultListPrefs,parseListPrefs,type ListPrefs} from '../list/listPreferences.js';
import {defaultBoardPrefs,parseBoardPrefs,type BoardPrefs} from '../board/boardPreferences.js';
export interface ViewFilters {status:string[];assignee:string[];kind:string[];project:string[];priority:string[];due:'all'|'overdue'|'today'|'next7'|'undated';createdFrom:string;updatedFrom:string}
export type ViewPreset='all'|'attention'|'agents'|'workload'|'completed';
export interface ViewConfig {source:'tasks';layout:'list'|'board';query:string;filters:ViewFilters;preset:ViewPreset;list:ListPrefs;board:BoardPrefs}
export interface SavedView {id:string;organizationId:string;workspaceId:string;name:string;description:string;icon:'views'|'work'|'teams'|'review'|'operations';visibility:'device';config:ViewConfig;createdAt:string;updatedAt:string}
export interface ViewsStore {version:1;organizationId:string;workspaceId:string;views:SavedView[];favorites:string[]}
export interface ViewScope {organizationId:string;workspaceId:string}
export const emptyViewFilters=():ViewFilters=>({status:[],assignee:[],kind:[],project:[],priority:[],due:'all',createdFrom:'',updatedFrom:''});
export const defaultViewConfig=():ViewConfig=>({source:'tasks',layout:'list',query:'',filters:emptyViewFilters(),preset:'all',list:defaultListPrefs(),board:defaultBoardPrefs()});
export const suggestedViews:Array<{id:ViewPreset;name:string;description:string;icon:SavedView['icon']}>= [
 {id:'all',name:'All Work',description:'All recorded work in this workspace.',icon:'work'},
 {id:'attention',name:'Needs Attention',description:'Blocked, overdue, failed, or waiting for approval.',icon:'review'},
 {id:'agents',name:'Agents Working',description:'AI assignments with a recorded running execution.',icon:'operations'},
 {id:'workload',name:'Team Workload',description:'Work grouped by the employee or AI worker responsible.',icon:'teams'},
 {id:'completed',name:'Recently Completed',description:'Completed work with a retained completion event in the last 30 days.',icon:'review'}];
export function presetConfig(preset:ViewPreset):ViewConfig {const c=defaultViewConfig();c.preset=preset;if(preset==='workload'){c.list.groupBy='owner';c.board.groupBy='owner';}if(preset==='completed'){c.list.sortBy='recordOrder';}return c;}
const strings=(v:unknown):string[]=>Array.isArray(v)?[...new Set(v.filter((s):s is string=>typeof s==='string'&&s.length<200))].slice(0,100):[];
const text=(v:unknown,max=200):string=>typeof v==='string'?v.slice(0,max):'';
const date=(v:unknown):string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))?v:'';
export function parseViewConfig(value:unknown):ViewConfig {const r=(value&&typeof value==='object'?value:{}) as Partial<ViewConfig>,f=r.filters??emptyViewFilters();const list=parseListPrefs(r.list),board=parseBoardPrefs(r.board);
 // Filter matching is shared by layouts. Child preferences contain presentation only.
 list.filters={status:'all',owner:'all',project:'all'};board.filters={...list.filters};list.criteria={priority:'all',due:'all',attention:'all',kind:'all'};board.criteria={...list.criteria};
 return {source:'tasks',layout:r.layout==='board'?'board':'list',query:text(r.query,300),preset:suggestedViews.some(v=>v.id===r.preset)?r.preset!:'all',filters:{status:strings(f.status).filter(s=>['backlog','todo','in_progress','in_review','done','blocked'].includes(s)),assignee:strings(f.assignee),kind:strings(f.kind).filter(s=>['person','agent','unassigned'].includes(s)),project:strings(f.project),priority:strings(f.priority).filter(s=>['low','medium','high','urgent'].includes(s)),due:['overdue','today','next7','undated'].includes(f.due)?f.due:'all',createdFrom:date(f.createdFrom),updatedFrom:date(f.updatedFrom)},list,board};}
export const viewsStorageKey=(scope:ViewScope)=>`gwira.saved-views.v1:${JSON.stringify([scope.organizationId,scope.workspaceId])}`;
export function parseViewsStore(value:unknown,scope:ViewScope):ViewsStore {const identity={organizationId:scope.organizationId,workspaceId:scope.workspaceId};const empty:ViewsStore={version:1,...identity,views:[],favorites:[]};if(!value||typeof value!=='object')return empty;const r=value as ViewsStore;if(r.version!==1||r.organizationId!==scope.organizationId||r.workspaceId!==scope.workspaceId)return empty;const seen=new Set<string>();const views:SavedView[]=[];
 for(const v of Array.isArray(r.views)?r.views:[]){if(!v||v.organizationId!==scope.organizationId||v.workspaceId!==scope.workspaceId||!v.id||typeof v.id!=='string'||seen.has(v.id)||!text(v.name).trim())continue;seen.add(v.id);views.push({id:text(v.id),...identity,name:text(v.name,100).trim(),description:text(v.description,400),icon:['views','work','teams','review','operations'].includes(v.icon)?v.icon:'views',visibility:'device',config:parseViewConfig(v.config),createdAt:text(v.createdAt),updatedAt:text(v.updatedAt)});}
 return {...empty,views,favorites:strings(r.favorites).filter(id=>seen.has(id)||suggestedViews.some(s=>`suggested-${s.id}`===id))};}
export function readViews(storage:Pick<Storage,'getItem'>,scope:ViewScope):ViewsStore {return parseViewsStore(JSON.parse(storage.getItem(viewsStorageKey(scope))??'null'),scope);}
export function writeViews(storage:Pick<Storage,'setItem'>,store:ViewsStore):void {storage.setItem(viewsStorageKey(store),JSON.stringify(parseViewsStore(store,store)));}
export function saveView(store:ViewsStore,view:SavedView):ViewsStore {if(view.organizationId!==store.organizationId||view.workspaceId!==store.workspaceId)throw Error('This view belongs to a different workspace.');if(!view.name.trim())throw Error('Give this view a name.');return parseViewsStore({...store,views:[...store.views.filter(v=>v.id!==view.id),view]},store);}
export function deleteView(store:ViewsStore,id:string):ViewsStore {return {...store,views:store.views.filter(v=>v.id!==id),favorites:store.favorites.filter(v=>v!==id)};}
export function completionTimes(state:GwiraLocalState):Map<string,string> {const times=new Map<string,string>();for(const e of state.activity)if(e.workspaceId===state.workspace.id&&e.kind==='task_status_changed'&&e.taskId&&/ to done$/.test(e.summary)&&!Number.isNaN(Date.parse(e.occurredAt))&&(!times.has(e.taskId)||times.get(e.taskId)!<e.occurredAt))times.set(e.taskId,e.occurredAt);return times;}
export function queryView(state:GwiraLocalState,config:ViewConfig,now=new Date()):Task[] {const s=scopedWorkState(state),f=config.filters,day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,next=new Date(now);next.setDate(next.getDate()+7);const nextDay=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;const completed=completionTimes(s),cutoff=now.getTime()-30*86400000;
 const tasks=s.tasks.filter(t=>{const owner=t.assignee?`${t.assignee.kind}:${t.assignee.id}`:'unassigned',due=t.dueDate?.slice(0,10),q=config.query.trim().toLocaleLowerCase();
 if(f.status.length&&!f.status.includes(t.status)||f.assignee.length&&!f.assignee.includes(owner)||f.kind.length&&!f.kind.includes(t.assignee?.kind??'unassigned')||f.project.length&&!f.project.includes(t.projectId??'none')||f.priority.length&&!f.priority.includes(t.priority))return false;
 if(f.createdFrom&&t.createdAt.slice(0,10)<f.createdFrom||f.updatedFrom&&t.updatedAt.slice(0,10)<f.updatedFrom)return false;
 if(f.due==='undated'&&due||f.due==='today'&&due!==day||f.due==='overdue'&&(!due||due>=day||t.status==='done')||f.due==='next7'&&(!due||due<day||due>nextDay))return false;
 if(config.preset==='attention'&&!taskNeedsAttention(t,s,day)||config.preset==='agents'&&(t.assignee?.kind!=='agent'||t.agentRun?.status!=='running')||config.preset==='completed'&&(t.status!=='done'||!completed.has(t.id)||(Date.parse(completed.get(t.id)!)<cutoff||Date.parse(completed.get(t.id)!)>now.getTime())))return false;
 const person=s.people.find(p=>p.id===t.assignee?.id),agent=s.doats.find(d=>d.id===t.assignee?.id),project=s.projects.find(p=>p.id===t.projectId);return !q||[t.title,t.id,t.description,t.status,t.priority,person?.name,agent?.identity.name,project?.name,t.agentRun?.status].filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
 });return config.preset==='completed'?tasks.sort((a,b)=>(completed.get(b.id)??'').localeCompare(completed.get(a.id)??'')||a.id.localeCompare(b.id)):tasks;
}
export function viewHash(scope:ViewScope,id:string):string {return `#views/${encodeURIComponent(scope.organizationId)}/${encodeURIComponent(scope.workspaceId)}/${encodeURIComponent(id)}`;}
export function viewIdFromHash(hash:string,scope:ViewScope):string|undefined {try{const [tag,org,workspace,id,...rest]=hash.slice(1).split('/').map(decodeURIComponent);return tag==='views'&&org===scope.organizationId&&workspace===scope.workspaceId&&!rest.length?id:undefined;}catch{return undefined;}}
