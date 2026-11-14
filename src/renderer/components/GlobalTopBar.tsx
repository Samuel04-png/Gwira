import { GwiraLogo } from './GwiraLogo.js';
import { SidebarTooltip } from './SidebarTooltip.js';
import { ItemTitle } from './ItemTitle.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { destinationKey, type WorkspaceDestination, type WorkspaceTab } from '../workspaceTabs.js';
import { ShellIcon } from './Icon.js';
import {WORKSPACE_ROUTES,workspaceNavigationLabel,type RoutableWorkspaceView} from '../navigationTypes.js';
import type {CloudNotification} from '../../shared/cloudNotifications.js';

export interface AuthenticatedNotifications {
  items: CloudNotification[]; loading: boolean; error: string; marking?: string;
  refresh: () => Promise<void>; markRead: (id:string) => Promise<void>;
}

export interface WorkspaceTabChoice {
  destination: WorkspaceDestination;
  label: string;
  detail?: string;
}

type Popover = 'search' | 'notifications';

/** Restricted top bar for authenticated surfaces that only expose Home. */
export function HomeOnlyTopBar({tabs=[],globalTabs,activeGlobalTabId,active,onSelect,onClose,onReorder,disabled=false,onToggleSidebar,sidebarCollapsed=true,onToggleWorkspace,workspaceOpen=false,workspaceTabs=[],activeWorkspace,onSelectWorkspace,onCloseWorkspace,onNewWorkspace,onNavigate,onCloseView,onActivateTab,onNewTab,canGoBack=false,canGoForward=false,onGoBack,onGoForward,conversationActions,chatOpen=false,onOpenChat,notifications}:{tabs?:Array<{id:string;title:string}>;globalTabs?:WorkspaceTab[];activeGlobalTabId?:string;active?:string|null;onSelect?:(id:string|null)=>void;onClose?:(id:string)=>void;onReorder?:(id:string,target:string)=>void;disabled?:boolean;onToggleSidebar?:()=>void;sidebarCollapsed?:boolean;onToggleWorkspace?:()=>void;workspaceOpen?:boolean;workspaceTabs?:WorkspaceTab[];activeWorkspace?:string;onSelectWorkspace?:(tab:WorkspaceTab)=>void;onCloseWorkspace?:(tab:WorkspaceTab)=>void;onNewWorkspace?:()=>void;onNavigate?:(view:RoutableWorkspaceView)=>void;onCloseView?:(id:string)=>void;onActivateTab?:(tab:WorkspaceTab)=>void;onNewTab?:()=>void;canGoBack?:boolean;canGoForward?:boolean;onGoBack?:()=>void;onGoForward?:()=>void;conversationActions?:React.ReactNode;chatOpen?:boolean;onOpenChat?:()=>void;notifications?:AuthenticatedNotifications}={}):React.ReactElement {
  const home:WorkspaceTab={id:'authenticated-home',destination:{type:'view',view:'home'}};
  const all:WorkspaceTab[]=globalTabs??[home,...tabs.map(tab=>({id:tab.id,destination:{type:'conversation' as const,projectId:'cloud',conversationId:tab.id}}))];
  const selected=activeGlobalTabId??active??home.id;
  const activate=(tab:WorkspaceTab)=>{if(disabled)return;if(onActivateTab)onActivateTab(tab);else if(tab.destination.type==='view')onNavigate?.(tab.destination.view);else if(tab.destination.type==='conversation')onSelect?.(tab.destination.conversationId);};
  return <GlobalTopBar restricted authenticatedNotifications={notifications} restrictedChatAvailable={!!onOpenChat} restrictedDisabled={disabled} restrictedSidebarAvailable={!!onToggleSidebar} restrictedNewTabAvailable={!!onNewTab} restrictedReorderAvailable={!!onReorder} restrictedWorkspaceAvailable={!!onToggleWorkspace} restrictedWorkspaceNewTabAvailable={!!onNewWorkspace} activeConversationActions={conversationActions}
    tabs={all} globalTabs={all} workspaceTabs={workspaceTabs} activeTabId={selected} activeGlobalTabId={selected} activeWorkspaceTabId={activeWorkspace}
    choices={WORKSPACE_ROUTES.map(route=>({destination:{type:'view',view:route.view},label:route.label}))} labelFor={tab=>tab.destination.type==='view'?workspaceNavigationLabel(tab.destination.view):tab.destination.type==='launcher'?'New tab':tab.destination.type==='files'?'Files':tab.destination.type==='terminal'?'Terminal':tab.destination.type==='work-sessions'?'Work Sessions':tab.destination.type==='conversation'?tabs.find(item=>tab.destination.type==='conversation'&&item.id===tab.destination.conversationId)?.title??'Conversation':'Conversation'}
    canGoBack={!disabled&&canGoBack} canGoForward={!disabled&&canGoForward} sidebarCollapsed={sidebarCollapsed} chatOpen={chatOpen} inspectorAvailable={false} inspectorOpen={false} pendingNotifications={notifications?.items.filter(item=>!item.read_at).length??0} workSessionsOpen={workspaceOpen}
    onGoBack={onGoBack??(()=>{})} onGoForward={onGoForward??(()=>{})} onToggleSidebar={onToggleSidebar??(()=>{})} onToggleInspector={onToggleWorkspace??(()=>{})} onOpenChat={onOpenChat??(()=>{})}
    onActivate={activate} onActivateWorkspace={tab=>{if(!disabled)onSelectWorkspace?.(tab);}} onCloseWorkspace={tab=>{if(!disabled)onCloseWorkspace?.(tab);}} onOpenWorkspace={()=>{if(!disabled)onNewWorkspace?.();}} onOpenGlobal={destination=>{if(!disabled&&destination.type==='view')onNavigate?.(destination.view);}} onClose={tab=>{if(!disabled){if(onCloseView)onCloseView(tab.id);else onClose?.(tab.id);}}}
    onNewGlobal={()=>{if(!disabled)onNewTab?.();}} onOpen={()=>{if(!disabled)onNewWorkspace?.();}} onOpenInbox={()=>{if(!disabled)onNavigate?.('inbox');}} onReorder={(id,target)=>{if(!disabled)onReorder?.(id,target);}} onSwitchRelative={direction=>{
      if(disabled)return;const index=all.findIndex(tab=>tab.id===selected);activate(all[(index+direction+all.length)%all.length]!);
    }} onReopen={()=>{}}/>;
}

export interface GlobalTopBarProps {
  activeConversationActions?: React.ReactNode;
  restricted?: boolean;
  authenticatedNotifications?: AuthenticatedNotifications;
  restrictedChatAvailable?: boolean;
  restrictedDisabled?: boolean;
  restrictedSidebarAvailable?: boolean;
  restrictedNewTabAvailable?: boolean;
  restrictedReorderAvailable?: boolean;
  restrictedWorkspaceAvailable?: boolean;
  restrictedWorkspaceNewTabAvailable?: boolean;
  tabs?: WorkspaceTab[];
  globalTabs?: WorkspaceTab[];
  workspaceTabs?: WorkspaceTab[];
  activeTabId?: string;
  activeGlobalTabId?: string;
  activeWorkspaceTabId?: string;
  choices: WorkspaceTabChoice[];
  labelFor: (tab: WorkspaceTab) => string;
  canGoBack: boolean;
  canGoForward: boolean;
  sidebarCollapsed: boolean;
  chatOpen: boolean;
  onOpenChat: () => void;
  inspectorAvailable: boolean;
  workSessionsOpen?: boolean;
  onOpenWorkSessions?: () => void;
  inspectorOpen: boolean;
  pendingNotifications: number;
  pendingScheduleReviews?: number;
  onGoBack: () => void;
  onGoForward: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onActivate: (tab: WorkspaceTab) => void;
  onActivateGlobal?: (tab: WorkspaceTab) => void;
  onActivateWorkspace?: (tab: WorkspaceTab) => void;
  onClose: (tab: WorkspaceTab) => void;
  onCloseGlobal?: (tab: WorkspaceTab) => void;
  onCloseWorkspace?: (tab: WorkspaceTab) => void;
  onOpen: (destination: WorkspaceDestination) => void;
  onOpenGlobal?: (destination: WorkspaceDestination) => void;
  onNewGlobal?: () => void;
  onOpenWorkspace?: (destination: WorkspaceDestination) => void;
  onOpenInbox: () => void;
  onReorder: (tabId: string, targetId: string) => void;
  onReorderGlobal?: (tabId: string, targetId: string) => void;
  onReorderWorkspace?: (tabId: string, targetId: string) => void;
  onSwitchRelative: (direction: -1 | 1) => void;
  onReopen: () => void;
}

/** The single application top bar. It lives in the shell above the sidebar and page, never inside a page. */
export function GlobalTopBar({
  restricted = false, authenticatedNotifications, restrictedChatAvailable = false, restrictedDisabled = false, restrictedSidebarAvailable = true, restrictedNewTabAvailable = true, restrictedReorderAvailable = false, restrictedWorkspaceAvailable = false, restrictedWorkspaceNewTabAvailable = false,
  tabs, globalTabs, workspaceTabs, activeTabId, activeGlobalTabId, activeWorkspaceTabId, choices, labelFor, canGoBack, canGoForward, sidebarCollapsed, chatOpen, onOpenChat, workSessionsOpen = false, onOpenWorkSessions, inspectorAvailable, inspectorOpen, pendingNotifications, pendingScheduleReviews = 0,
  onGoBack, onGoForward, onToggleSidebar, onToggleInspector, onActivate, onActivateGlobal, onActivateWorkspace, onClose, onCloseGlobal, onCloseWorkspace, onOpen, onOpenGlobal, onNewGlobal, onOpenWorkspace, onOpenInbox, onReorder, onReorderGlobal, onReorderWorkspace, onSwitchRelative, onReopen, activeConversationActions
}: GlobalTopBarProps): React.ReactElement {
  const [popover, setPopover] = useState<Popover>();
  const [query, setQuery] = useState('');
  const draggedTabId = useRef<string | undefined>(undefined);
  const barRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const globalTabsRef = useRef<HTMLDivElement>(null);
  const workspaceTabsRef = useRef<HTMLDivElement>(null);
  const tabList = tabs ?? [];
  const globalTabsList = globalTabs ?? tabList;
  const workspaceTabsList = workspaceTabs ?? tabList;
  const globalActiveId = activeGlobalTabId ?? activeTabId ?? globalTabsList[0]?.id;
  const workspaceActiveId = activeWorkspaceTabId ?? activeTabId ?? workspaceTabsList[0]?.id;
  const filteredChoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return choices.filter((choice) => !normalized || `${choice.label} ${choice.detail ?? ''}`.toLowerCase().includes(normalized));
  }, [choices, query]);

  function openPopover(next: Popover): void {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setPopover((current) => current === next ? undefined : next);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const modifier = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
      if (restricted && (restrictedDisabled || modifier && (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 't' && !restrictedNewTabAvailable) || event.shiftKey && event.key.toLowerCase() === 't' || event.shiftKey && event.key.toLowerCase() === 's' && !restrictedSidebarAvailable)) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && !isEditable && event.key.toLowerCase() === 's') { event.preventDefault(); onToggleSidebar(); return; }
      if (target instanceof HTMLElement && target.closest('.workspace-terminal')) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 't') { event.preventDefault(); onReopen(); return; }
      if (modifier && event.key.toLowerCase() === 't') { event.preventDefault(); onNewGlobal?.(); return; }
      if (modifier && event.key.toLowerCase() === 'w') { event.preventDefault(); const active = tabList.find(tab => tab.id === activeTabId); if (active) onClose(active); return; }
      if (modifier && /^[1-9]$/.test(event.key)) { const index = event.key === '9' ? tabList.length - 1 : Number(event.key) - 1; if (tabList[index]) { event.preventDefault(); onActivate(tabList[index]!); } return; }
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setQuery(''); setPopover('search'); return; }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Tab') { event.preventDefault(); onSwitchRelative(event.shiftKey ? -1 : 1); return; }
      if (event.key === 'Escape' && popover) { setPopover(undefined); requestAnimationFrame(() => returnFocusRef.current?.focus()); }
    }
    function onPointerDown(event: PointerEvent): void {
      if (!barRef.current?.contains(event.target as Node)) setPopover(undefined);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('pointerdown', onPointerDown); };
  }, [onSwitchRelative, onToggleSidebar, onNewGlobal, onReopen, onClose, onActivate, tabList, activeTabId, popover, restricted, restrictedDisabled, restrictedSidebarAvailable, restrictedNewTabAvailable]);

  useEffect(() => {
    const revealActive = (): void => { for(const ref of [globalTabsRef,workspaceTabsRef]) ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    if (globalTabsRef.current) observer.observe(globalTabsRef.current);
    if (workspaceTabsRef.current) observer.observe(workspaceTabsRef.current);
    return () => observer.disconnect();
  }, [globalActiveId, workspaceActiveId, workSessionsOpen]);

  function openChoice(destination: WorkspaceDestination): void {
    if ((destination.type === 'launcher' || destination.type === 'files' || destination.type === 'file' || destination.type === 'terminal' || destination.type === 'work-sessions')) {
      onOpenWorkspace ? onOpenWorkspace(destination) : onOpen(destination);
    } else {
      onOpenGlobal ? onOpenGlobal(destination) : onOpen(destination);
    }
    setPopover(undefined);
    setQuery('');
  }

  function renderTabList(
    list: WorkspaceTab[],
    activeTab: string | undefined,
    side: 'global' | 'workspace',
    onSelect: (tab: WorkspaceTab) => void,
    onRemove: (tab: WorkspaceTab) => void,
    onReorder: (tabId: string, targetId: string) => void,
    openNew: () => void,
    label: string
  ): React.ReactNode {
    return <div className={`global-topbar__tabs global-topbar__tabs--${side}`} ref={side==='global'?globalTabsRef:workspaceTabsRef} role="tablist" aria-label={label}>
      {list.map((tab, index) => <div
        key={tab.id}
        className={`global-tab${tab.id === activeTab ? ' is-active' : ''}`}
        role="presentation"
        draggable={!restricted||restrictedReorderAvailable&&!restrictedDisabled&&side==='global'}
        onDragStart={() => { draggedTabId.current = tab.id; }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (draggedTabId.current&&(!restricted||restrictedReorderAvailable&&side==='global')) onReorder(draggedTabId.current, tab.id);
          draggedTabId.current = undefined;
        }}
        onDragEnd={() => { draggedTabId.current = undefined; }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          tabIndex={tab.id === activeTab ? 0 : -1}
          className="global-tab__select"
          disabled={restrictedDisabled}
          onClick={() => onSelect(tab)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
            const container = event.currentTarget.closest('.global-topbar__tabs');
            onSelect(list[nextIndex]!);
            requestAnimationFrame(() => container?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus());
          }}
        ><ShellIcon name={tab.destination.type === 'launcher' ? 'grid' : tab.destination.type === 'files' ? 'folder' : tab.destination.type === 'file' ? 'file' : tab.destination.type === 'terminal' ? 'terminal' : tab.destination.type === 'conversation' ? 'threads' : tab.destination.type === 'project' ? 'folder' : tab.destination.type === 'work-sessions' ? 'clock' : tab.destination.type === 'view' && tab.destination.view === 'home' ? 'home' : tab.destination.type === 'view' && tab.destination.view === 'inbox' ? 'inbox' : tab.destination.type === 'view' && tab.destination.view === 'dashboard' ? 'dashboard' : tab.destination.type === 'view' && tab.destination.view === 'my-work' ? 'work' : 'file'} /><ItemTitle text={labelFor(tab)} /></button>
        {side==='global'&&tab.id===activeTab&&tab.destination.type==='conversation'&&activeConversationActions}
        <button type="button" disabled={restrictedDisabled} className="global-tab__close" aria-label={`Close ${labelFor(tab)} tab`} onClick={() => onRemove(tab)}><ShellIcon name="close" /></button>
      </div>)}
      <button type="button" disabled={restrictedDisabled||restricted&&(side==='workspace'?!restrictedWorkspaceNewTabAvailable:!restrictedNewTabAvailable)} className="global-topbar__add" aria-label={side === 'workspace' ? 'Open a new workspace tab' : 'Open a new global tab'} title={restricted&&side==='workspace'&&!restrictedWorkspaceNewTabAvailable?'Additional workspace tabs are unavailable.':restricted&&side==='global'&&!restrictedNewTabAvailable?'Start a conversation first.':side === 'workspace' ? 'New workspace tab' : 'New tab (⌘/Ctrl+T)'} onClick={openNew}><ShellIcon name="plus" /></button>
    </div>;
  }

  const showPicker = popover === 'search';
  const notificationLabel = pendingNotifications + pendingScheduleReviews > 0 ? `Notifications, ${pendingNotifications + pendingScheduleReviews} pending` : 'Notifications';

  return <header className="global-topbar" ref={barRef} aria-label="Gwira application bar" data-testid="global-topbar" data-workspace-open={workSessionsOpen}>
    <div className="global-topbar__global-region">
      <div className="global-topbar__nav">
        <SidebarTooltip placement="bottom" label={canGoBack ? 'Back' : 'No previous location'}><button type="button" aria-label="Back" disabled={!canGoBack} onClick={onGoBack}><ShellIcon name="arrow-left" size={18} /></button></SidebarTooltip>
        <SidebarTooltip placement="bottom" label={canGoForward ? 'Forward' : 'No next location'}><button type="button" aria-label="Forward" disabled={!canGoForward} onClick={onGoForward}><ShellIcon name="arrow-right" size={18} /></button></SidebarTooltip>
        {(!restricted||restrictedSidebarAvailable)&&<SidebarTooltip placement="bottom" label={`${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} · ${document.documentElement.dataset.platform === 'darwin' ? '⇧⌘S' : 'Ctrl+Shift+S'}`}><button type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-keyshortcuts="Control+Shift+S Meta+Shift+S" aria-pressed={!sidebarCollapsed} onClick={onToggleSidebar}><ShellIcon name={sidebarCollapsed?'sidebar-expand':'sidebar-collapse'} size={18} /></button></SidebarTooltip>}
      </div>
      <div className="global-topbar__primary-tabs">
        {renderTabList(globalTabsList, globalActiveId, 'global', (tab) => (onActivateGlobal ?? onActivate)(tab), (tab) => (onCloseGlobal ?? onClose)(tab), (tabId, targetId) => onReorderGlobal ? onReorderGlobal(tabId, targetId) : onReorder(tabId, targetId), () => onNewGlobal?.(), 'Open destinations')}
      </div>
    </div>
    <div className="global-topbar__workspace-region">
      {workSessionsOpen ? <div className="global-topbar__divider" aria-hidden="true" /> : null}
      {workSessionsOpen ? <div className="global-topbar__workspace-tabs">
        {renderTabList(workspaceTabsList, workspaceActiveId, 'workspace', (tab) => (onActivateWorkspace ?? onActivate)(tab), (tab) => (onCloseWorkspace ?? onClose)(tab), (tabId, targetId) => onReorderWorkspace ? onReorderWorkspace(tabId, targetId) : onReorder(tabId, targetId), () => onOpenWorkspace ? onOpenWorkspace({ type: 'launcher' }) : onOpen({ type: 'launcher' }), 'Workspace tools')}
      </div> : null}
      {!restricted&&<div className="global-topbar__actions">
        <SidebarTooltip placement="bottom" label="Gwira Chat"><button type="button" aria-label="Gwira Chat" aria-expanded={chatOpen} aria-controls="gwira-assistant-panel" onClick={() => { setPopover(undefined); onOpenChat(); }}><GwiraLogo size="compact" /></button></SidebarTooltip>
        <button type="button" aria-label={notificationLabel} title="Notifications" aria-expanded={popover === 'notifications'} onClick={() => openPopover('notifications')}>
          <ShellIcon name="bell" />{pendingNotifications + pendingScheduleReviews > 0 ? <i className="global-topbar__badge" aria-hidden="true" /> : null}
        </button>
        <SidebarTooltip placement="bottom" label={workSessionsOpen ? 'Close workspace tools' : 'Open workspace tools'}><button
          type="button" data-testid="context-panel-toggle"
          aria-label="Workspace tools" aria-expanded={workSessionsOpen} aria-controls="workspace-tools-panel"
          onClick={onOpenWorkSessions ?? onToggleInspector}
        ><ShellIcon name="inspector" /></button></SidebarTooltip>
      </div>}
      {restricted&&<div className="global-topbar__actions">{restrictedChatAvailable?<SidebarTooltip placement="bottom" label="Gwira Chat"><button type="button" aria-label="Gwira Chat" aria-expanded={chatOpen} aria-controls="gwira-assistant-panel" onClick={onOpenChat}><GwiraLogo size="compact"/></button></SidebarTooltip>:<button type="button" aria-label="Gwira Chat unavailable" title="Gwira Chat is unavailable until your workspace is ready." disabled><GwiraLogo size="compact"/></button>}{authenticatedNotifications?<button type="button" aria-label={notificationLabel} title="Notifications" aria-expanded={popover==='notifications'} onClick={()=>{if(popover!=='notifications')void authenticatedNotifications.refresh();openPopover('notifications');}}><ShellIcon name="bell"/>{pendingNotifications>0&&<i className="global-topbar__badge" aria-hidden="true"/>}</button>:<button type="button" aria-label="Notifications unavailable" title="Notifications are unavailable until your workspace is ready." disabled><ShellIcon name="bell"/></button>}<SidebarTooltip placement="bottom" label={restrictedWorkspaceAvailable?(workSessionsOpen?'Close workspace':'Open workspace'):'Workspace is unavailable.'}><button type="button" aria-label="Workspace tools" aria-expanded={workSessionsOpen} aria-controls="workspace-tools-panel" disabled={!restrictedWorkspaceAvailable||restrictedDisabled} onClick={onToggleInspector}><ShellIcon name="inspector"/></button></SidebarTooltip></div>}
    </div>
    {showPicker ? <div className="global-popover global-popover--picker is-right" role="dialog" aria-label="Search Gwira">
      <label><span>Search pages and work</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and work…" onKeyDown={(event) => {
        if (event.key === 'Enter' && filteredChoices[0]) { event.preventDefault(); openChoice(filteredChoices[0].destination); }
        if (event.key === 'ArrowDown') { event.preventDefault(); event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); }
      }} /></label>
      <div className="global-popover__choices" role="listbox">
        {filteredChoices.length ? filteredChoices.map((choice, index) => <button
          key={destinationKey(choice.destination)}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => openChoice(choice.destination)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const next = Math.max(0, Math.min(filteredChoices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus();
          }}
        ><strong>{choice.label}</strong>{choice.detail ? <span>{choice.detail}</span> : null}</button>) : <p>No matching destinations.</p>}
      </div>
      <p className="global-popover__hint">⌘/Ctrl+T new tab · ⌘/Ctrl+K search · Ctrl+Tab switch</p>
    </div> : null}
    {popover === 'notifications' ? <div className="global-popover global-popover--notifications is-right" role="dialog" aria-label="Notifications">
      <strong>Notifications</strong>
      {restricted&&authenticatedNotifications ? <>
        {authenticatedNotifications.loading&&<p role="status">Loading notifications…</p>}
        {authenticatedNotifications.error&&<p role="alert">{authenticatedNotifications.error}</p>}
        {!authenticatedNotifications.loading&&!authenticatedNotifications.error&&authenticatedNotifications.items.length===0&&<p>No notifications yet.</p>}
        {authenticatedNotifications.items.map(item=><article className="global-notification" key={item.id}>
          <strong>{item.title}</strong><p>{item.body}</p><small><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>{item.read_at?' · Read':' · Unread'}</small>
          {!item.read_at&&<button type="button" disabled={!!authenticatedNotifications.marking} onClick={()=>void authenticatedNotifications.markRead(item.id)}>Mark as read</button>}
        </article>)}
        <button type="button" disabled={authenticatedNotifications.loading||!!authenticatedNotifications.marking} onClick={()=>void authenticatedNotifications.refresh()}>Refresh</button>
        <button type="button" onClick={()=>{onOpenInbox();setPopover(undefined);}}>Open Inbox</button>
      </> : <>
      <p>{pendingNotifications > 0 ? `${pendingNotifications} approval${pendingNotifications === 1 ? '' : 's'} waiting for a decision.` : 'No pending approvals. Local approvals and workspace activity appear in Inbox.'}</p>
      {pendingScheduleReviews > 0 ? <><p>{pendingScheduleReviews} scheduled occurrence{pendingScheduleReviews === 1 ? '' : 's'} waiting for review.</p><button type="button" onClick={() => { onOpen({ type: 'view', view: 'schedule' }); setPopover(undefined); }}>Review scheduled work</button></> : null}
      <button type="button" onClick={() => { onOpenInbox(); setPopover(undefined); }}>Open Inbox</button>
      {onOpenWorkSessions ? <button type="button" onClick={() => { if (!workSessionsOpen) onOpenWorkSessions(); setPopover(undefined); }}>View recorded work</button> : null}
      </>}
    </div> : null}
  </header>;
}
