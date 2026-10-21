import React, { useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { canSubmitPerson, peopleByName } from './workspaceViewModel.js';

export interface NewPersonInput {
  name: string;
  role: string;
}

export interface TeamsPageProps {
  state: GwiraLocalState;
  onAddPerson: (input: NewPersonInput) => void;
}

/** Local people directory. The parent owns IDs, persistence and reducer dispatch. */
export function TeamsPage({ state, onAddPerson }: TeamsPageProps): React.ReactElement {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const people = peopleByName(state.people);

  return <section className="gwira-workspace-page" aria-label="Teams">
    <header className="gwira-workspace-page__header"><div><h1>Teams</h1><p>People recorded in this local workspace.</p></div></header>
    <form className="gwira-workspace-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmitPerson(name, role)) return;
      onAddPerson({ name: name.trim(), role: role.trim() });
      setName(''); setRole('');
    }}>
      <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Role<input required value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Founder" /></label>
      <button type="submit">Add person</button>
    </form>
    {people.length === 0 ? <div className="gwira-workspace-page__empty"><h2>No people added</h2><p>Add a person before assigning human-owned work or approving an agent result.</p></div> : <ul className="gwira-directory-list" aria-label="Workspace people">
      {people.map((person) => <li key={person.id}><strong>{person.name}</strong><span>{person.role}</span></li>)}
    </ul>}
  </section>;
}
