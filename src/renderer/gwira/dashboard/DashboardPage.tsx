import React, { useMemo, useRef, useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { WorkflowCanvas } from '../graph/WorkflowCanvas.js';
import { TimelineView } from '../timeline/TimelineView.js';
import { localStateToGraphRecords } from '../graph/localGraphAdapter.js';
import { buildGraph } from '../graph/graphModel.js';
import { freshBlendDemo, type FreshBlendScenario } from '../graph/freshBlendDemo.js';
import { readDevWorkflowFixture, workflowFixture } from '../graph/workflowFixtures.js';
import { PlanProposalPreview } from '../proposals/PlanProposalPreview.js';
import { dashboardProgressText, dashboardTitle, dashboardViews, summarizeDashboard, type DashboardView } from './dashboardModel.js';
import { WorkflowPanel, type WorkflowPanelHandle } from './WorkflowPanel.js';
import type { NewTaskInput, TaskUpdateInput } from '../work/MyWorkPage.js';

type DashboardProps = {
  state: GwiraLocalState;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  onStartConversation: (message: string) => Promise<boolean>;
  onAskAboutRecord: (recordId: string) => void;
  onOpenTask: (taskId: string) => void;
  onCreateTask: (input: NewTaskInput) => string;
  onUpdateTask: (taskId: string, input: TaskUpdateInput) => void;
};

function hasOperationalRecords(state: GwiraLocalState): boolean {
  return state.tasks.length > 0 || state.doats.length > 0 || state.people.length > 0 || state.approvals.length > 0 || state.activity.some((entry) => entry.kind !== 'workspace_created');
}

export function DashboardPage({ state, panelOpen, onPanelOpenChange, onStartConversation, onAskAboutRecord, onOpenTask, onCreateTask, onUpdateTask }: DashboardProps): React.ReactElement {
  const records = useMemo(() => localStateToGraphRecords(state), [state]);
  const [demoScenario, setDemoScenario] = useState<FreshBlendScenario>();
  const demo = useMemo(() => import.meta.env.DEV && demoScenario ? freshBlendDemo(demoScenario) : undefined, [demoScenario]);
  const [fixtureName, setFixtureName] = useState(import.meta.env.DEV ? readDevWorkflowFixture : undefined);
  const fixture = useMemo(() => fixtureName ? workflowFixture(fixtureName) : undefined, [fixtureName]);
  const displayedRecords = demo?.records ?? fixture ?? records;
  const summary = useMemo(() => summarizeDashboard(displayedRecords), [displayedRecords]);
  const graph = useMemo(() => buildGraph(displayedRecords), [displayedRecords]);
  const operating = hasOperationalRecords(state);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [activeView, setActiveView] = useState<DashboardView>('workflow');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const inspectorRef = useRef<WorkflowPanelHandle>(null);
  const proposalPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('safePlanProposals') === '1';
  const selected = selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) : undefined;
  const selectedEdge = selectedEdgeId ? graph.edges.find((edge) => edge.id === selectedEdgeId) : undefined;
  const showWorkflow = Boolean(demo || fixture || operating);
  const scopeLabel = demo?.label ?? state.workspace.name;
  const canCreateHumanWork = state.people.some((person) => person.workspaceId === state.workspace.id);
  const canCreateDoatWork = state.doats.some((doat) => doat.workspaceId === state.workspace.id && !doat.archivedAt && state.agents.some((agent) => agent.id === doat.id));

  function selectWorkspaceData(): void {
    setDemoScenario(undefined);
    setFixtureName(undefined);
    const url = new URL(window.location.href);
    if (url.searchParams.has('canvasFixture')) {
      url.searchParams.delete('canvasFixture');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function selectTimelineTask(taskId: string): void {
    const node = graph.nodes.find((item) => item.type !== 'approval' && item.data.id === taskId);
    if (!node) return;
    inspectorRef.current?.requestSelectNode(node.id);
    onPanelOpenChange(true);
  }

  function selectView(view: DashboardView): void {
    if (dashboardViews.some((item) => item.id === view && item.available)) setActiveView(view);
  }

  function handleViewKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const availableViews = dashboardViews.filter((view) => view.available);
    if (availableViews.length < 2) return;
    const currentIndex = availableViews.findIndex((view) => view.id === activeView);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % availableViews.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + availableViews.length) % availableViews.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = availableViews.length - 1;
    else return;
    event.preventDefault();
    const next = availableViews[nextIndex];
    setActiveView(next.id);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-dashboard-view="${next.id}"]`)?.focus();
  }

  return <section className="gwira-dashboard gwira-dashboard--workflow" aria-label="Dashboard" data-dashboard-view={activeView}>
    <main className="gwira-dashboard__main">
      <header className="gwira-dashboard-header">
        <div className="gwira-dashboard-header__context">
          <div className="gwira-dashboard-breadcrumb" aria-label="Dashboard location">
            <span>Dashboard</span><span aria-hidden="true">/</span><strong>{scopeLabel}</strong>
          </div>
          <div className="gwira-dashboard-header__controls">
            {import.meta.env.DEV ? <DemoMenu value={demoScenario} fixtureName={fixtureName} onChange={(next) => { setFixtureName(undefined); setDemoScenario(next); }} onFixture={(name) => { setDemoScenario(undefined); setFixtureName(name); }} onWorkspaceData={selectWorkspaceData} /> : null}
          </div>
        </div>
        <div className="gwira-dashboard-header__objective">
          <h1 title={summary.objectiveTitle ?? undefined} data-testid="dashboard-title">{dashboardTitle(summary, state.workspace.name)}</h1>
          <p>{dashboardProgressText(summary)}</p>
        </div>
        <div className="gwira-dashboard-header__navigation">
          <nav className="gwira-dashboard-views" role="tablist" aria-label="Dashboard views">
            {dashboardViews.map((view) => <button
              key={view.id}
              type="button"
              role="tab"
              id={`dashboard-view-${view.id}`}
              data-dashboard-view={view.id}
              aria-controls="dashboard-view-content"
              aria-selected={activeView === view.id}
              tabIndex={activeView === view.id ? 0 : -1}
              disabled={!view.available}
              title={view.available ? undefined : `${view.label} view is not available yet. ${view.description}`}
              onClick={() => selectView(view.id)}
              onKeyDown={view.available ? handleViewKeyDown : undefined}
            >{view.label}</button>)}
          </nav>
          <div className="gwira-dashboard-add">
            <button type="button" disabled={activeView !== 'workflow' && activeView !== 'timeline'} title={activeView !== 'workflow' && activeView !== 'timeline' ? 'Switch to Workflow or Timeline to add work.' : undefined} aria-expanded={createMenuOpen} onClick={() => setCreateMenuOpen((open) => !open)}>+ Add work</button>
            {createMenuOpen ? <div className="gwira-dashboard-add__menu" role="menu" aria-label="Add workflow work">
              <button type="button" role="menuitem" disabled={!canCreateHumanWork || Boolean(demo || fixtureName)} title={demo || fixtureName ? 'Switch to workspace data before creating work.' : !canCreateHumanWork ? 'Add a workspace person first.' : undefined} onClick={() => { setCreateMenuOpen(false); onPanelOpenChange(true); inspectorRef.current?.beginCreate('humanWork'); }}>{canCreateHumanWork ? 'Human work' : 'Human work · add a person first'}</button>
              <button type="button" role="menuitem" disabled={!canCreateDoatWork || Boolean(demo || fixtureName)} title={demo || fixtureName ? 'Switch to workspace data before creating work.' : !canCreateDoatWork ? 'Configure a Doat with a local coding agent first.' : undefined} onClick={() => { setCreateMenuOpen(false); onPanelOpenChange(true); inspectorRef.current?.beginCreate('doatWork'); }}>{canCreateDoatWork ? 'Doat work' : 'Doat work · configure a Doat first'}</button>
              {demo || fixtureName ? <p>Creation is disabled while demo or fixture data is displayed.</p> : null}
            </div> : null}
          </div>
        </div>
      </header>
      <section className="gwira-workflow-body" id="dashboard-view-content" role="tabpanel" aria-labelledby={`dashboard-view-${activeView}`} aria-label={`${dashboardViews.find((view) => view.id === activeView)?.label ?? 'Dashboard'} view`}>
        {activeView === 'timeline'
          ? <TimelineView onHideInspector={panelOpen && onPanelOpenChange ? () => onPanelOpenChange(false) : undefined} records={displayedRecords} sourceLabel={demo ? `Demo · ${demo.label}` : fixtureName ? 'Development fixture' : undefined} selectedTaskId={selected && selected.type !== 'approval' ? selected.data.id : undefined} onSelectTask={selectTimelineTask} />
          : showWorkflow
          ? <WorkflowCanvas
              records={displayedRecords}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={(id) => inspectorRef.current?.requestSelectNode(id || undefined)}
              onSelectEdge={(id) => inspectorRef.current?.requestSelectEdge(id)}
              showObjectiveSummary={false}
            />
          : <EmptyDashboardComposer onSubmit={onStartConversation} />}
      </section>
      {!panelOpen && (selected || selectedEdge) ? <button
        type="button"
        className="gwira-dashboard-reveal-inspector"
        aria-label={selected ? `Show details for ${selected.data.title}` : 'Show connection details'}
        onClick={() => onPanelOpenChange(true)}
      >Show details</button> : null}
      {proposalPreview && activeView === 'workflow' ? <PlanProposalPreview state={state} /> : null}
    </main>
    <WorkflowPanel
      ref={inspectorRef}
      id="gwira-workflow-panel"
      hidden={!panelOpen}
      state={state}
      graph={graph}
      selectedNode={selected}
      selectedEdge={selectedEdge}
      demo={demo}
      fixtureName={fixtureName}
      onOpenTask={onOpenTask}
      onAskAboutRecord={onAskAboutRecord}
      onSelectNode={(id) => { setSelectedNodeId(id || undefined); if (id) setSelectedEdgeId(undefined); }}
      onSelectEdge={(id) => { setSelectedEdgeId(id); if (id) setSelectedNodeId(undefined); }}
      onCreateTask={onCreateTask}
      onUpdateTask={onUpdateTask}
    />
  </section>;
}

function DemoMenu({ value, fixtureName, onChange, onFixture, onWorkspaceData }: { onFixture: (name: 'timeline' | 'timeline-large') => void; value?: FreshBlendScenario; fixtureName?: string; onChange: (value: FreshBlendScenario) => void; onWorkspaceData: () => void }): React.ReactElement {
  const choose = (next: FreshBlendScenario, event: React.MouseEvent<HTMLButtonElement>) => { onChange(next); event.currentTarget.closest('details')?.removeAttribute('open'); };
  const activeLabel = value
    ? `Demo · ${value === 'morning' ? 'Morning Operations' : value === 'marketing' ? 'Marketing Campaign' : 'Problem & Recovery'}`
    : fixtureName ? `Fixture · ${fixtureName.replaceAll('-', ' ')}` : 'Workspace data';
  return <details className="gwira-demo-menu"><summary aria-label={`Data source: ${activeLabel}`}>{activeLabel}</summary><div role="menu" aria-label="Development data source"><button type="button" role="menuitemradio" aria-checked={!value && !fixtureName} onClick={(event) => { onWorkspaceData(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Workspace data</button><button type="button" role="menuitemradio" aria-checked={value === 'morning'} onClick={(event) => choose('morning', event)}>Morning Operations</button><button type="button" role="menuitemradio" aria-checked={value === 'marketing'} onClick={(event) => choose('marketing', event)}>Marketing Campaign</button><button type="button" role="menuitemradio" aria-checked={value === 'recovery'} onClick={(event) => choose('recovery', event)}>Problem &amp; Recovery</button><button type="button" role="menuitemradio" aria-checked={fixtureName === 'timeline'} data-fixture="timeline" onClick={(event) => { onFixture('timeline'); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Timeline fixture (dated)</button><button type="button" role="menuitemradio" aria-checked={fixtureName === 'timeline-large'} data-fixture="timeline-large" onClick={(event) => { onFixture('timeline-large'); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Timeline stress fixture (1,600)</button></div></details>;
}

function EmptyDashboardComposer({ onSubmit }: { onSubmit: (message: string) => Promise<boolean> }): React.ReactElement {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  async function submit(): Promise<void> {
    const message = value.trim();
    if (!message || sending) return;
    setSending(true);
    if (await onSubmit(message)) setValue('');
    setSending(false);
  }
  return <div className="gwira-dashboard-empty" data-testid="dashboard-empty-composer">
    <div className="gwira-dashboard-empty__intro"><h2>Nothing to supervise yet</h2><p>Ask Gwira to help organize work for this workspace.</p></div>
    <div className="gwira-dashboard-empty__composer"><textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} aria-label="Ask Gwira anything" placeholder="Ask Gwira anything…" rows={1} /><button type="button" disabled={!value.trim() || sending} onClick={() => void submit()} aria-label="Send message">↑</button></div>
  </div>;
}
