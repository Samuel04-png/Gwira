import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GwiraLocalState, Person } from '../domain/types.js';
import type { Doat, DoatOperationalStatus } from '../doats/domain/types.js';
import { AutomationsIcon, ExploreIcon, FolderIcon, NewThreadIcon, SkillsNavIcon } from '../../components/Icons.js';
import type { WorkspaceNavigation } from '../../components/ProjectSidebar.js';

export type SidebarSelection = { kind: 'person'; id: string } | { kind: 'doat'; id: string } | { kind: 'channel'; id: string };
export type OpenOptions = { openInspector: true; tab: 'chat' };
export function useDashboardSelection(onSelect?: (selection: SidebarSelection, options?: OpenOptions) => void): { selected: SidebarSelection | null; select: (selection: SidebarSelection, options?: OpenOptions) => void } {
  const [selected, setSelected] = useState<SidebarSelection | null>(null);
  return { selected, select: (selection, options) => { setSelected(selection); onSelect?.(selection, options); } };
}

type Entry = { id: string; kind: SidebarSelection['kind']; name: string; updatedAt: string; status?: DoatOperationalStatus; task?: string };
const pinKey = 'gwira.dashboard-sidebar.pinned.v1';
const collapsedKey = 'gwira.dashboard-sidebar.sections.v1';
function readArray(key: string): string[] { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }
function readSections(): Record<string, boolean> { try { const value: unknown = JSON.parse(localStorage.getItem(collapsedKey) ?? '{}'); return value && typeof value === 'object' ? value as Record<string, boolean> : {}; } catch { return {}; } }
function initials(name: string): string { return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'; }
function statusSentence(entry: Entry): string | undefined {
  if (!entry.status) return undefined;
  switch (entry.status) { case 'working': return `${entry.name} is working${entry.task ? ` on ${entry.task}` : ''}.`; case 'waiting_for_approval': return `${entry.name} is waiting for your approval.`; case 'idle': return `${entry.name} is idle.`; case 'paused': return `${entry.name} is paused.`; case 'failed': return `${entry.name} failed during its last run.`; case 'completed': return `${entry.name} completed its last run.`; default: return undefined; }
}
function statusGlyph(status?: DoatOperationalStatus): string | undefined { return status === 'working' ? '—' : status === 'waiting_for_approval' ? '◐' : status === 'idle' ? '•' : status === 'paused' ? '○' : status === 'failed' ? '■' : status === 'completed' ? '✓' : undefined; }

export function DashboardSidebar({ state, activeView, onNavigate, onOpenDoat, onCreateDoat, onAddPerson }: { state: GwiraLocalState; activeView: WorkspaceNavigation; onNavigate: (view: Exclude<WorkspaceNavigation, 'home' | 'chat' | 'skills'>) => void; onOpenDoat: (id: string) => void; onCreateDoat: () => void; onAddPerson: () => void }): React.ReactElement {
  const { selected, select } = useDashboardSelection((item) => { if (item.kind === 'doat') onOpenDoat(item.id); });
  const [pinned, setPinned] = useState<string[]>(() => readArray(pinKey));
  const [expanded, setExpanded] = useState(() => ({ pinned: readSections().pinned !== false, channels: readSections().channels !== false, people: readSections().people !== false }));
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => { try { localStorage.setItem(pinKey, JSON.stringify(pinned)); } catch { /* pinning remains local for this session */ } }, [pinned]);
  useEffect(() => { try { localStorage.setItem(collapsedKey, JSON.stringify(expanded)); } catch { /* expanded is the safe fallback */ } }, [expanded]);
  const people = useMemo<Entry[]>(() => state.people.map((person: Person) => ({ id: `person:${person.id}`, kind: 'person', name: person.name, updatedAt: person.createdAt })), [state.people]);
  const doats = useMemo<Entry[]>(() => state.doats.filter((doat: Doat) => !doat.archivedAt).map((doat: Doat) => {
    const task = state.tasks.find((item) => item.id === doat.operations.activeTaskId);
    // A configured/available Doat is not evidence of an executing run. Keep a
    // stale "working" operation from producing a misleading activity glyph.
    const status = doat.operations.status === 'working' && task?.agentRun?.status !== 'running' ? undefined : doat.operations.status;
    return { id: `doat:${doat.id}`, kind: 'doat', name: doat.identity.name, updatedAt: doat.operations.updatedAt, status, task: task?.title };
  }), [state.doats, state.tasks]);
  const all = useMemo(() => [...people, ...doats].sort((a, b) => { const attention = (entry: Entry) => entry.status === 'waiting_for_approval' || entry.status === 'failed' ? 1 : 0; return attention(b) - attention(a) || b.updatedAt.localeCompare(a.updatedAt); }), [people, doats]);
  const pinnedEntries = all.filter((entry) => pinned.includes(entry.id));
  const unpinned = all.filter((entry) => !pinned.includes(entry.id));
  const togglePin = (id: string) => setPinned((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleSection = (section: keyof typeof expanded) => setExpanded((current) => ({ ...current, [section]: !current[section] }));
  const onListKey = (event: React.KeyboardEvent<HTMLElement>) => { const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.dashboard-sidebar__row')]; const index = rows.indexOf(document.activeElement as HTMLButtonElement); if (index < 0) return; if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus(); } if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); rows[event.key === 'Home' ? 0 : rows.length - 1]?.focus(); } };
  const renderRows = (key: string, entries: Entry[]) => { const visible = showAll[key] ? entries : entries.slice(0, 6); return <>{visible.map((entry) => <ConversationRow key={entry.id} entry={entry} selected={selected?.kind === entry.kind && selected.id === entry.id.slice(entry.kind.length + 1)} onOpen={() => select({ kind: entry.kind, id: entry.id.slice(entry.kind.length + 1) }, { openInspector: true, tab: 'chat' })} onPin={() => togglePin(entry.id)} pinned={pinned.includes(entry.id)} />)}{entries.length > 6 ? <button type="button" className="dashboard-sidebar__show-all" onClick={() => setShowAll((current) => ({ ...current, [key]: !current[key] }))}>{showAll[key] ? 'Show less' : `Show all ${entries.length}`}</button> : null}</>; };
  return <nav className="dashboard-sidebar" aria-label="Dashboard navigation" ref={listRef} onKeyDown={onListKey}>
    <header className="dashboard-sidebar__header"><strong>Gwira</strong></header>
    <div className="dashboard-sidebar__nav">
      <NavRow label="Dashboard" icon={<AutomationsIcon />} active={activeView === 'dashboard'} onClick={() => onNavigate('dashboard')} />
      <NavRow label="Inbox" icon={<NewThreadIcon />} active={activeView === 'inbox'} onClick={() => onNavigate('inbox')} />
      <NavRow label="My Work" icon={<SkillsNavIcon />} active={activeView === 'my-work'} onClick={() => onNavigate('my-work')} />
      <NavRow label="Projects" icon={<FolderIcon />} disabled title="Projects doesn't have a dedicated route yet." />
      <NavRow label="Views" icon={<ExploreIcon />} disabled title="Views isn't built yet." />
    </div>
    <div className="dashboard-sidebar__scroll">
      <Section id="dashboard-pinned" label="Pinned" expanded={expanded.pinned} onToggle={() => toggleSection('pinned')}>{pinnedEntries.length ? renderRows('pinned', pinnedEntries) : <p className="dashboard-sidebar__empty">Nothing pinned yet.</p>}</Section>
      <Section id="dashboard-channels" label="Channels" expanded={expanded.channels} onToggle={() => toggleSection('channels')}><p className="dashboard-sidebar__empty">No channels yet.</p></Section>
      <Section id="dashboard-people" label="People & Doats" expanded={expanded.people} onToggle={() => toggleSection('people')} actions={<CreationMenu onCreateDoat={onCreateDoat} onAddPerson={onAddPerson} />}>{unpinned.length ? renderRows('people', unpinned) : <EmptyPeople peopleCount={people.length} doatCount={doats.length} onCreateDoat={onCreateDoat} onAddPerson={onAddPerson} />}</Section>
    </div>
    <footer className="dashboard-sidebar__footer"><strong>Local workspace</strong><small>No account connected</small></footer>
  </nav>;
}

function NavRow({ label, active, onClick, disabled, title, icon }: { label: string; active?: boolean; onClick?: () => void; disabled?: boolean; title?: string; icon?: React.ReactNode }): React.ReactElement { return <button type="button" className={`dashboard-sidebar__nav-row ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} aria-disabled={disabled || undefined} disabled={disabled} title={title} onClick={onClick}>{icon ?? <span className="dashboard-sidebar__nav-dot" aria-hidden="true" />}{label}</button>; }
function Section({ id, label, expanded, onToggle, actions, children }: { id: string; label: string; expanded: boolean; onToggle: () => void; actions?: React.ReactNode; children: React.ReactNode }): React.ReactElement { return <section className="dashboard-sidebar__section"><div className="dashboard-sidebar__section-title"><button type="button" className="dashboard-sidebar__section-header" aria-expanded={expanded} aria-controls={id} onClick={onToggle}><span>{label}</span><span className="dashboard-sidebar__section-action-slot" aria-hidden="true" /><span className={expanded ? 'is-open' : ''} aria-hidden="true">›</span></button>{actions}</div>{expanded ? <div id={id}>{children}</div> : null}</section>; }
function CreationMenu({ onCreateDoat, onAddPerson }: { onCreateDoat: () => void; onAddPerson: () => void }): React.ReactElement { const [open, setOpen] = useState(false); return <div className="dashboard-sidebar__creation"><button type="button" className="dashboard-sidebar__section-add" aria-label="Add person or Doat" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>+</button>{open ? <div className="dashboard-sidebar__menu" role="menu"><button type="button" role="menuitem" onClick={() => { setOpen(false); onAddPerson(); }}>Add person</button><button type="button" role="menuitem" onClick={() => { setOpen(false); onCreateDoat(); }}>Create Doat</button></div> : null}</div>; }
function EmptyPeople({ peopleCount, doatCount, onCreateDoat, onAddPerson }: { peopleCount: number; doatCount: number; onCreateDoat: () => void; onAddPerson: () => void }): React.ReactElement { return <div className="dashboard-sidebar__empty-stack">{peopleCount === 0 ? <p className="dashboard-sidebar__empty">No people added yet. <button type="button" onClick={onAddPerson}>Add a person</button></p> : null}{doatCount === 0 ? <p className="dashboard-sidebar__empty">No Doats yet. <button type="button" onClick={onCreateDoat}>Create a Doat</button></p> : null}</div>; }
function ConversationRow({ entry, selected, onOpen, onPin, pinned }: { entry: Entry; selected: boolean; onOpen: () => void; onPin: () => void; pinned: boolean }): React.ReactElement { const [menuOpen, setMenuOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const sentence = statusSentence(entry); const label = sentence ? `${entry.name}, ${sentence}` : entry.name; const close = () => { setMenuOpen(false); queueMicrotask(() => trigger.current?.focus()); }; return <div className={`dashboard-sidebar__conversation ${selected ? 'is-selected' : ''}`} onKeyDown={(event) => { if (event.shiftKey && event.key === 'F10') { event.preventDefault(); setMenuOpen(true); } }}><button type="button" className="dashboard-sidebar__row" aria-current={selected ? 'page' : undefined} aria-label={label} title={entry.name} onClick={onOpen}><span className={`dashboard-sidebar__avatar ${entry.kind === 'doat' ? 'is-doat' : ''}`}>{initials(entry.name)}</span><span className="dashboard-sidebar__name">{entry.name}</span>{entry.kind === 'doat' && statusGlyph(entry.status) ? <span className={`dashboard-sidebar__status is-${entry.status}`} title={sentence}>{statusGlyph(entry.status)}</span> : null}<span className="dashboard-sidebar__right-slot" aria-hidden="true" /></button><button ref={trigger} type="button" className="dashboard-sidebar__more" title="More actions" aria-label={`More actions for ${entry.name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>•••</button>{menuOpen ? <div className="dashboard-sidebar__menu dashboard-sidebar__row-menu" role="menu" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}><button type="button" role="menuitem" onClick={() => { onPin(); close(); }}>{pinned ? 'Unpin' : 'Pin'}</button></div> : null}</div>; }
