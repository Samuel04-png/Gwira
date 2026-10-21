import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CodexSession, CodexThreadHistory } from '../../shared/types.js';
import { getProjectThreadRows } from '../projectThreads.js';
import type { ProjectEntry } from '../projects.js';
import { DeleteThreadIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, NewThreadIcon, SearchIcon } from './Icons.js';

/** Destinations are only enabled once their data-backed surface is available. */
export type WorkspaceNavigation = 'home' | 'library' | 'dashboard' | 'inbox' | 'my-work' | 'organization' | 'teams' | 'agents' | 'doats' | 'integrations' | 'settings' | 'chat' | 'skills';

type SidebarSection = 'favorites' | 'projects' | 'recent';
type SidebarItem = { key: string; title: string; updatedAt: string; project: ProjectEntry; kind: 'history' | 'session'; history?: CodexThreadHistory; session?: CodexSession };
type SidebarSort = 'updated' | 'created' | 'name';
type SidebarMenu = { section: SidebarSection; panel: 'root' | 'organize' | 'sort' } | undefined;
type SidebarMenuPreferences = { pinnedSort: 'updated' | 'manual'; projectSort: SidebarSort; recentSort: SidebarSort; recentShowProjects: boolean };

const sidebarSectionsStorageKey = 'gwira.sidebar.sections.v2';
const sidebarFavoritesStorageKey = 'gwira.sidebar.favorites.v1';
const sidebarRecentStorageKey = 'gwira.sidebar.recent-access.v1';
const sidebarMenuStorageKey = 'gwira.sidebar.menu-preferences.v1';
const sidebarPinnedOrderStorageKey = 'gwira.sidebar.pinned-order.v1';

function readObjectStorage(key: string): Record<string, string | boolean> {
  try { const stored = JSON.parse(localStorage.getItem(key) ?? '{}'); return stored && typeof stored === 'object' ? stored as Record<string, string | boolean> : {}; } catch { return {}; }
}
function readStringArrayStorage(key: string): string[] { try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }

function historyItemKey(projectId: string, historyId: string): string { return `history:${projectId}:${historyId}`; }
function sessionItemKey(projectId: string, sessionId: string): string { return `session:${projectId}:${sessionId}`; }
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
function sortSidebarItems(items: SidebarItem[], sort: SidebarSort): SidebarItem[] { return [...items].sort((left, right) => sort === 'name' ? left.title.localeCompare(right.title) : Date.parse(sort === 'created' ? right.history?.createdAt ?? right.session?.startedAt ?? right.updatedAt : right.updatedAt) - Date.parse(sort === 'created' ? left.history?.createdAt ?? left.session?.startedAt ?? left.updatedAt : left.updatedAt)); }

interface ProjectSidebarProps {
  dashboardSidebar?: React.ReactNode;
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
  onDeleteHistory: (event: React.MouseEvent<HTMLButtonElement>, project: ProjectEntry, history: CodexThreadHistory) => void;
  onNewThread: (project?: ProjectEntry) => void;
  onOpenHistory: (project: ProjectEntry, history: CodexThreadHistory) => void;
  onOpenSession: (project: ProjectEntry, session: CodexSession) => void;
  onProjectKeyDown: (event: React.KeyboardEvent<HTMLElement>, action: () => void) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onSelectBusinessView: (view: Exclude<WorkspaceNavigation, 'home' | 'chat' | 'skills'>) => void;
  onOpenHome: () => void;
  onSelectSkills: () => void;
  onToggleProject: (project: ProjectEntry) => void;
  onToggleProjectMenu: (project: ProjectEntry, button: HTMLButtonElement) => void;
  openProjectMenuId?: string;
}

export function ProjectSidebar({
  dashboardSidebar,
  activeProject,
  activeSession,
  activeSessionId,
  activeView,
  expandedProjectIds,
  historiesByProject,
  projects,
  sessionsForProject,
  formatRelativeTime,
  onAddProject,
  onDeleteHistory,
  onNewThread,
  onOpenHistory,
  onOpenSession,
  onProjectKeyDown,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onSelectBusinessView,
  onOpenHome,
  onSelectSkills,
  onToggleProject,
  onToggleProjectMenu,
  openProjectMenuId
}: ProjectSidebarProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('gwira.sidebar.collapsed') === 'true');
  // Library is a destination in its own right. Keep the context that opened it
  // so Home and Workspace can both expose the same library without a redirect.
  const [context, setContext] = useState<'home' | 'workspace'>(() => activeView === 'home' || activeView === 'chat' ? 'home' : 'workspace');
  const [moreOpen, setMoreOpen] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState<Record<SidebarSection, boolean>>(() => {
    const saved = readObjectStorage(sidebarSectionsStorageKey);
    return { favorites: saved.favorites !== false, projects: saved.projects === true, recent: saved.recent === true };
  });
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(() => new Set(Object.keys(readObjectStorage(sidebarFavoritesStorageKey)).filter((key) => readObjectStorage(sidebarFavoritesStorageKey)[key] === true)));
  const [recentAccess, setRecentAccess] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(readObjectStorage(sidebarRecentStorageKey)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
  const [menuPreferences, setMenuPreferences] = useState<SidebarMenuPreferences>(() => {
    const saved = readObjectStorage(sidebarMenuStorageKey);
    return { pinnedSort: saved.pinnedSort === 'manual' ? 'manual' as const : 'updated' as const, projectSort: (saved.projectSort === 'created' || saved.projectSort === 'name' ? saved.projectSort : 'updated') as SidebarSort, recentSort: (saved.recentSort === 'created' || saved.recentSort === 'name' ? saved.recentSort : 'updated') as SidebarSort, recentShowProjects: saved.recentShowProjects !== false };
  });
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(() => readStringArrayStorage(sidebarPinnedOrderStorageKey));
  const [sidebarMenu, setSidebarMenu] = useState<SidebarMenu>();
  const [sidebarMenuPosition, setSidebarMenuPosition] = useState<{ top: number; left: number }>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuFocusRequestedRef = useRef(false);
  useEffect(() => { localStorage.setItem('gwira.sidebar.collapsed', String(collapsed)); }, [collapsed]);
  useEffect(() => { localStorage.setItem(sidebarSectionsStorageKey, JSON.stringify(sectionExpanded)); }, [sectionExpanded]);
  useEffect(() => { localStorage.setItem(sidebarFavoritesStorageKey, JSON.stringify(Object.fromEntries([...favoriteKeys].map((key) => [key, true])))); }, [favoriteKeys]);
  useEffect(() => { localStorage.setItem(sidebarRecentStorageKey, JSON.stringify(recentAccess)); }, [recentAccess]);
  useEffect(() => { localStorage.setItem(sidebarMenuStorageKey, JSON.stringify(menuPreferences)); }, [menuPreferences]);
  useEffect(() => { localStorage.setItem(sidebarPinnedOrderStorageKey, JSON.stringify(pinnedOrder)); }, [pinnedOrder]);
  useEffect(() => {
    const closeMenu = (event: PointerEvent): void => { if (!menuRef.current?.contains(event.target as Node) && !menuTriggerRef.current?.contains(event.target as Node)) setSidebarMenu(undefined); };
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape' && sidebarMenu) { setSidebarMenu(undefined); menuTriggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', closeMenu); document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', closeMenu); document.removeEventListener('keydown', onKeyDown); };
  }, [sidebarMenu]);
  useEffect(() => {
    if (!sidebarMenu) return;
    if (menuFocusRequestedRef.current) requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    menuFocusRequestedRef.current = false;
  }, [sidebarMenu]);
  useEffect(() => {
    if (activeView === 'home' || activeView === 'chat') setContext('home');
    else if (activeView !== 'library') setContext('workspace');
  }, [activeView]);
  const openHome = () => { setContext('home'); onOpenHome(); };
  const openWorkspace = () => { setContext('workspace'); if (activeView === 'home' || activeView === 'chat') onSelectBusinessView('dashboard'); };
  const sidebarItems = useMemo<SidebarItem[]>(() => projects.flatMap((project) => {
    const histories = historiesByProject[project.id] ?? [];
    const historyConversationIds = new Set(histories.map((history) => history.id));
    const historyItems = histories.map((history) => ({ key: historyItemKey(project.id, history.id), title: normalizeSidebarTitle(history.title), updatedAt: history.updatedAt, project, kind: 'history' as const, history }));
    const sessionItems = sessionsForProject(project).filter((session) => !session.codexConversationId || !historyConversationIds.has(session.codexConversationId)).map((session) => ({ key: sessionItemKey(project.id, session.id), title: compactSessionTitle(session), updatedAt: session.updatedAt, project, kind: 'session' as const, session }));
    return [...historyItems, ...sessionItems];
  }), [historiesByProject, projects, sessionsForProject]);
  const favoriteItems = useMemo(() => {
    const items = sidebarItems.filter((item) => favoriteKeys.has(item.key));
    if (menuPreferences.pinnedSort === 'updated') return sortSidebarItems(items, 'updated');
    return [...items].sort((left, right) => (pinnedOrder.indexOf(left.key) === -1 ? Number.MAX_SAFE_INTEGER : pinnedOrder.indexOf(left.key)) - (pinnedOrder.indexOf(right.key) === -1 ? Number.MAX_SAFE_INTEGER : pinnedOrder.indexOf(right.key)));
  }, [favoriteKeys, menuPreferences.pinnedSort, pinnedOrder, sidebarItems]);
  const recentItems = useMemo(() => {
    const items = menuPreferences.recentShowProjects ? sidebarItems : sidebarItems.filter((item) => item.project.id === activeProject?.id);
    return sortSidebarItems(items.map((item) => ({ ...item, updatedAt: recentAccess[item.key] ?? item.updatedAt })), menuPreferences.recentSort).slice(0, 5);
  }, [activeProject?.id, menuPreferences.recentShowProjects, menuPreferences.recentSort, recentAccess, sidebarItems]);
  const toggleSection = (section: SidebarSection) => setSectionExpanded((current) => ({ ...current, [section]: !current[section] }));
  const toggleFavorite = (key: string) => setFavoriteKeys((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const openSidebarMenu = (section: SidebarSection, trigger: HTMLButtonElement, focusMenu = false) => {
    if (sidebarMenu?.section === section) { setSidebarMenu(undefined); return; }
    menuTriggerRef.current = trigger;
    menuFocusRequestedRef.current = focusMenu;
    const rect = trigger.getBoundingClientRect();
    const width = 218; const height = 180;
    setSidebarMenuPosition({ top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - height - 8)), left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) });
    setSidebarMenu({ section, panel: 'root' });
  };
  const movePinnedItem = (draggedKey: string, targetKey: string) => setPinnedOrder((current) => {
    const all = favoriteItems.map((item) => item.key); const next = [...current.filter((key) => all.includes(key) && key !== draggedKey), ...all.filter((key) => !current.includes(key) && key !== draggedKey)];
    const target = next.indexOf(targetKey); next.splice(Math.max(0, target), 0, draggedKey); return next;
  });
  const openSidebarItem = (item: SidebarItem) => {
    setRecentAccess((current) => ({ ...current, [item.key]: new Date().toISOString() }));
    if (item.kind === 'history' && item.history) onOpenHistory(item.project, item.history);
    else if (item.session) onOpenSession(item.project, item.session);
  };
  return <aside className={`sidebar gwira-two-layer-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="window-toolbar" aria-label="Navigation history">
      <button type="button" className="toolbar-button" aria-label="Back" title={canGoBack ? 'Back' : 'No previous location'} disabled={!canGoBack} onClick={onGoBack}><ToolbarIcon direction="left" /></button>
      <button type="button" className="toolbar-button" aria-label="Forward" title={canGoForward ? 'Forward' : 'No next location'} disabled={!canGoForward} onClick={onGoForward}><ToolbarIcon direction="right" /></button>
      <button type="button" className="rail-toggle" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)}><RailIcon kind="panel" /></button>
    </div>
    <nav className="gwira-primary-rail" aria-label="Primary navigation">
      <button type="button" className={context === 'home' ? 'active' : ''} title="Home" aria-label="Home" onClick={openHome}><RailIcon kind="home" filled={context === 'home'} /></button>
      <button type="button" className={context === 'workspace' ? 'active' : ''} title="Workspace" aria-label="Workspace" onClick={openWorkspace}><RailIcon kind="grid" /></button>
      <button type="button" disabled title="Scheduled work is not implemented yet." aria-label="Scheduled work unavailable"><RailIcon kind="clock" /></button>
      <button type="button" className={moreOpen ? 'active' : ''} title="More" aria-label="More" aria-expanded={moreOpen} onClick={() => { if (collapsed) setCollapsed(false); setMoreOpen((value) => !value); }}><RailIcon kind="more" /></button>
      <span className="rail-spacer" />
      <button type="button" title="Help is not implemented yet." disabled aria-label="Help unavailable"><RailIcon kind="help" /></button>
      <span className="rail-avatar" aria-label="Local workspace profile">G</span>
    </nav>
    <div className="gwira-secondary-sidebar" hidden={collapsed}>
    {activeView === 'dashboard' && dashboardSidebar ? dashboardSidebar : <>
    <div className="traffic-spacer" aria-hidden="true" />
    <header className="gwira-sidebar-header">
      <div className="gwira-title" aria-label="Gwira local workspace"><strong>Gwira</strong></div>
      <div className="sidebar-header-actions"><button className="sidebar-notification" type="button" disabled title="Notifications are not implemented yet." aria-label="Notifications unavailable"><RailIcon kind="bell" /></button><button className="sidebar-search" type="button" disabled title="Search is not implemented yet."><SearchIcon /></button></div>
    </header>
    {moreOpen ? <div className="gwira-more-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setContext('workspace'); onSelectBusinessView('agents'); setMoreOpen(false); }}>Agents</button><button type="button" role="menuitem" onClick={() => { onSelectSkills(); setMoreOpen(false); }}>Skills</button><button type="button" role="menuitem" onClick={() => { onSelectBusinessView('settings'); setMoreOpen(false); }}>Settings</button></div> : null}
    <div className="nav-block top-actions">
      {context !== 'workspace' ? <>
      <button className="ghost-button" onClick={() => onNewThread()}><NewThreadIcon className="nav-icon" /> New work</button>
      <button className={`ghost-button ${activeView === 'library' ? 'active' : ''}`} onClick={() => { setContext('home'); onSelectBusinessView('library'); }}><FolderIcon className="nav-icon" /> Library</button>
      </> : <>
      <button className={`ghost-button ${activeView === 'inbox' ? 'active' : ''}`} onClick={() => onSelectBusinessView('inbox')}>Inbox</button>
      <button className={`ghost-button ${activeView === 'library' ? 'active' : ''}`} onClick={() => onSelectBusinessView('library')}>Library</button>
      <button className={`ghost-button ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => onSelectBusinessView('dashboard')}>Dashboard</button>
      <button className={`ghost-button ${activeView === 'my-work' ? 'active' : ''}`} onClick={() => onSelectBusinessView('my-work')}>My Work</button>
      <button className={`ghost-button ${activeView === 'organization' ? 'active' : ''}`} onClick={() => onSelectBusinessView('organization')}>Views</button>
      <button className="ghost-button" disabled title="Pipelines are not implemented yet.">Pipelines</button>
      <button className={`ghost-button ${activeView === 'teams' ? 'active' : ''}`} onClick={() => onSelectBusinessView('teams')}>Teams</button>
      <button className={`ghost-button ${activeView === 'doats' ? 'active' : ''}`} onClick={() => onSelectBusinessView('doats')}>Doats</button>
      <button className={`ghost-button ${activeView === 'integrations' ? 'active' : ''}`} onClick={() => onSelectBusinessView('integrations')}>Integrations</button>
      </>}
    </div>

    {favoriteItems.length > 0 ? <section className="sidebar-work-section sidebar-favorites" aria-label="Pinned">
      <div className="sidebar-section-row"><button type="button" className="sidebar-collapsible-heading" aria-expanded={sectionExpanded.favorites} onClick={() => toggleSection('favorites')}>Pinned<span className={sectionExpanded.favorites ? 'sidebar-chevron open' : 'sidebar-chevron'} aria-hidden="true" /></button><div className="sidebar-heading-actions"><button type="button" className="sidebar-heading-action" aria-label="Pinned options" title="Pinned options" aria-haspopup="menu" aria-expanded={sidebarMenu?.section === 'favorites'} onClick={(event) => openSidebarMenu('favorites', event.currentTarget)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); openSidebarMenu('favorites', event.currentTarget, true); } }}>•••</button></div></div>
      {sectionExpanded.favorites ? <SidebarItemList items={favoriteItems} favorites={favoriteKeys} formatRelativeTime={formatRelativeTime} onOpen={openSidebarItem} onToggleFavorite={toggleFavorite} draggable={menuPreferences.pinnedSort === 'manual'} onMoveItem={movePinnedItem} /> : null}
    </section> : null}

    <section className="threads-section sidebar-work-section">
      <div className="projects-header"><button type="button" className="projects-header-toggle" aria-expanded={sectionExpanded.projects} onClick={() => toggleSection('projects')}>Projects<span className={sectionExpanded.projects ? 'sidebar-chevron open' : 'sidebar-chevron'} aria-hidden="true" /></button><div className="projects-header-actions"><button type="button" className="sidebar-heading-action" aria-label="Projects section options" title="Projects options" aria-haspopup="menu" aria-expanded={sidebarMenu?.section === 'projects'} onClick={(event) => openSidebarMenu('projects', event.currentTarget)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); openSidebarMenu('projects', event.currentTarget, true); } }}>•••</button><button className="section-tool-button sidebar-heading-action" type="button" onClick={onAddProject} title="Add project" aria-label="Add project"><FolderPlusIcon className="section-tool-icon" /></button></div></div>
      {sectionExpanded.projects ? <div className="threads-scroll">
        {projects.map((project) => {
          const histories = [...(historiesByProject[project.id] || [])].sort((left, right) => menuPreferences.projectSort === 'name' ? normalizeSidebarTitle(left.title).localeCompare(normalizeSidebarTitle(right.title)) : Date.parse(menuPreferences.projectSort === 'created' ? right.createdAt : right.updatedAt) - Date.parse(menuPreferences.projectSort === 'created' ? left.createdAt : left.updatedAt));
          const expanded = expandedProjectIds.has(project.id);
          const rows = getProjectThreadRows({
            projectId: project.id,
            activeProjectId: activeProject?.id,
            activeConversationId: activeSession?.codexConversationId,
            activeSessionId,
            expandedProjectIds,
            histories,
            sessions: sessionsForProject(project)
          });
          return <div className="project-group" key={project.id}>
            <div className={`project-pill ${project.id === activeProject?.id ? 'active' : ''} ${project.id === openProjectMenuId ? 'menu-open' : ''}`} onClick={() => onToggleProject(project)}>
              {expanded ? <FolderOpenIcon className="folder-icon" /> : <FolderIcon className="folder-icon" />}
              <strong>{project.name}</strong>
              <div className="project-actions">
                <button className="project-menu-button" onClick={(event) => { event.stopPropagation(); onToggleProjectMenu(project, event.currentTarget); }} title="Project options">•••</button>
                <button className="project-new-chat-button" onClick={(event) => { event.stopPropagation(); onNewThread(project); }} title={`New chat in ${project.name}`} aria-label={`New chat in ${project.name}`}><NewThreadIcon /></button>
              </div>
            </div>
            {rows.map((row) => row.kind === 'session' ? (
              <div className={`thread-item ${row.active ? 'active-thread' : ''}`} key={row.session.id} role="button" tabIndex={0} onClick={() => openSidebarItem({ key: sessionItemKey(project.id, row.session.id), title: row.title, updatedAt: row.session.updatedAt, project, kind: 'session', session: row.session })} onKeyDown={(event) => onProjectKeyDown(event, () => openSidebarItem({ key: sessionItemKey(project.id, row.session.id), title: row.title, updatedAt: row.session.updatedAt, project, kind: 'session', session: row.session }))}>
                <span className="thread-title">{normalizeSidebarTitle(row.title)}</span><span className="thread-time">{row.running ? <ThreadSpinner /> : formatRelativeTime(row.session.updatedAt)}</span>
                <button className="pin-thread-button" type="button" aria-label={`${favoriteKeys.has(sessionItemKey(project.id, row.session.id)) ? 'Unpin' : 'Pin'} ${normalizeSidebarTitle(row.title)}`} title={favoriteKeys.has(sessionItemKey(project.id, row.session.id)) ? 'Unpin from Favorites' : 'Pin to Favorites'} onClick={(event) => { event.stopPropagation(); toggleFavorite(sessionItemKey(project.id, row.session.id)); }}>{favoriteKeys.has(sessionItemKey(project.id, row.session.id)) ? '★' : '☆'}</button>
              </div>
            ) : (
              <div className={`thread-item history-thread ${row.active ? 'active-thread' : ''} ${row.running ? 'running-thread' : ''}`} key={row.history.id} role="button" tabIndex={0} onClick={() => openSidebarItem({ key: historyItemKey(project.id, row.history.id), title: row.history.title, updatedAt: row.history.updatedAt, project, kind: 'history', history: row.history })} onKeyDown={(event) => onProjectKeyDown(event, () => openSidebarItem({ key: historyItemKey(project.id, row.history.id), title: row.history.title, updatedAt: row.history.updatedAt, project, kind: 'history', history: row.history }))}>
                <span className="thread-title">{normalizeSidebarTitle(row.history.title)}</span><span className="thread-time">{row.running ? <ThreadSpinner /> : formatRelativeTime(row.history.updatedAt)}</span>
                {!row.running ? <button className="delete-thread-button" type="button" title="Delete thread" aria-label={`Delete ${normalizeSidebarTitle(row.history.title)}`} onClick={(event) => onDeleteHistory(event, project, row.history)}><DeleteThreadIcon /></button> : null}
                <button className="pin-thread-button" type="button" aria-label={`${favoriteKeys.has(historyItemKey(project.id, row.history.id)) ? 'Unpin' : 'Pin'} ${normalizeSidebarTitle(row.history.title)}`} title={favoriteKeys.has(historyItemKey(project.id, row.history.id)) ? 'Unpin from Favorites' : 'Pin to Favorites'} onClick={(event) => { event.stopPropagation(); toggleFavorite(historyItemKey(project.id, row.history.id)); }}>{favoriteKeys.has(historyItemKey(project.id, row.history.id)) ? '★' : '☆'}</button>
              </div>
            ))}
          </div>;
        })}
      </div> : null}
    </section>

    {recentItems.length > 0 ? <section className="sidebar-work-section sidebar-recent" aria-label="Recent">
      <div className="sidebar-section-row"><button type="button" className="sidebar-collapsible-heading" aria-expanded={sectionExpanded.recent} onClick={() => toggleSection('recent')}>Recents<span className={sectionExpanded.recent ? 'sidebar-chevron open' : 'sidebar-chevron'} aria-hidden="true" /></button><div className="sidebar-heading-actions"><button type="button" className="sidebar-heading-action" aria-label="Recent options" title="Recent options" aria-haspopup="menu" aria-expanded={sidebarMenu?.section === 'recent'} onClick={(event) => openSidebarMenu('recent', event.currentTarget)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); openSidebarMenu('recent', event.currentTarget, true); } }}>•••</button><button type="button" className="sidebar-heading-action" aria-label="New chat" title="New chat" onClick={() => onNewThread()}><NewThreadIcon className="section-tool-icon" /></button></div></div>
      {sectionExpanded.recent ? <SidebarItemList items={recentItems} favorites={favoriteKeys} formatRelativeTime={formatRelativeTime} onOpen={openSidebarItem} onToggleFavorite={toggleFavorite} /> : null}
    </section> : null}

    {sidebarMenu && sidebarMenuPosition ? <SidebarContextMenu section={sidebarMenu.section} panel={sidebarMenu.panel} position={sidebarMenuPosition} preferences={menuPreferences} onPanelChange={(panel) => setSidebarMenu((current) => current ? { ...current, panel } : current)} onClose={() => { setSidebarMenu(undefined); menuTriggerRef.current?.focus(); }} onPreferencesChange={(update) => setMenuPreferences((current) => ({ ...current, ...update }))} menuRef={menuRef} /> : null}

    <footer className="sidebar-account" aria-label="Account status"><span className="account-avatar" aria-hidden="true">G</span><span><strong>Local workspace</strong><small>No account connected</small></span><span className="account-more" aria-hidden="true">•••</span></footer>
    </>}
    </div>
  </aside>;
}

function SidebarContextMenu({ section, panel, position, preferences, onPanelChange, onClose, onPreferencesChange, menuRef }: { section: SidebarSection; panel: NonNullable<SidebarMenu>['panel']; position: { top: number; left: number }; preferences: SidebarMenuPreferences; onPanelChange: (panel: NonNullable<SidebarMenu>['panel']) => void; onClose: () => void; onPreferencesChange: (update: Partial<SidebarMenuPreferences>) => void; menuRef: React.RefObject<HTMLDivElement | null> }): React.ReactElement {
  const sort = section === 'projects' ? preferences.projectSort : preferences.recentSort;
  const options: Array<{ value: SidebarSort; label: string }> = [{ value: 'updated', label: 'Last updated' }, { value: 'created', label: 'Date created' }, { value: 'name', label: 'Name' }];
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  };
  return <div className="sidebar-context-menu" ref={menuRef} role="menu" onKeyDown={handleKeyDown} style={position}>
    {panel !== 'root' ? <button type="button" className="sidebar-menu-back" onClick={() => onPanelChange('root')}>‹ Back</button> : null}
    {section === 'favorites' ? <>
      <button type="button" role="menuitemradio" aria-checked={preferences.pinnedSort === 'updated'} onClick={() => { onPreferencesChange({ pinnedSort: 'updated' }); onClose(); }}><span>Last updated</span>{preferences.pinnedSort === 'updated' ? <b>✓</b> : null}</button>
      <button type="button" role="menuitemradio" aria-checked={preferences.pinnedSort === 'manual'} onClick={() => { onPreferencesChange({ pinnedSort: 'manual' }); onClose(); }}><span>Manual order</span>{preferences.pinnedSort === 'manual' ? <b>✓</b> : null}</button>
    </> : panel === 'root' ? <>
      <button type="button" role="menuitem" onClick={() => onPanelChange('organize')}>Organize sidebar <span>›</span></button>
      <button type="button" role="menuitem" onClick={() => onPanelChange('sort')}>Sort chats by <span>›</span></button>
      {section === 'recent' ? <><hr /><span className="sidebar-menu-label">Show</span><button type="button" role="menuitemcheckbox" aria-checked={preferences.recentShowProjects} onClick={() => onPreferencesChange({ recentShowProjects: !preferences.recentShowProjects })}><span>Projects</span>{preferences.recentShowProjects ? <b>✓</b> : null}</button></> : null}
    </> : panel === 'sort' ? <>{options.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={sort === option.value} onClick={() => { onPreferencesChange(section === 'projects' ? { projectSort: option.value } : { recentSort: option.value }); onClose(); }}><span>{option.label}</span>{sort === option.value ? <b>✓</b> : null}</button>)}</> : <>
      <span className="sidebar-menu-label">Section controls</span>
      <button type="button" disabled title="Section visibility preferences are not implemented yet.">Section visibility</button>
      <button type="button" disabled title="Sidebar section ordering is not implemented yet.">Section order</button>
    </>}
  </div>;
}

function SidebarItemList({ items, favorites, formatRelativeTime, onOpen, onToggleFavorite, draggable = false, onMoveItem }: { items: SidebarItem[]; favorites: ReadonlySet<string>; formatRelativeTime: (iso: string) => string; onOpen: (item: SidebarItem) => void; onToggleFavorite: (key: string) => void; draggable?: boolean; onMoveItem?: (draggedKey: string, targetKey: string) => void }): React.ReactElement {
  return <div className="sidebar-item-list">
    {items.map((item) => <div className="sidebar-shortcut-item" key={item.key} role="button" tabIndex={0} draggable={draggable} title={`${item.title} · ${item.project.name}`} onDragStart={(event) => { if (draggable) event.dataTransfer.setData('text/plain', item.key); }} onDragOver={(event) => { if (draggable) event.preventDefault(); }} onDrop={(event) => { if (!draggable) return; event.preventDefault(); const draggedKey = event.dataTransfer.getData('text/plain'); if (draggedKey && draggedKey !== item.key) onMoveItem?.(draggedKey, item.key); }} onClick={() => onOpen(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item); } }}>
      <span className="sidebar-item-icon" aria-hidden="true">{item.kind === 'history' ? '◌' : '◍'}</span><span className="sidebar-item-title">{item.title}</span><span className="sidebar-item-time">{formatRelativeTime(item.updatedAt)}</span>
      <button type="button" className="pin-thread-button" title={favorites.has(item.key) ? 'Unpin from Favorites' : 'Pin to Favorites'} aria-label={`${favorites.has(item.key) ? 'Unpin' : 'Pin'} ${item.title}`} onClick={(event) => { event.stopPropagation(); onToggleFavorite(item.key); }}>{favorites.has(item.key) ? '★' : '☆'}</button>
    </div>)}
  </div>;
}

function ToolbarIcon({ direction }: { direction: 'left' | 'right' }): React.ReactElement {
  const points = direction === 'left' ? '14 5 7 12 14 19' : '10 5 17 12 10 19';
  return <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function RailIcon({ kind, filled = false }: { kind: 'panel' | 'home' | 'grid' | 'clock' | 'more' | 'help' | 'bell'; filled?: boolean }): React.ReactElement {
  const paths: Record<typeof kind, React.ReactNode> = {
    panel: <><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M10 5v14" /></>, home: filled ? <path d="M3.5 10.5 12 3l8.5 7.5V21h-6v-6H9.5v6h-6z" fill="currentColor" stroke="none" /> : <><path d="m4 11 8-7 8 7" /><path d="M6.5 10v9h11v-9" /></>, grid: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></>, clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>, more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>, help: <><circle cx="12" cy="12" r="8" /><path d="M9.5 9a2.7 2.7 0 1 1 4.5 2c-1.2.9-2 1.4-2 3" /><path d="M12 17h.01" /></>, bell: <><path d="M18 10a6 6 0 0 0-12 0c0 6-2 6-2 7h16c0-1-2-1-2-7" /><path d="M10 20h4" /></>
  };
  return <svg className="rail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

function ThreadSpinner(): React.ReactElement {
  return <svg className="thread-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Running" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="38" strokeDashoffset="10" /></svg>;
}
