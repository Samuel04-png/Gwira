import React, { useMemo, useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { WorkflowCanvas } from '../graph/WorkflowCanvas.js';
import { localStateToGraphRecords } from '../graph/localGraphAdapter.js';
import { buildGraph } from '../graph/graphModel.js';
import { WorkflowPanel } from './WorkflowPanel.js';
import { freshBlendDemo, type FreshBlendScenario } from '../graph/freshBlendDemo.js';
import { readDevWorkflowFixture } from '../graph/workflowFixtures.js';

type DashboardProps = { state: GwiraLocalState; onStartConversation: (message: string) => Promise<boolean>; onAskAboutRecord: (recordId: string) => void };

function hasOperationalRecords(state: GwiraLocalState): boolean {
  return state.tasks.length > 0 || state.doats.length > 0 || state.people.length > 0 || state.approvals.length > 0 || state.activity.some((entry) => entry.kind !== 'workspace_created');
}

/** Dashboard supervises real work. Conversations always live in Home. */
export function DashboardPage({ state, onStartConversation, onAskAboutRecord }: DashboardProps): React.ReactElement {
  const records = useMemo(() => localStateToGraphRecords(state), [state]);
  const [demoScenario, setDemoScenario] = useState<FreshBlendScenario>();
  const [simulateLiveWork, setSimulateLiveWork] = useState(false);
  const demo = import.meta.env.DEV && demoScenario ? freshBlendDemo(demoScenario) : undefined;
  const fixture = import.meta.env.DEV ? readDevWorkflowFixture() : undefined;
  const displayedRecords = demo?.records ?? records;
  const graph = useMemo(() => buildGraph(displayedRecords), [displayedRecords]);
  const operating = hasOperationalRecords(state);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const selected = selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) : undefined;
  return <section className="gwira-dashboard gwira-dashboard--workflow" aria-label="Dashboard"><main className="gwira-dashboard__main">
    <header className="gwira-workflow-header"><div><h1>Dashboard</h1><p>Workflow supervision</p></div>{import.meta.env.DEV ? <DemoMenu value={demoScenario} onChange={setDemoScenario} simulateLiveWork={simulateLiveWork} onSimulateLiveWork={setSimulateLiveWork} /> : null}</header>
    <section className="gwira-workflow-body" aria-label="Workflow workspace">{demo || fixture || operating ? <WorkflowCanvas records={displayedRecords} scope={demo ? `fixture:freshblend-${demoScenario}` : state.workspace.id} selectedNodeId={selectedNodeId} onSelectNode={(id) => setSelectedNodeId(id || undefined)} simulateLiveWork={import.meta.env.DEV && simulateLiveWork} /> : <EmptyDashboardComposer onSubmit={onStartConversation} />}</section>
    {operating && selected ? <div className="gwira-workflow-context-action"><span>{selected.data.title}</span><button type="button" onClick={() => onAskAboutRecord(selected.id)}>Ask Gwira</button></div> : null}
  </main>{demo || operating ? <WorkflowPanel state={state} unlinkedTitles={graph.unlinked.map((node) => node.data.title)} demo={demo} /> : null}</section>;
}

function DemoMenu({ value, onChange, simulateLiveWork, onSimulateLiveWork }: { value?: FreshBlendScenario; onChange: (value: FreshBlendScenario | undefined) => void; simulateLiveWork: boolean; onSimulateLiveWork: (value: boolean) => void }): React.ReactElement {
  const choose = (next: FreshBlendScenario | undefined, event: React.MouseEvent<HTMLButtonElement>) => { onChange(next); event.currentTarget.closest('details')?.removeAttribute('open'); };
  return <details className="gwira-demo-menu"><summary>Demo data</summary><div role="menu" aria-label="Development data"><button type="button" role="menuitemradio" aria-checked={!value} onClick={(event) => choose(undefined, event)}>Workspace data</button><button type="button" role="menuitemradio" aria-checked={value === 'morning'} onClick={(event) => choose('morning', event)}>Morning Operations</button><button type="button" role="menuitemradio" aria-checked={value === 'marketing'} onClick={(event) => choose('marketing', event)}>Marketing Campaign</button><button type="button" role="menuitemradio" aria-checked={value === 'recovery'} onClick={(event) => choose('recovery', event)}>Problem &amp; Recovery</button><button type="button" role="menuitemcheckbox" aria-checked={simulateLiveWork} onClick={() => onSimulateLiveWork(!simulateLiveWork)}>Simulate live work <small>(simulated)</small></button></div></details>;
}

function EmptyDashboardComposer({ onSubmit }: { onSubmit: (message: string) => Promise<boolean> }): React.ReactElement {
  const [value, setValue] = useState(''); const [sending, setSending] = useState(false);
  async function submit(): Promise<void> { const message = value.trim(); if (!message || sending) return; setSending(true); if (await onSubmit(message)) setValue(''); setSending(false); }
  return <div className="gwira-dashboard-empty" data-testid="dashboard-empty-composer"><div className="gwira-dashboard-empty__composer"><textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} aria-label="Ask Gwira anything" placeholder="Ask Gwira anything…" rows={1} /><button type="button" disabled={!value.trim() || sending} onClick={() => void submit()} aria-label="Send message">↑</button></div></div>;
}
