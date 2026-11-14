import {CompactActionMenu} from '../../components/CompactActionMenu.js';
import './dashboardFoundation.css';
import {AvatarArtworkContext} from '../../components/AvatarArtwork.js';
import { Icon } from "../../components/Icon.js";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {boardTransition} from '../board/boardTransitions.js';
import type {TaskStatus} from '../domain/types.js';
import type { GwiraLocalState } from '../domain/types.js';
import { WorkflowCanvas } from '../graph/WorkflowCanvas.js';
import { TimelineView } from '../timeline/TimelineView.js';
import { ListView } from '../list/ListView.js';
import { CalendarView } from '../calendar/CalendarView.js';
import { BoardView } from '../board/BoardView.js';
import { localStateToGraphRecords } from '../graph/localGraphAdapter.js';
import { buildGraph } from '../graph/graphModel.js';
import { freshBlendDemo, type FreshBlendScenario } from '../graph/freshBlendDemo.js';
import { readDevWorkflowFixture, workflowFixture } from '../graph/workflowFixtures.js';
import { PlanProposalPreview } from '../proposals/PlanProposalPreview.js';
import { dashboardProgressText, dashboardTitle, dashboardViews, summarizeDashboard, type DashboardView } from './dashboardModel.js';
import { WorkflowPanel, type WorkflowPanelHandle } from './WorkflowPanel.js';
import type { NewTaskInput, TaskUpdateInput } from '../work/MyWorkPage.js';

type DashboardProps = {
  authenticatedUnavailable?: boolean;
  state: GwiraLocalState;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  onStartConversation: (message: string) => Promise<boolean>;
  onAskAboutRecord: (recordId: string) => void;
  onOpenTask: (taskId: string) => void;
  onCreateTask: (input: NewTaskInput) => string;
  onTransitionTask?: (taskId:string,status:TaskStatus)=>void;
  onUpdateTask: (taskId: string, input: TaskUpdateInput) => void;
};

export function DashboardBreadcrumb({workspace}:{workspace:string}):React.ReactElement {
  return <div className="gwira-dashboard-breadcrumb" aria-label="Dashboard location"><span>Dashboard</span><span aria-hidden="true">/</span><strong title={workspace}>{workspace}</strong></div>;
}

function hasOperationalRecords(state: GwiraLocalState): boolean {
  return state.tasks.length > 0 || state.doats.length > 0 || state.people.length > 0 || state.approvals.length > 0 || state.activity.some((entry) => entry.kind !== 'workspace_created');
}

export function DashboardPage({ state, panelOpen, onPanelOpenChange, onStartConversation, onAskAboutRecord, onOpenTask, onCreateTask, onUpdateTask, onTransitionTask,authenticatedUnavailable=false }: DashboardProps): React.ReactElement {
  const [testArtwork,setTestArtwork]=useState<Readonly<Record<string,string>>>();
  const records = useMemo(() => localStateToGraphRecords(state), [state]);
  const [demoScenario, setDemoScenario] = useState<FreshBlendScenario>();
  const demo = useMemo(() => import.meta.env.DEV && demoScenario ? freshBlendDemo(demoScenario) : undefined, [demoScenario]);
  const [fixtureName, setFixtureName] = useState(import.meta.env.DEV&&!authenticatedUnavailable ? readDevWorkflowFixture : undefined);
  const fixture = useMemo(() => fixtureName ? workflowFixture(fixtureName) : undefined, [fixtureName]);
  useEffect(()=>{let cancelled=false;if(import.meta.env.DEV&&demo)void import('./testProfileArtwork.js').then(module=>{if(!cancelled)setTestArtwork(module.testProfileArtwork);});return()=>{cancelled=true;};},[!!demo]);
  const displayedRecords = demo?.records ?? fixture ?? records;
  const summary = useMemo(() => summarizeDashboard(displayedRecords), [displayedRecords]);
  const graph = useMemo(() => buildGraph(displayedRecords), [displayedRecords]);
  const operating = hasOperationalRecords(state);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [activeView, setActiveView] = useState<DashboardView>(()=>{if(authenticatedUnavailable)return 'workflow';try{const value=localStorage.getItem('gwira.dashboard.view.v1');return dashboardViews.some(v=>v.id===value)?value as DashboardView:'workflow';}catch{return 'workflow';}});
  const [visitedViews,setVisitedViews]=useState<Set<DashboardView>>(()=>new Set([activeView]));
  useEffect(()=>{setVisitedViews(current=>current.has(activeView)?current:new Set([...current,activeView]));if(!authenticatedUnavailable)try{localStorage.setItem('gwira.dashboard.view.v1',activeView);}catch{}},[activeView,authenticatedUnavailable]);
  const [narrowInspector,setNarrowInspector]=useState(false);
  const [contextOverlayOpen,setContextOverlayOpen]=useState(false);
  const [contextTask,setContextTask]=useState<string>();
  const [contextRequest,setContextRequest]=useState<{x:number;y:number;nonce:number}>();
  const selectionOrigin=useRef<HTMLElement|null>(null);
  const [hoverItem,setHoverItem]=useState<{id:string;x:number;y:number}>();
  useEffect(()=>{if(!selectedNodeId)selectionOrigin.current?.focus({preventScroll:true});},[selectedNodeId]);
  useEffect(()=>{setSelectedNodeId(undefined);setSelectedEdgeId(undefined);setContextTask(undefined);},[demoScenario,fixtureName,state.workspace.id]);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const inspectorRef = useRef<WorkflowPanelHandle>(null);
  const addMenuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!createMenuOpen)return;addMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();const outside=(event:PointerEvent)=>{if(!addMenuRef.current?.contains(event.target as Node))setCreateMenuOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setCreateMenuOpen(false);addMenuRef.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};},[createMenuOpen]);
  const proposalPreview = !authenticatedUnavailable && import.meta.env.DEV && new URLSearchParams(window.location.search).get('safePlanProposals') === '1';
  const selected = selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) : undefined;
  const selectedEdge = selectedEdgeId ? graph.edges.find((edge) => edge.id === selectedEdgeId) : undefined;
  const actionTaskId=contextTask??(selected?.type==='approval'?selected.data.taskId:selected?.data.id);
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

  function selectDashboardTask(taskId: string): void {
    const node = graph.nodes.find((item) => item.type !== 'approval' && item.data.id === taskId);
    if (!node) return;
    inspectorRef.current?.requestSelectNode(node.id);
    onPanelOpenChange(true);
  }

  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(()=>{const element=sectionRef.current;if(!element)return;const measure=()=>setNarrowInspector(element.clientWidth<parseFloat(getComputedStyle(element).getPropertyValue('--gw-dashboard-inspector-breakpoint')));measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
  const inspectorVisible=panelOpen&&(!narrowInspector||!!selected||!!selectedEdge||contextOverlayOpen);
  useEffect(() => {
    const section = sectionRef.current;
    const header = headerRef.current;
    if (!section || !header) return;
    // Narrow-window inspector drawer opens below the header so the view tabs stay visible.
    const measure = (): void => section.style.setProperty('--gwira-dashboard-header-h', `${header.offsetTop + header.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.getElementById(`dashboard-view-${activeView}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeView]);

  function selectView(view: DashboardView): void {
    if ((!authenticatedUnavailable||view==='workflow')&&dashboardViews.some((item) => item.id === view && item.available)) setActiveView(view);
  }

  function handleViewKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const availableViews = dashboardViews.filter((view) => view.available&&(!authenticatedUnavailable||view.id==='workflow'));
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

  return <AvatarArtworkContext.Provider value={demo?testArtwork:undefined}><section ref={sectionRef} className="gwira-dashboard gwira-dashboard--workflow" aria-label="Dashboard" data-dashboard-view={activeView} data-narrow-inspector={narrowInspector} onScrollCapture={()=>setHoverItem(undefined)} onPointerOver={event=>{const target=event.target as HTMLElement;if(target.closest('.gwira-list,.gwira-board,.gwira-calendar')){setHoverItem(undefined);return;}if(target.closest('.gw-work-item-open'))return;const item=target.closest<HTMLElement>('[data-work-item-id]');if(!item?.dataset.workItemId){setHoverItem(undefined);return;}const box=item.getBoundingClientRect();setHoverItem({id:item.dataset.workItemId,x:box.right,y:box.top});}} onPointerLeave={()=>setHoverItem(undefined)} onClickCapture={event=>{const item=(event.target as HTMLElement).closest<HTMLElement>('[data-work-item-id]');if(item){selectionOrigin.current=item.querySelector<HTMLElement>('[data-list-task-id]')??(item.tabIndex>=0?item:item.closest<HTMLElement>('[tabindex],button'));setContextTask(undefined);}}} onContextMenu={event=>{if((event.target as HTMLElement).closest('.gwira-list,.gwira-board,.gwira-calendar'))return;const item=(event.target as HTMLElement).closest<HTMLElement>('[data-work-item-id]');if(!item?.dataset.workItemId)return;event.preventDefault();selectionOrigin.current=item;setContextTask(item.dataset.workItemId);setContextRequest({x:event.clientX,y:event.clientY,nonce:Date.now()});}} onKeyDownCapture={event=>{if((event.target as HTMLElement).closest('.gwira-list,.gwira-board,.gwira-calendar'))return;if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;const item=(event.target as HTMLElement).closest<HTMLElement>('[data-work-item-id]');if(!item?.dataset.workItemId)return;event.preventDefault();const box=item.getBoundingClientRect();selectionOrigin.current=item;setContextTask(item.dataset.workItemId);setContextRequest({x:box.left,y:box.bottom,nonce:Date.now()});}}>
    <main className="gwira-dashboard__main">
      <header ref={headerRef} className="gwira-dashboard-header">
        <div className="gwira-dashboard-header__context">
          <DashboardBreadcrumb workspace={scopeLabel}/>
          <div className="gwira-dashboard-header__controls">
            {import.meta.env.DEV&&!authenticatedUnavailable ? <DemoMenu value={demoScenario} fixtureName={fixtureName} onChange={(next) => { setFixtureName(undefined); setDemoScenario(next); }} onFixture={(name) => { setDemoScenario(undefined); setFixtureName(name); }} onWorkspaceData={selectWorkspaceData} /> : null}
          </div>
        </div>
        <div className="gwira-dashboard-header__objective">
          <h1 title={authenticatedUnavailable?'Dashboard':dashboardTitle(summary, state.workspace.name)} data-testid="dashboard-title">{authenticatedUnavailable?'Dashboard':dashboardTitle(summary, state.workspace.name)}</h1>
          {!authenticatedUnavailable&&<p title={dashboardProgressText(summary)}>{dashboardProgressText(summary)}</p>}
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
              disabled={!view.available||authenticatedUnavailable&&view.id!=='workflow'}
              title={authenticatedUnavailable&&view.id!=='workflow'?'Dashboard data is not connected for authenticated workspaces.':view.available ? undefined : `${view.label} view is not available yet. ${view.description}`}
              onClick={() => selectView(view.id)}
              onKeyDown={view.available ? handleViewKeyDown : undefined}
            >{view.label}</button>)}
          </nav>
          <button data-testid="dashboard-context-toggle" className="gw-dashboard-context-toggle" type="button" disabled={authenticatedUnavailable} aria-expanded={inspectorVisible} onClick={()=>{if(inspectorVisible){onPanelOpenChange(false);setContextOverlayOpen(false);}else{onPanelOpenChange(true);setContextOverlayOpen(true);}}}><Icon name="teams"/>Team &amp; activity</button>
          <CompactActionMenu label="Work item actions" className={selected||contextTask?'gw-work-item-actions':'gw-work-item-actions is-unavailable'} contextRequest={contextRequest} actions={[
            {label:'Open details',icon:'external',disabled:!contextTask&&!selected,reason:'Select a work item first.',onSelect:()=>{if(actionTaskId)selectDashboardTask(actionTaskId);}},
            {label:'Open task',icon:'work',disabled:!!demo||!!fixtureName||!state.tasks.some(t=>t.id===(actionTaskId)),reason:demo||fixtureName?'Sample records cannot open a real workspace task.':'Select a recorded workspace task.',onSelect:()=>onOpenTask(actionTaskId!)},
            {label:'Ask Gwira about work',icon:'threads',disabled:!!demo||!!fixtureName||!state.tasks.some(t=>t.id===(actionTaskId)),reason:demo||fixtureName?'Sample work cannot be sent as a live workspace instruction.':'Select a recorded workspace task.',onSelect:()=>onAskAboutRecord(actionTaskId!)}
          ]}/>
          <div ref={addMenuRef} className="gwira-dashboard-add">
            <button type="button" disabled={authenticatedUnavailable} aria-expanded={createMenuOpen} onClick={() => setCreateMenuOpen((open) => !open)}>+ Add work</button>
            {createMenuOpen ? <div className="gwira-dashboard-add__menu" role="menu" aria-label="Add workflow work">
              <button type="button" role="menuitem" disabled={!canCreateHumanWork || Boolean(demo || fixtureName)} title={demo || fixtureName ? 'Switch to workspace data before creating work.' : !canCreateHumanWork ? 'Add a workspace person first.' : undefined} onClick={() => { setCreateMenuOpen(false); onPanelOpenChange(true); inspectorRef.current?.beginCreate('humanWork'); }}>{canCreateHumanWork ? 'Human work' : 'Human work · add a person first'}</button>
              <button type="button" role="menuitem" disabled={!canCreateDoatWork || Boolean(demo || fixtureName)} title={demo || fixtureName ? 'Switch to workspace data before creating work.' : !canCreateDoatWork ? 'Configure a Doat with a local coding agent first.' : undefined} onClick={() => { setCreateMenuOpen(false); onPanelOpenChange(true); inspectorRef.current?.beginCreate('doatWork'); }}>{canCreateDoatWork ? 'Doat work' : 'Doat work · configure a Doat first'}</button>
              {demo || fixtureName ? <p>Creation is disabled while demo or fixture data is displayed.</p> : null}
            </div> : null}
          </div>
        </div>
      </header>
      {demo||fixtureName?<p className="gw-dashboard-source" role="note">{demo?`Demo · ${demo.label}`:'Development fixture'} · sample data, not live workspace activity</p>:null}
      <section className="gwira-workflow-body" id="dashboard-view-content" role="tabpanel" aria-labelledby={`dashboard-view-${activeView}`} aria-label={`${dashboardViews.find((view) => view.id === activeView)?.label ?? 'Dashboard'} view`}>
        {(visitedViews.has('workflow')||activeView==='workflow')?<div className="gw-dashboard-view" data-view-panel="workflow" hidden={activeView!=='workflow'}>{showWorkflow ? <WorkflowCanvas
              records={displayedRecords}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={(id) => {inspectorRef.current?.requestSelectNode(id || undefined);if(id)onPanelOpenChange(true);}}
              onSelectEdge={(id) => inspectorRef.current?.requestSelectEdge(id)}
              showObjectiveSummary={false}
            /> : authenticatedUnavailable?<div className="gwira-dashboard-empty"><div className="gwira-dashboard-empty__intro"><h2>Dashboard is unavailable</h2><p>Dashboard data is not connected for authenticated workspaces.</p></div></div>:<EmptyDashboardComposer onSubmit={onStartConversation} />}</div>:null}
        {(visitedViews.has('timeline')||activeView==='timeline')?<div className="gw-dashboard-view" data-view-panel="timeline" hidden={activeView!=='timeline'}>{<TimelineView onHideInspector={inspectorVisible && onPanelOpenChange ? () => onPanelOpenChange(false) : undefined} records={displayedRecords} sourceLabel={demo ? `Demo · ${demo.label}` : fixtureName ? 'Development fixture' : undefined} selectedTaskId={selected && selected.type !== 'approval' ? selected.data.id : undefined} onSelectTask={selectDashboardTask} />}</div>:null}
        {(visitedViews.has('list')||activeView==='list')?<div className="gw-dashboard-view" data-view-panel="list" hidden={activeView!=='list'}>{<ListView onHideInspector={inspectorVisible && onPanelOpenChange ? () => onPanelOpenChange(false) : undefined} records={displayedRecords} selectedTaskId={selected && selected.type !== 'approval' ? selected.data.id : undefined} onSelectTask={selectDashboardTask} editableTaskIds={demo||fixture?undefined:new Set(state.tasks.filter(task=>task.workspaceId===state.workspace.id&&task.agentRun?.status!=='running').map(task=>task.id))} onOpenTask={demo||fixture?undefined:onOpenTask} onPatchTasks={demo||fixture?undefined:(ids,patch)=>{const tasks=ids.map(id=>state.tasks.find(task=>task.id===id&&task.workspaceId===state.workspace.id));if(tasks.some(task=>!task||task.agentRun?.status==='running'))throw new Error('This work changed or is running. Review its task controls before editing.');for(const task of tasks)if(task)onUpdateTask(task.id,{title:task.title,priority:patch.priority??task.priority,dueDate:patch.dueDate});}} />}</div>:null}
        {(visitedViews.has('calendar')||activeView==='calendar')?<div className="gw-dashboard-view" data-view-panel="calendar" hidden={activeView!=='calendar'}>{<CalendarView sourceLabel={demo ? `Demo · ${demo.label}` : fixtureName ? 'Development fixture' : undefined} onHideInspector={inspectorVisible ? () => onPanelOpenChange(false) : undefined} records={displayedRecords} selectedTaskId={selected && selected.type !== 'approval' ? selected.data.id : undefined} onSelectTask={selectDashboardTask} onOpenTask={demo||fixture?undefined:onOpenTask} editableTaskIds={demo||fixture?undefined:new Set(state.tasks.filter(task=>task.workspaceId===state.workspace.id&&task.agentRun?.status!=='running').map(task=>task.id))} onPatchTasks={demo||fixture?undefined:(ids,patch)=>{const tasks=ids.map(id=>state.tasks.find(task=>task.id===id&&task.workspaceId===state.workspace.id));if(tasks.some(task=>!task||task.agentRun?.status==='running'))throw new Error('This work changed or is running. Review task details before editing.');for(const task of tasks)if(task)onUpdateTask(task.id,{title:task.title,priority:patch.priority??task.priority,dueDate:patch.dueDate});}} />}</div>:null}
        {(visitedViews.has('board')||activeView==='board')?<div className="gw-dashboard-view" data-view-panel="board" hidden={activeView!=='board'}>{<BoardView sourceLabel={demo ? `Demo · ${demo.label}` : fixtureName ? 'Development fixture' : undefined} onHideInspector={inspectorVisible ? () => onPanelOpenChange(false) : undefined} records={displayedRecords} selectedTaskId={selected && selected.type !== 'approval' ? selected.data.id : undefined} onSelectTask={selectDashboardTask} onOpenTask={demo||fixture?undefined:onOpenTask} onAddWork={demo||fixture||!(canCreateHumanWork||canCreateDoatWork)?undefined:()=>setCreateMenuOpen(true)} moveReason={demo||fixture?undefined:(id,target)=>boardTransition(state,id,target).reason} onMoveTask={demo||fixture||!onTransitionTask?undefined:(id,target)=>{const result=boardTransition(state,id,target);if(result.reason||!result.status)throw new Error(result.reason??'This move is unavailable.');onTransitionTask(id,result.status);}} editableTaskIds={demo||fixture?undefined:new Set(state.tasks.filter(task=>task.workspaceId===state.workspace.id&&task.agentRun?.status!=='running').map(task=>task.id))} onPatchTasks={demo||fixture?undefined:(ids,patch)=>{const tasks=ids.map(id=>state.tasks.find(task=>task.id===id&&task.workspaceId===state.workspace.id));if(tasks.some(task=>!task||task.agentRun?.status==='running'))throw new Error('This work changed or is running. Review task details before editing.');for(const task of tasks)if(task)onUpdateTask(task.id,{title:task.title,priority:patch.priority??task.priority,dueDate:patch.dueDate});}} />}</div>:null}
      </section>
      {!panelOpen && (selected || selectedEdge) ? <button
        type="button"
        className="gwira-dashboard-reveal-inspector"
        aria-label={selected ? `Show details for ${selected.data.title}` : 'Show connection details'}
        onClick={() => onPanelOpenChange(true)}
      >Show details</button> : null}
      {proposalPreview && activeView === 'workflow' ? <PlanProposalPreview state={state} /> : null}
    </main>
    {hoverItem?<button type="button" className="gw-work-item-open" style={{left:hoverItem.x,top:hoverItem.y}} aria-label="Open work details" title="Open work details" onClick={()=>{selectDashboardTask(hoverItem.id);setHoverItem(undefined);}}><Icon name="external"/></button>:null}
    {!authenticatedUnavailable&&<WorkflowPanel
      ref={inspectorRef}
      id="gwira-workflow-panel"
      hidden={!inspectorVisible}
      onClose={()=>{onPanelOpenChange(false);setContextOverlayOpen(false);requestAnimationFrame(()=>sectionRef.current?.querySelector<HTMLButtonElement>('.gw-dashboard-context-toggle')?.focus());}}
      state={state}
      graph={graph}
      records={displayedRecords}
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
    />}
  </section></AvatarArtworkContext.Provider>;
}

function DemoMenu({ value, fixtureName, onChange, onFixture, onWorkspaceData }: { onFixture: (name: 'timeline' | 'timeline-large') => void; value?: FreshBlendScenario; fixtureName?: string; onChange: (value: FreshBlendScenario) => void; onWorkspaceData: () => void }): React.ReactElement {
  const choose = (next: FreshBlendScenario, event: React.MouseEvent<HTMLButtonElement>) => { onChange(next); event.currentTarget.closest('details')?.removeAttribute('open'); };
  const activeLabel = value
    ? `Demo · ${value === 'morning' ? 'Morning Operations' : value === 'marketing' ? 'Marketing Campaign' : 'Problem & Recovery'}`
    : fixtureName ? `Fixture · ${fixtureName.replaceAll('-', ' ')}` : 'Workspace data';
  return <details className="gwira-demo-menu"><summary aria-label={`Data source: ${activeLabel}`}>{activeLabel}<Icon name="chevron-down" /></summary><div role="menu" aria-label="Development data source"><button type="button" role="menuitemradio" aria-checked={!value && !fixtureName} onClick={(event) => { onWorkspaceData(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Workspace data</button><button type="button" role="menuitemradio" aria-checked={value === 'morning'} onClick={(event) => choose('morning', event)}>Morning Operations</button><button type="button" role="menuitemradio" aria-checked={value === 'marketing'} onClick={(event) => choose('marketing', event)}>Marketing Campaign</button><button type="button" role="menuitemradio" aria-checked={value === 'recovery'} onClick={(event) => choose('recovery', event)}>Problem &amp; Recovery</button><button type="button" role="menuitemradio" aria-checked={fixtureName === 'timeline'} data-fixture="timeline" onClick={(event) => { onFixture('timeline'); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Timeline fixture (dated)</button><button type="button" role="menuitemradio" aria-checked={fixtureName === 'timeline-large'} data-fixture="timeline-large" onClick={(event) => { onFixture('timeline-large'); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Timeline stress fixture (1,600)</button></div></details>;
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
    <div className="gwira-dashboard-empty__composer"><textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} aria-label="Ask Gwira anything" placeholder="Ask Gwira anything…" rows={1} /><button type="button" disabled={!value.trim() || sending} onClick={() => void submit()} aria-label="Send message"><Icon name="send" /></button></div>
  </div>;
}
