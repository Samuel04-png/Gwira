import { AgentActivityIndicator } from './StatusIndicator.js';
import { primaryNavigationSelection } from './iconModel.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CodexSession, CodexThreadHistory } from '../../shared/types.js';
import type { ProjectEntry } from '../projects.js';
import { getProjectThreadRows } from '../projectThreads.js';
import { type WorkspaceNavigation, type WorkspaceRoute } from '../navigationTypes.js';
export type { WorkspaceNavigation } from '../navigationTypes.js';
import { orderSidebarItems, moveSidebarItem, readSidebarPreferences, visibleSidebarItems, remapSidebarKeys, type SidebarSection, type SidebarPreferences } from '../sidebarModel.js';
import { Icon, NavigationIcon, ThreadSpinner, FolderIcon, FolderOpenIcon, NewThreadIcon } from './Icon.js';
import { PrimaryRail } from './PrimaryRail.js';
import {WorkspaceToolsNavigation,workspaceToolRoutes} from './WorkspaceToolsNavigation.js';
import { HomeSidebarContent } from './HomeSidebarContent.js';
import { ItemTitle } from './ItemTitle.js';
import { SidebarContextMenu } from './SidebarContextMenu.js';
import { ProjectCreateDialog } from './ProjectCreateDialog.js';
import { SidebarSectionHeading } from './SidebarSectionHeading.js';
import { SidebarConversationRow } from './SidebarConversationRow.js';

type SidebarItem = { key: string; title: string; updatedAt: string; createdAt: string; project: ProjectEntry; kind: 'history' | 'session'; history?: CodexThreadHistory; session?: CodexSession; active: boolean; running: boolean };
type SidebarMenu = { section: SidebarSection; panel: 'root' | 'organize' | 'sort' | 'show' } | undefined;
function readStored<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } }
function saveStored(key: string, value: unknown): void { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* UI preferences remain usable for this session. */ } }
function historyItemKey(projectId: string, id: string): string { return `history:${projectId}:${id}`; }
function sessionItemKey(projectId: string, id: string): string { return `session:${projectId}:${id}`; }
function normalizeSidebarTitle(value: string | undefined): string {
  let title = value?.trim() ?? '';
  if (!title) return 'Untitled conversation';
  if (title.startsWith('{') || title.startsWith('[')) {
    try {
      const parsed = JSON.parse(title) as { title?: unknown; text?: unknown; message?: unknown };
      const candidate = [parsed.title, parsed.text, parsed.message].find((item): item is string => typeof item === 'string' && item.trim().length > 0);
      title = candidate?.trim() ?? '';
    } catch { title = ''; }
  }
  title = title.replace(/<[^>]+>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_#>]/g, '').replace(/\s+/g, ' ').trim();
  if (!title || /^\{.*\}$/.test(title) || /^\/?(?:Users|home|tmp)\//i.test(title) || /^page[_\s-]*id/i.test(title)) return 'Untitled conversation';
  return title;
}
function compactSessionTitle(session: CodexSession): string { return normalizeSidebarTitle(session.messages.find((message) => message.role === 'user')?.text); }

interface ProjectSidebarProps {
  dashboardSidebar?: React.ReactNode;
  workspaceToolsTarget?: React.Ref<HTMLDivElement>;
  workspaceToolsOpen?: boolean;
  neutralRail?: boolean;
  scheduleSidebarRef?: React.Ref<HTMLDivElement>;
  activeProject?: ProjectEntry;
  activeSession?: CodexSession;
  activeSessionId?: string;
  activeView: WorkspaceNavigation;
  expandedProjectIds: ReadonlySet<string>;
  historiesByProject: Record<string, CodexThreadHistory[]>;
  projects: ProjectEntry[];
  sessionsForProject: (project: ProjectEntry) => CodexSession[];
  formatRelativeTime: (iso: string) => string;
  onAddProject: () => void;
  onCreateProject: (name: string, path: string) => void;
  onDeleteHistory: (event: React.MouseEvent<HTMLButtonElement>, project: ProjectEntry, history: CodexThreadHistory) => void;
  onNewThread: (project?: ProjectEntry) => void;
  onOpenHistory: (project: ProjectEntry, history: CodexThreadHistory) => void;
  onOpenSession: (project: ProjectEntry, session: CodexSession) => void;
  onProjectKeyDown: (event: React.KeyboardEvent<HTMLElement>, action: () => void) => void;
  collapsed: boolean;
  overlay?: boolean;
  onSelectBusinessView: (view: Exclude<WorkspaceNavigation, 'home' | 'chat' | 'skills'>) => void;
  onOpenHome: () => void;
  onSelectSkills: () => void;
  onToggleProject: (project: ProjectEntry) => void;
  onToggleProjectMenu: (project: ProjectEntry, button: HTMLButtonElement) => void;
  openProjectMenuId?: string;
}


/** Freeze row ordering while a pointer is inside the sidebar; keep data current. */
function useStableSidebarRows(items: SidebarItem[], locked: boolean): SidebarItem[] {
  const order = useRef<string[]>([]);
  if (!locked) order.current = items.map(item => item.key);
  const rank = new Map(order.current.map((key, index) => [key, index]));
  const incoming = new Map(items.map((item,index) => [item.key,index]));
  return locked ? [...items].sort((a,b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) || (incoming.get(a.key) ?? 0) - (incoming.get(b.key) ?? 0)) : items;
}

export function ProjectSidebar({ workspaceToolsTarget,workspaceToolsOpen, neutralRail, scheduleSidebarRef, dashboardSidebar, activeProject, activeSession, activeSessionId, activeView, expandedProjectIds, historiesByProject, projects, sessionsForProject, formatRelativeTime, onAddProject, onCreateProject, onDeleteHistory, onNewThread, onOpenHistory, onOpenSession, onProjectKeyDown, collapsed, overlay = false, onSelectBusinessView, onOpenHome, onSelectSkills, onToggleProject, onToggleProjectMenu, openProjectMenuId }: ProjectSidebarProps): React.ReactElement {
  const [sectionExpanded, setSectionExpanded] = useState<Record<SidebarSection, boolean>>(() => ({ favorites: true, projects: false, recent: false, ...readStored('gwira.sidebar.sections.v2', {}) }));
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(() => new Set(Object.entries(readStored<Record<string, boolean>>('gwira.sidebar.favorites.v1', {})).filter(([,value]) => value === true).map(([key]) => key)));
  const [preferences, setPreferences] = useState(() => readSidebarPreferences(readStored('gwira.sidebar.menu-preferences.v1', {})));
  const [orders, setOrders] = useState<Record<SidebarSection, string[]>>(() => {
    const saved = readStored<Record<string, unknown>>('gwira.sidebar.manual-orders.v1', {});
    const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
    return { favorites: strings(saved.favorites ?? readStored('gwira.sidebar.pinned-order.v1', [])), projects: strings(saved.projects), recent: strings(saved.recent) };
  });
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});
  const [pointerInside, setPointerInside] = useState(false);
  const [sidebarMenu, setSidebarMenu] = useState<SidebarMenu>();
  const [sidebarMenuPosition, setSidebarMenuPosition] = useState<{ top: number; left: number }>();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const createTriggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuFocusRequestedRef = useRef(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [context, setContext] = useState<'home' | 'business'>(() => activeView === 'home' || activeView === 'chat' || activeView === 'library' ? 'home' : 'business');
  useEffect(() => { if (activeView === 'home' || activeView === 'chat' || activeView === 'library') setContext('home'); else setContext('business'); setMoreOpen(false); }, [activeView]);
  useEffect(() => saveStored('gwira.sidebar.sections.v2', sectionExpanded), [sectionExpanded]);
  useEffect(() => saveStored('gwira.sidebar.favorites.v1', Object.fromEntries([...favoriteKeys].map(key => [key,true]))), [favoriteKeys]);
  useEffect(() => saveStored('gwira.sidebar.menu-preferences.v1', preferences), [preferences]);
  useEffect(() => { saveStored('gwira.sidebar.manual-orders.v1', orders); saveStored('gwira.sidebar.pinned-order.v1', orders.favorites); }, [orders]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node) && !menuTriggerRef.current?.contains(event.target as Node)) setSidebarMenu(undefined); if (!(event.target as Element).closest('.gwira-more-menu,[aria-label="More"]')) setMoreOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { if (sidebarMenu) { setSidebarMenu(undefined); menuTriggerRef.current?.focus(); } if (moreOpen) { setMoreOpen(false); sidebarRef.current?.querySelector<HTMLButtonElement>('[aria-label="More"]')?.focus(); } } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    const resized = () => setSidebarMenu(undefined);
    window.addEventListener('resize', resized);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); window.removeEventListener('resize', resized); };
  }, [sidebarMenu, moreOpen]);
  useEffect(() => {
    if (!sidebarMenu) return;
    if (menuFocusRequestedRef.current) requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    menuFocusRequestedRef.current = false;
  }, [sidebarMenu]);
  useEffect(() => { if (moreOpen) document.dispatchEvent(new CustomEvent('gw-item-preview-open', { detail: 'sidebar-more' })); }, [moreOpen]);
  useEffect(() => { if (collapsed) { setSidebarMenu(undefined); setMoreOpen(false); } }, [collapsed]);

  const sidebarItems = useMemo<SidebarItem[]>(() => projects.flatMap(project => {
    const sessions = sessionsForProject(project);
    return getProjectThreadRows({ projectId: project.id, activeProjectId: activeProject?.id, activeConversationId: activeSession?.codexConversationId, activeSessionId, expandedProjectIds: new Set(projects.map(p => p.id)), histories: historiesByProject[project.id] ?? [], sessions }).map(row => {
      if (row.kind === 'session') return { key: sessionItemKey(project.id,row.session.id), title: compactSessionTitle(row.session), updatedAt: row.session.updatedAt, createdAt: row.session.startedAt, project, kind: 'session' as const, session: row.session, active: row.active, running: row.running };
      const matching = sessions.find(session => session.codexConversationId === row.history.id);
      const updatedAt = matching && Date.parse(matching.updatedAt) > Date.parse(row.history.updatedAt) ? matching.updatedAt : row.history.updatedAt;
      return { key: historyItemKey(project.id,row.history.id), title: normalizeSidebarTitle(row.history.title), updatedAt, createdAt: row.history.createdAt, project, kind: 'history' as const, history: row.history, active: row.active, running: row.running };
    });
  }), [projects, historiesByProject, sessionsForProject, activeProject?.id, activeSession?.codexConversationId, activeSessionId]);
  useEffect(() => {
    const aliases = new Map<string,string>();
    for (const project of projects) for (const session of sessionsForProject(project)) {
      const canonical = session.codexConversationId ? historyItemKey(project.id, session.codexConversationId) : undefined;
      if (canonical && sidebarItems.some(item => item.key === canonical)) aliases.set(sessionItemKey(project.id, session.id), canonical);
    }
    if ([...favoriteKeys].some(key => aliases.has(key))) setFavoriteKeys(new Set(remapSidebarKeys([...favoriteKeys], aliases)));
    if (Object.values(orders).some(keys => keys.some(key => aliases.has(key)))) setOrders(current => ({ favorites: remapSidebarKeys(current.favorites, aliases), projects: remapSidebarKeys(current.projects, aliases), recent: remapSidebarKeys(current.recent, aliases) }));
  }, [sidebarItems, projects, sessionsForProject, favoriteKeys, orders]);
  const favoriteItems = useStableSidebarRows(orderSidebarItems(sidebarItems.filter(item => favoriteKeys.has(item.key)), preferences.pinnedSort, orders.favorites), pointerInside);
  const recentItems = useStableSidebarRows(orderSidebarItems(sidebarItems, preferences.recentSort, orders.recent), pointerInside);
  const projectItems = useStableSidebarRows(orderSidebarItems(sidebarItems, preferences.projectSort, orders.projects), pointerInside);
  const sidebarContext = context;
  const railSelection = neutralRail ? null : primaryNavigationSelection(activeView,sidebarContext);
  const moreRoutes = workspaceToolRoutes;
  const openMoreRoute = (route: WorkspaceRoute) => { setMoreOpen(false); if (route.view === 'skills') onSelectSkills(); else if (route.view !== 'home') onSelectBusinessView(route.view); };
  const toggleFavorite = (key: string) => setFavoriteKeys(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const openSidebarItem = (item: SidebarItem) => { if (item.kind === 'history' && item.history) onOpenHistory(item.project,item.history); else if (item.session) onOpenSession(item.project,item.session); };
  const openSidebarMenu = (section: SidebarSection, trigger: HTMLButtonElement, keyboard = false) => {
    if (sidebarMenu?.section === section) { setSidebarMenu(undefined); return; }
    document.dispatchEvent(new CustomEvent('gw-item-preview-open', { detail: 'sidebar-menu' }));
    menuTriggerRef.current = trigger; menuFocusRequestedRef.current = keyboard;
    const rect = trigger.getBoundingClientRect();
    setSidebarMenuPosition({ top: rect.bottom, left: rect.left }); setSidebarMenu({ section,panel:'root' });
  };
  const changePreferences = (update: Partial<SidebarPreferences>) => {
    const next = readSidebarPreferences({ ...preferences, ...update });
    setOrders(current => ({ favorites: update.pinnedSort === 'manual' && !current.favorites.length ? favoriteItems.map(i=>i.key) : current.favorites, projects: update.projectSort === 'manual' && !current.projects.length ? projectItems.map(i=>i.key) : current.projects, recent: update.recentSort === 'manual' && !current.recent.length ? recentItems.map(i=>i.key) : current.recent }));
    setPreferences(next); setPointerInside(false);
  };
  const reorder = (section: SidebarSection, moving: string, target: string) => { setOrders(current => ({ ...current, [section]: moveSidebarItem(current[section], (section === 'favorites' ? favoriteItems : section === 'projects' ? projectItems : recentItems).map(i=>i.key), moving,target) })); setPointerInside(false); };
  const openCreateProject = (trigger: HTMLElement) => { document.dispatchEvent(new CustomEvent('gw-item-preview-open', { detail: 'sidebar-dialog' })); createTriggerRef.current = trigger; setCreateProjectOpen(true); };
  const closeCreateProject = () => { setCreateProjectOpen(false); requestAnimationFrame(() => createTriggerRef.current?.focus()); };
  const sectionHeading = (section: SidebarSection, label: string) => <SidebarSectionHeading label={label} projects={section==='projects'} expanded={sectionExpanded[section]} controls={`sidebar-section-${section}`} onToggle={() => setSectionExpanded(current=>({...current,[section]:!current[section]}))}>
    <div className={section === 'projects' ? 'projects-header-actions sidebar-heading-actions' : 'sidebar-heading-actions'}><button type="button" className="sidebar-heading-action" aria-label={section === 'projects' ? 'Projects section options' : section === 'favorites' ? 'Pinned options' : 'Recent options'} title={`${label} options`} aria-haspopup="menu" aria-expanded={sidebarMenu?.section === section} onClick={event=>openSidebarMenu(section,event.currentTarget)} onKeyDown={event=>{if(event.key === 'ArrowDown'){event.preventDefault();openSidebarMenu(section,event.currentTarget,true)}}}><Icon name="more" /></button>
      {section === 'projects' ? <button type="button" className="sidebar-heading-action" aria-label="Add project" title="Add project" onClick={event=>openCreateProject(event.currentTarget)}><Icon name="plus" /></button> : section === 'recent' ? <button type="button" className="sidebar-heading-action" aria-label="New chat" title="New chat" onClick={()=>onNewThread()}><NewThreadIcon /></button> : null}
    </div>
  </SidebarSectionHeading>;
  const renderItems = (items: SidebarItem[], section: SidebarSection, listKey: string, nested = false) => {
    const manual = (section === 'favorites' ? preferences.pinnedSort : section === 'projects' ? preferences.projectSort : preferences.recentSort) === 'manual';
    const visible = visibleSidebarItems(items,Boolean(expandedLists[listKey]),items.find(i=>i.active)?.key);
    return <><SidebarItemList items={visible} favorites={favoriteKeys} formatRelativeTime={formatRelativeTime} onOpen={openSidebarItem} onToggleFavorite={toggleFavorite} onDeleteHistory={onDeleteHistory} nested={nested} draggable={manual} onMoveItem={(moving,target)=>reorder(section,moving,target)} allItems={items} />
      {items.length > 5 ? <button type="button" className={`sidebar-show-more${nested ? ' is-nested' : ''}`} aria-expanded={Boolean(expandedLists[listKey])} onClick={()=>setExpandedLists(current=>({...current,[listKey]:!current[listKey]}))}>{expandedLists[listKey] ? 'Show less' : `Show more (${items.length - visible.length})`}</button> : null}</>;
  };
  const projectGroups = (items: SidebarItem[]) => projects.map(project => {
    const group = items.filter(i=>i.project.id === project.id);
    if (!group.length) return null;
    return <div className="sidebar-recent-group" key={project.id}><span className="sidebar-group-label"><FolderIcon /><ItemTitle sidebar text={project.name} preview={{context:'Project',sources:[project.path]}} /></span>{renderItems(group,'recent',`recent:${project.id}`)}</div>;
  });

  return <aside ref={sidebarRef} data-sidebar-context={sidebarContext} className={`sidebar gwira-two-layer-sidebar is-${sidebarContext}-sidebar ${collapsed ? 'is-collapsed' : ''}${overlay ? ' is-overlay' : ''}`} aria-label="Gwira navigation">
    <PrimaryRail selection={railSelection} onHome={()=>{setContext('home');onOpenHome()}} onWorkspace={()=>onSelectBusinessView('dashboard')} onSchedule={()=>onSelectBusinessView('schedule')} moreOpen={moreOpen} onMore={()=>setMoreOpen(v=>!v)} onMoreKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const last=event.key==='ArrowUp';setMoreOpen(true);requestAnimationFrame(()=>{const items=sidebarRef.current?.querySelectorAll<HTMLButtonElement>('.gwira-more-menu button');items?.[last?items.length-1:0]?.focus()})}}} account={<span className="rail-avatar" aria-label="Local workspace profile">G</span>}/>
    {moreOpen ? <div className="gwira-more-menu" role="menu" onKeyDown={event=>{const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];const index=items.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus()}if(event.key==='Escape'){event.preventDefault();setMoreOpen(false);sidebarRef.current?.querySelector<HTMLButtonElement>('[aria-label="More"]')?.focus()}}}>{moreRoutes.map(route=><button key={route.view} type="button" role="menuitem" data-navigation-view={route.view} className={activeView===route.view?'active':''} onClick={()=>openMoreRoute(route)}><NavigationIcon name={route.icon} active={activeView===route.view} size={18} />{route.label}</button>)}</div> : null}
    <div className="gwira-secondary-sidebar" hidden={collapsed} onPointerEnter={()=>setPointerInside(true)} onPointerLeave={()=>setPointerInside(false)}>
    <div id="workspace-tools-panel" className="workspace-tools-target" ref={workspaceToolsTarget} hidden={!workspaceToolsOpen}/>
    <div hidden={workspaceToolsOpen} style={{display:workspaceToolsOpen?'none':'contents'}}>
    {activeView === 'schedule' ? <div className="gw-schedule gw-schedule-context" ref={scheduleSidebarRef} /> : activeView==='work-sessions'?<><header className="gwira-sidebar-header"><h2>Work Sessions</h2></header><p className="sidebar-section-empty">Recorded work and results.</p></>: moreRoutes.some(route=>route.view===activeView) ? <WorkspaceToolsNavigation activeView={activeView} onNavigate={view=>{const route=moreRoutes.find(item=>item.view===view);if(route)openMoreRoute(route);}}/> : sidebarContext === 'business' ? dashboardSidebar : <HomeSidebarContent workspaceLabel="Gwira local workspace" onNewWork={()=>onNewThread()} libraryActive={activeView==='library'} onLibrary={()=>{setContext('home');onSelectBusinessView('library')}} onScroll={()=>setSidebarMenu(undefined)} sections={<>
        <section className="sidebar-work-section sidebar-favorites" aria-label="Pinned" hidden={!preferences.visible.favorites}>{sectionHeading('favorites','Pinned')}<div id="sidebar-section-favorites" hidden={!sectionExpanded.favorites}>{favoriteItems.length ? renderItems(favoriteItems,'favorites','favorites') : <p className="sidebar-section-empty">Pin conversations to keep them here.</p>}</div></section>
        <section className="threads-section sidebar-work-section" aria-label="Projects" hidden={!preferences.visible.projects}>{sectionHeading('projects','Projects')}<div id="sidebar-section-projects" className="threads-scroll" hidden={!sectionExpanded.projects}>
          {preferences.projectGrouping === 'list' ? renderItems(projectItems,'projects','projects-list') : projects.map(project=><div className="project-group" key={project.id}>
            <div className={`project-pill${project.id===activeProject?.id?' active':''}${project.id===openProjectMenuId?' menu-open':''}`} role="button" tabIndex={0} aria-expanded={expandedProjectIds.has(project.id)} aria-label={project.name} onClick={()=>onToggleProject(project)} onKeyDown={event=>{if(event.target===event.currentTarget){if(event.key==='ArrowRight'&&!expandedProjectIds.has(project.id)){event.preventDefault();onToggleProject(project)}else if(event.key==='ArrowLeft'&&expandedProjectIds.has(project.id)){event.preventDefault();onToggleProject(project)}else onProjectKeyDown(event,()=>onToggleProject(project))}}}>
              {expandedProjectIds.has(project.id)?<FolderOpenIcon className="folder-icon" />:<FolderIcon className="folder-icon" />}<strong><ItemTitle sidebar text={project.name} preview={{context:'Project',sources:[project.path]}} /></strong><div className="project-actions"><button type="button" className="project-menu-button" onClick={event=>{event.stopPropagation();onToggleProjectMenu(project,event.currentTarget)}} aria-label={`Options for ${project.name}`} aria-haspopup="menu" aria-expanded={project.id===openProjectMenuId} title="Project options"><Icon name="more" /></button><button type="button" className="project-new-chat-button" onClick={event=>{event.stopPropagation();onNewThread(project)}} aria-label={`New chat in ${project.name}`} title={`New chat in ${project.name}`}><NewThreadIcon /></button></div>
            </div>
            <div hidden={!expandedProjectIds.has(project.id)}>{renderItems(projectItems.filter(item=>item.project.id===project.id),'projects',`project:${project.id}`,true)}</div>
          </div>)}
          {!projects.length ? <p className="sidebar-section-empty">Add a project to organize conversations.</p> : null}
        </div></section>
        <section className="sidebar-work-section sidebar-recent" aria-label="Recent" hidden={!preferences.visible.recent}>{sectionHeading('recent','Recents')}<div id="sidebar-section-recent" hidden={!sectionExpanded.recent}>{recentItems.length ? preferences.recentGrouping==='project' ? projectGroups(recentItems) : renderItems(recentItems,'recent','recent') : <p className="sidebar-section-empty">No recent conversations.</p>}</div></section>
      </>} footer={<footer className="sidebar-account" aria-label="Account status"><span className="account-avatar" aria-hidden="true">G</span><span><strong>Local workspace</strong><small>No account connected</small></span><span className="account-more" aria-hidden="true"><Icon name="more" /></span></footer>}/>}
    </div></div>
    {sidebarMenu && sidebarMenuPosition ? <SidebarContextMenu section={sidebarMenu.section} panel={sidebarMenu.panel} position={sidebarMenuPosition} preferences={preferences} onPanelChange={panel=>setSidebarMenu(current=>current?{...current,panel}:current)} onClose={()=>{setSidebarMenu(undefined);menuTriggerRef.current?.focus()}} onPreferencesChange={changePreferences} menuRef={menuRef} /> : null}
    {createProjectOpen ? <ProjectCreateDialog onClose={closeCreateProject} onCreate={(name,path)=>{onCreateProject(name,path);closeCreateProject()}} onChooseFolder={()=>window.codexDesktop.selectDirectory()} /> : null}
  </aside>;
}

function SidebarItemList({ items, allItems, favorites, formatRelativeTime, onOpen, onToggleFavorite, onDeleteHistory, nested, draggable, onMoveItem }: { items: SidebarItem[]; allItems: SidebarItem[]; favorites: ReadonlySet<string>; formatRelativeTime: (iso: string)=>string; onOpen: (item:SidebarItem)=>void; onToggleFavorite:(key:string)=>void; onDeleteHistory:ProjectSidebarProps['onDeleteHistory']; nested:boolean; draggable:boolean; onMoveItem:(moving:string,target:string)=>void }):React.ReactElement {
  return <div className={`sidebar-item-list${nested?' is-nested':''}`}>{items.map(item=><SidebarConversationRow key={item.key} title={item.title} preview={{context:item.project.name,metadata:`Last activity: ${formatRelativeTime(item.updatedAt)}`,sources:[item.project.path]}} time={item.running?<AgentActivityIndicator status="working" executing compact/>:formatRelativeTime(item.updatedAt)} pinned={favorites.has(item.key)} onOpen={()=>onOpen(item)} onTogglePin={()=>onToggleFavorite(item.key)} className={`${nested?'thread-item':'sidebar-shortcut-item'}${item.kind==='history'?' history-thread':''}${item.running?' running-thread':''}${item.active?' active-thread is-selected':''}`} aria-current={item.active?'page':undefined} aria-keyshortcuts={draggable?'Alt+ArrowUp Alt+ArrowDown':undefined} data-sidebar-item-key={item.key} draggable={draggable} onDragStart={event=>{if(draggable)event.dataTransfer.setData('text/plain',item.key)}} onDragOver={event=>{if(draggable)event.preventDefault()}} onDrop={event=>{if(draggable){event.preventDefault();onMoveItem(event.dataTransfer.getData('text/plain'),item.key)}}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(draggable&&event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const index=allItems.findIndex(i=>i.key===item.key);const target=allItems[index+(event.key==='ArrowUp'?-1:1)];if(target)onMoveItem(item.key,target.key)}}}>
      {item.history?.filePath&&!item.running ? <button type="button" className="delete-thread-button" aria-label={`Delete ${item.title}`} title="Delete conversation…" onClick={event=>onDeleteHistory(event,item.project,item.history!)}><Icon name="trash" /></button>:null}
  </SidebarConversationRow>)}</div>;
}
