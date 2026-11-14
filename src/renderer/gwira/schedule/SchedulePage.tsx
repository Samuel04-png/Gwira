import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { categories, categoryRows, scheduleIssues, scheduleLoadMessage, type Category } from './categoryModel.js';
import { Icon } from '../../components/Icon.js';
import { CompactActionMenu, type CompactAction } from '../../components/CompactActionMenu.js';
import type { GwiraLocalState } from '../domain/types.js';
import { nextOccurrence, recurrenceLabel, suggestRecurrence, validateScheduleInput, WEEKDAYS, type Schedule, type ScheduleCommand, type ScheduleInput, type ScheduleRun, type ScheduleSnapshot } from '../../../shared/schedules.js';
import { SidebarTooltip } from '../../components/SidebarTooltip.js';
import { buildScheduleSuggestions, resolveSuggestionIcon, type ScheduleSuggestion } from './scheduleSuggestions.js';
import { createEmptyLocalState } from '../domain/types.js';
import './schedule.css';
const blank = (state: GwiraLocalState): ScheduleInput => ({ title: '', instructions: '', recurrence: { frequency: 'weekdays', time: '09:00', weekday: 1, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, doatId: '', ownerId: state.people.find(p => p.workspaceId === state.workspace.id)?.id ?? '' });
function formatDate(value: string | undefined, zone: string): string { return value ? new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No trigger scheduled'; }
function ScheduleCategoryHeader({category,onNew}:{category:typeof categories[number];onNew?:()=>void}):React.ReactElement {
    return <header className="gw-schedule__category-header"><div><h1>{category.label}</h1><p>{category.description}</p></div><button type="button" disabled={!onNew} title={!onNew?'Scheduling is not connected for authenticated workspaces.':undefined} onClick={onNew}><Icon name="plus"/>New task</button></header>;
}
function ScheduleNavigationHeader({searchOpen,onSearch,onNew}:{searchOpen:boolean;onSearch?:()=>void;onNew?:()=>void}):React.ReactElement {
    return <><header><h1>Scheduled</h1><button type="button" aria-label="Search schedules" aria-expanded={searchOpen} disabled={!onSearch} title={!onSearch?'Scheduling is not connected for authenticated workspaces.':undefined} onClick={onSearch}><Icon name="search"/></button></header>
        <button type="button" className="gw-schedule__new" data-new-schedule disabled={!onNew} title={!onNew?'Scheduling is not connected for authenticated workspaces.':undefined} onClick={onNew}><Icon name="plus"/>New task</button></>;
}
export type AvailableCategory = Exclude<Category, 'all'>;
const availableCategories = categories.filter((category): category is typeof categories[number] & {id: AvailableCategory} => category.id !== 'all');
const unavailableReason = 'Scheduling is not connected for authenticated workspaces.';
function ScheduleCompactHeading({label,actions}:{label:string;actions:CompactAction[]}):React.ReactElement {
    return <div className="gw-schedule__compact-heading"><span>{label}</span><CompactActionMenu label="Filter schedules" icon="views" actions={actions}/></div>;
}
export function UnavailableScheduleSidebar({category,onSelect}:{category:AvailableCategory;onSelect:(category:AvailableCategory)=>void}):React.ReactElement {
    const selected=availableCategories.find(item=>item.id===category)!;
    return <div className="gw-schedule gw-schedule-context"><aside className="gw-schedule__nav" aria-label="Schedules"><ScheduleNavigationHeader searchOpen={false}/><ScheduleCompactHeading label={selected.label} actions={availableCategories.map(item=>({label:item.label,checked:category===item.id,onSelect:()=>onSelect(item.id)}))}/><div className="gw-schedule__list"><p>Schedules are unavailable.</p></div></aside></div>;
}
export function UnavailableSchedulePage({category}:{category:AvailableCategory}):React.ReactElement {
    const selected = availableCategories.find(item=>item.id===category)!;
    const emptyState = useMemo(()=>createEmptyLocalState({organizationId:'unavailable',workspaceId:'unavailable'},new Date(0).toISOString(),'Workspace','Workspace'),[]);
    const suggestions = useMemo(()=>buildScheduleSuggestions(emptyState,[],0),[emptyState]);
    return <div className="gw-schedule" data-testid="schedule-page"><main className="gw-schedule__main"><section className="gw-schedule__category-content">
        <ScheduleCategoryHeader category={selected}/>
        {category==='upcoming'?<ScheduleWelcome suggestions={suggestions}/>:<div className="gw-schedule__category-empty" role="status"><Icon name={selected.icon} size={24}/><h2>Schedules unavailable</h2><p>{unavailableReason}</p></div>}
    </section></main></div>;
}
function ScheduleWelcome({suggestions,onDraftSchedule,onEngagement}:{suggestions:ScheduleSuggestion[];onDraftSchedule?:(instructions:string)=>void;onEngagement?:(engaged:boolean)=>void}):React.ReactElement {
    return <div className="gw-schedule__empty"><div className="gw-schedule__intro"><span className="gw-schedule__clock"><Icon name="clock" size={20}/></span><h1>{onDraftSchedule?'No schedules yet':'Schedules unavailable'}</h1><p>{onDraftSchedule?'Give recurring work a routine. Start with a suggestion or create a schedule.':unavailableReason}</p></div><div className="gw-schedule__templates" aria-label="Schedule suggestions" onMouseEnter={()=>onEngagement?.(true)} onMouseLeave={event=>{if(!event.currentTarget.contains(document.activeElement))onEngagement?.(false);}} onFocusCapture={()=>onEngagement?.(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&!event.currentTarget.matches(':hover'))onEngagement?.(false);}}>{suggestions.map(suggestion=>{
        const content=<><span className="gw-schedule__template-icon"><Icon name={resolveSuggestionIcon(suggestion)} size={20}/></span><span className="gw-schedule__suggestion-copy"><strong>{suggestion.title}</strong><small>{suggestions.every(item=>item.source==='general')?suggestion.description.replace(/^General example · /,''):suggestion.description}</small></span></>;
        return <SidebarTooltip key={suggestion.id} className="gw-schedule__suggestion-host" placement="bottom" label={`${suggestion.title}. ${suggestion.description} ${suggestion.reason}`}>{onDraftSchedule?<button type="button" data-schedule-suggestion={suggestion.id} aria-label={`${suggestion.title}. ${suggestion.description}`} onClick={()=>onDraftSchedule(suggestion.instructions)}>{content}</button>:<div className="gw-schedule__suggestion-card" data-schedule-suggestion={suggestion.id}>{content}</div>}</SidebarTooltip>;
    })}</div><p className="gw-schedule__empty-note">{suggestions.length?suggestions.every(suggestion=>suggestion.source==='general')?'General business examples · Add workspace context for tailored suggestions.':'Suggested from workspace records. General examples are labeled.':'Existing schedules already cover these suggestions. Create a schedule for something else.'}</p></div>;
}
export function SchedulePage({ sidebarTarget, state, onReviewRun, onOpenTask, onDraftSchedule }: {
    sidebarTarget?: HTMLElement | null;
    state: GwiraLocalState;
    onDraftSchedule: (instructions: string) => void;
    onReviewRun: (run: ScheduleRun, schedule: Schedule) => void;
    onOpenTask: (id: string) => void;
}): React.ReactElement {
    const [snapshot, setSnapshot] = useState<ScheduleSnapshot>({ schedules: [], runs: [], audit: [] });
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [selectedId, setSelectedId] = useState<string>(), [search, setSearch] = useState(''), [filter, setFilter] = useState<Category>(() => { try { const saved = localStorage.getItem(`gwira.schedule.category.${state.workspace.id}`); return categories.some(c => c.id === saved) ? saved as Category : 'all'; } catch { return 'all'; } });
    const [searchOpen,setSearchOpen]=useState(false),[showAll,setShowAll]=useState(false);
    const [seen,setSeen]=useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem(`gwira.schedule.seen.${state.workspace.id}`)??'{}');}catch{return {};}});
    const resultVersion=(id:string)=>snapshot.runs.filter(r=>r.scheduleId===id).flatMap(r=>{const task=state.tasks.find(t=>t.id===r.id&&t.workspaceId===state.workspace.id);if(task?.agentRun?.status==='running')return [];return task?.agentRun?.completedAt?[task.agentRun.completedAt]:r.status==='awaiting_review'?[r.createdAt]:[];}).sort().at(-1);
    const selectSchedule=(id:string)=>{setSelectedId(id);const at=resultVersion(id);if(at)setSeen(current=>{const next={...current,[id]:at};try{localStorage.setItem(`gwira.schedule.seen.${state.workspace.id}`,JSON.stringify(next));}catch{}return next;});};
    const [owner, setOwner] = useState(''), [doat, setDoat] = useState(''), [status, setStatus] = useState(''), [sort, setSort] = useState('next'), [range, setRange] = useState('7'), [customStart, setCustomStart] = useState(''), [customEnd, setCustomEnd] = useState('');
    const [loadError, setLoadError] = useState('');
    useEffect(() => { try { localStorage.setItem(`gwira.schedule.category.${state.workspace.id}`, filter); } catch { /* Navigation remains available without preference storage. */ } }, [filter, state.workspace.id]);
    const [editor, setEditor] = useState<{
        input: ScheduleInput;
        schedule?: Schedule;
    }>(), [deleting, setDeleting] = useState<Schedule>();
    const root = useRef<HTMLDivElement>(null), origin = useRef<HTMLElement | null>(null), mutation = useRef(false), request = useRef(0);
    const workspaceId = state.workspace.id;
    const selected = snapshot.schedules.find(s => s.id === selectedId);
    const [cardsEngaged, setCardsEngaged] = useState(false);
    const generated = useMemo(() => buildScheduleSuggestions(state, snapshot.schedules, Date.now()), [state, snapshot.schedules]);
    const suggestionCache = useRef<ScheduleSuggestion[]>(generated);
    if (!cardsEngaged) suggestionCache.current = generated;
    const suggestions = suggestionCache.current;
    useEffect(() => {
        let alive = true;
        setSnapshot({ schedules: [], runs: [], audit: [] });
        setSelectedId(undefined);
        setEditor(undefined);
        setDeleting(undefined);
        setLoading(true);
        setError('');
        const read = async (): Promise<void> => {
            if (mutation.current)
                return;
            const sequence = ++request.current;
            try {
                const data = await window.codexDesktop.schedules.read(workspaceId);
                if (alive && sequence === request.current) {
                    setSnapshot(data);
                    setLoadError('');
                }
            }
            catch (cause) {
                if (alive && sequence === request.current)
                    setLoadError(scheduleLoadMessage(cause, !!window.codexDesktop.schedules));
            }
            finally {
                if (alive && sequence === request.current)
                    setLoading(false);
            }
        };
        void read();
        const timer = setInterval(() => { void read(); }, 15000);
        return () => { alive = false; request.current++; clearInterval(timer); };
    }, [workspaceId]);
    const refresh = async (): Promise<void> => { if (mutation.current) return; const sequence = ++request.current; setLoading(true); try {
        const data = await window.codexDesktop.schedules.read(workspaceId);
        if (sequence === request.current) { setSnapshot(data); setLoadError(''); }
    }
    catch (cause) {
        setLoadError(scheduleLoadMessage(cause, !!window.codexDesktop.schedules));
    }
    finally {
        setLoading(false);
    } };
    const change = async (command: ScheduleCommand, message: string): Promise<boolean> => {
        if (mutation.current)
            return false;
        mutation.current = true;
        request.current++;
        setBusy(true);
        setError('');
        setNotice('Saving…');
        try {
            const data = await window.codexDesktop.schedules.change(workspaceId, command);
            setSnapshot(data);
            if (command.kind === 'save')
                setSelectedId(command.id ?? data.schedules.at(-1)?.id);
            setNotice(message);
            return true;
        }
        catch (value) {
            setError(value instanceof Error ? value.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Schedule could not be saved. Retry.');
            setNotice('');
            return false;
        }
        finally {
            mutation.current = false;
            setBusy(false);
        }
    };
    const closeDialog = (): void => { setEditor(undefined); setDeleting(undefined); requestAnimationFrame(() => { if (origin.current?.isConnected)
        origin.current.focus();
    else
        sidebarTarget?.querySelector<HTMLButtonElement>('[data-new-schedule]')?.focus(); }); };
    const openEditor = (schedule?: Schedule): void => {
        origin.current = document.activeElement as HTMLElement;
        setError('');
        const input = schedule ? { title: schedule.title, instructions: schedule.instructions, recurrence: { ...schedule.recurrence }, ownerId: schedule.ownerId, doatId: schedule.doatId } : blank(state);
        setEditor({ input, schedule });
    };
    const actions = (schedule: Schedule): CompactAction[] => [
        { label: schedule.status === 'paused' ? 'Resume' : 'Pause', icon: schedule.status === 'paused' ? 'refresh' : 'paused', disabled: busy || (schedule.status === 'paused' && scheduleIssues(schedule,snapshot,state).some(i => i.kind === 'configuration')), reason: 'Choose an available owner and Doat before resuming.', onSelect: () => { void change({ kind: schedule.status === 'paused' ? 'resume' : 'pause', id: schedule.id, version: schedule.version }, schedule.status === 'paused' ? 'Schedule registered for review triggers.' : 'Schedule paused. Existing reviews are still available.'); } },
        { label: 'Run now', icon: 'refresh', description: 'Queue one occurrence for review', disabled: busy || snapshot.runs.some(r => r.scheduleId === schedule.id && r.status === 'awaiting_review'), reason: 'Review or dismiss the pending occurrence before requesting another.', onSelect: () => { setSelectedId(schedule.id); void change({ kind: 'run', id: schedule.id, version: schedule.version }, 'Occurrence saved for review. No Doat has been started.'); } },
        { label: 'Edit', icon: 'new-work', disabled: busy, onSelect: () => openEditor(schedule) },
        { label: 'Delete', destructive:true, icon: 'trash', disabled: busy, onSelect: () => { origin.current = document.activeElement as HTMLElement; setDeleting(schedule); } },
    ];
    const category = categories.find(c => c.id === filter)!;
    const now = useMemo(() => Date.now(),[snapshot,filter,range,customStart,customEnd]);
    const end = range === 'custom' && customEnd ? Date.parse(`${customEnd}T23:59:59`) : now + Number(range === 'custom' ? 7 : range) * 86400000;
    const start = range === 'custom' && customStart ? Date.parse(`${customStart}T00:00:00`) : now;
    const invalidRange = range === 'custom' && (!customStart || !customEnd || end < start || end > now + 31 * 86400000);
    const rows = useMemo(() => invalidRange && filter === 'upcoming' ? [] : categoryRows(snapshot,state,filter,{now,end,start,search,owner,doat,status,sort}),[snapshot,state,filter,now,end,start,search,owner,doat,status,sort,invalidRange]);
    const matches = [...new Map(rows.map(row => [row.schedule.id,row.schedule])).values()];
    const chooseCategory = (value: Category): void => { setFilter(value); setSelectedId(undefined); setSearch(''); setOwner(''); setDoat(''); setStatus(''); };
    const closeDetails = (): void => { const id = selectedId; setSelectedId(undefined); requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-schedule-row="${CSS.escape(id ?? '')}"]`)?.focus()); };
    useEffect(() => { if (!selectedId) return; const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.gw-schedule__detail button')?.focus()); return () => cancelAnimationFrame(frame); },[selectedId]);
    useEffect(() => { const close = (event: KeyboardEvent): void => { if (event.key === 'Escape' && selectedId && !document.querySelector('dialog[open],[role="menu"]')) { event.preventDefault();closeDetails(); } }; document.addEventListener('keydown',close); return () => document.removeEventListener('keydown',close); },[selectedId]);
    const groupLabel = (at: string, zone: string): string => { const fmt = new Intl.DateTimeFormat(undefined,{timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,dateStyle:'full'}); const date = fmt.format(new Date(at)); return date === fmt.format(now) ? 'Today' : date === fmt.format(now + 86400000) ? 'Tomorrow' : date; };
    const runs = selected ? snapshot.runs.filter(r => r.scheduleId === selected.id).slice().reverse() : [];
    const listKey = (event: React.KeyboardEvent): void => { const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-schedule-row]')]; const index = rows.indexOf(document.activeElement as HTMLButtonElement); if (index < 0)
        return; if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
    } };
    return <div className="gw-schedule" ref={root} data-testid="schedule-page" aria-busy={busy}>
  {sidebarTarget ? createPortal(<aside className="gw-schedule__nav" aria-label="Schedules">
   <ScheduleNavigationHeader searchOpen={searchOpen} onSearch={()=>setSearchOpen(!searchOpen)} onNew={()=>openEditor()}/>
   <label hidden={!searchOpen} className="gw-schedule__search"><Icon name="search"/><input type="search" aria-label="Search schedules" placeholder="Search schedules" value={search} onChange={e => setSearch(e.target.value)}/></label>
   <ScheduleCompactHeading label={filter==='all'||filter==='upcoming'?'Upcoming':category.label} actions={categories.map(item=>({label:item.label,checked:filter===item.id,onSelect:()=>chooseCategory(item.id)}))}/>
   <div className="gw-schedule__list" onKeyDown={listKey}>
    {loading ? <p role="status">Loading schedules…</p> : loadError ? <p>Schedules unavailable. Retry in the main area.</p> : !matches.length ? <p>{snapshot.schedules.length ? 'No matching schedules.' : 'Your recurring work will appear here.'}</p> : matches.slice(0,showAll?undefined:5).map(schedule => <div className={`gw-schedule__row${selectedId === schedule.id ? ' is-selected' : ''}`} key={schedule.id}><button type="button" data-schedule-row={schedule.id} aria-current={selectedId === schedule.id ? 'true' : undefined} onClick={() => selectSchedule(schedule.id)} title={schedule.title}><span>{schedule.title}{resultVersion(schedule.id)&&seen[schedule.id]!==resultVersion(schedule.id)?<i className="desktop-unread-dot" aria-label="Unread result"/>:null}</span><small>{schedule.status === 'paused' ? 'Paused' : formatDate(schedule.nextRun, schedule.recurrence.timeZone)}</small></button><CompactActionMenu className="gw-schedule__hover" label={`Actions for ${schedule.title}`} actions={actions(schedule)}/></div>)}
   </div>
   {matches.length>5?<button type="button" onClick={()=>setShowAll(!showAll)}>{showAll?'Show less':'Show more'}</button>:null}
  </aside>,sidebarTarget) : null}
  <main className="gw-schedule__main">
   <section className="gw-schedule__category-content">
   <ScheduleCategoryHeader category={category} onNew={()=>openEditor()}/>
   {(loadError || error || snapshot.serviceError) && <div className="gw-schedule__error" role="alert"><span>{loadError || error || snapshot.serviceError}</span><button type="button" disabled={busy || loading} onClick={() => { if (loadError.includes('Restart Gwira')) void window.codexDesktop.restartApp(); else void refresh(); }}>{loading ? 'Retrying…' : loadError.includes('Restart Gwira') ? 'Restart Gwira' : 'Retry'}</button></div>}
   <div role="status" className="gw-schedule__notice">{notice}</div>
   {loading ? <p role="status">Loading schedules…</p> : loadError ? null : <>
   {!!snapshot.schedules.length && <div className="gw-schedule__toolbar">
    {filter === 'all' && <label>Status<select aria-label="Schedule status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="registered">Enabled</option><option value="paused">Paused</option></select></label>}
    <label>Owner<select aria-label="Schedule owner" value={owner} onChange={e => setOwner(e.target.value)}><option value="">All owners</option>{state.people.filter(p => p.workspaceId === workspaceId).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <label>Doat<select aria-label="Schedule Doat" value={doat} onChange={e => setDoat(e.target.value)}><option value="">All Doats</option>{state.doats.filter(d => d.workspaceId === workspaceId).map(d => <option value={d.id} key={d.id}>{d.identity.name}</option>)}</select></label>
    {filter === 'upcoming' ? <><label>Range<select aria-label="Upcoming range" value={range} onChange={e => setRange(e.target.value)}><option value="1">Next 24 hours</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option><option value="custom">Custom</option></select></label>{range === 'custom' && <><label>From<input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}/></label><label>Through<input type="date" min={customStart} value={customEnd} onChange={e => setCustomEnd(e.target.value)}/></label></>}</> : <label>Sort<select aria-label="Sort schedules" value={sort} onChange={e => setSort(e.target.value)}><option value="next">Next trigger</option><option value="updated">Recently updated</option><option value="name">Name</option></select></label>}
    {(search || owner || doat || status) && <button type="button" onClick={() => { setSearch('');setOwner('');setDoat('');setStatus(''); }}>Clear filters</button>}
   </div>}
   {filter === 'upcoming' && <p className="gw-schedule__range-note">Date groups and custom ranges use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Trigger times use each schedule’s timezone.</p>}
   {filter === 'upcoming' && invalidRange ? <p role="alert">Choose a valid range within the next 31 days.</p> : rows.length ? <div className="gw-schedule__table" onKeyDown={listKey} aria-label={`${category.label} records`}>
    <div className="gw-schedule__table-heading"><span>Schedule</span><span>{filter === 'upcoming' ? 'Expected trigger' : filter === 'attention' ? 'Recorded issue' : 'Next trigger'}</span><span>Actions</span></div>
    {rows.map((row,index) => <React.Fragment key={`${row.schedule.id}:${row.at ?? ''}`}>
     {filter === 'upcoming' && (index === 0 || groupLabel(row.at!,row.schedule.recurrence.timeZone) !== groupLabel(rows[index-1]!.at!,rows[index-1]!.schedule.recurrence.timeZone)) && <h2 className="gw-schedule__date-group">{groupLabel(row.at!,row.schedule.recurrence.timeZone)}</h2>}
     <div className={`gw-schedule__table-row${selectedId === row.schedule.id ? ' is-selected' : ''}`}><button type="button" data-schedule-row={row.schedule.id} aria-pressed={selectedId === row.schedule.id} onClick={() => setSelectedId(row.schedule.id)} title={row.schedule.title}><strong>{row.schedule.title}</strong><small>{row.schedule.status === 'paused' ? 'Paused' : 'Enabled · review triggers'} · {state.doats.find(d => d.id === row.schedule.doatId)?.identity.name ?? 'Doat unavailable'}</small><small>{recurrenceLabel(row.schedule.recurrence)}</small></button><div className="gw-schedule__row-meta">{filter === 'attention' ? scheduleIssues(row.schedule,snapshot,state).map(issue => <p key={issue.kind}><strong>{issue.kind === 'review' ? 'Waiting for review' : issue.kind === 'approval' ? 'Approval required' : issue.kind === 'failure' ? 'Execution failed' : 'Configuration'}</strong><small>{issue.reason}{issue.at ? ` · ${formatDate(issue.at,row.schedule.recurrence.timeZone)}` : ''}</small></p>) : formatDate(row.at ?? row.schedule.nextRun,row.schedule.recurrence.timeZone)}</div><CompactActionMenu label={`Actions for ${row.schedule.title}`} actions={actions(row.schedule)}/></div>
    </React.Fragment>)}
   </div> : snapshot.schedules.length || filter !== 'all' ? <div className="gw-schedule__category-empty"><Icon name={category.icon} size={24}/><h2>{search || owner || doat || status ? 'No matching schedules' : filter === 'attention' ? 'No recorded issues need attention' : filter === 'active' ? 'No enabled schedules' : filter === 'paused' ? 'No paused schedules' : filter === 'upcoming' ? 'No triggers in this date range' : 'No schedules yet'}</h2><p>{filter === 'attention' ? 'Reviews and recorded issues will appear here when they need your attention.' : 'Choose another category or create a schedule.'}</p><button type="button" onClick={() => openEditor()}>Create schedule</button></div> : null}
   </>}
   {!loading && !loadError && !snapshot.serviceError && !snapshot.schedules.length && filter === 'all' ? <ScheduleWelcome suggestions={suggestions} onDraftSchedule={onDraftSchedule} onEngagement={setCardsEngaged}/> : null}
   </section>
   {selected && !loadError ? <article className="gw-schedule__detail" aria-label="Schedule details" onKeyDown={event => { if (event.key === 'Escape' && !(event.target as HTMLElement).closest('[role="menu"]')) { event.stopPropagation();closeDetails(); } }}>
    <header><div><button type="button" className="gw-schedule__back" onClick={closeDetails}><Icon name="close"/>Close details</button><h1>{selected.title}</h1><p><Icon name={selected.status === 'paused' ? 'paused' : 'clock'}/>{selected.status === 'paused' ? 'Paused' : 'Registered · review required'}</p></div><CompactActionMenu label="Schedule actions" actions={actions(selected)}/></header>
    <dl className="gw-schedule__facts"><div><dt>Recurrence</dt><dd>{recurrenceLabel(selected.recurrence)}</dd></div><div><dt>Last trigger</dt><dd>{runs[0] ? formatDate(runs[0].createdAt,selected.recurrence.timeZone) : 'No recorded triggers'}</dd></div><div><dt>Next trigger</dt><dd>{formatDate(selected.nextRun, selected.recurrence.timeZone)}</dd></div><div><dt>Owner</dt><dd>{state.people.find(p => p.id === selected.ownerId)?.name ?? 'Owner no longer available'}</dd></div><div><dt>Doat</dt><dd>{state.doats.find(d => d.id === selected.doatId)?.identity.name ?? 'Doat no longer available'}</dd></div></dl>
    {selected.status === 'paused' && <p>Paused since {formatDate(snapshot.audit.filter(a => a.scheduleId === selected.id && a.action === 'paused').at(-1)?.at,selected.recurrence.timeZone)}. No new review triggers will be produced.</p>}
    <section className="gw-schedule__instructions"><h2>Instructions</h2><p>{selected.instructions}</p></section>
    <p className="gw-schedule__boundary"><Icon name="lock"/>Each occurrence waits for your review in My Work. Starting a Doat is a separate action and requires an approved coding project. External actions require authorization.</p>
    <section className="gw-schedule__history"><header><h2>Execution history</h2><button type="button" disabled={busy || runs.some(r => r.status === 'awaiting_review')} title={runs.some(r => r.status === 'awaiting_review') ? 'Review or dismiss the pending occurrence first.' : 'Queue an occurrence for review; does not start a Doat.'} onClick={() => { void change({ kind: 'run', id: selected.id, version: selected.version }, 'Occurrence saved for review. No Doat has been started.'); }}><Icon name="refresh"/>Run now</button></header>
     {!runs.length ? <div className="gw-schedule__history-empty"><Icon name="clock"/><strong>No runs yet</strong><p>Due occurrences and recorded task outcomes will appear here.</p></div> : runs.map(run => {
                const task = state.tasks.find(t => t.id === run.id), outcome = task?.agentRun;
                const label = outcome ? outcome.status === 'completed' ? 'Doat completed' : outcome.status === 'error' ? 'Doat failed' : outcome.status === 'running' ? 'Doat running' : 'Doat stopped' : run.status === 'dismissed' ? 'Review dismissed' : 'Awaiting review · not started';
                const approvals = task ? state.approvals.filter(a => a.taskId === task.id && a.status === 'pending') : [];
                return <div className="gw-schedule__run" key={run.id}><div><strong><Icon name={outcome?.status === 'error' ? 'failed' : outcome?.status === 'completed' ? 'trace-check' : 'clock'}/>{label}</strong><small>{formatDate(run.createdAt, selected.recurrence.timeZone)} · {run.source === 'manual' ? 'Run now' : 'Scheduled trigger'}</small>{outcome?.startedAt ? <small>Started {formatDate(outcome.startedAt,selected.recurrence.timeZone)}{outcome.completedAt ? ` · Ended ${formatDate(outcome.completedAt,selected.recurrence.timeZone)} · ${Math.max(0,Math.round((Date.parse(outcome.completedAt)-Date.parse(outcome.startedAt))/1000))}s` : ''}</small> : null}{outcome?.error ? <p role="alert">{outcome.error}</p> : null}{approvals.length ? <p>{approvals.length} pending approval{approvals.length === 1 ? '' : 's'} in My Work</p> : null}<details><summary>Occurrence instructions</summary><p>{run.instructions}</p></details></div><div className="gw-schedule__run-actions">{task ? <button type="button" onClick={() => onOpenTask(task.id)}>Open task</button> : run.status === 'awaiting_review' ? <button type="button" disabled={!state.doats.some(d => d.id === run.doatId && !d.archivedAt) || !state.agents.some(a => a.id === run.doatId)} title={state.agents.some(a => a.id === run.doatId) ? "Create a To do task for review. Starting it is a separate action in My Work." : "This Doat has no configured coding executor. Choose a supported Doat."} onClick={() => { try {
                    onReviewRun(run, selected);
                }
                catch (value) {
                    setError(value instanceof Error ? value.message : 'Task could not be saved. Check local storage and retry.');
                } }}>Review in My Work</button> : null}{run.status === 'awaiting_review' ? <button type="button" disabled={busy} onClick={() => { void change({ kind: 'dismiss', runId: run.id }, 'Review dismissed. Existing task and execution records are retained.'); }}>Dismiss review</button> : null}</div></div>;
            })}
    </section>
    <details className="gw-schedule__audit"><summary>Schedule activity</summary>{snapshot.audit.filter(a => a.scheduleId === selected.id).slice().reverse().map(a => <p key={a.id}>{a.action} · {formatDate(a.at, selected.recurrence.timeZone)}</p>)}</details>
   </article> : null}


  </main>
  {editor ? <ScheduleEditor key={editor.schedule?.id ?? 'new'} initial={editor.input} editing={!!editor.schedule} state={state} busy={busy} error={error} onClose={closeDialog} onSave={async (input) => { const ok = await change({ kind: 'save', input, id: editor.schedule?.id, version: editor.schedule?.version }, 'Schedule saved and registered for review triggers on this device.'); if (ok)
        closeDialog(); }}/> : null}
  {deleting ? <ScheduleDialog label="Delete schedule" onClose={() => { if (!busy)
        closeDialog(); }}><h1>Delete this schedule?</h1><p>“{deleting.title}” will stop producing triggers. Pending reviews will be dismissed. Existing tasks, run history and audit records are retained.</p><footer><button type="button" disabled={busy} onClick={closeDialog}>Cancel</button><button type="button" className="is-danger" disabled={busy} onClick={async () => { if (await change({ kind: 'delete', id: deleting.id, version: deleting.version }, 'Schedule deleted. History retained on this device.')) {
        setSelectedId(undefined);
        closeDialog();
    } }}>{busy ? 'Deleting…' : 'Delete schedule'}</button></footer>{error ? <p role="alert">{error}</p> : null}</ScheduleDialog> : null}
 </div>;
}
function ScheduleDialog({ label, onClose, children }: {
    label: string;
    onClose: () => void;
    children: React.ReactNode;
}): React.ReactElement {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current?.showModal(); return () => { ref.current?.close(); }; }, []);
    return <dialog ref={ref} className="gw-schedule-dialog" aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}
function ScheduleEditor({ initial, editing, state, busy, error, onClose, onSave }: {
    initial: ScheduleInput;
    editing: boolean;
    state: GwiraLocalState;
    busy: boolean;
    error: string;
    onClose: () => void;
    onSave: (input: ScheduleInput) => Promise<void>;
}): React.ReactElement {
    const [input, setInput] = useState(initial), [step, setStep] = useState(0), [validation, setValidation] = useState(''), [confirmed, setConfirmed] = useState(false);
    const [suggestion, setSuggestion] = useState('');
    const doats = state.doats.filter(d => d.workspaceId === state.workspace.id && !d.archivedAt);
    const patch = (part: Partial<ScheduleInput>): void => setInput(current => ({ ...current, ...part }));
    const zone = input.recurrence.timeZone;
    let next = '';
    try {
        next = formatDate(nextOccurrence(input.recurrence, new Date().toISOString()), zone);
    }
    catch {
        next = 'Enter a valid timezone and recurrence.';
    }
    return <ScheduleDialog label={editing ? 'Edit schedule' : 'New Schedule'} onClose={() => { if (!busy)
        onClose(); }}><form onSubmit={async (e) => { e.preventDefault(); setValidation(''); if (!step) {
        if (!input.title.trim() || !input.instructions.trim()) {
            setValidation('Add a title and describe the work.');
            return;
        }
        const proposed = suggestRecurrence(input.instructions, zone);
        if (proposed && (!editing || input.instructions !== initial.instructions)) {
            patch({ recurrence: proposed });
            setConfirmed(false);
        }
        setStep(1);
        return;
    } try {
        validateScheduleInput(input);
        if (!confirmed)
            throw new Error('Confirm the recurrence and timezone before saving.');
        if (!doats.some(d => d.id === input.doatId) || !state.people.some(p => p.id === input.ownerId && p.workspaceId === state.workspace.id))
            throw new Error('Choose an available owner and Doat.');
        await onSave(input);
    }
    catch (value) {
        setValidation(value instanceof Error ? value.message : 'Check schedule details.');
    } }}>
  <header><div><small>{step === 0 ? '1 · Describe the work' : '2 · Confirm the routine'}</small><h1>{editing ? 'Edit schedule' : 'New Schedule'}</h1></div><button type="button" aria-label="Close schedule editor" disabled={busy} onClick={onClose}><Icon name="close"/></button></header>
  {!step ? <><label>Title<input autoFocus required maxLength={160} value={input.title} onChange={e => patch({ title: e.target.value })} placeholder="Weekly project review"/></label><label>What should happen?<textarea required maxLength={12000} value={input.instructions} onChange={e => patch({ instructions: e.target.value })} placeholder="Every Friday at 3 pm, review project progress and prepare a summary of blockers and next steps…"/></label><button type="button" className="gw-schedule__suggest" onClick={() => { const result = suggestRecurrence(input.instructions, zone); if (result) {
            patch({ recurrence: result });
            setConfirmed(false);
            setSuggestion(`Suggested: ${recurrenceLabel(result)}. Confirm on the next step.`);
        }
        else
            setSuggestion('No supported recurrence found. Choose daily, weekdays or weekly on the next step.'); }}><Icon name="clock"/>Suggest recurrence from description</button><p role="status">{suggestion || 'Your description stays intact. You confirm the actual timing next.'}</p></> : <>
   <div className="gw-schedule-dialog__grid"><label>Repeats<select value={input.recurrence.frequency} onChange={e => { patch({ recurrence: { ...input.recurrence, frequency: e.target.value as ScheduleInput['recurrence']['frequency'] } }); setConfirmed(false); }}><option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Every week</option></select></label><label>Time<input type="time" required value={input.recurrence.time} onChange={e => { patch({ recurrence: { ...input.recurrence, time: e.target.value } }); setConfirmed(false); }}/></label></div>
   {input.recurrence.frequency === 'weekly' ? <label>Day<select value={input.recurrence.weekday} onChange={e => { patch({ recurrence: { ...input.recurrence, weekday: Number(e.target.value) } }); setConfirmed(false); }}>{WEEKDAYS.map((d, i) => <option value={i} key={d}>{d}</option>)}</select></label> : null}
   <label>Timezone<input required value={zone} list="schedule-timezones" onChange={e => { patch({ recurrence: { ...input.recurrence, timeZone: e.target.value } }); setConfirmed(false); }}/><datalist id="schedule-timezones">{['Africa/Lusaka', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Kolkata'].map(z => <option key={z} value={z}/>)}</datalist></label>
   <p className="gw-schedule-dialog__preview">Next trigger: {next}<br />Local wall time is preserved across daylight saving changes. Missing times are skipped.</p>
   <label className="gw-schedule-dialog__confirm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I confirm this recurrence and timezone.</label>
   <div className="gw-schedule-dialog__grid"><label>Owner<select required value={input.ownerId} onChange={e => patch({ ownerId: e.target.value })}><option value="">Choose owner</option>{state.people.filter(p => p.workspaceId === state.workspace.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Run with<select required value={input.doatId} onChange={e => patch({ doatId: e.target.value })}><option value="">Choose Doat</option>{doats.map(d => <option key={d.id} value={d.id}>{d.identity.name}</option>)}<option disabled title="No workflow execution service is connected.">Workflow — execution service required</option></select></label></div>
   {!doats.length || !state.people.length ? <p>Add {doats.length ? 'a person in Teams' : 'a Doat and an owner in the workspace'} before registering a schedule.</p> : null}
   <p className="gw-schedule__boundary"><Icon name="lock"/>Device-local triggers run while Gwira is open. Work is saved for review in My Work. Starting the Doat is a separate action and requires an approved coding project. Workflows need a connected execution service before they can be scheduled.</p>
  </>}
  {validation || error ? <p className="gw-schedule__error" role="alert">{validation || error}</p> : null}
  <footer><button type="button" disabled={busy} onClick={() => step ? setStep(0) : onClose()}>{step ? 'Back' : 'Cancel'}</button><button type="submit" className="is-primary" disabled={busy || !!step && (!doats.length || !state.people.length)}>{busy ? 'Saving…' : !step ? 'Continue' : editing ? 'Save changes' : 'Register schedule'}</button></footer>
 </form></ScheduleDialog>;
}
