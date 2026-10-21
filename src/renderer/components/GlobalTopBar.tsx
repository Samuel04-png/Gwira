import React, { useEffect, useMemo, useRef, useState } from 'react';
import { destinationKey, type WorkspaceDestination, type WorkspaceTab } from '../workspaceTabs.js';
import { ShellIcon } from './NavIcons.js';

export interface WorkspaceTabChoice {
  destination: WorkspaceDestination;
  label: string;
  detail?: string;
}

type Popover = 'new-tab' | 'search' | 'notifications';

export interface GlobalTopBarProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  choices: WorkspaceTabChoice[];
  labelFor: (tab: WorkspaceTab) => string;
  canGoBack: boolean;
  canGoForward: boolean;
  sidebarCollapsed: boolean;
  inspectorAvailable: boolean;
  inspectorOpen: boolean;
  pendingNotifications: number;
  onGoBack: () => void;
  onGoForward: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onActivate: (tab: WorkspaceTab) => void;
  onClose: (tab: WorkspaceTab) => void;
  onOpen: (destination: WorkspaceDestination) => void;
  onOpenInbox: () => void;
  onReorder: (tabId: string, targetId: string) => void;
  onSwitchRelative: (direction: -1 | 1) => void;
}

/** The single application top bar. It lives in the shell above the sidebar and page, never inside a page. */
export function GlobalTopBar({
  tabs, activeTabId, choices, labelFor, canGoBack, canGoForward, sidebarCollapsed, inspectorAvailable, inspectorOpen, pendingNotifications,
  onGoBack, onGoForward, onToggleSidebar, onToggleInspector, onActivate, onClose, onOpen, onOpenInbox, onReorder, onSwitchRelative
}: GlobalTopBarProps): React.ReactElement {
  const [popover, setPopover] = useState<Popover>();
  const [query, setQuery] = useState('');
  const [popoverLeft, setPopoverLeft] = useState<number>();
  const draggedTabId = useRef<string | undefined>(undefined);
  const barRef = useRef<HTMLElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const filteredChoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return choices.filter((choice) => !normalized || `${choice.label} ${choice.detail ?? ''}`.toLowerCase().includes(normalized));
  }, [choices, query]);

  function openPopover(next: Popover): void {
    setQuery('');
    setPopoverLeft(next === 'new-tab' ? Math.max(8, (addRef.current?.getBoundingClientRect().left ?? 8) - 4) : undefined);
    setPopover((current) => current === next ? undefined : next);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const modifier = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
      if (modifier && !isEditable && event.key.toLowerCase() === 't') { event.preventDefault(); setQuery(''); setPopoverLeft(Math.max(8, (addRef.current?.getBoundingClientRect().left ?? 8) - 4)); setPopover('new-tab'); return; }
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); setQuery(''); setPopoverLeft(undefined); setPopover('search'); return; }
      if (event.ctrlKey && event.key === 'Tab') { event.preventDefault(); onSwitchRelative(event.shiftKey ? -1 : 1); return; }
      if (event.key === 'Escape') setPopover((current) => current ? undefined : current);
    }
    function onPointerDown(event: PointerEvent): void {
      if (!barRef.current?.contains(event.target as Node)) setPopover(undefined);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('pointerdown', onPointerDown); };
  }, [onSwitchRelative]);

  function openChoice(destination: WorkspaceDestination): void {
    onOpen(destination);
    setPopover(undefined);
    setQuery('');
  }

  const showPicker = popover === 'new-tab' || popover === 'search';
  const notificationLabel = pendingNotifications > 0 ? `Notifications, ${pendingNotifications} pending` : 'Notifications';

  return <header className="global-topbar" ref={barRef} aria-label="Gwira application bar" data-testid="global-topbar">
    <div className="global-topbar__nav">
      <button type="button" aria-label="Back" title={canGoBack ? 'Back' : 'No previous location'} disabled={!canGoBack} onClick={onGoBack}><ShellIcon name="back" /></button>
      <button type="button" aria-label="Forward" title={canGoForward ? 'Forward' : 'No next location'} disabled={!canGoForward} onClick={onGoForward}><ShellIcon name="forward" /></button>
      <button type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={!sidebarCollapsed} onClick={onToggleSidebar}><ShellIcon name="sidebar" /></button>
    </div>
    <div className="global-topbar__tabs" role="tablist" aria-label="Open destinations">
      {tabs.map((tab, index) => <div
        key={tab.id}
        className={`global-tab${tab.id === activeTabId ? ' is-active' : ''}`}
        role="presentation"
        draggable
        onDragStart={() => { draggedTabId.current = tab.id; }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (draggedTabId.current) onReorder(draggedTabId.current, tab.id);
          draggedTabId.current = undefined;
        }}
        onDragEnd={() => { draggedTabId.current = undefined; }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab.id === activeTabId}
          tabIndex={tab.id === activeTabId ? 0 : -1}
          className="global-tab__select"
          onClick={() => onActivate(tab)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            const container = event.currentTarget.closest('.global-topbar__tabs');
            onActivate(tabs[nextIndex]!);
            requestAnimationFrame(() => container?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus());
          }}
          title={labelFor(tab)}
        >{labelFor(tab)}</button>
        {tabs.length > 1 ? <button type="button" className="global-tab__close" aria-label={`Close ${labelFor(tab)} tab`} onClick={() => onClose(tab)}>×</button> : null}
      </div>)}
      <button type="button" className="global-topbar__add" ref={addRef} aria-label="Open a new tab" title="New tab (⌘/Ctrl+T)" aria-expanded={popover === 'new-tab'} onClick={() => openPopover('new-tab')}><ShellIcon name="plus" /></button>
    </div>
    <div className="global-topbar__actions">
      <button type="button" className="global-topbar__search" aria-label="Search Gwira" title="Search (⌘/Ctrl+K)" aria-expanded={popover === 'search'} onClick={() => openPopover('search')}><ShellIcon name="search" /><span>Search</span><kbd>⌘K</kbd></button>
      <button type="button" aria-label={notificationLabel} title="Notifications" aria-expanded={popover === 'notifications'} onClick={() => openPopover('notifications')}>
        <ShellIcon name="bell" />{pendingNotifications > 0 ? <i className="global-topbar__badge" aria-hidden="true" /> : null}
      </button>
      <button
        type="button"
        data-testid="context-panel-toggle"
        aria-label={inspectorOpen ? 'Collapse context panel' : 'Expand context panel'}
        title={inspectorAvailable ? (inspectorOpen ? 'Collapse context panel' : 'Expand context panel') : 'This page has no context panel'}
        aria-expanded={inspectorAvailable ? inspectorOpen : false}
        aria-controls="gwira-workflow-panel"
        disabled={!inspectorAvailable}
        onClick={onToggleInspector}
      ><ShellIcon name="inspector" /></button>
    </div>
    {showPicker ? <div className={`global-popover global-popover--picker${popover === 'search' ? ' is-right' : ''}`} style={popover === 'new-tab' && popoverLeft !== undefined ? { left: popoverLeft } : undefined} role="dialog" aria-label={popover === 'search' ? 'Search Gwira' : 'Open destination'}>
      <label><span>{popover === 'search' ? 'Search pages and work' : 'Open destination in a tab'}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and work…" onKeyDown={(event) => {
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
      <p>{pendingNotifications > 0 ? `${pendingNotifications} approval${pendingNotifications === 1 ? '' : 's'} waiting for a decision.` : 'No pending approvals. Local approvals and workspace activity appear in Inbox.'}</p>
      <button type="button" onClick={() => { onOpenInbox(); setPopover(undefined); }}>Open Inbox</button>
    </div> : null}
  </header>;
}
