import React, { useMemo, useState } from 'react';
import { readableDoatStatus } from './avatarModel.js';
import { filterDoats } from './directoryModel.js';
import { DoatAvatar } from './DoatAvatar.js';
import type { DoatOperationalStatus, DoatUiRecord } from './types.js';

export type DoatDirectoryView = 'grid' | 'list';

export interface DoatDirectoryProps {
  doats: readonly DoatUiRecord[];
  onOpenDoat: (doatId: string) => void;
  onCreateDoat: () => void;
}

/** Directory of saved Doats. Its parent supplies only actual domain records. */
export function DoatDirectory({ doats, onOpenDoat, onCreateDoat }: DoatDirectoryProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<DoatOperationalStatus | 'all'>('all');
  const [view, setView] = useState<DoatDirectoryView>('grid');
  const displayed = useMemo(() => filterDoats(doats, query, status), [doats, query, status]);
  return <section className="gwira-doat-directory" aria-label="Doats">
    <header className="gwira-doat-directory__header"><div><h1>Doats</h1><p>Your local AI workforce. Availability reflects configured execution providers.</p></div><button type="button" onClick={onCreateDoat}>Create Doat</button></header>
    <div className="gwira-doat-directory__controls"><label>Search Doats<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, role, or department" /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as DoatOperationalStatus | 'all')}><option value="all">All statuses</option>{(['idle', 'working', 'planning', 'waiting_approval', 'blocked', 'completed', 'failed', 'paused', 'unavailable'] as const).map((value) => <option key={value} value={value}>{readableDoatStatus(value)}</option>)}</select></label><div role="group" aria-label="Directory view"><button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button></div></div>
    {displayed.length === 0 ? <div className="gwira-doat-directory__empty"><h2>{doats.length ? 'No matching Doats' : 'No Doats yet'}</h2><p>{doats.length ? 'Change the search or status filter to see saved Doats.' : 'Create a Doat to configure a worker. A provider is required before it can execute work.'}</p>{doats.length === 0 && <button type="button" onClick={onCreateDoat}>Create Doat</button>}</div> : <ul className={`gwira-doat-directory__items is-${view}`} aria-label="Doat directory">{displayed.map((doat) => <li key={doat.id}><button type="button" className="gwira-doat-card" onClick={() => onOpenDoat(doat.id)}><DoatAvatar spec={doat.avatar} status={doat.status} label={doat.name} /><span className="gwira-doat-card__body"><strong>{doat.name}</strong><span>{doat.role}</span><span className={`gwira-doat-card__status is-${doat.status}`}>{readableDoatStatus(doat.status)}</span>{doat.activeTask ? <span>Working on: {doat.activeTask.title}</span> : <span>No active task</span>}<small>{doat.tasks?.length ?? 0} assigned · {doat.completedTaskCount ?? 0} completed</small></span></button></li>)}</ul>}
  </section>;
}
