import React, { useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { canSubmitCodingAgent, codingAgentCapabilities } from './workspaceViewModel.js';

export interface NewCodingAgentInput { name: string; }

export interface AgentsPageProps {
  state: GwiraLocalState;
  onAddCodingAgent: (input: NewCodingAgentInput) => void;
}

/**
 * This is an inventory of real local coding-agent records. It intentionally
 * does not suggest connectors, cloud workers, or capabilities that do not exist.
 */
export function AgentsPage({ state, onAddCodingAgent }: AgentsPageProps): React.ReactElement {
  const [name, setName] = useState('');
  return <section className="gwira-workspace-page" aria-label="Agents">
    <header className="gwira-workspace-page__header"><div><h1>Agents</h1><p>Only the installed local Codex coding-agent capability is available in this prototype.</p></div></header>
    <form className="gwira-workspace-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmitCodingAgent(name)) return;
      onAddCodingAgent({ name: name.trim() }); setName('');
    }}>
      <label>Coding agent name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product engineer" /></label>
      <button type="submit">Add coding agent</button>
    </form>
    {state.agents.length === 0 ? <div className="gwira-workspace-page__empty"><h2>No coding agents added</h2><p>Add a coding-agent record to assign a task. A run still requires a linked local Codex project.</p></div> : <ul className="gwira-directory-list" aria-label="Coding agents">
      {state.agents.map((agent) => <li key={agent.id}><strong>{agent.name}</strong><span>{agent.type}</span><ul>{codingAgentCapabilities(agent).map((capability) => <li key={capability}>{capability}</li>)}</ul></li>)}
    </ul>}
  </section>;
}
