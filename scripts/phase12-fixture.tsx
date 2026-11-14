import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkSessions } from '../src/renderer/workSessions/WorkSessions.js';
import { projectWorkSessions, restoreWorkPreferences, type WorkSessionView } from '../src/renderer/workSessions/model.js';
import { createEmptyLocalState } from '../src/renderer/gwira/domain/types.js';
const at = new Date().toISOString();
let change: (mode: string) => void;
export function changeActivityFixture(mode: string): void { change(mode); }
export function showActivityFixture(): void {
  if (!import.meta.env.DEV) throw Error('Development fixture only');
  const node = document.createElement('div'); node.id = 'phase12-fixture'; document.body.appendChild(node);
  Object.assign(node.style, { position: 'fixed', inset: '38px 0 0 0', zIndex: 1000, pointerEvents: 'none' });
  createRoot(node).render(<Fixture />);
}
function Fixture(): React.ReactElement {
  const state = createEmptyLocalState({ organizationId: 'fixture', workspaceId: 'fixture' }, at);
  state.people = [{ id: 'employee', workspaceId: 'fixture', name: 'Operations reviewer', role: 'Operations', createdAt: at }];
  state.agents = [{ id: 'agent', workspaceId: 'fixture', name: 'Local coding worker', type: 'coding', createdAt: at }];
  state.tasks = Array.from({ length: 6 }, (_, i) => ({ id: `work-${i}`, workspaceId: 'fixture', title: ['Review outstanding account records before the daily reconciliation and prepare a clear summary', 'Review submitted result', 'Inspect failed local operation', 'Prepare the final documentation', 'Stopped local operation', 'Correct the customer contact list'][i], description: 'An isolated development record for checking supervision interactions.', status: 'in_progress' as const, priority: 'medium' as const, assignee: { kind: i === 5 ? 'person' as const : 'agent' as const, id: i === 5 ? 'employee' : 'agent' }, createdAt: at, updatedAt: at, agentRun: i === 5 ? undefined : { sessionId: `fixture-${i}`, status: (['running', 'completed', 'error', 'completed', 'stopped'] as const)[i], startedAt: at } }));
  state.approvals = [{ id: 'approval', taskId: 'work-1', resultId: 'result-1', requestedBy: { kind: 'agent', id: 'agent' }, status: 'pending', createdAt: at }];
  state.activity = Array.from({ length: 9 }, (_, i) => ({ id: `event-${i}`, workspaceId: 'fixture', taskId: 'work-0', kind: 'agent_run_updated' as const, summary: `Recorded local execution event ${i + 1}.`, occurredAt: new Date(Date.parse(at) + i * 1000).toISOString() }));
  const initial = projectWorkSessions(state, [{ id: 'fixture-0', cwd: '/development-only', context: 'coding', model: 'fixture', reasoningEffort: 'high', permissionMode: 'default', webSearch: false, status: 'running', startedAt: at, updatedAt: at, messages: [{ id: 'step', role: 'system', text: 'Ran inspect-source\nProcess exited with code 0\nTOKEN=private-fixture', createdAt: at }] }]);
  const [rows, setRows] = useState(initial), [pref, setPref] = useState({ ...restoreWorkPreferences(null), open: true }), [expanded, setExpanded] = useState(false), [stopping, setStopping] = useState(new Set<string>()), [loading, setLoading] = useState(false);
  change = mode => { if (mode === 'empty') setRows([]); if (mode === 'restore') setRows(initial); if (mode === 'stopped') setRows(current => current.map(row => row.id === 'task:work-0' ? { ...row, group: 'resolved', status: 'Stopped', task: { ...row.task!, agentRun: { ...row.task!.agentRun!, status: 'stopped' } } } : row)); if (mode === 'loading') setLoading(true); if (mode === 'loaded') setLoading(false); if (mode === 'overflow') setRows([...initial, ...Array.from({ length: 50 }, (_, i) => ({ ...initial[0], id: `extra-${i}`, title: `Recorded task ${i}: long work description for truncation and overflow verification` }))]); if (mode === 'failure') setRows(current => current.map(row => row.id === 'task:work-0' ? { ...row, group: 'attention', status: 'Run failed' } : row)); };
  return <><style>{`#phase12-fixture .work-sessions:not(.is-expanded){position:relative;inset:auto;width:100%;height:100%;grid-area:auto;}#phase12-fixture .work-sessions.is-expanded{height:100%;}#phase12-fixture .phase12-fixture-label{position:absolute;top:var(--gw-space-16);right:var(--gw-space-2);font-size:var(--gw-type-caption);color:var(--gw-text-muted);background:var(--gw-surface);pointer-events:none;}`}</style><div className="phase12-fixture-panel" style={{ position: 'absolute', insetBlock: 0, right: 0, width: expanded ? '100%' : pref.width, pointerEvents: 'auto' }}><WorkSessions rows={rows} preferences={pref} onPreferences={setPref} expanded={expanded} onExpand={() => setExpanded(true)} onClose={() => setExpanded(false)} onChat={() => {}} onReview={() => { document.querySelector('#phase12-fixture')!.setAttribute('data-reviewed', 'true'); }} onConversation={() => {}} canOpenConversation={() => false} onRefresh={async () => { if ((window as unknown as { phase12RefreshFails?: boolean }).phase12RefreshFails) throw Error('fixture refresh'); }} onCancel={async row => { setStopping(new Set([row.task!.id])); return true; }} stopping={stopping} loading={loading} scopeKey="development-only" onInstruction={async (_row, _text, _id) => { if ((window as unknown as { phase12SendFails?: boolean }).phase12SendFails) throw Error('Could not save the local message. Your draft is retained.'); return { message: 'Saved in isolated development adapter. No employee was notified.' }; }} /><span className="phase12-fixture-label">Dev fixture</span></div></>;
}
/** Seeds only the disposable Electron QA profile. Never imported in production. */
export async function seedActivityWorkspace(): Promise<void> {
  if (!import.meta.env.DEV) throw Error('Development fixture only');
  const { saveGwiraLocalState } = await import('../src/renderer/gwira/data/localStore.js');
  const state = createEmptyLocalState({ organizationId: '50000000-0000-4000-8000-000000000001', workspaceId: '50000000-0000-4000-8000-000000000002' }, at);
  state.people = [{ id: '50000000-0000-4000-8000-00000000000a', workspaceId: state.workspace.id, name: 'QA sender', role: 'Operations', createdAt: at }, { id: '50000000-0000-4000-8000-00000000000b', workspaceId: state.workspace.id, name: 'QA employee', role: 'Reviewer', createdAt: at }];
  state.tasks = [{ id: '50000000-0000-4000-8000-0000000000a1', workspaceId: state.workspace.id, title: 'Verify local instruction delivery boundary', status: 'in_progress', priority: 'medium', assignee: { kind: 'person', id: state.people[1].id }, createdAt: at, updatedAt: at }];
  saveGwiraLocalState(localStorage, state);
  localStorage.setItem('gwira.work-sessions.preferences.v1', JSON.stringify({ ...restoreWorkPreferences(null), open: true, selected: `task:${state.tasks[0].id}` }));
}
