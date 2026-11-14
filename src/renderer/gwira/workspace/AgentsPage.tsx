import {DirectoryDialog} from '../../components/DirectoryDialog.js';
import React, { useState } from 'react';
import { Button } from '../../components/Button.js';
import { Field } from '../../components/Input.js';
import type { GwiraLocalState } from '../domain/types.js';
import { canSubmitCodingAgent, codingAgentCapabilities } from './workspaceViewModel.js';

export interface NewCodingAgentInput { name: string; }

export interface AgentsPageProps {
  state: GwiraLocalState;
  onAddCodingAgent: (input: NewCodingAgentInput) => void;
  unavailable?: boolean;
}

/**
 * This is an inventory of real local coding-agent records. It intentionally
 * does not suggest connectors, cloud workers, or capabilities that do not exist.
 */
export function AgentsPage({ state, onAddCodingAgent, unavailable = false }: AgentsPageProps): React.ReactElement {
  const [name, setName] = useState('');
  const [creating,setCreating]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState<string>();
  const agents=state.agents.filter(a=>a.workspaceId===state.workspace.id&&a.name.toLowerCase().includes(query.toLowerCase()));
  return <section className="gwira-workspace-page" aria-label="Agents">
    <header className="gwira-workspace-page__header"><div><h1>Coding agents</h1><p>Configure coding workers for your projects.</p></div><Button variant="primary" disabled={unavailable} onClick={()=>setCreating(true)}>Add coding agent</Button></header><label className="desktop-directory-search">Search coding agents<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Agent name…" disabled={unavailable}/></label>
    {creating?<DirectoryDialog title="Add coding agent" onClose={()=>setCreating(false)}><form className="gwira-workspace-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmitCodingAgent(name)) return;
      onAddCodingAgent({ name: name.trim() }); setName('');setCreating(false);
    }}>
      <Field label="Coding agent name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product engineer" />
      <Button variant="primary" size="form" type="submit">Add coding agent</Button>
    <p>A coding task requires a linked local project and an available local coding provider before it can run.</p></form></DirectoryDialog>:null}
    {unavailable ? <div className="gwira-workspace-page__empty" role="status"><h2>Coding agents unavailable</h2><p>Local coding execution is unavailable in authenticated workspaces.</p></div> : state.agents.length === 0 ? <div className="gwira-workspace-page__empty"><h2>No coding agents added</h2><p>Add a coding-agent record to assign a task. A run still requires a linked local project.</p></div> : <ul className="gwira-directory-list" aria-label="Coding agents">
      {agents.map((agent) => <li key={agent.id}><button type="button" onClick={()=>setSelected(agent.id)}><strong>{agent.name}</strong><span>Gwira · {agent.type}</span></button><ul>{codingAgentCapabilities(agent).map((capability) => <li key={capability}>{capability}</li>)}</ul></li>)}
    </ul>}
    {selected?<DirectoryDialog title={state.agents.find(a=>a.id===selected)?.name??'Coding agent'} onClose={()=>setSelected(undefined)}><p>Provider: local Codex CLI. Execution is available only through a task with a linked project and configured provider.</p><h3>Recorded work</h3>{state.tasks.filter(t=>t.workspaceId===state.workspace.id&&t.assignee?.kind==='agent'&&t.assignee.id===selected).map(t=><p key={t.id}>{t.title} · {t.agentRun?.status??t.status}</p>)}</DirectoryDialog>:null}
  </section>;
}
