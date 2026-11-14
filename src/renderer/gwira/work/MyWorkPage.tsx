import { Icon, NavigationIcon } from '../../components/Icon.js';
import { CompactActionMenu } from '../../components/CompactActionMenu.js';
import { localStateToGraphRecords } from '../graph/localGraphAdapter.js';
import { ListView } from '../list/ListView.js';
import { BoardView } from '../board/BoardView.js';
import { CalendarView } from '../calendar/CalendarView.js';
import { TimelineView } from '../timeline/TimelineView.js';
import { boardTransition } from '../board/boardTransitions.js';
import { WorkActivityPanel, WorkProgressChart } from '../activity/WorkActivity.js';
import { activityDateRange, aggregateWorkActivity, dateInZone, scopedWorkState, taskNeedsAttention, type ActivityMeasure } from '../activity/workActivityModel.js';
import type { ListPatch } from '../list/ListPropertyEditor.js';
import './myWork.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { allowedTaskTransitions } from '../domain/lifecycle.js';
import type { ApprovalStatus, Assignee, GwiraLocalState, Task, TaskPriority, TaskStatus } from '../domain/types.js';
import { assigneeName, groupTasksByStatus, pendingApprovalsForTask, taskProjectName, taskStatuses } from './workViewModel.js';

function MyWorkHeader({workspace,children}:{workspace:string;children:React.ReactNode}):React.ReactElement {
  return <header className="my-work__header"><div><p className="my-work__eyebrow">{workspace}</p><h1>My Work</h1><p>Your work, progress, and priorities.</p></div><div className="my-work__header-actions">{children}</div></header>;
}
export function UnavailableMyWorkPage({workspace}:{workspace:string}):React.ReactElement {
  return <section className="gwira-my-work my-work" aria-label="My Work"><div className="my-work__content"><MyWorkHeader workspace={workspace}><button type="button" className="my-work__primary" disabled title="Task creation is not connected for authenticated workspaces."><Icon name="plus"/>New task</button></MyWorkHeader><p role="status">Work records are unavailable in authenticated workspaces.</p></div></section>;
}

export interface NewTaskInput {
  title: string;
  description?: string;
  projectId?: string;
  priority: TaskPriority;
  dueDate?: string;
  assignee?: Assignee;
}

export interface TaskUpdateInput {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  dueDate?: string | null;
  assignee?: Assignee | null;
}

/**
 * Presentation-only My Work surface. Its parent owns identifiers, current
 * actor selection, persistence and reducer dispatch; this component never
 * creates business records itself.
 */
export interface MyWorkPageProps {
  state: GwiraLocalState;
  onOpenRunHistory?: (taskId: string) => void;
  onCreateTask: (input: NewTaskInput) => void;
  onUpdateTask: (taskId: string, input: TaskUpdateInput) => void;
  onTransitionTask: (taskId: string, status: TaskStatus) => void;
  onAddComment: (taskId: string, body: string) => void;
  onDecideApproval: (approvalId: string, decision: Extract<ApprovalStatus, 'approved' | 'changes_requested'>) => void;
  onStartCodingTask: (taskId: string) => void;
  onStopCodingTask: (taskId: string) => void;
  startingTaskIds: ReadonlySet<string>;
  stoppingTaskIds: ReadonlySet<string>;
  requestedTaskId?: string;
  onRequestedTaskOpened: () => void;
  activeCodexProjectName?: string;
  onLinkActiveCodexProject: () => void;
}

const priorities: readonly TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

function isoDateForInput(value?: string): string {
  return value ? value.slice(0, 10) : '';
}

function assigneeValue(assignee?: Assignee): string {
  return assignee ? `${assignee.kind}:${assignee.id}` : '';
}

function parseAssignee(value: string): Assignee | undefined {
  if (!value) return undefined;
  const [kind, id] = value.split(':', 2);
  return (kind === 'person' || kind === 'agent') && id ? { kind, id } : undefined;
}

function labelForStatus(status: TaskStatus): string {
  return status.replace('_', ' ');
}

export function MyWorkPage({ state, onOpenRunHistory, onCreateTask, onUpdateTask, onTransitionTask, onAddComment, onDecideApproval, onStartCodingTask, onStopCodingTask, startingTaskIds, stoppingTaskIds, requestedTaskId, onRequestedTaskOpened, activeCodexProjectName, onLinkActiveCodexProject }: MyWorkPageProps): React.ReactElement {
  const local = useMemo(()=>scopedWorkState(state),[state]);
  const root=useRef<HTMLElement>(null),opener=useRef<HTMLElement|null>(null);
  const preferenceKey=`gwira.my-work.view.v1:${JSON.stringify([state.organization.id,state.workspace.id])}`;
  const [view,setView]=useState<'list'|'board'|'calendar'|'timeline'>(()=>{try{const saved=localStorage.getItem(preferenceKey);return ['list','board','calendar','timeline'].includes(saved??'')?saved as 'list':'list';}catch{return 'list';}});
  const [visited,setVisited]=useState(new Set([view])),[selectedTaskId,setSelectedTaskId]=useState<string|null>(null),[createOpen,setCreateOpen]=useState(false);
  const [worker,setWorker]=useState('all'),[project,setProject]=useState('all'),[query,setQuery]=useState(''),[metric,setMetric]=useState('all'),[period,setPeriod]=useState('84'),[measure,setMeasure]=useState<ActivityMeasure>('activity');
  const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,today=dateInZone(new Date().toISOString(),timeZone)!;
  const [customFrom,setCustomFrom]=useState(activityDateRange(today,28).from),[customTo,setCustomTo]=useState(today);
  const range=period==='custom'?{from:customFrom,to:customTo}:activityDateRange(today,Number(period));
  const invalidRange=!range.from||!range.to||range.from>range.to||(Date.parse(range.to)-Date.parse(range.from))/86400000>366;
  const selectedTask=local.tasks.find(t=>t.id===selectedTaskId)??null;
  const subject=worker==='all'?undefined:parseAssignee(worker);
  const base=useMemo(()=>local.tasks.filter(t=>(worker==='all'||assigneeValue(t.assignee)===worker)&&(project==='all'||t.projectId===project)),[local.tasks,worker,project]);
  const counts={assigned:base.filter(t=>t.assignee).length,progress:base.filter(t=>t.status==='in_progress').length,completed:base.filter(t=>t.status==='done').length,attention:base.filter(t=>taskNeedsAttention(t,local,today)).length};
  const visible=useMemo(()=>base.filter(t=>(!query.trim()||[t.title,t.description??'',taskProjectName(t,local),assigneeName(t.assignee,local.people,local.agents)].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))&&(metric==='all'||metric==='assigned'&&!!t.assignee||metric==='progress'&&t.status==='in_progress'||metric==='completed'&&t.status==='done'||metric==='attention'&&taskNeedsAttention(t,local,today))),[base,query,metric,local,today]);
  const displayed=useMemo(()=>({...local,tasks:visible,approvals:local.approvals.filter(a=>visible.some(t=>t.id===a.taskId))}),[local,visible]);
  const records=useMemo(()=>localStateToGraphRecords(displayed),[displayed]);
  const analyticsState=useMemo(()=>project==='all'?local:({...local,tasks:local.tasks.filter(t=>t.projectId===project)}),[local,project]);
  const summary=useMemo(()=>aggregateWorkActivity(analyticsState,{organizationId:state.organization.id,workspaceId:state.workspace.id,subject,...range,timeZone}),[analyticsState,state.organization.id,state.workspace.id,worker,range.from,range.to,timeZone]);
  const editable=new Set(visible.filter(t=>t.agentRun?.status!=='running').map(t=>t.id));
  useEffect(()=>{setVisited(current=>current.has(view)?current:new Set([...current,view]));try{localStorage.setItem(preferenceKey,view);}catch{}},[view,preferenceKey]);
  useEffect(()=>{if(selectedTaskId&&!local.tasks.some(t=>t.id===selectedTaskId))setSelectedTaskId(null);},[selectedTaskId,local.tasks]);
  useEffect(()=>{if(requestedTaskId&&local.tasks.some(t=>t.id===requestedTaskId)){setSelectedTaskId(requestedTaskId);onRequestedTaskOpened();}},[requestedTaskId,local.tasks,onRequestedTaskOpened]);
  function openTask(id:string):void {opener.current=document.activeElement as HTMLElement;setSelectedTaskId(id);}
  function closeDetails():void {setSelectedTaskId(null);requestAnimationFrame(()=>opener.current?.isConnected&&opener.current.focus({preventScroll:true}));}
  function createTask():void {opener.current=document.activeElement as HTMLElement;setCreateOpen(true);}
  function patchTasks(ids:string[],patch:ListPatch):void {const tasks=ids.map(id=>local.tasks.find(t=>t.id===id));if(tasks.some(t=>!t||t.agentRun?.status==='running'))throw Error('The task is unavailable or running. Open task details before editing.');for(const task of tasks)if(task)onUpdateTask(task.id,{title:task.title,priority:patch.priority??task.priority,...('dueDate' in patch?{dueDate:patch.dueDate}: {})});}
  const views=[{id:'list',label:'List',icon:'list'},{id:'board',label:'Board',icon:'board'},{id:'calendar',label:'Calendar',icon:'calendar'},{id:'timeline',label:'Timeline',icon:'timeline'}] as const;
  return <section ref={root} className="gwira-my-work my-work" aria-label="My Work" data-my-work-view={view}>
    <div className="my-work__content">
      <MyWorkHeader workspace={state.workspace.name}><label className="my-work__worker"><span>Worker</span><select aria-label="Work scope" value={worker} onChange={e=>{setWorker(e.target.value);setMetric('all');}}><option value="all">All workspace work</option>{local.people.map(p=><option key={p.id} value={`person:${p.id}`}>{p.name}</option>)}{local.agents.map(a=><option key={a.id} value={`agent:${a.id}`}>{local.doats.find(d=>d.id===a.id)?.identity.name??a.name} · AI</option>)}</select></label><button type="button" className="my-work__primary" onClick={createTask}><Icon name="plus"/>New task</button>{activeCodexProjectName?<CompactActionMenu label="My Work options" actions={[{label:`Link ${activeCodexProjectName}`,onSelect:onLinkActiveCodexProject}]}/>:null}</MyWorkHeader>
      <div className="my-work__summary" aria-label="Current task status">{([{id:'assigned',label:'Assigned tasks',icon:'work'},{id:'progress',label:'In progress',icon:'operations'},{id:'completed',label:'Completed',icon:'review'},{id:'attention',label:'Needs attention',icon:'blocked'}] as const).map(item=><button key={item.id} type="button" className={metric===item.id?'is-selected':''} aria-pressed={metric===item.id} onClick={()=>setMetric(metric===item.id?'all':item.id)}><span>{item.label}<Icon name={item.icon}/></span><strong>{counts[item.id]}</strong><small>{item.id==='completed'?'Current completed tasks':item.id==='attention'?'Overdue, blocked, failed or awaiting review':'Current workspace status'}</small></button>)}</div>
      <div className="my-work__analytics-heading"><span>Recorded work · no productivity score</span><label>Analytics period<select aria-label="Analytics period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="1">Day · today</option><option value="7">Week · last 7 days</option><option value="30">Month · last 30 days</option><option value="84">Last 12 weeks</option><option value="365">Last year</option><option value="custom">Custom range</option></select></label>{period==='custom'?<><label>From<input aria-label="Activity from date" type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label><label>To<input aria-label="Activity to date" type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></label></>:null}</div>
      {invalidRange?<p className="my-work__range-error" role="alert">Choose a valid range of up to 367 days, with From before To.</p>:<div className="my-work__analytics"><WorkProgressChart summary={summary} onSelect={day=>{setMeasure('completed');root.current?.querySelector<HTMLButtonElement>(`[data-activity-date="${day.date}"]`)?.click();}}/><WorkActivityPanel onOpenRunHistory={onOpenRunHistory} summary={summary} measure={measure} onMeasure={setMeasure} onOpenTask={openTask}/></div>}
      <div className="my-work__task-heading"><div><h2>Your tasks <span>{visible.length}</span></h2><small>{worker==='all'?'All workspace records · no signed-in identity is connected':`Assigned to ${assigneeName(subject,local.people,local.agents)}`}</small></div><label className="my-work__search"><Icon name="search"/><input type="search" aria-label="Search My Work" placeholder="Search tasks…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="My Work project" value={project} onChange={e=>setProject(e.target.value)}><option value="all">All projects</option>{local.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <nav className="my-work__views" role="tablist" aria-label="My Work views">{views.map((item,i)=><button type="button" role="tab" id={`my-work-tab-${item.id}`} aria-controls={`my-work-panel-${item.id}`} aria-selected={view===item.id} tabIndex={view===item.id?0:-1} key={item.id} onClick={()=>setView(item.id)} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?views.length-1:(i+(e.key==='ArrowRight'?1:-1)+views.length)%views.length;setView(views[next].id);e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();}}><NavigationIcon name={item.icon} active={view===item.id}/>{item.label}</button>)}{metric!=='all'||query||project!=='all'?<button type="button" className="my-work__clear" onClick={()=>{setMetric('all');setQuery('');setProject('all');}}>Clear task filters</button>:null}</nav>
      {metric!=='all'?<p className="my-work__filter-note">Showing {metric==='progress'?'in-progress':metric==='attention'?'work needing attention':metric} tasks. Analytics retains the selected worker and project scope.</p>:null}
      <div className="my-work__task-views gwira-dashboard--workflow">{views.map(item=>visited.has(item.id)||view===item.id?<section key={item.id} className="my-work__view" id={`my-work-panel-${item.id}`} role="tabpanel" aria-labelledby={`my-work-tab-${item.id}`} hidden={view!==item.id}>
       {item.id==='list'?<ListView searchValue={query} onSearchValue={setQuery} records={records} selectedTaskId={selectedTaskId??undefined} onSelectTask={openTask} editableTaskIds={editable} onPatchTasks={patchTasks} onOpenTask={openTask} onHideInspector={selectedTask?closeDetails:undefined}/>:item.id==='board'?<BoardView searchValue={query} onSearchValue={setQuery} records={records} selectedTaskId={selectedTaskId??undefined} onSelectTask={openTask} onOpenTask={openTask} onAddWork={createTask} editableTaskIds={editable} onPatchTasks={patchTasks} moveReason={(id,target)=>boardTransition(local,id,target).reason} onMoveTask={(id,target)=>{const result=boardTransition(local,id,target);if(!result.status)throw Error(result.reason);onTransitionTask(id,result.status);}} onHideInspector={selectedTask?closeDetails:undefined}/>:item.id==='calendar'?<CalendarView searchValue={query} onSearchValue={setQuery} records={records} selectedTaskId={selectedTaskId??undefined} onSelectTask={openTask} onOpenTask={openTask} editableTaskIds={editable} onPatchTasks={patchTasks} onHideInspector={selectedTask?closeDetails:undefined}/>:<TimelineView records={records} selectedTaskId={selectedTaskId??undefined} onSelectTask={openTask} onHideInspector={selectedTask?closeDetails:undefined}/>}
      </section>:null)}</div>
    </div>
    {createOpen?<div className="my-work__create" role="dialog" aria-modal="true" aria-label="Create task" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setCreateOpen(false);opener.current?.focus();}if(e.key==='Tab'){const items=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><div><h2>Create task</h2><TaskCreateForm state={local} onCancel={()=>{setCreateOpen(false);opener.current?.focus();}} onSubmit={input=>{onCreateTask(input);setCreateOpen(false);opener.current?.focus();}}/></div></div>:null}
    {selectedTask?<TaskDetails onOpenRunHistory={onOpenRunHistory} key={selectedTask.id} task={selectedTask} state={local} onClose={closeDetails} onUpdate={onUpdateTask} onTransition={onTransitionTask} onAddComment={onAddComment} onDecideApproval={onDecideApproval} onStartCodingTask={onStartCodingTask} onStopCodingTask={onStopCodingTask} starting={startingTaskIds.has(selectedTask.id)} stopping={stoppingTaskIds.has(selectedTask.id)}/>:null}
  </section>;
}

function TaskCard({ task, state, selected, onOpen }: { task: Task; state: GwiraLocalState; selected: boolean; onOpen: () => void }): React.ReactElement {
  return <button type="button" className={`gwira-task-card${selected ? ' is-selected' : ''}`} onClick={onOpen}>
    <span className={`gwira-task-card__priority is-${task.priority}`}>{task.priority}</span>
    <strong>{task.title}</strong>
    <span>{assigneeName(task.assignee, state.people, state.agents)}</span>
    {task.dueDate && <time dateTime={task.dueDate}>Due {isoDateForInput(task.dueDate)}</time>}
  </button>;
}

function TaskCreateForm({ state, onCancel, onSubmit }: { state: GwiraLocalState; onCancel: () => void; onSubmit: (input: NewTaskInput) => void }): React.ReactElement {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [priority, setPriority] = useState<TaskPriority>('medium'); const [projectId, setProjectId] = useState(''); const [dueDate, setDueDate] = useState(''); const [assignee, setAssignee] = useState('');
  const formRef=useRef<HTMLFormElement>(null);
  useEffect(()=>{formRef.current?.querySelector<HTMLInputElement>('input')?.focus();},[]);
  return <form ref={formRef} className="gwira-task-form" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSubmit({ title: title.trim(), description: description.trim() || undefined, priority, projectId: projectId || undefined, dueDate: dueDate || undefined, assignee: parseAssignee(assignee) }); }}>
    <label>Task title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <TaskFields state={state} priority={priority} projectId={projectId} dueDate={dueDate} assignee={assignee} onPriority={setPriority} onProject={setProjectId} onDueDate={setDueDate} onAssignee={setAssignee} />
    <div className="gwira-task-form__actions"><button type="submit">Create task</button><button type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

export function TaskDetails({ task, state, onOpenRunHistory, onClose, onUpdate, onTransition, onAddComment, onDecideApproval, onStartCodingTask, onStopCodingTask, starting, stopping }: { task: Task; state: GwiraLocalState; onOpenRunHistory?: (id: string) => void; onClose: () => void; onUpdate: (taskId: string, input: TaskUpdateInput) => void; onTransition: (taskId: string, status: TaskStatus) => void; onAddComment: (taskId: string, body: string) => void; onDecideApproval: MyWorkPageProps['onDecideApproval']; onStartCodingTask: (taskId: string) => void; onStopCodingTask: (taskId: string) => void; starting: boolean; stopping: boolean }): React.ReactElement {
  const [title, setTitle] = useState(task.title); const [description, setDescription] = useState(task.description ?? ''); const [priority, setPriority] = useState<TaskPriority>(task.priority); const [dueDate, setDueDate] = useState(isoDateForInput(task.dueDate)); const [assignee, setAssignee] = useState(assigneeValue(task.assignee)); const [comment, setComment] = useState('');
  const comments = state.comments.filter((entry) => entry.taskId === task.id).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pendingApprovals = pendingApprovalsForTask(state.approvals, task.id);
  const detailsRef=useRef<HTMLElement>(null);
  useEffect(()=>{detailsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();},[]);
  return <aside ref={detailsRef} onKeyDown={event=>{if(event.key==='Escape'&&!document.querySelector('.compact-action-menu,.gwira-list__editor')){event.stopPropagation();onClose();}}} className="gwira-task-details" aria-label={`Task details: ${task.title}`}>
    <header><h2>Task details</h2><button type="button" onClick={onClose} aria-label="Close task details">Close</button></header>
    <form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onUpdate(task.id, { title: title.trim(), description: description.trim() || null, priority, dueDate: dueDate || null, assignee: parseAssignee(assignee) ?? null }); }}>
      <label>Task title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <p className="gwira-task-details__project">Project: {taskProjectName(task, state)}</p>
      <TaskFields state={state} priority={priority} projectId="" dueDate={dueDate} assignee={assignee} onPriority={setPriority} onProject={() => undefined} onDueDate={setDueDate} onAssignee={setAssignee} showProject={false} />
      <label>Status<select value={task.status} onChange={(event) => onTransition(task.id, event.target.value as TaskStatus)}><option value={task.status}>{labelForStatus(task.status)}</option>{allowedTaskTransitions(task.status).map((status) => <option value={status} key={status}>{labelForStatus(status)}</option>)}</select></label>
      <div className="gwira-task-details__actions"><button type="submit">Save changes</button></div>
    </form>
    {task.assignee?.kind === 'agent' ? <section className="gwira-task-details__agent-run"><h3>Coding agent</h3>{task.agentRun&&onOpenRunHistory?<button type="button" onClick={()=>onOpenRunHistory(task.id)}>View recorded Work Session</button>:null}<p>{starting ? 'Starting the local Gwira session…' : stopping ? 'Stopping the local Gwira session…' : task.agentRun?.status === 'running' ? 'Running through the local Gwira session.' : task.agentRun?.status === 'completed' ? 'Completed; awaiting or recording review.' : task.agentRun?.status === 'error' ? `Failed: ${task.agentRun.error ?? 'unknown error'}` : task.agentRun?.status === 'stopped' ? 'Stopped before completion.' : 'Ready to run with workspace-write permission.'}</p>{task.agentRun?.status === 'running' ? <button type="button" onClick={() => onStopCodingTask(task.id)} disabled={stopping}>{stopping ? 'Stopping…' : 'Stop agent'}</button> : <button type="button" onClick={() => onStartCodingTask(task.id)} disabled={task.status !== 'todo' || starting}>{starting ? 'Starting…' : 'Run coding task'}</button>}{task.agentRun?.codexConversationId ? <p>Gwira conversation: {task.agentRun.codexConversationId}</p> : null}</section> : null}
    <section className="gwira-task-details__approvals"><h3>Approvals</h3>{pendingApprovals.length === 0 ? <p>No pending approvals.</p> : pendingApprovals.map((approval) => <div key={approval.id}><p>Awaiting decision for result {approval.resultId}.</p><button type="button" onClick={() => onDecideApproval(approval.id, 'approved')}>Approve</button><button type="button" onClick={() => onDecideApproval(approval.id, 'changes_requested')}>Request changes</button></div>)}</section>
    <section className="gwira-task-details__history"><h3>Recorded history</h3>{task.agentRun?<p>Run {task.agentRun.sessionId} · {task.agentRun.status} · Started {task.agentRun.startedAt}{task.agentRun.completedAt?` · Ended ${task.agentRun.completedAt}`:''}</p>:null}{state.activity.filter(e=>e.taskId===task.id).length?<ol>{state.activity.filter(e=>e.taskId===task.id).slice().reverse().slice(0,30).map(e=><li key={e.id}><time dateTime={e.occurredAt}>{new Date(e.occurredAt).toLocaleString()}</time><span>{e.summary}</span></li>)}</ol>:<p>No retained work history.</p>}{task.dependsOnTaskIds?.length?<p>Recorded predecessors: {task.dependsOnTaskIds.map(id=>state.tasks.find(t=>t.id===id)?.title??'Unavailable task').join(', ')}</p>:null}</section>
    <section className="gwira-task-details__comments"><h3>Comments</h3>{comments.length === 0 ? <p>No comments yet.</p> : <ol>{comments.map((entry) => <li key={entry.id}><strong>{assigneeName(entry.author, state.people, state.agents)}</strong><time dateTime={entry.createdAt}>{entry.createdAt}</time><p>{entry.body}</p></li>)}</ol>}<form onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; onAddComment(task.id, comment.trim()); setComment(''); }}><label>Add comment<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label><button type="submit">Add comment</button></form></section>
  </aside>;
}

function TaskFields({ state, priority, projectId, dueDate, assignee, onPriority, onProject, onDueDate, onAssignee, showProject = true }: { state: GwiraLocalState; priority: TaskPriority; projectId: string; dueDate: string; assignee: string; onPriority: (value: TaskPriority) => void; onProject: (value: string) => void; onDueDate: (value: string) => void; onAssignee: (value: string) => void; showProject?: boolean }): React.ReactElement {
  return <div className="gwira-task-fields"><label>Priority<select value={priority} onChange={(event) => onPriority(event.target.value as TaskPriority)}>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{showProject && <label>Project<select value={projectId} onChange={(event) => onProject(event.target.value)}><option value="">No project</option>{state.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>}<label>Due date<input type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} /></label><label>Assignee<select value={assignee} onChange={(event) => onAssignee(event.target.value)}><option value="">Unassigned</option>{state.people.map((person) => <option value={`person:${person.id}`} key={`person:${person.id}`}>{person.name}</option>)}{state.agents.map((agent) => <option value={`agent:${agent.id}`} key={`agent:${agent.id}`}>{agent.name}</option>)}</select></label></div>;
}
