import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon.js';
import { CompactActionMenu, type CompactAction } from '../components/CompactActionMenu.js';
import { SidebarTooltip } from '../components/SidebarTooltip.js';
import { workGroups, filterWorkSessions, clampWorkWidth, type WorkPreferences, type WorkSessionView, type WorkGroup } from './model.js';
import { WorkRow } from './WorkRow.js';
import { WorkInspector } from './WorkInspector.js';
import type { InstructionActions } from './InstructionComposer.js';
interface Props extends InstructionActions {
  rows: WorkSessionView[]; preferences: WorkPreferences; onPreferences: (next: WorkPreferences) => void;
  expanded?: boolean; workspaceContext?: boolean; onClose: () => void; onExpand: () => void; onChat: () => void;
  onConversation: (row: WorkSessionView) => void; canOpenConversation: (row: WorkSessionView) => boolean;
  onReview: (row: WorkSessionView) => void; onRefresh: () => Promise<void>; onCancel: (row: WorkSessionView) => Promise<boolean>;
  stopping: ReadonlySet<string>; loading?: boolean; errorMessage?: string;
}
const iconFor = (group: WorkGroup): IconName => group === 'working' ? 'running' : group === 'waiting' || group === 'review' ? 'waiting' : group === 'attention' ? 'failed' : group === 'assigned' ? 'work' : 'trace-check';
function Tool({ label, icon, onClick, expanded }: { label: string; icon: IconName; onClick: () => void; expanded?: boolean }): React.ReactElement {
  return <SidebarTooltip label={label} placement="bottom"><button type="button" aria-label={label} aria-expanded={expanded} onClick={onClick}><Icon name={icon} /></button></SidebarTooltip>;
}
function WorkSessionsHeader({workspaceContext,children}:{workspaceContext?:boolean;children:React.ReactNode}):React.ReactElement {
  return <header className="work-sessions__header"><Icon name={workspaceContext?'clock':'inspector'}/><h2>Work Sessions</h2><span className="work-sessions__spacer"/>{children}</header>;
}
type WorkTab = 'threads' | 'library' | 'scheduled';
function WorkSessionsTabs({id,selected,onSelect,root,disabled=false}:{id:string;selected:WorkTab;onSelect?:(tab:WorkTab)=>void;root?:React.RefObject<HTMLElement|null>;disabled?:boolean}):React.ReactElement {
  return <div className="work-sessions__tabs" role="tablist" aria-label="Work session views">{(['threads', 'library', 'scheduled'] as const).map((tab, index, all) => <button key={tab} type="button" role="tab" id={`${id}-work-tab-${tab}`} aria-controls={`${id}-work-content`} tabIndex={selected === tab ? 0 : -1} aria-selected={selected === tab} disabled={disabled} onClick={() => onSelect?.(tab)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const next = all[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]; onSelect?.(next); root?.current?.querySelector<HTMLButtonElement>(`#${id}-work-tab-${next}`)?.focus(); } }}>{tab === 'threads' ? 'Threads' : tab === 'library' ? 'Library' : 'Scheduled tasks'}</button>)}</div>;
}
export function WorkSessionsUnavailable({onClose}:{onClose:()=>void}):React.ReactElement {
  return <section id="work-sessions-panel" className="work-sessions" data-workspace-context aria-label="Work Sessions">
    <WorkSessionsHeader workspaceContext><Tool label="Close Work Sessions" icon="close" onClick={onClose}/></WorkSessionsHeader>
    <WorkSessionsTabs id="dock" selected="threads" disabled/>
    <label className="work-sessions__search"><Icon name="search"/><input aria-label="Search sessions" placeholder="Search sessions..." disabled/></label>
    <div id="dock-work-content" role="tabpanel" aria-labelledby="dock-work-tab-threads" className="work-sessions__body"><div className="work-sessions__empty"><h3>Work Sessions unavailable</h3><p>Local execution history is unavailable in authenticated workspaces.</p></div></div>
  </section>;
}
export function WorkSessions(p: Props): React.ReactElement {
  const { preferences: pref } = p;
  const seenKey=`gwira.work-seen.${p.scopeKey}`;
  const navigationKey=`gwira.work-navigation.${p.scopeKey}`;
  const [navigation,setNavigation]=useState<{group:'activity'|'projects'|'recent';pinned:string[];collapsed:string[]}>(()=>{try{const value=JSON.parse(localStorage.getItem(navigationKey)??'{}');return {group:['activity','projects','recent'].includes(value.group)?value.group:'projects',pinned:Array.isArray(value.pinned)?value.pinned.filter((v:unknown)=>typeof v==='string'):[],collapsed:Array.isArray(value.collapsed)?value.collapsed.filter((v:unknown)=>typeof v==='string'):[]};}catch{return {group:'projects',pinned:[],collapsed:[]};}});
  const saveNavigation=(next:typeof navigation)=>{setNavigation(next);try{localStorage.setItem(navigationKey,JSON.stringify(next));}catch{}};

  const [seen,setSeen]=useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem(seenKey)??'{}');}catch{return {};}});
  const unread=(row:WorkSessionView)=>row.group!=='working'&&(row.group==='review'||row.group==='attention'||row.task?.agentRun?.completedAt||row.session?.exitCode===0)&&seen[row.id]!==row.updatedAt;

  const root = useRef<HTMLElement>(null), searchRef = useRef<HTMLInputElement>(null), drag = useRef<{x:number;width:number} | undefined>(undefined);
  const [search, setSearch] = useState(!!pref.query || !!p.workspaceContext), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false), [hovered, setHovered] = useState(false), [focusToken, setFocusToken] = useState(0), [area, setArea] = useState('overview');
  const frozen = useRef<WorkSessionView[]>([]);
  const filtered = useMemo(() => filterWorkSessions(p.rows, pref.query, pref.filter), [p.rows, pref.query, pref.filter]);
  const selected = p.rows.find(row => row.id === pref.selected);
  // Freeze row order/group placement, while keeping critical status and inspector data current.
  const rows = hovered ? frozen.current.flatMap(old => { const latest = p.rows.find(row => row.id === old.id); return latest ? [{ ...latest, displayGroup: old.group }] : []; }) : filtered.map(row => ({ ...row, displayGroup: row.group }));
  const pendingUpdates = hovered && frozen.current !== filtered;
  const patch = (next: Partial<WorkPreferences>): void => p.onPreferences({ ...pref, ...next });
  function choose(row: WorkSessionView, nextArea = 'overview', instruct = false): void {
    if(unread(row))setSeen(current=>{const next={...current,[row.id]:row.updatedAt};try{localStorage.setItem(seenKey,JSON.stringify(next));}catch{}return next;});
    patch({ selected: row.id, tab: 'threads' }); setArea(nextArea); if (instruct) setFocusToken(value => value + 1);
    requestAnimationFrame(() => { if (instruct) root.current?.querySelector<HTMLTextAreaElement>('.work-instruction textarea')?.focus(); else root.current?.querySelector<HTMLButtonElement>('[aria-label="Back to work sessions"]')?.focus(); });
  }
  function back(): void { patch({ selected: undefined }); requestAnimationFrame(() => { const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>('[data-work-row]')]; (buttons.find(button => button.dataset.workRow === pref.selected) ?? buttons[0] ?? root.current?.querySelector<HTMLButtonElement>('[aria-label="Search work sessions"]'))?.focus(); }); }
  useEffect(() => { if (search && !p.workspaceContext) searchRef.current?.focus(); }, [search, p.workspaceContext]);
  useEffect(() => { setHovered(false); }, [pref.query, pref.filter, pref.tab]);
  async function refresh(): Promise<void> {
    if (refreshing) return; setHovered(false); setRefreshing(true); setError('');
    try { await p.onRefresh(); } catch { setError('Could not refresh local records. Last confirmed data is shown. Try again.'); } finally { setRefreshing(false); }
  }
  function actions(row: WorkSessionView): CompactAction[] {
    return [
      {label:navigation.pinned.includes(row.id)?'Unpin session':'Pin session',icon:'pin',onSelect:()=>saveNavigation({...navigation,pinned:navigation.pinned.includes(row.id)?navigation.pinned.filter(id=>id!==row.id):[...navigation.pinned,row.id]})},
      { label: row.workerKind === 'person' ? 'Message employee' : 'Give instruction', icon: 'threads', onSelect: () => choose(row, 'overview', true) },
      { label: 'View execution', icon: 'list', onSelect: () => choose(row, 'activity') },
      ...(p.canOpenConversation(row) ? [{ label: 'Open conversation', icon: 'threads' as const, onSelect: () => p.onConversation(row) }] : []),
      ...(row.task ? [{ label: 'Review related task', icon: 'work' as const, onSelect: () => p.onReview(row) }] : []),
      ...(row.approvals.length ? [{ label: 'Review output', icon: 'file' as const, onSelect: () => choose(row, 'outputs') }] : []),
      ...(row.workerKind !== 'person' && row.group === 'working' ? [{ label: 'Pause work', icon: 'paused' as const, disabled: true, reason: 'Cooperative checkpoint API is not connected.', onSelect: () => {} }] : []),
      ...(row.task ? [{ label: 'Reassign work', icon: 'users' as const, disabled: true, reason: 'Authorized handoff service is not connected.', onSelect: () => {} }] : [])
    ];
  }
  const id = p.expanded ? 'expanded' : 'dock';
  const renderRow=(row:WorkSessionView)=><WorkRow key={row.id} unread={!!unread(row)} workspaceContext={p.workspaceContext} row={row} selected={row.id===pref.selected} onSelect={()=>choose(row)} onPrimary={()=>choose(row,row.approvals.some(a=>a.status==='pending')?'outputs':'overview',true)} actions={actions(row)}/>;
  const navSection=(label:string,items:WorkSessionView[])=>{const collapsed=navigation.collapsed.includes(label);return items.length?<section className="work-sessions__group" key={label}><button type="button" className="work-sessions__group-title" aria-expanded={!collapsed} onClick={()=>saveNavigation({...navigation,collapsed:collapsed?navigation.collapsed.filter(v=>v!==label):[...navigation.collapsed,label]})}><Icon name={collapsed?'chevron-right':'chevron-down'}/><strong>{label}</strong><span>{items.length}</span></button><div hidden={collapsed}>{items.map(renderRow)}</div></section>:null;};
  const unpinned=rows.filter(row=>!navigation.pinned.includes(row.id));

  const library = p.rows.flatMap(row => row.approvals.map(approval => ({ row, approval }))).filter(({ row }) => filterWorkSessions([row], pref.query, pref.filter).length);
  const inspector = selected ? <WorkInspector key={`${selected.id}:${area}:${focusToken}`} row={selected} initialArea={area} focusToken={focusToken} actions={actions(selected)} onBack={back} onReview={() => p.onReview(selected)} canOpen={p.canOpenConversation(selected)} onConversation={() => p.onConversation(selected)} onExpand={p.onExpand} expanded={p.expanded} onCancel={() => p.onCancel(selected)} stopping={!!selected.task && p.stopping.has(selected.task.id)} scopeKey={p.scopeKey} onInstruction={p.onInstruction} onDraftInstruction={p.onDraftInstruction} /> : null;
  return <section id={p.expanded ? 'work-sessions-expanded' : 'work-sessions-panel'} ref={root} className={`work-sessions${p.expanded ? ' is-expanded' : ''}`} data-workspace-context={p.workspaceContext || undefined} aria-label={p.workspaceContext ? 'Work Sessions' : p.expanded ? 'Expanded work sessions' : 'Work sessions'} onKeyDown={event => {
    if (event.key !== 'Escape') return; event.preventDefault(); event.stopPropagation(); if (pref.selected) back(); else if (search && !p.workspaceContext) { setSearch(false); root.current?.querySelector<HTMLButtonElement>('[aria-label="Search work sessions"]')?.focus(); } else p.onClose();
  }}>
    {!p.expanded ? <div className="work-sessions__resize" role="separator" tabIndex={0} aria-label="Resize work sessions" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={460} aria-valuenow={pref.width} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); patch({ width: event.key === 'Home' ? 320 : event.key === 'End' ? 460 : clampWorkWidth(pref.width + (event.key === 'ArrowLeft' ? 10 : -10)) }); } }} onPointerDown={event => { drag.current = { x: event.clientX, width: pref.width }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (drag.current) patch({ width: clampWorkWidth(drag.current.width + drag.current.x - event.clientX) }); }} onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }} /> : null}
    <WorkSessionsHeader workspaceContext={p.workspaceContext}>{!p.workspaceContext ? <Tool label="Search work sessions" icon="search" expanded={search} onClick={() => setSearch(!search)} /> : null}<CompactActionMenu label="Work session options" actions={[
      { label: 'Open in application tab', icon: 'external', onSelect: p.onExpand },
      { label: 'Refresh local records', icon: 'refresh', onSelect: () => void refresh() },
      ...(['projects','recent','activity'] as const).map(group=>({label:group==='projects'?'Group by project':group==='recent'?'Recent sessions':'Group by activity',checked:navigation.group===group,onSelect:()=>saveNavigation({...navigation,group})})),
      { label: 'All work', checked: pref.filter === 'all', onSelect: () => patch({ filter: 'all' }) },
      ...workGroups.map(group => ({ label: group.label, checked: pref.filter === group.id, onSelect: () => patch({ filter: group.id }) }))
    ]} /><Tool label={p.workspaceContext ? 'Close Work Sessions' : p.expanded ? 'Collapse to panel' : 'Close work sessions'} icon={p.workspaceContext ? 'close' : p.expanded ? 'inspector' : 'close'} onClick={p.onClose} /></WorkSessionsHeader>
    {!p.workspaceContext ? <div className="work-sessions__source"><Icon name="computer" /><span>Local activity · {refreshing ? 'Refreshing records…' : 'Not connected'}</span></div> : null}
    <WorkSessionsTabs id={id} selected={pref.tab} root={root} onSelect={tab=>patch({tab,selected:undefined})}/>
    {search ? <label className="work-sessions__search"><Icon name="search" /><input ref={searchRef} aria-label={p.workspaceContext ? 'Search sessions' : 'Search work'} placeholder={p.workspaceContext ? 'Search sessions...' : 'Search worker, task or session…'} value={pref.query} onChange={event => patch({ query: event.target.value })} />{pref.query ? <button type="button" aria-label="Clear work search" onClick={() => patch({ query: '' })}><Icon name="close" /></button> : null}</label> : null}
    {pref.filter !== 'all' ? <div className="work-sessions__filter">{workGroups.find(group => group.id === pref.filter)?.label}<button type="button" onClick={() => patch({ filter: 'all' })}>Clear filter</button></div> : null}
    {error || p.errorMessage ? <div className="work-sessions__error" role="alert">{error || p.errorMessage}<button type="button" onClick={() => void refresh()}>Retry refresh</button></div> : null}
    <span className="work-sessions__announcer" role="status">{p.rows.filter(row => row.group === 'attention').length} work items need attention. {p.rows.filter(row => row.group === 'review').length} results need review.</span>
    <div id={`${id}-work-content`} role="tabpanel" aria-labelledby={`${id}-work-tab-${pref.tab}`} className="work-sessions__body">
      {p.loading ? <div role="status" className="work-sessions__empty">Loading local records…{[1, 2, 3].map(value => <div key={value} className="work-sessions__skeleton" aria-hidden="true" />)}</div> : pref.tab === 'scheduled' ? <div className="work-sessions__empty"><h3>No connected execution schedules</h3><p>A durable agent scheduling service is not connected. Employee calendar events are kept separate.</p></div> : pref.tab === 'library' ? <><div className="work-sessions__intro"><h3>Recorded results</h3><p>References linked to actual work. File download requires an output catalog.</p></div>{library.map(({ row, approval }) => <button type="button" className="work-sessions__output" key={approval.id} onClick={() => choose(row, 'outputs')}><Icon name="file" /><span><strong>{row.title}</strong><small>{row.owner} · {approval.status.replaceAll('_', ' ')}</small><small>Result {approval.resultId}</small></span><Icon name="forward" /></button>)}{!library.length ? <div className="work-sessions__empty"><h3>No execution outputs recorded</h3></div> : null}</> : <div className={`work-sessions__feed-layout${pref.selected ? ' has-selection' : ''}`}>
        <div className="work-sessions__list" onMouseEnter={() => { frozen.current = filtered; setHovered(true); }} onMouseLeave={() => setHovered(false)}>
          {navSection('Pinned sessions',rows.filter(row=>navigation.pinned.includes(row.id)))}
          {navigation.group==='projects'?[...new Set(unpinned.map(row=>row.project??'Unlinked work'))].map(project=>navSection(project,unpinned.filter(row=>(row.project??'Unlinked work')===project))):navigation.group==='recent'?navSection('Recent sessions',unpinned):workGroups.map(group => { const matches = unpinned.filter(row => row.displayGroup === group.id), collapsed = pref.collapsed.includes(group.id); if (!matches.length) return null; return <section className={`work-sessions__group is-${group.id}`} key={group.id}><button type="button" className="work-sessions__group-title" aria-controls={`${id}-work-group-${group.id}`} aria-expanded={!collapsed} onClick={() => patch({ collapsed: collapsed ? pref.collapsed.filter(value => value !== group.id) : [...pref.collapsed, group.id] })}><Icon name={iconFor(group.id)} /><strong>{group.label}</strong><span>{matches.length}</span><Icon name={collapsed ? 'forward' : 'chevron-down'} /></button><div id={`${id}-work-group-${group.id}`} hidden={collapsed}>{matches.map(row => <WorkRow key={row.id} unread={!!unread(row)} workspaceContext={p.workspaceContext} row={row} selected={row.id === pref.selected} onSelect={() => choose(row)} onPrimary={() => choose(row, row.approvals.some(approval => approval.status === 'pending') ? 'outputs' : 'overview', true)} actions={actions(row)} />)}</div></section>; })}
          {!rows.length ? <div className="work-sessions__empty"><h3>{pref.query || pref.filter !== 'all' ? 'No matching work sessions' : p.workspaceContext ? 'No work sessions yet' : 'No active work'}</h3><p>{pref.query || pref.filter !== 'all' ? 'Try another search or clear the filters.' : p.workspaceContext ? 'Your work sessions will appear here.' : 'No recorded executions or employee assignments.'}</p><button type="button" onClick={p.onChat}>Open Gwira Chat</button></div> : null}
        </div>
        {inspector}{pref.selected && !selected ? <div className="work-sessions__empty"><h3>Work record unavailable</h3><p>This record is no longer accessible in the workspace.</p><button type="button" onClick={back}>Return to threads</button></div> : null}
      </div>}
    </div><footer className="work-sessions__footer"><span>{pendingUpdates ? 'New activity available · order updates on exit' : 'Local records · Not synchronized'}</span><button type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></footer>
  </section>;
}
