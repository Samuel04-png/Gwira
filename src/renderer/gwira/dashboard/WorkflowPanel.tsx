import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ActivityEvent, Assignee, GwiraLocalState, TaskPriority } from '../domain/types.js';
import type { NewTaskInput, TaskUpdateInput } from '../work/MyWorkPage.js';
import { doatToUiRecord } from '../doats/doatViewModel.js';
import { DoatAvatar } from '../doats/ui/DoatAvatar.js';
import { createProceduralAvatarSpec } from '../doats/ui/avatarModel.js';
import type { DoatOperationalStatus } from '../doats/ui/types.js';
import { activityDayLabel, formatActivityTimestamp, matchesActivityFilter, type ActivityFilter } from './dashboardModel.js';
import { relativeTime, recentActivity, workerGroup, workflowWorkers, type WorkflowWorker } from './workflowPanelModel.js';
import type { FreshBlendDemo } from '../graph/freshBlendDemo.js';
import type { WorkGraph, WorkGraphEdge, WorkGraphNode } from '../graph/graphModel.js';

type PanelTab = 'team' | 'activity';
type InspectorMode = 'context' | 'inspect' | 'edit' | 'create';
type WorkDraft = { title: string; description: string; priority: TaskPriority; dueDate: string; assignee: string };

export interface WorkflowPanelHandle {
  requestSelectNode: (nodeId?: string) => void;
  requestSelectEdge: (edgeId?: string) => void;
  beginCreate: (kind: 'humanWork' | 'doatWork') => void;
}

export const WorkflowPanel = forwardRef<WorkflowPanelHandle, {
  id: string;
  hidden?: boolean;
  state: GwiraLocalState;
  graph: WorkGraph;
  selectedNode?: WorkGraphNode;
  selectedEdge?: WorkGraphEdge;
  demo?: FreshBlendDemo;
  fixtureName?: string;
  onOpenTask: (taskId: string) => void;
  onAskAboutRecord: (recordId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId?: string) => void;
  onCreateTask: (input: NewTaskInput) => string;
  onUpdateTask: (taskId: string, input: TaskUpdateInput) => void;
}>(({ id, hidden = false, state, graph, selectedNode, selectedEdge, demo, fixtureName, onOpenTask, onAskAboutRecord, onSelectNode, onSelectEdge, onCreateTask, onUpdateTask }, ref): React.ReactElement => {
  const [tab, setTab] = useState<PanelTab>('team');
  const [mode, setMode] = useState<InspectorMode>('context');
  const [draft, setDraft] = useState<WorkDraft>();
  const [formError, setFormError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<(() => void)>();
  const [createKind, setCreateKind] = useState<'humanWork' | 'doatWork'>('humanWork');
  const selectionBeforeCreate = useRef<string | undefined>(undefined);
  const workers = useMemo(() => workflowWorkers(state), [state]);
  const activity = useMemo(() => recentActivity(state), [state]);
  const objective = graph.objectives[0];
  const selectedTaskId = selectedNode?.data.type === 'approval' ? selectedNode.data.taskId : selectedNode?.data.id;
  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId);
  const isDemoOrFixture = Boolean(demo || fixtureName);
  const eligiblePeople = state.people.filter((person) => person.workspaceId === state.workspace.id);
  const eligibleDoats = state.doats.filter((doat) => doat.workspaceId === state.workspace.id && !doat.archivedAt && state.agents.some((agent) => agent.id === doat.id));
  const isDraftDirty = mode === 'create'
    ? Boolean(draft && (draft.title.trim() || draft.description.trim() || draft.dueDate || draft.assignee))
    : mode === 'edit' && selectedTask && draft
      ? draft.title !== selectedTask.title || draft.description !== (selectedTask.description ?? '') || draft.priority !== selectedTask.priority || draft.dueDate !== (selectedTask.dueDate?.slice(0, 10) ?? '') || draft.assignee !== assigneeValue(selectedTask.assignee)
      : false;

  useEffect(() => {
    if (mode === 'edit' || mode === 'create') return;
    setMode(selectedNode || selectedEdge ? 'inspect' : 'context');
  }, [mode, selectedEdge?.id, selectedNode?.id]);

  function chooseTab(next: PanelTab): void {
    setTab(next);
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const tabs: PanelTab[] = ['team', 'activity'];
    const currentIndex = tabs.indexOf(tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    chooseTab(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#context-tab-${next}`)?.focus();
  }

  function applySelection(nodeId?: string): void {
    onSelectNode(nodeId ?? '');
    onSelectEdge(undefined);
    setMode(nodeId ? 'inspect' : 'context');
    setDraft(undefined);
    setFormError(undefined);
  }

  function requestAction(action: () => void): void {
    if ((mode === 'edit' || mode === 'create') && isDraftDirty) {
      setPendingAction(() => action);
      return;
    }
    action();
  }

  function cancelForm(): void {
    const previous = mode === 'create' ? selectionBeforeCreate.current : selectedNode?.id;
    setMode(previous ? 'inspect' : 'context');
    setDraft(undefined);
    setFormError(undefined);
    setPendingAction(undefined);
    if (mode === 'create') {
      if (previous?.startsWith('edge:')) {
        onSelectNode('');
        onSelectEdge(previous.slice('edge:'.length));
      } else applySelection(previous);
    }
  }

  function validAssignee(value: string): Assignee | undefined {
    const [kind, id] = value.split(':', 2);
    if (kind === 'person' && id && eligiblePeople.some((person) => person.id === id)) return { kind, id };
    if (kind === 'agent' && id && eligibleDoats.some((doat) => doat.id === id)) return { kind, id };
    return undefined;
  }

  function saveDraft(): boolean {
    if (!draft || !draft.title.trim()) { setFormError('Enter a task title.'); return false; }
    if (!validAssignee(draft.assignee)) { setFormError('Choose an assigned person or an available Doat in this workspace.'); return false; }
    if (mode === 'create') {
      if (createKind === 'humanWork' && !draft.assignee.startsWith('person:')) { setFormError('Human work must be assigned to a person.'); return false; }
      if (createKind === 'doatWork' && !draft.assignee.startsWith('agent:')) { setFormError('Doat work must be assigned to a configured Doat.'); return false; }
      const taskId = onCreateTask({ title: draft.title.trim(), description: draft.description.trim() || undefined, priority: draft.priority, dueDate: draft.dueDate || undefined, assignee: validAssignee(draft.assignee) });
      const nodeType = draft.assignee.startsWith('agent:') ? 'doatWork' : 'humanWork';
      setMode('inspect');
      setDraft(undefined);
      setFormError(undefined);
      selectionBeforeCreate.current = undefined;
      onSelectNode(`${nodeType}:${taskId}`);
      return true;
    }
    if (mode === 'edit' && selectedTask) {
      const assignee = validAssignee(draft.assignee);
      if (!assignee) { setFormError('Choose an assigned person or an available Doat in this workspace.'); return false; }
      onUpdateTask(selectedTask.id, { title: draft.title.trim(), description: draft.description.trim() || null, priority: draft.priority, dueDate: draft.dueDate || null, assignee });
      const nodeType = assignee.kind === 'agent' ? 'doatWork' : 'humanWork';
      setMode('inspect');
      setDraft(undefined);
      setFormError(undefined);
      onSelectNode(`${nodeType}:${selectedTask.id}`);
      return true;
    }
    return false;
  }

  useImperativeHandle(ref, () => ({
    requestSelectNode: (nodeId) => requestAction(() => applySelection(nodeId)),
    requestSelectEdge: (edgeId) => requestAction(() => {
      onSelectNode('');
      onSelectEdge(edgeId);
      setMode(edgeId ? 'inspect' : 'context');
      setDraft(undefined);
      setFormError(undefined);
    }),
    beginCreate: (kind) => requestAction(() => {
      selectionBeforeCreate.current = selectedNode?.id ?? (selectedEdge ? `edge:${selectedEdge.id}` : undefined);
      setCreateKind(kind);
      setDraft({ title: '', description: '', priority: 'medium', dueDate: '', assignee: '' });
      setFormError(undefined);
      setMode('create');
    })
  }), [isDraftDirty, mode, onSelectEdge, onSelectNode, selectedEdge?.id, selectedNode?.id]);

  useEffect(() => {
    if (!isDraftDirty) return;
    function warnBeforeClose(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [isDraftDirty]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || hidden) return;
      if (mode === 'inspect' && (selectedNode || selectedEdge)) {
        event.preventDefault();
        requestAction(() => {
          if (selectedEdge) {
            onSelectEdge(undefined);
            setMode('context');
          } else applySelection(undefined);
        });
      } else if (mode === 'edit' || mode === 'create') {
        event.preventDefault();
        requestAction(cancelForm);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const heading = mode === 'inspect' ? selectedEdge ? 'Inspect connection' : 'Inspect work' : mode === 'edit' ? 'Edit work' : mode === 'create' ? 'Add work' : 'Workspace context';
  const subheading = mode === 'inspect' ? selectedEdge ? 'Recorded relationship' : selectedNode?.data.title : demo?.label ?? objective?.title ?? state.workspace.name;
  return <aside id={id} className="gwira-workflow-panel" aria-label="Dashboard context" hidden={hidden}>
    <header className="gwira-workflow-panel__header">
      <div><h2>{heading}</h2><span>{subheading}</span></div>
      {mode === 'inspect' ? <button type="button" onClick={() => requestAction(() => {
        if (selectedEdge) { onSelectEdge(undefined); setMode('context'); }
        else applySelection(undefined);
      })} aria-label="Back to workspace context" title="Back to workspace context">←</button> : null}
    </header>
    <div className="gwira-workflow-panel__content" id="gwira-context-panel-content">
      {mode === 'inspect' && selectedEdge
        ? <SelectedConnection edge={selectedEdge} graph={graph} />
        : mode === 'inspect' && selectedNode
        ? <SelectedWork node={selectedNode} graph={graph} state={state} demo={demo} isFixture={Boolean(fixtureName)} editable={!isDemoOrFixture && Boolean(selectedTask) && selectedTask?.agentRun?.status !== 'running'} onOpenTask={onOpenTask} onAskAboutRecord={onAskAboutRecord} onEdit={() => {
          if (!selectedTask) return;
          setDraft({ title: selectedTask.title, description: selectedTask.description ?? '', priority: selectedTask.priority, dueDate: selectedTask.dueDate?.slice(0, 10) ?? '', assignee: assigneeValue(selectedTask.assignee) });
          setMode('edit');
        }} />
        : mode === 'edit' || mode === 'create'
          ? <WorkForm
              kind={mode === 'create' ? createKind : 'edit'}
              draft={draft ?? { title: '', description: '', priority: 'medium', dueDate: '', assignee: '' }}
              people={eligiblePeople}
              doats={eligibleDoats}
              error={formError}
              onChange={setDraft}
              onSubmit={(event) => { event.preventDefault(); saveDraft(); }}
              onCancel={() => requestAction(cancelForm)}
            />
          : <ContextView
              tab={tab}
              onTab={chooseTab}
              onKeyDown={onTabKeyDown}
              demo={demo}
              fixtureName={fixtureName}
              graph={graph}
              workers={workers}
              activity={activity}
              state={state}
              onOpenTask={onOpenTask}
              onSelectNode={(id) => requestAction(() => applySelection(id))}
            />}
    </div>
    {pendingAction ? <div className="gwira-inspector-confirm" role="alertdialog" aria-modal="true" aria-label="Unsaved changes">
      <strong>Unsaved changes</strong><p>Save or discard this draft before leaving it.</p>
      <div>
        <button type="button" onClick={() => {
          if (!saveDraft()) return;
          const action = pendingAction;
          setPendingAction(undefined);
          action();
        }}>Save and continue</button>
        <button type="button" onClick={() => {
          const action = pendingAction;
          cancelForm();
          setPendingAction(undefined);
          action();
        }}>Discard changes</button>
        <button type="button" onClick={() => setPendingAction(undefined)}>Continue editing</button>
      </div>
    </div> : null}
  </aside>;
});

WorkflowPanel.displayName = 'WorkflowPanel';

function assigneeValue(assignee?: Assignee): string {
  return assignee ? `${assignee.kind}:${assignee.id}` : '';
}

function formatDueDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ContextView({ tab, onTab, onKeyDown, demo, fixtureName, graph, workers, activity, state, onOpenTask, onSelectNode }: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  demo?: FreshBlendDemo;
  fixtureName?: string;
  graph: WorkGraph;
  workers: WorkflowWorker[];
  activity: ActivityEvent[];
  state: GwiraLocalState;
  onOpenTask: (taskId: string) => void;
  onSelectNode: (nodeId: string) => void;
}): React.ReactElement {
  return <>
    <div className="gwira-workflow-panel__tabs" role="tablist" aria-label="Workspace context">
      <PanelTabButton id="team" selected={tab === 'team'} onSelect={onTab} onKeyDown={onKeyDown}>Team</PanelTabButton>
      <PanelTabButton id="activity" selected={tab === 'activity'} onSelect={onTab} onKeyDown={onKeyDown}>Activity</PanelTabButton>
    </div>
    <div role="tabpanel" aria-labelledby={`context-tab-${tab}`}>
      {tab === 'activity'
        ? demo ? <DemoActivity demo={demo} />
          : fixtureName ? <p className="gwira-workflow-panel__empty">Development fixtures have no recorded workspace activity.</p>
            : <Activity state={state} activity={activity} onOpenTask={onOpenTask} />
        : demo ? <DemoTeam graph={graph} onSelectNode={onSelectNode} />
          : fixtureName ? <FixtureTeam graph={graph} onSelectNode={onSelectNode} />
            : <Team workers={workers} onSelectNode={onSelectNode} />}
    </div>
  </>;
}

function WorkForm({ kind, draft, people, doats, error, onChange, onSubmit, onCancel }: {
  kind: 'humanWork' | 'doatWork' | 'edit';
  draft: WorkDraft;
  people: GwiraLocalState['people'];
  doats: GwiraLocalState['doats'];
  error?: string;
  onChange: React.Dispatch<React.SetStateAction<WorkDraft | undefined>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}): React.ReactElement {
  const availablePeople = people;
  const availableDoats = doats;
  const options = kind === 'humanWork'
    ? availablePeople.map((person) => ({ value: `person:${person.id}`, label: person.name }))
    : kind === 'doatWork'
      ? availableDoats.map((doat) => ({ value: `agent:${doat.id}`, label: doat.identity.name }))
      : [
          ...availablePeople.map((person) => ({ value: `person:${person.id}`, label: person.name })),
          ...availableDoats.map((doat) => ({ value: `agent:${doat.id}`, label: `${doat.identity.name} · Doat` }))
        ];
  return <form className="gwira-inspector-form" onSubmit={onSubmit}>
    <p className="gwira-inspector-form__scope">Local workspace changes · no hosted save or authorization is implied.</p>
    <label>Task title<input autoFocus required maxLength={160} value={draft.title} onChange={(event) => onChange((current) => current ? { ...current, title: event.target.value } : current)} /></label>
    <label>Description<textarea rows={3} maxLength={4000} value={draft.description} onChange={(event) => onChange((current) => current ? { ...current, description: event.target.value } : current)} /></label>
    <label>Assigned {kind === 'humanWork' ? 'person' : kind === 'doatWork' ? 'Doat' : 'owner'}
      <select required value={draft.assignee} onChange={(event) => onChange((current) => current ? { ...current, assignee: event.target.value } : current)}>
        <option value="">Choose an owner</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <label>Priority<select value={draft.priority} onChange={(event) => onChange((current) => current ? { ...current, priority: event.target.value as TaskPriority } : current)}>
      {(['low', 'medium', 'high', 'urgent'] as const).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
    </select></label>
    <label>Due date<input type="date" value={draft.dueDate} onChange={(event) => onChange((current) => current ? { ...current, dueDate: event.target.value } : current)} /></label>
    {!options.length ? <p className="gwira-inspector-form__error">Add a workspace person or a configured Doat before creating this work type.</p> : null}
    {error ? <p className="gwira-inspector-form__error" role="alert">{error}</p> : null}
    <div className="gwira-inspector-form__actions">
      <button type="submit" disabled={!options.length}>{kind === 'edit' ? 'Save changes' : 'Create work'}</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

function PanelTabButton({ id, selected, onSelect, onKeyDown, children }: { id: PanelTab; selected: boolean; onSelect: (tab: PanelTab) => void; onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void; children: React.ReactNode }): React.ReactElement {
  return <button type="button" role="tab" id={`context-tab-${id}`} aria-controls="gwira-context-panel-content" aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onSelect(id)} onKeyDown={onKeyDown}>{children}</button>;
}

function SelectedWork({ node, graph, state, demo, isFixture, editable, onOpenTask, onAskAboutRecord, onEdit }: {
  node: WorkGraphNode;
  graph: WorkGraph;
  state: GwiraLocalState;
  demo?: FreshBlendDemo;
  isFixture: boolean;
  editable: boolean;
  onOpenTask: (taskId: string) => void;
  onAskAboutRecord: (recordId: string) => void;
  onEdit: () => void;
}): React.ReactElement {
  const record = node.data;
  const taskId = record.type === 'approval' ? record.taskId : record.id;
  const task = state.tasks.find((entry) => entry.id === taskId);
  const demoTask = demo?.records.tasks?.find((entry) => entry.id === taskId);
  const associatedTask = task ?? demoTask;
  const edgesIn = graph.edges.filter((edge) => edge.target === node.id);
  const edgesOut = graph.edges.filter((edge) => edge.source === node.id);
  const connectedNames = (edges: typeof graph.edges) => edges.flatMap((edge) => {
    const otherId = edge.source === node.id ? edge.target : edge.source;
    const other = graph.nodes.find((entry) => entry.id === otherId);
    return other ? [`${other.data.title}${other.data.ownerName ? ` · ${other.data.ownerName}` : ''}`] : [];
  });
  const taskActivity = state.activity.filter((entry) => entry.taskId === taskId).slice(-5).reverse();
  const comments = state.comments.filter((entry) => entry.taskId === taskId).slice(-3).reverse();
  const nodeStatus = record.status ?? 'default';
  const status = nodeStatus === 'default' ? 'Ready' : nodeStatus[0].toUpperCase() + nodeStatus.slice(1);
  const owner = record.type === 'approval' ? record.reviewerName ?? 'Not recorded' : record.ownerName ?? 'Unassigned';
  const typeLabel = record.type === 'humanWork' ? 'Human work' : record.type === 'doatWork' ? 'Doat work' : record.type === 'approval' ? 'Approval' : 'Unassigned work';
  const isDoat = record.type === 'doatWork';
  return <div className="gwira-workflow-inspector">
    <div className="gwira-workflow-inspector__summary">
      <span className={`gwira-workflow-status is-${nodeStatus}`}><i aria-hidden="true">{nodeStatus === 'completed' ? '✓' : nodeStatus === 'waiting' ? '◐' : nodeStatus === 'failed' ? '■' : nodeStatus === 'working' ? '◔' : '○'}</i>{status}</span>
      <p>{record.description || record.subtitle || `${typeLabel} assigned to ${owner}.`}</p>
    </div>
    <dl className="gwira-workflow-inspector__facts">
      <div><dt>Type</dt><dd>{typeLabel}</dd></div>
      <div><dt>{record.type === 'approval' ? record.reviewerName ? 'Decided by' : 'Approver' : 'Owner'}</dt><dd>{record.type === 'approval' && !record.reviewerName ? 'Not recorded' : owner}</dd></div>
      {record.type === 'approval' ? <div><dt>Requested by</dt><dd>{record.requestedByName ?? 'Not recorded'}</dd></div> : null}
      {record.priority ? <div><dt>Priority</dt><dd>{record.priority.charAt(0).toUpperCase() + record.priority.slice(1)}</dd></div> : null}
      {record.dueDate ? <div><dt>Due</dt><dd>{formatDueDate(record.dueDate)}</dd></div> : null}
      {record.updatedAt ? <div><dt>Updated</dt><dd>{relativeTime(record.updatedAt)}</dd></div> : null}
      {record.resultId ? <div><dt>Result reference</dt><dd>{record.resultId}</dd></div> : null}
    </dl>
    {record.type === 'approval' ? <section className="gwira-workflow-inspector__section">
      <h3>Approval requirement</h3>
      <p>{record.subtitle || 'Approval decision is recorded separately from task status.'}</p>
      {record.createdAt ? <small>Requested {relativeTime(record.createdAt)}</small> : null}
      {record.decidedAt ? <small>Decision recorded {relativeTime(record.decidedAt)}</small> : null}
      {task ? <p>Related work · {task.title}</p> : null}
      <small>Approval decisions are not editable as task status.</small>
    </section> : null}
    {(edgesIn.length || edgesOut.length) ? <section className="gwira-workflow-inspector__section">
      <h3>Connections</h3>
      {edgesIn.length ? <div><small>{edgesIn.some((edge) => edge.type === 'gates') ? 'Gated by' : 'Receives from'}</small>{connectedNames(edgesIn).map((name) => <p key={`in-${name}`}>{name}</p>)}</div> : null}
      {edgesOut.length ? <div><small>{edgesOut.some((edge) => edge.type === 'gates') ? 'Approval for' : 'Hands off to'}</small>{connectedNames(edgesOut).map((name) => <p key={`out-${name}`}>{name}</p>)}</div> : null}
    </section> : <p className="gwira-workflow-inspector__note">No verified dependencies are recorded for this work.</p>}
    {isDoat && (record.doatRunId || task?.agentRun) ? <section className="gwira-workflow-inspector__section">
      <h3>Run</h3>
      <p>{record.runStatus ?? task?.agentRun?.status ?? 'Recorded run'}{record.doatRunId ? ` · ${record.doatRunId}` : ''}</p>
      <small>Detailed logs and tool calls are available only when recorded by the local run provider.</small>
    </section> : null}
    {(taskActivity.length || comments.length) ? <section className="gwira-workflow-inspector__section">
      <h3>Recent activity</h3>
      {taskActivity.map((event) => <p key={event.id}>{event.summary}<small>{relativeTime(event.occurredAt)}</small></p>)}
      {comments.map((comment) => <p key={comment.id}>{comment.body}<small>Comment · {relativeTime(comment.createdAt)}</small></p>)}
    </section> : null}
    <div className="gwira-workflow-inspector__actions">
      {task ? <button type="button" onClick={() => onOpenTask(task.id)}>Open task</button> : null}
      {!isFixture && !demo && task ? <button type="button" onClick={() => onAskAboutRecord(task.id)}>Ask Gwira</button> : null}
      {editable && task && record.type !== 'approval' ? <button type="button" onClick={onEdit}>Edit</button> : null}
    </div>
    {task?.agentRun?.status === 'running' ? <p className="gwira-workflow-inspector__note">Editing is unavailable while this Doat run is active.</p> : null}
    {!associatedTask && !demo && !isFixture ? <p className="gwira-workflow-inspector__note">This local task is not available in the current workspace.</p> : null}
  </div>;
}

function SelectedConnection({ edge, graph }: { edge: WorkGraphEdge; graph: WorkGraph }): React.ReactElement {
  const source = graph.nodes.find((node) => node.id === edge.source);
  const target = graph.nodes.find((node) => node.id === edge.target);
  const label = edge.type === 'gates' ? 'Approval gate' : 'Dependency';
  return <div className="gwira-workflow-inspector">
    <span className="gwira-workflow-status is-default">{label}</span>
    <dl className="gwira-workflow-inspector__facts">
      <div><dt>From</dt><dd>{source?.data.title ?? 'Unavailable source'}</dd></div>
      <div><dt>To</dt><dd>{target?.data.title ?? 'Unavailable destination'}</dd></div>
      <div><dt>Relationship</dt><dd>{label}</dd></div>
    </dl>
  </div>;
}

function DemoTeam({ graph, onSelectNode }: { graph: WorkGraph; onSelectNode: (nodeId: string) => void }): React.ReactElement {
  const work = graph.nodes.filter((node) => node.type !== 'approval').map((node) => ({
    node,
    name: node.type === 'unassignedWork' ? 'Unassigned work' : node.data.ownerName ?? 'Unassigned',
    kind: node.type === 'doatWork' ? 'doat' as const : node.type === 'humanWork' ? 'person' as const : 'unassigned' as const,
    detail: node.data.title,
    status: displayGraphStatus(node),
    updatedAt: node.data.updatedAt
  }));
  return <TeamRows rows={work} onSelectNode={onSelectNode} emptyMessage="This demo objective has no work items." />;
}

function FixtureTeam({ graph, onSelectNode }: { graph: WorkGraph; onSelectNode: (nodeId: string) => void }): React.ReactElement {
  const work = graph.nodes.filter((node) => node.type !== 'approval').map((node) => ({
    node,
    name: node.type === 'unassignedWork' ? 'Unassigned work' : node.data.ownerName ?? 'Unassigned',
    kind: node.type === 'doatWork' ? 'doat' as const : node.type === 'humanWork' ? 'person' as const : 'unassigned' as const,
    detail: node.data.title,
    status: displayGraphStatus(node),
    updatedAt: node.data.updatedAt
  }));
  return <TeamRows rows={work} onSelectNode={onSelectNode} emptyMessage="This development fixture has no work records." />;
}

function displayGraphStatus(node: WorkGraphNode): string {
  const status = node.data.status ?? 'default';
  if (status === 'waiting') return 'Needs approval';
  if (status === 'blocked') return 'Blocked';
  if (status === 'failed') return 'Failed';
  if (status === 'working') return 'Working';
  if (status === 'completed') return 'Completed';
  return 'Queued';
}

type TeamRow = {
  node?: WorkGraphNode;
  id?: string;
  name: string;
  kind: 'person' | 'doat' | 'unassigned';
  detail: string;
  status: string;
  updatedAt?: string;
  avatar?: ReturnType<typeof doatToUiRecord>['avatar'];
};

function TeamRows({ rows, onSelectNode, emptyMessage }: { rows: TeamRow[]; onSelectNode: (nodeId: string) => void; emptyMessage: string }): React.ReactElement {
  if (!rows.length) return <div className="gwira-workflow-panel__empty"><strong>No work items</strong><span>{emptyMessage}</span></div>;
  const groupId = (row: TeamRow): 'attention' | 'working' | 'idle' => {
    const status = row.status.toLowerCase();
    if (['blocked', 'failed', 'needs approval', 'needs review'].includes(status)) return 'attention';
    if (status === 'working') return 'working';
    return 'idle';
  };
  return <div className="gwira-workflow-panel__scroll">{([
    { id: 'attention', label: 'Needs attention' },
    { id: 'working', label: 'Working' },
    { id: 'idle', label: 'Idle' }
  ] as const).map((group) => {
    const entries = rows.filter((row) => groupId(row) === group.id);
    if (!entries.length) return null;
    const content = entries.map((row, index) => <WorkerRow
      key={row.node?.id ?? `${row.kind}:${row.id ?? index}`}
      name={row.name}
      kind={row.kind}
      detail={row.detail}
      status={row.status}
      updatedAt={row.updatedAt}
      avatar={row.avatar}
      onClick={row.node ? () => onSelectNode(row.node?.id ?? '') : undefined}
    />);
    return group.id === 'idle'
      ? <details className="gwira-workflow-panel__group" key={group.id}><summary>{group.label}<span>{entries.length}</span></summary>{content}</details>
      : <section className="gwira-workflow-panel__group" key={group.id}><h3>{group.label}<span>{entries.length}</span></h3>{content}</section>;
  })}</div>;
}

function Team({ workers, onSelectNode }: { workers: WorkflowWorker[]; onSelectNode: (nodeId: string) => void }): React.ReactElement {
  const rows: TeamRow[] = workers.map((worker) => ({
    id: worker.id,
    name: worker.name,
    kind: worker.kind,
    detail: worker.task?.title ?? worker.role,
    status: worker.status,
    updatedAt: worker.updatedAt,
    avatar: worker.avatar
  }));
  return <TeamRows rows={rows} onSelectNode={onSelectNode} emptyMessage="People and Doats will appear here when they have workspace records." />;
}

function WorkerRow({ name, kind, detail, status, updatedAt, avatar, onClick }: {
  name: string;
  kind: 'person' | 'doat' | 'unassigned';
  detail: string;
  status: string;
  updatedAt?: string;
  avatar?: TeamRow['avatar'];
  onClick?: () => void;
}): React.ReactElement {
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const doatStatus = avatarStatus(status);
  return <button type="button" className="gwira-worker-row" disabled={!onClick} onClick={onClick}>
    <span className={`gwira-worker-row__mark is-${kind}`} aria-hidden="true">
      {kind === 'doat' ? <DoatAvatar spec={avatar ?? createProceduralAvatarSpec(name)} status={doatStatus} size={24} label={name} /> : kind === 'person' ? initials : '—'}
    </span>
    <span className="gwira-worker-row__content">
      <strong>{name}</strong><small>{detail}</small>
      <span className={`gwira-worker-row__status is-${status.toLowerCase().replaceAll(' ', '-')}`}><i aria-hidden="true" />{status}</span>
      {updatedAt ? <time dateTime={updatedAt}>{formatActivityTimestamp(updatedAt)}</time> : null}
    </span>
  </button>;
}

function avatarStatus(status: string): DoatOperationalStatus {
  const normalized = status.toLowerCase();
  if (normalized === 'working') return 'working';
  if (normalized === 'needs approval') return 'waiting_approval';
  if (normalized === 'blocked') return 'blocked';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'unavailable') return 'unavailable';
  return 'idle';
}

function DemoActivity({ demo }: { demo: FreshBlendDemo }): React.ReactElement {
  return <div className="gwira-workflow-panel__scroll">
    {demo.activity.length ? <ol className="gwira-workflow-activity">{demo.activity.slice().sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).map((entry) => <li key={entry.id}>
      <span className="gwira-workflow-activity__mark is-demo" aria-hidden="true">·</span>
      <div><strong>{entry.summary}</strong><small><time dateTime={entry.occurredAt}>{formatActivityTimestamp(entry.occurredAt)}</time> · Simulated demo activity</small></div>
    </li>)}</ol> : <p className="gwira-workflow-panel__empty">This demo objective has no activity events.</p>}
  </div>;
}

function Activity({ state, activity, onOpenTask }: { state: GwiraLocalState; activity: ActivityEvent[]; onOpenTask: (taskId: string) => void }): React.ReactElement {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const filters: Array<{ id: ActivityFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'humans', label: 'Humans' },
    { id: 'doats', label: 'Doats' },
    { id: 'approvals', label: 'Approvals' }
  ];
  const filtered = activity.filter((event) => matchesActivityFilter(event, filter));
  const grouped = new Map<string, ActivityEvent[]>();
  filtered.slice(0, 30).forEach((event) => {
    const day = activityDayLabel(event.occurredAt);
    grouped.set(day, [...(grouped.get(day) ?? []), event]);
  });
  if (!activity.length) return <div className="gwira-workflow-panel__empty"><strong>No recorded activity</strong><span>Meaningful workspace events will appear here when they are recorded.</span></div>;
  return <div className="gwira-workflow-panel__scroll">
    <div className="gwira-workflow-activity-filters" role="group" aria-label="Filter activity">
      {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
    </div>
    {grouped.size ? [...grouped].map(([day, events]) => <section key={day} className="gwira-workflow-activity-day" aria-label={day}>
      <h3>{day}</h3>
      <ol className="gwira-workflow-activity">{events.map((event) => {
      const actor = event.actor?.kind === 'person'
        ? state.people.find((person) => person.id === event.actor?.id)
        : event.actor?.kind === 'agent'
          ? state.doats.find((doat) => doat.id === event.actor?.id)
          : undefined;
      const actorName = actor && 'identity' in actor ? actor.identity.name : actor?.name;
      const actorAvatar = actor && 'identity' in actor ? doatToUiRecord(actor, state).avatar : undefined;
      const approval = event.approvalId ? state.approvals.find((entry) => entry.id === event.approvalId) : undefined;
      const relatedTaskId = event.taskId ?? approval?.taskId;
      const relatedTask = relatedTaskId ? state.tasks.find((task) => task.id === relatedTaskId) : undefined;
      return <li key={event.id}>
        <ActorMark name={actorName} kind={event.actor?.kind} avatar={actorAvatar} />
        <div className="gwira-workflow-activity__body">
          <strong>{event.summary}</strong>
          {actorName ? <small>By {actorName}</small> : null}
          <small><time dateTime={event.occurredAt}>{formatActivityTimestamp(event.occurredAt)}</time></small>
          {relatedTask ? <button type="button" className="gwira-workflow-activity__related" onClick={() => onOpenTask(relatedTask.id)}>{relatedTask.title}</button> : null}
        </div>
      </li>;
      })}</ol>
    </section>) : <p className="gwira-workflow-panel__empty">No activity matches this filter.</p>}
  </div>;
}

function ActorMark({ name, kind, avatar }: { name?: string; kind?: 'person' | 'agent'; avatar?: TeamRow['avatar'] }): React.ReactElement {
  const initials = name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '·';
  return <span className={`gwira-workflow-activity__mark is-${kind === 'agent' ? 'doat' : kind === 'person' ? 'person' : 'unknown'}`} aria-hidden="true">
    {kind === 'agent' && name ? <DoatAvatar spec={avatar ?? createProceduralAvatarSpec(name)} status="idle" size={22} label={name} /> : initials}
  </span>;
}
