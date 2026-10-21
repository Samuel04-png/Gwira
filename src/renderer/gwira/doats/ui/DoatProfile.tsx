import React, { useMemo, useState } from 'react';
import { readableDoatStatus } from './avatarModel.js';
import { DoatAvatar } from './DoatAvatar.js';
import type { DoatUiRecord } from './types.js';

export interface DoatProfileProps {
  doat: DoatUiRecord;
  onBack: () => void;
  onPause?: (doatId: string) => void;
  onResume?: (doatId: string) => void;
  onArchive?: (doatId: string) => void;
  onEdit?: (doatId: string) => void;
  onAssignTask?: (doatId: string) => void;
}

function durationText(value?: number): string {
  if (value === undefined) return 'Not available';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

/** Operational profile: all metrics are domain supplied, never inferred. */
export function DoatProfile({ doat, onBack, onPause, onResume, onArchive, onEdit, onAssignTask }: DoatProfileProps): React.ReactElement {
  const [section, setSection] = useState<'overview' | 'tasks' | 'capabilities' | 'memory' | 'performance'>('overview');
  const completed = useMemo(() => doat.tasks?.filter((task) => task.status === 'done') ?? [], [doat.tasks]);
  const inactive = doat.status === 'paused' || doat.status === 'unavailable';
  return <section className="gwira-doat-profile" aria-label={`${doat.name} profile`}>
    <header className="gwira-doat-profile__header"><button type="button" onClick={onBack}>Back to Doats</button><div className="gwira-doat-profile__actions">{onEdit && <button type="button" onClick={() => onEdit(doat.id)}>Edit</button>}{doat.status === 'paused' ? onResume && <button type="button" onClick={() => onResume(doat.id)}>Resume</button> : onPause && <button type="button" onClick={() => onPause(doat.id)} disabled={doat.status === 'working'}>Pause</button>}{onArchive && <button type="button" onClick={() => onArchive(doat.id)}>Archive</button>}</div></header>
    <div className="gwira-doat-profile__hero"><DoatAvatar spec={doat.avatar} status={doat.status} size={152} label={doat.name} /><div><p className="gwira-doat-profile__eyebrow">{doat.department ?? 'Local workspace'}</p><h1>{doat.name}</h1><h2>{doat.role}</h2><p>{doat.description ?? 'No job description has been saved.'}</p><p><strong>{readableDoatStatus(doat.status)}</strong>{doat.activeTask ? ` · ${doat.activeTask.title}` : ' · No active task'}</p>{!doat.providerAvailable && <p className="gwira-doat-profile__notice">{doat.providerLabel ?? 'No execution provider is configured.'} This Doat cannot run work yet.</p>}{onAssignTask && <button type="button" onClick={() => onAssignTask(doat.id)} disabled={inactive || !doat.providerAvailable}>Assign task</button>}</div></div>
    <nav className="gwira-doat-profile__tabs" aria-label="Doat profile sections">{(['overview', 'tasks', 'capabilities', 'memory', 'performance'] as const).map((item) => <button type="button" key={item} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
    {section === 'overview' && <div className="gwira-doat-profile__section"><h2>Overview</h2><dl><dt>Personality</dt><dd>{doat.personality ?? 'Not configured'}</dd><dt>Communication</dt><dd>{doat.communicationStyle ?? 'Not configured'}</dd><dt>Supervisor</dt><dd>{doat.supervisorName ?? 'Not assigned'}</dd><dt>Provider</dt><dd>{doat.providerAvailable ? (doat.providerLabel ?? 'Configured') : 'Unavailable'}</dd></dl></div>}
    {section === 'tasks' && <div className="gwira-doat-profile__section"><h2>Tasks</h2>{doat.tasks?.length ? <ul>{doat.tasks.map((task) => <li key={task.id}><strong>{task.title}</strong><span>{task.status}</span></li>)}</ul> : <p>No task history is available.</p>}</div>}
    {section === 'capabilities' && <div className="gwira-doat-profile__section"><h2>Skills and tools</h2><h3>Capabilities</h3>{doat.capabilities?.length ? <ul>{doat.capabilities.map((value) => <li key={value}>{value}</li>)}</ul> : <p>No capabilities have been configured.</p>}<h3>Tools</h3>{doat.tools?.length ? <ul>{doat.tools.map((value) => <li key={value}>{value}</li>)}</ul> : <p>No tools have been configured.</p>}</div>}
    {section === 'memory' && <div className="gwira-doat-profile__section"><h2>Memory</h2><p>Business-memory access is not configured in this local prototype. Codex conversation history remains separate from durable business memory.</p></div>}
    {section === 'performance' && <div className="gwira-doat-profile__section"><h2>Performance</h2><dl><dt>Completed tasks</dt><dd>{doat.completedTaskCount ?? completed.length}</dd><dt>Failed executions</dt><dd>{doat.failedTaskCount ?? 'Not available'}</dd><dt>Recorded execution duration</dt><dd>{durationText(doat.executionDurationMs)}</dd></dl></div>}
  </section>;
}
