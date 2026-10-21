import React, { useEffect, useMemo, useState } from 'react';
import { allowedTaskTransitions } from '../domain/lifecycle.js';
import type { ApprovalStatus, Assignee, GwiraLocalState, Task, TaskPriority, TaskStatus } from '../domain/types.js';
import { assigneeName, groupTasksByStatus, pendingApprovalsForTask, taskProjectName, taskStatuses } from './workViewModel.js';

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
  description?: string;
  priority: TaskPriority;
  dueDate?: string;
  assignee?: Assignee;
}

/**
 * Presentation-only My Work surface. Its parent owns identifiers, current
 * actor selection, persistence and reducer dispatch; this component never
 * creates business records itself.
 */
export interface MyWorkPageProps {
  state: GwiraLocalState;
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

export function MyWorkPage({ state, onCreateTask, onUpdateTask, onTransitionTask, onAddComment, onDecideApproval, onStartCodingTask, onStopCodingTask, startingTaskIds, stoppingTaskIds, requestedTaskId, onRequestedTaskOpened, activeCodexProjectName, onLinkActiveCodexProject }: MyWorkPageProps): React.ReactElement {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const groups = useMemo(() => groupTasksByStatus(state.tasks), [state.tasks]);

  useEffect(() => {
    if (selectedTaskId && !state.tasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [selectedTaskId, state.tasks]);

  useEffect(() => {
    if (requestedTaskId && state.tasks.some((task) => task.id === requestedTaskId)) {
      setSelectedTaskId(requestedTaskId);
      onRequestedTaskOpened();
    }
  }, [onRequestedTaskOpened, requestedTaskId, state.tasks]);

  return <section className="gwira-my-work" aria-label="My Work">
    <header className="gwira-my-work__header">
      <div><h1>My Work</h1><p>Tasks stored in this local Gwira workspace.</p></div>
      <div className="gwira-my-work__header-actions">{activeCodexProjectName ? <button type="button" onClick={onLinkActiveCodexProject}>Link {activeCodexProjectName}</button> : null}<button type="button" className="gwira-my-work__create-button" onClick={() => setCreateOpen((open) => !open)} aria-expanded={createOpen}>New task</button></div>
    </header>
    {createOpen && <TaskCreateForm state={state} onCancel={() => setCreateOpen(false)} onSubmit={(input) => { onCreateTask(input); setCreateOpen(false); }} />}
    {state.tasks.length === 0 ? <div className="gwira-my-work__empty"><h2>No tasks yet</h2><p>Create a task to begin tracking work in this workspace.</p></div> : <div className="gwira-my-work__board" aria-label="Tasks by status">
      {groups.map((group) => <section className="gwira-my-work__column" key={group.status} aria-labelledby={`gwira-status-${group.status}`}>
        <h2 id={`gwira-status-${group.status}`}>{labelForStatus(group.status)} <span>{group.tasks.length}</span></h2>
        <div className="gwira-my-work__task-list">
          {group.tasks.map((task) => <TaskCard key={task.id} task={task} state={state} selected={task.id === selectedTaskId} onOpen={() => setSelectedTaskId(task.id)} />)}
        </div>
      </section>)}
    </div>}
    {selectedTask && <TaskDetails key={selectedTask.id} task={selectedTask} state={state} onClose={() => setSelectedTaskId(null)} onUpdate={onUpdateTask} onTransition={onTransitionTask} onAddComment={onAddComment} onDecideApproval={onDecideApproval} onStartCodingTask={onStartCodingTask} onStopCodingTask={onStopCodingTask} starting={startingTaskIds.has(selectedTask.id)} stopping={stoppingTaskIds.has(selectedTask.id)} />}
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
  return <form className="gwira-task-form" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSubmit({ title: title.trim(), description: description.trim() || undefined, priority, projectId: projectId || undefined, dueDate: dueDate || undefined, assignee: parseAssignee(assignee) }); }}>
    <label>Task title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <TaskFields state={state} priority={priority} projectId={projectId} dueDate={dueDate} assignee={assignee} onPriority={setPriority} onProject={setProjectId} onDueDate={setDueDate} onAssignee={setAssignee} />
    <div className="gwira-task-form__actions"><button type="submit">Create task</button><button type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function TaskDetails({ task, state, onClose, onUpdate, onTransition, onAddComment, onDecideApproval, onStartCodingTask, onStopCodingTask, starting, stopping }: { task: Task; state: GwiraLocalState; onClose: () => void; onUpdate: (taskId: string, input: TaskUpdateInput) => void; onTransition: (taskId: string, status: TaskStatus) => void; onAddComment: (taskId: string, body: string) => void; onDecideApproval: MyWorkPageProps['onDecideApproval']; onStartCodingTask: (taskId: string) => void; onStopCodingTask: (taskId: string) => void; starting: boolean; stopping: boolean }): React.ReactElement {
  const [title, setTitle] = useState(task.title); const [description, setDescription] = useState(task.description ?? ''); const [priority, setPriority] = useState<TaskPriority>(task.priority); const [dueDate, setDueDate] = useState(isoDateForInput(task.dueDate)); const [assignee, setAssignee] = useState(assigneeValue(task.assignee)); const [comment, setComment] = useState('');
  const comments = state.comments.filter((entry) => entry.taskId === task.id).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pendingApprovals = pendingApprovalsForTask(state.approvals, task.id);
  return <aside className="gwira-task-details" aria-label={`Task details: ${task.title}`}>
    <header><h2>Task details</h2><button type="button" onClick={onClose} aria-label="Close task details">Close</button></header>
    <form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onUpdate(task.id, { title: title.trim(), description: description.trim() || undefined, priority, dueDate: dueDate || undefined, assignee: parseAssignee(assignee) }); }}>
      <label>Task title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <p className="gwira-task-details__project">Project: {taskProjectName(task, state)}</p>
      <TaskFields state={state} priority={priority} projectId="" dueDate={dueDate} assignee={assignee} onPriority={setPriority} onProject={() => undefined} onDueDate={setDueDate} onAssignee={setAssignee} showProject={false} />
      <label>Status<select value={task.status} onChange={(event) => onTransition(task.id, event.target.value as TaskStatus)}><option value={task.status}>{labelForStatus(task.status)}</option>{allowedTaskTransitions(task.status).map((status) => <option value={status} key={status}>{labelForStatus(status)}</option>)}</select></label>
      <div className="gwira-task-details__actions"><button type="submit">Save changes</button></div>
    </form>
    {task.assignee?.kind === 'agent' ? <section className="gwira-task-details__agent-run"><h3>Coding agent</h3><p>{starting ? 'Starting the local Codex session…' : stopping ? 'Stopping the local Codex session…' : task.agentRun?.status === 'running' ? 'Running through the local Codex session.' : task.agentRun?.status === 'completed' ? 'Completed; awaiting or recording review.' : task.agentRun?.status === 'error' ? `Failed: ${task.agentRun.error ?? 'unknown error'}` : task.agentRun?.status === 'stopped' ? 'Stopped before completion.' : 'Ready to run with workspace-write permission.'}</p>{task.agentRun?.status === 'running' ? <button type="button" onClick={() => onStopCodingTask(task.id)} disabled={stopping}>{stopping ? 'Stopping…' : 'Stop agent'}</button> : <button type="button" onClick={() => onStartCodingTask(task.id)} disabled={task.status !== 'todo' || starting}>{starting ? 'Starting…' : 'Run coding task'}</button>}{task.agentRun?.codexConversationId ? <p>Codex conversation: {task.agentRun.codexConversationId}</p> : null}</section> : null}
    <section className="gwira-task-details__approvals"><h3>Approvals</h3>{pendingApprovals.length === 0 ? <p>No pending approvals.</p> : pendingApprovals.map((approval) => <div key={approval.id}><p>Awaiting decision for result {approval.resultId}.</p><button type="button" onClick={() => onDecideApproval(approval.id, 'approved')}>Approve</button><button type="button" onClick={() => onDecideApproval(approval.id, 'changes_requested')}>Request changes</button></div>)}</section>
    <section className="gwira-task-details__comments"><h3>Comments</h3>{comments.length === 0 ? <p>No comments yet.</p> : <ol>{comments.map((entry) => <li key={entry.id}><strong>{assigneeName(entry.author, state.people, state.agents)}</strong><time dateTime={entry.createdAt}>{entry.createdAt}</time><p>{entry.body}</p></li>)}</ol>}<form onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; onAddComment(task.id, comment.trim()); setComment(''); }}><label>Add comment<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label><button type="submit">Add comment</button></form></section>
  </aside>;
}

function TaskFields({ state, priority, projectId, dueDate, assignee, onPriority, onProject, onDueDate, onAssignee, showProject = true }: { state: GwiraLocalState; priority: TaskPriority; projectId: string; dueDate: string; assignee: string; onPriority: (value: TaskPriority) => void; onProject: (value: string) => void; onDueDate: (value: string) => void; onAssignee: (value: string) => void; showProject?: boolean }): React.ReactElement {
  return <div className="gwira-task-fields"><label>Priority<select value={priority} onChange={(event) => onPriority(event.target.value as TaskPriority)}>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{showProject && <label>Project<select value={projectId} onChange={(event) => onProject(event.target.value)}><option value="">No project</option>{state.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>}<label>Due date<input type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} /></label><label>Assignee<select value={assignee} onChange={(event) => onAssignee(event.target.value)}><option value="">Unassigned</option>{state.people.map((person) => <option value={`person:${person.id}`} key={`person:${person.id}`}>{person.name}</option>)}{state.agents.map((agent) => <option value={`agent:${agent.id}`} key={`agent:${agent.id}`}>{agent.name}</option>)}</select></label></div>;
}
