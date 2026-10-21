import React, { useEffect, useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';

export interface SettingsPageProps {
  state: GwiraLocalState;
  onRenameWorkspace: (name: string) => void;
}

/** The only settings control exposed here is backed by the local state reducer. */
export function SettingsPage({ state, onRenameWorkspace }: SettingsPageProps): React.ReactElement {
  const [name, setName] = useState(state.workspace.name);
  useEffect(() => setName(state.workspace.name), [state.workspace.name]);
  return <section className="gwira-workspace-page" aria-label="Settings">
    <header className="gwira-workspace-page__header"><div><h1>Settings</h1><p>Local workspace settings only.</p></div></header>
    <form className="gwira-workspace-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onRenameWorkspace(name.trim()); }}>
      <label>Workspace name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit" disabled={!name.trim() || name.trim() === state.workspace.name}>Save workspace name</button>
    </form>
    <p className="gwira-workspace-page__notice">This local prototype stores workspace records on this device. It does not sync to a server, invite users, or change Codex CLI permissions.</p>
  </section>;
}
