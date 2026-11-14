import { recordedSidebarActivity } from '../dashboard/sidebarActivity.js';
import { Icon } from "../../components/Icon.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { MessagingProvider } from '../messaging/react/MessagingProvider.js';
import { useMessaging } from '../messaging/react/useMessaging.js';
import type { Message, ParticipantRef } from '../messaging/domain/types.js';
import type { StorageLike } from '../messaging/data/messagingStore.js';
import type { ParticipantView } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import type { SendInput } from '../messaging/domain/reducer.js';
import { selectConversationList, selectDraft, selectDrafts, selectFailedSends, selectEligibleParticipants, selectFeed, selectMentionCandidates, selectMentions, selectSaved, selectThread, selectThreadSummaries, selectUnreadMessages } from '../messaging/domain/selectors.js';
import { inboxCounts } from './inboxViewModel.js';
import { InboxNav } from './InboxNav.js';
import { ConversationHeader } from './ConversationHeader.js';
import { MessageFeed } from './MessageFeed.js';
import { UnreadPage } from './UnreadPage.js';
import { ThreadsPage } from './ThreadsPage.js';
import { messagingStorageKey } from '../messaging/data/messagingStore.js';
import { MentionsPage } from './MentionsPage.js';
import { DraftsPage } from './DraftsPage.js';
import { buildDraftEntries } from './draftsModel.js';
import { SavedPage } from './SavedPage.js';
import type { ThreadKey } from './threadsPageModel.js';
import { NeedsReviewPage } from './NeedsReviewPage.js';
import { linkedReviewMessages, reviewEntries } from './needsReviewModel.js';
import { Composer } from './Composer.js';
import type { ComposerLinkOption } from './composerModel.js';
import { MessageActions } from './MessageActions.js';
import { ThreadPanel } from './ThreadPanel.js';
import { ContextPanel } from './ContextPanel.js';
import { NEEDS_REVIEW_NAV_ID, avatarInitials, groupConversations, isEditableTarget, navTargetIds, resolveDestination, stepDestination, type InboxDestination } from './inboxNavModel.js';
import { runMessageSearch } from './inboxSearch.js';
import { ShellIcon } from '../../components/Icon.js';
import { getInboxResponsiveLayout } from './inboxResponsiveModel.js';
import { clearInboxSampleStorage, createInboxSampleStorage, createInboxSampleWork, INBOX_SAMPLE_FIRST_CONVERSATION_ID, INBOX_SAMPLE_TASK_ID, seedInboxSampleStorage } from './inboxDevSample.js';
import './inboxNav.css';
import './inbox.css';

if (import.meta.env.DEV) void import('./sampleAvatars.css');

export interface InboxPageProps {
  state: GwiraLocalState;
  onOpenTask: (taskId: string) => void;
  onOpenDaot?: (id: string) => void;
  onOpenWorkSessions?: () => void;
  requestedConversationId?: { id: string; nonce: number };
}

export function InboxHeading({children,leading,headingClass,indicator}:{children?:React.ReactNode;leading?:React.ReactNode;headingClass?:string;indicator?:React.ReactNode}):React.ReactElement {
  return <div className="gw-inbox-nav-header"><div className="gw-inbox-nav-title"><div className="gw-inbox-nav-heading">{leading}<h1 className={headingClass}>Inbox</h1>{indicator}</div>{children}</div></div>;
}

export function InboxPage({ state, onOpenTask, requestedConversationId, onOpenDaot, onOpenWorkSessions }: InboxPageProps): React.ReactElement {
  const scope = useMemo(() => ({ organizationId: state.organization.id, workspaceId: state.workspace.id }), [state.organization.id, state.workspace.id]);
  const work = useMemo(() => ({ people: state.people, doats: state.doats, projects: state.projects, tasks: state.tasks, approvals: state.approvals, activity: state.activity }), [state.people, state.doats, state.projects, state.tasks, state.approvals, state.activity]);
  const sampleToolsEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('devTools') === '1';
  const sampleWork = useMemo(() => createInboxSampleWork(scope), [scope]);
  const [sampleActive, setSampleActive] = useState(false);
  // Sample review records stay in the sample namespace: the real workspace state is never modified.
  // Dev only: lets a capture resolve a sample approval while Needs review is open, to exercise the stale state.
  const [resolvedSampleApprovals, setResolvedSampleApprovals] = useState<string[]>([]);
  useEffect(() => {
    if (!sampleToolsEnabled) return undefined;
    const onResolve = (event: Event): void => setResolvedSampleApprovals((ids) => [...ids, String((event as CustomEvent).detail)]);
    window.addEventListener('gwira:dev-resolve-sample-approval', onResolve);
    return () => window.removeEventListener('gwira:dev-resolve-sample-approval', onResolve);
  }, [sampleToolsEnabled]);
  const reviewState = useMemo(() => sampleActive ? { ...state, people: sampleWork.people, doats: sampleWork.doats, tasks: sampleWork.tasks, approvals: sampleWork.approvals.map((approval) => resolvedSampleApprovals.includes(approval.id) ? { ...approval, status: 'approved' as const } : approval), activity: sampleWork.activity } : state, [sampleActive, sampleWork, state, resolvedSampleApprovals]);
  const [sampleStorage, setSampleStorage] = useState<StorageLike>();
  const [sampleError, setSampleError] = useState('');
  const sampleAutoLoadRef = useRef(false);

  const loadSample = useCallback((keepExisting = false): void => {
    if (!sampleToolsEnabled) return;
    try {
      const storage = window.localStorage;
      const existing = createInboxSampleStorage(storage).getItem(messagingStorageKey(scope));
      if (!keepExisting || !existing) seedInboxSampleStorage(storage, scope);
      setSampleStorage(createInboxSampleStorage(storage));
      setSampleActive(true);
      setSampleError('');
    } catch (errorValue) {
      setSampleError(errorValue instanceof Error ? `Could not load sample conversations: ${errorValue.message}` : 'Could not load sample conversations because local storage is unavailable.');
    }
  }, [sampleToolsEnabled, scope]);

  useEffect(() => {
    if (!sampleToolsEnabled || sampleAutoLoadRef.current || !['1', 'keep'].includes(new URLSearchParams(window.location.search).get('sampleData') ?? '')) return;
    sampleAutoLoadRef.current = true;
    // `sampleData=keep` (dev only) reuses the stored sample so edited fixtures survive a reload.
    loadSample(new URLSearchParams(window.location.search).get('sampleData') === 'keep');
  }, [loadSample, sampleToolsEnabled]);

  const clearSample = (): void => {
    setSampleActive(false);
    window.setTimeout(() => {
      try {
        clearInboxSampleStorage(window.localStorage, scope);
        setSampleStorage(undefined);
        setSampleError('');
      } catch (errorValue) {
        setSampleError(errorValue instanceof Error ? `Could not clear sample data: ${errorValue.message}` : 'Could not clear sample data because local storage is unavailable.');
      }
    }, 0);
  };

  return <MessagingProvider key={sampleActive ? 'sample-inbox' : 'workspace-inbox'} scope={scope} work={sampleActive ? sampleWork : work} storage={sampleActive ? sampleStorage : undefined}>
    <InboxWorkspace onOpenDaot={onOpenDaot} onOpenWorkSessions={onOpenWorkSessions} requestedConversationId={requestedConversationId} state={reviewState} onOpenTask={onOpenTask} devToolsEnabled={sampleToolsEnabled} sampleActive={sampleActive}
      sampleWork={sampleWork} sampleError={sampleError} onLoadSample={() => loadSample()} onClearSample={clearSample} />
  </MessagingProvider>;
}

interface InboxWorkspaceProps extends InboxPageProps {
  devToolsEnabled: boolean;
  sampleActive: boolean;
  sampleWork: ReturnType<typeof createInboxSampleWork>;
  sampleError: string;
  onLoadSample: () => void;
  onClearSample: () => void;
}

function InboxWorkspace({ state, onOpenTask, requestedConversationId, onOpenDaot, onOpenWorkSessions, devToolsEnabled, sampleActive, sampleWork, sampleError, onLoadSample, onClearSample }: InboxWorkspaceProps): React.ReactElement {
  const messaging = useMessaging();
  const { state: messagingState, scope, work, actions } = messaging;
  const conversations = useMemo(() => selectConversationList(messagingState, scope, work), [messagingState, scope, work]);
  const savedMessageIds = useMemo(() => new Set(messaging.durable ? messagingState.messages.filter((message) => message.sendState === 'local_saved').map((message) => message.id) : []), [messaging.durable, messagingState.messages]);
  const [destination, setDestination] = useState<InboxDestination>({ kind: 'utility', view: NEEDS_REVIEW_NAV_ID });
  useEffect(() => { if (requestedConversationId) setDestination({ kind: 'conversation', id: requestedConversationId.id }); }, [requestedConversationId]);
  const [listOpen, setListOpen] = useState(false);
  const [pendingHit, setPendingHit] = useState<string>();
  const [highlightedMessageId, setHighlightedMessageId] = useState<string>();
  const [messageSearchRequest, setMessageSearchRequest] = useState<{ conversationId: string; conversationTitle?: string; nonce: number }>();
  const [threadRootId, setThreadRootId] = useState<string>();
  const [threadsSelection, setThreadsSelection] = useState<ThreadKey>();
  const [threadsDetailOpen, setThreadsDetailOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message>();
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<'channel' | 'group' | 'dm'>('channel');
  const [createFocus, setCreateFocus] = useState<'doat'>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [status, setStatus] = useState('');
  const rootRef = useRef<HTMLElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const threadOpenerRef = useRef<HTMLElement | null>(null);
  const createTriggerRef = useRef<HTMLElement | null>(null);
  const localPeople = useMemo(() => state.people.filter((person) => person.workspaceId === scope.workspaceId), [state.people, scope.workspaceId]);
  const actorPeople = sampleActive ? sampleWork.people : localPeople;
  const eligibleParticipants = useMemo(() => selectEligibleParticipants(work, scope), [work, scope]);
  const linkOptions = useMemo<ComposerLinkOption[]>(() => {
    const tasks = work.tasks.filter((task) => task.workspaceId === scope.workspaceId);
    const taskNames = new Map(tasks.map((task) => [task.id, task.title]));
    return [
      ...tasks.map((task): ComposerLinkOption => ({ ref: { kind: 'task', taskId: task.id }, label: task.title, detail: 'Task' })),
      ...work.approvals.filter((approval) => taskNames.has(approval.taskId)).map((approval): ComposerLinkOption => ({ ref: { kind: 'approval', approvalId: approval.id }, label: taskNames.get(approval.taskId)!, detail: `Approval · ${approval.status}` }))
    ];
  }, [work.tasks, work.approvals, scope.workspaceId]);
  const activeConversationId = destination.kind === 'conversation' ? destination.id : undefined;
  const feed = useMemo(() => activeConversationId ? selectFeed(messagingState, scope, work, activeConversationId) : undefined, [messagingState, scope, work, activeConversationId]);
  const thread = useMemo(() => activeConversationId && threadRootId ? selectThread(messagingState, scope, work, activeConversationId, threadRootId) : undefined, [messagingState, scope, work, activeConversationId, threadRootId]);
  const candidates = useMemo(() => activeConversationId ? selectMentionCandidates(messagingState, scope, work, activeConversationId) : [], [messagingState, scope, work, activeConversationId]);
  const initialDraft = useMemo(() => activeConversationId ? selectDraft(messagingState, scope, work, activeConversationId)?.body ?? '' : '', [messagingState, scope, work, activeConversationId]);
  const initialDraftRefs = useMemo(() => activeConversationId ? selectDraft(messagingState, scope, work, activeConversationId)?.refs ?? [] : [], [messagingState, scope, work, activeConversationId]);
  const activityActive = destination.kind === 'utility' && destination.view === NEEDS_REVIEW_NAV_ID;
  const responsive = getInboxResponsiveLayout({ contentWidth: containerWidth, activityMode: activityActive, contextOpen: drawerOpen || Boolean(threadRootId) });
  const { isNarrow, isMasterDetail } = responsive;
  const detailShown = isMasterDetail && !listOpen;
  const closeDrawer = useCallback((): void => {
    setDrawerOpen(false);
    setThreadRootId(undefined);
    requestAnimationFrame(() => drawerTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0]?.contentRect.width ?? root.clientWidth));
    observer.observe(root);
    setContainerWidth(root.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (drawerOpen && !threadRootId) drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [drawerOpen, threadRootId]);

  useEffect(() => {
    setHighlightedMessageId(undefined);
    setEditingMessage(undefined);
    setThreadRootId(undefined);
    setDrawerOpen(false);
  }, [scope.organizationId, scope.workspaceId, messagingState.selfPersonId]);

  useEffect(() => {
    if (!sampleActive) return;
    setDestination({ kind: 'conversation', id: INBOX_SAMPLE_FIRST_CONVERSATION_ID });
    setListOpen(false);
  }, [sampleActive]);

  useEffect(() => {
    if (!isNarrow || (!drawerOpen && !threadRootId)) return;
    const background = [...(rootRef.current?.querySelectorAll<HTMLElement>('.gw-inbox-master, .gw-inbox-main, .gw-inbox-compact-header') ?? [])];
    background.forEach((node) => { node.inert = true; });
    return () => background.forEach((node) => { node.inert = false; });
  }, [isNarrow, drawerOpen, threadRootId]);

  const navTargets = useMemo(() => navTargetIds(groupConversations(conversations, activeConversationId)), [conversations, activeConversationId]);
  const shortcutRef = useRef({ destination, navTargets, feed, createOpen });
  shortcutRef.current = { destination, navTargets, feed, createOpen };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      const live = shortcutRef.current;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === 'k' || key === 'f')) {
        if (live.createOpen) return;
        event.preventDefault();
        setListOpen(true);
        setDrawerOpen(false);
        setThreadRootId(undefined);
        const selector = key === 'k' ? '.gw-msg-nav__search input:not([data-message-search])' : '.gw-msg-nav__search input[data-message-search]';
        requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>(selector)?.focus());
      } else if (event.key === 'Escape') {
        if (createOpen) {
          setCreateOpen(false);
          requestAnimationFrame(() => createTriggerRef.current?.focus());
          return;
        }
        if (threadRootId) { setThreadRootId(undefined); setDrawerOpen(false); return; }
        if (drawerOpen) {
          closeDrawer();
        }
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && (key === 'j' || key === 'k' || key === 'u')) {
        if (live.createOpen || event.defaultPrevented || isEditableTarget(event.target)) return;
        event.preventDefault();
        if (key === 'u') {
          const view = live.feed;
          if (live.destination.kind !== 'conversation' || !view) return;
          if (view.unread.unread > 0) { actionsRef.current.markRead(live.destination.id); return; }
          const last = view.messages[view.messages.length - 1];
          if (last) actionsRef.current.markUnread(live.destination.id, last.message.id);
          return;
        }
        const next = stepDestination(live.navTargets, live.destination, key);
        if (next) selectRef.current(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createOpen, threadRootId, drawerOpen]);

  useEffect(() => {
    const resolved = resolveDestination(destination, conversations);
    if (resolved !== destination) {
      setDestination(resolved);
      setStatus('That conversation is no longer available to this person.');
    }
  }, [destination, conversations]);

  useEffect(() => {
    if (!pendingHit || !feed) return;
    const node = rootRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(pendingHit)}"]`);
    node?.scrollIntoView?.({ block: 'center' });
    node?.focus({ preventScroll: true });
    setPendingHit(undefined);
  }, [pendingHit, feed]);

  useEffect(() => {
    setEditingMessage(undefined);
    if (activeConversationId && feed?.unread.unread) actions.markRead(activeConversationId);
  }, [activeConversationId, messagingState.selfPersonId]);

  const select = (next: InboxDestination): void => {
    setDestination(next);
    setListOpen(false);
    setStatus('');
    setHighlightedMessageId(undefined);
    setThreadRootId(undefined);
    setEditingMessage(undefined);
    setDrawerOpen(false);
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const selectRef = useRef(select);
  selectRef.current = select;
  const participantsForSearch = useMemo(() => [...eligibleParticipants], [eligibleParticipants]);
  const searchMessagesFor = useCallback((query: string) => runMessageSearch(messagingState, scope, work, query, conversations, participantsForSearch), [messagingState, scope, work, conversations, participantsForSearch]);
  const openMessage = (conversationId: string, messageId: string): void => {
    threadOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const hit = messagingState.messages.find((message) => message.id === messageId);
    select({ kind: 'conversation', id: conversationId });
    if (hit?.threadRootId) { setThreadRootId(hit.threadRootId); setDrawerOpen(true); }
    setPendingHit(messageId);
    setHighlightedMessageId(messageId);
  };
  const openCreate = (kind: 'channel' | 'group' | 'dm', focus?: 'doat'): void => { setCreateKind(kind); setCreateFocus(focus); setCreateOpen(true); };
  const closeCreate = (): void => {
    setCreateOpen(false);
    const opener = createTriggerRef.current;
    requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
  };
  const dispatchError = (result: DispatchResult): void => { setStatus(result.ok ? '' : result.error.message); };
  const doSend = useCallback((input: SendInput) => actions.send(input), [actions]);
  const doRetry = useCallback((message: Message) => actions.retry(message.id), [actions]);
  const openThread = (message: Message): void => {
    threadOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setThreadRootId(message.id);
    setDrawerOpen(true);
  };
  const backToList = (): void => {
    setListOpen(true);
    setThreadRootId(undefined);
    setDrawerOpen(false);
    requestAnimationFrame(() => {
      const id = destination.kind === 'conversation' ? destination.id : destination.view;
      rootRef.current?.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(id)}"]`)?.focus();
    });
  };
  const mainActions = (view: import('../messaging/domain/selectors.js').MessageView): React.ReactNode => <MessageActions
    view={view}
    canPost={feed?.canPost}
    onToggleReaction={actions.toggleReaction}
    onToggleSaved={actions.toggleSaved}
    onMarkUnread={actions.markUnread}
    onDelete={(id) => { const result = actions.remove(id); dispatchError(result); return result; }}
    onReply={openThread}
    onEdit={setEditingMessage}
  />;

  const hasConversation = Boolean(activeConversationId && feed);
  const scopeActorKey = JSON.stringify([scope.organizationId, scope.workspaceId, messagingState.selfPersonId]);
  const reviewIsEmpty = useMemo(() => reviewEntries(state).length === 0, [state]);
  const reviewLinkedMessages = useMemo(() => linkedReviewMessages(messagingState.messages), [messagingState.messages]);
  const taskStatuses = useMemo(() => new Map(work.tasks.map((task) => [task.id, task.status] as const)), [work.tasks]);
  const selectedSaved = useMemo(() => selectSaved(messagingState, scope, work), [messagingState, scope, work]);
  const threadSummaries = useMemo(() => selectThreadSummaries(messagingState, scope, work), [messagingState, scope, work]);
  const threadTitles = useMemo(() => new Map(conversations.map((item) => [item.conversation.id, item.title] as const)), [conversations]);
  const THREADS_SPLIT_WIDTH = 760;
  const threadsActive = destination.kind === 'utility' && destination.view === 'threads';
  const threadsMasterDetail = (isMasterDetail ? containerWidth : containerWidth - 261) < THREADS_SPLIT_WIDTH;
  const threadsStorageKey = `gwira.inbox.threads.selected.v1:${scopeActorKey}`;
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(threadsStorageKey) ?? 'null') as ThreadKey | null;
      setThreadsSelection(stored && typeof stored.rootId === 'string' && typeof stored.conversationId === 'string' ? stored : undefined);
    } catch { setThreadsSelection(undefined); }
    setThreadsDetailOpen(false);
  }, [threadsStorageKey]);
  const selectThreadKey = useCallback((key: ThreadKey | undefined): void => {
    setThreadsSelection(key);
    try { if (key) window.localStorage.setItem(threadsStorageKey, JSON.stringify(key)); } catch { /* preference only */ }
  }, [threadsStorageKey]);
  const selectedDrafts = useMemo(() => selectDrafts(messagingState, scope, work), [messagingState, scope, work]);
  const failedSends = useMemo(() => selectFailedSends(messagingState, scope, work), [messagingState, scope, work]);
  const draftEntries = useMemo(() => buildDraftEntries(selectedDrafts, failedSends), [selectedDrafts, failedSends]);
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  const composerFocusThread = useRef(false);
  // Resuming a draft lands in the composer once the conversation (or its thread) has rendered.
  useEffect(() => {
    if (!composerFocusNonce) return;
    let frames = 0;
    let handle = 0;
    const attempt = (): void => {
      const root = rootRef.current;
      const pane = composerFocusThread.current ? '.gw-inbox-side' : '.gw-inbox-main';
      const textarea = root?.querySelector<HTMLTextAreaElement>(`${pane} textarea.gw-msg-textarea`);
      if (textarea) { textarea.focus(); const end = textarea.value.length; textarea.setSelectionRange(end, end); return; }
      if (++frames < 30) handle = requestAnimationFrame(attempt);
    };
    handle = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(handle);
  }, [composerFocusNonce]);
  const resumeDraft = (draft: import('../messaging/domain/types.js').Draft): void => {
    threadOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    select({ kind: 'conversation', id: draft.conversationId });
    if (draft.threadRootId) { setThreadRootId(draft.threadRootId); setDrawerOpen(true); }
    composerFocusThread.current = Boolean(draft.threadRootId);
    setComposerFocusNonce((value) => value + 1);
  };
  const resumeFailed = (message: Message, mode: 'open' | 'edit'): void => {
    const rootId = message.threadRootId;
    openMessage(message.conversationId, message.id);
    if (mode === 'edit' && !rootId) setEditingMessage(message);
    composerFocusThread.current = Boolean(rootId);
    setComposerFocusNonce((value) => value + 1);
  };
  const selectedMentions = useMemo(() => selectMentions(messagingState, scope, work), [messagingState, scope, work]);
  const unreadViews = useMemo(() => selectUnreadMessages(messagingState, scope, work), [messagingState, scope, work]);
  const backInHeader = detailShown && destination.kind === 'utility';
  const inboxHeader = <InboxHeading headingClass={backInHeader?'gw-visually-hidden':undefined} leading={backInHeader ? <button type="button" className="gw-inbox-header-back" aria-label="Back to Inbox navigation" onClick={backToList}><span aria-hidden="true"><Icon name="back" /></span> Inbox</button> : null} indicator={devToolsEnabled && sampleActive ? <span className="gw-inbox-sample-indicator">Sample data</span> : null}>
      <div className="gw-inbox-nav-actions">
        <button type="button" className="gw-inbox-create" aria-label="New conversation" title="New conversation" onClick={(event) => { createTriggerRef.current = event.currentTarget; openCreate('dm'); }}><ShellIcon name="new-work" /></button>
        {devToolsEnabled ? <details className="gw-inbox-dev-menu">
          <summary aria-label="Developer tools" title="Developer tools"><ShellIcon name="settings" /></summary>
          <div className="gw-inbox-dev-menu__panel" aria-label="Inbox developer tools">
            <span className="gw-inbox-dev-menu__label">Local testing</span>
            {sampleActive
              ? <button type="button" onClick={(event) => { onClearSample(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Clear sample data</button>
              : <button type="button" onClick={(event) => { onLoadSample(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Load sample conversations</button>}
            <label><span>Local actor</span><select aria-label="Local actor choice" title="Local test actor" value={messagingState.selfPersonId ?? ''} disabled={!actorPeople.length} onChange={(event) => { if (event.target.value) dispatchError(actions.setSelf(event.target.value)); }}>
              {actorPeople.length ? actorPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>) : <option value="">No workspace people</option>}
            </select></label>
          </div>
        </details> : null}
      </div>
  </InboxHeading>;
  const detailsAction = <button ref={drawerTriggerRef} type="button" className="gw-inbox-details-trigger" aria-label="Open conversation details" aria-expanded={drawerOpen && !threadRootId} onClick={() => { if (drawerOpen && !threadRootId) closeDrawer(); else { setThreadRootId(undefined); setDrawerOpen(true); } }}>Details</button>;

  const inboxNavigation = <aside className={`gw-inbox-master${detailShown ? ' is-hidden' : ''}`} aria-label="Inbox navigation">
        <InboxNav key={scopeActorKey} scopeKey={`${sampleActive ? 'sample:' : ''}${scopeActorKey}`} directory={{
          participants: messagingState.selfPersonId ? eligibleParticipants.filter(p=>!(p.ref.kind==='human'&&p.ref.id===messagingState.selfPersonId)) : [],
          mutedIds: new Set(messagingState.memberships.filter(m=>m.participant.kind==='human'&&m.participant.id===messagingState.selfPersonId&&!m.leftAt&&m.muted).map(m=>m.conversationId)),
          statuses: new Map(work.doats.flatMap(d=>{const status=recordedSidebarActivity(d,{workspace:state.workspace,tasks:work.tasks}).status;return status?[[d.id,status] as const]:[]})),
          onStartParticipant: ref=>{const result=actions.createDm(ref);dispatchError(result);if(result.ok&&result.value.conversationId)select({kind:'conversation',id:result.value.conversationId});},
          onRead: (id,unread)=>{const latest=messagingState.messages.filter(m=>m.conversationId===id&&!m.deletedAt&&!(m.author.kind==='human'&&m.author.id===messagingState.selfPersonId)).sort((a,b)=>b.seq-a.seq)[0];if(unread&&latest)dispatchError(actions.markUnread(id,latest.id));else if(!unread)dispatchError(actions.markRead(id));else setStatus('This conversation has no messages to mark unread.');},
          onDetails: id=>{select({kind:'conversation',id});setThreadRootId(undefined);setDrawerOpen(true);},
          onProfile: sampleActive ? undefined : onOpenDaot, onWorkSessions: sampleActive ? undefined : onOpenWorkSessions
        }} hideEmptyHint={activityActive && reviewIsEmpty} destination={destination} onSelectDestination={select} header={!detailShown ? inboxHeader : undefined} messageSearchRequest={messageSearchRequest} conversations={conversations} pendingApprovals={inboxCounts(state).pendingApprovals} searchMessages={searchMessagesFor} mentionsCount={selectedMentions.length} savedCount={selectedSaved.length} draftsCount={draftEntries.length} onOpenMessage={openMessage} onStartConversation={() => { createTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; openCreate('channel'); }} onAddConversation={(kind, sectionId) => { createTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; openCreate(kind, sectionId === 'doat' ? 'doat' : undefined); }} />
      </aside>;

  return <section ref={rootRef} className={`gwira-inbox-workspace${isMasterDetail ? ' is-master-detail' : ''}${isNarrow ? ' is-narrow' : ''}`} aria-label="Inbox" data-testid="inbox-workspace" data-sample-avatars={sampleActive || undefined} data-layout={isMasterDetail ? 'master-detail' : isNarrow ? 'two-pane' : 'three-pane'}>
    {detailShown ? <div className="gw-inbox-compact-header">{inboxHeader}</div> : null}
    {sampleError ? <p className="gw-inbox-alert" role="status">{sampleError}</p> : null}
    {messaging.recovery === 'recovery_unavailable' || messaging.lastError ? <p className="gw-inbox-alert" role="status">Messaging storage needs attention. Recovery may be unavailable if local storage is blocked.</p> : null}
    {messaging.trimmed ? <p className="gw-inbox-notice" role="status">Older history trimmed. <button type="button" onClick={actions.dismissTrimNotice}>Dismiss</button></p> : null}
    {status ? <p className="gw-inbox-alert" role="status">{status}</p> : null}
    <div className={`gw-inbox-layout${!isNarrow && (drawerOpen || threadRootId) ? ' has-context' : ''}`}>
      {inboxNavigation}
      <main className={`gw-inbox-main${isMasterDetail && !detailShown ? ' is-hidden' : ''}`}>
        {destination.kind === 'utility' && destination.view === 'unread' ? <UnreadPage views={unreadViews} conversations={conversations} scopeKey={scopeActorKey} onMarkRead={(id) => actions.markRead(id)} onMarkUnread={(id, messageId) => actions.markUnread(id, messageId)} onOpenConversation={(id) => select({ kind: 'conversation', id })} onOpenMessage={openMessage} onOpenTask={onOpenTask} />
          : destination.kind === 'utility' && destination.view === 'mentions' ? <MentionsPage views={selectedMentions} conversations={conversations} scopeKey={scopeActorKey} onOpenMessage={openMessage} onMarkRead={(id, seq) => actions.markRead(id, seq)} onToggleSaved={(id) => actions.toggleSaved(id)} />
            : destination.kind === 'utility' && destination.view === 'saved' ? <SavedPage views={selectedSaved} conversations={conversations} taskStatuses={taskStatuses} scopeKey={scopeActorKey} onOpenMessage={openMessage} onSetSaved={(id, saved, savedAt) => actions.toggleSaved(id, saved, savedAt)} />
              : destination.kind === 'utility' && destination.view === 'threads' ? <ThreadsPage summaries={threadSummaries} titles={threadTitles} scopeKey={scopeActorKey} selected={threadsSelection} onSelect={selectThreadKey} masterDetail={threadsMasterDetail} detailOpen={threadsDetailOpen} onDetailOpenChange={setThreadsDetailOpen}
                getThread={(key) => selectThread(messagingState, scope, work, key.conversationId, key.rootId)}
                getMentionCandidates={(id) => selectMentionCandidates(messagingState, scope, work, id)}
                getDraft={(key) => { const draft = selectDraft(messagingState, scope, work, key.conversationId, key.rootId); return { body: draft?.body ?? '', refs: draft?.refs ?? [] }; }}
                linkOptions={linkOptions} onOpenConversation={(key) => openMessage(key.conversationId, key.rootId)}
                panel={{ actor: { kind: 'human', id: messagingState.selfPersonId ?? '' }, savedMessageIds, onSendMessage: actions.send, onSetDraft: actions.setDraft, onRetry: actions.retry, onFlush: actions.flush, onEditMessage: actions.edit, onToggleReaction: actions.toggleReaction, onToggleSaved: actions.toggleSaved, onMarkUnread: actions.markUnread, onDelete: actions.remove, onOpenTask }} />
                : destination.kind === 'utility' && destination.view === 'drafts' ? <DraftsPage entries={draftEntries} conversations={conversations} scopeKey={scopeActorKey} onResumeDraft={resumeDraft} onResumeFailed={resumeFailed} onRetry={(id) => actions.retry(id)} onDeleteFailed={(id) => actions.remove(id)} onSetDraft={actions.setDraft} />
            : activityActive ? <NeedsReviewPage key={scopeActorKey} state={state} linkedMessages={reviewLinkedMessages} conversationTitles={threadTitles} masterDetail={threadsMasterDetail} onOpenTask={onOpenTask} onOpenMessage={openMessage} /> : hasConversation ? <>
              {feed ? <ConversationHeader feed={feed} sampleData={sampleActive} onBack={detailShown ? backToList : undefined} actions={detailsAction} onSearch={() => { setListOpen(true); setDrawerOpen(false); setThreadRootId(undefined); setMessageSearchRequest((previous) => ({ conversationId: activeConversationId!, conversationTitle: feed.title, nonce: (previous?.nonce ?? 0) + 1 })); }} /> : null}
              <MessageFeed feed={feed} renderActions={mainActions} onRetry={doRetry} onOpenTask={(taskId) => {
                if (sampleActive && taskId === INBOX_SAMPLE_TASK_ID) { setStatus('This task is sample data and is not part of the workspace.'); return; }
                onOpenTask(taskId);
              }} onReply={openThread} highlightedMessageId={highlightedMessageId} scrollScopeKey={JSON.stringify([scope.organizationId, scope.workspaceId, messagingState.selfPersonId])} />
              {feed?.canPost || editingMessage ? <Composer conversationTitle={feed?.title} savedMessageIds={savedMessageIds} conversationId={activeConversationId!} actor={{ kind: 'human', id: messagingState.selfPersonId! }} mentionCandidates={candidates} linkOptions={linkOptions} initialDraft={initialDraft} initialDraftRefs={initialDraftRefs} onSendMessage={doSend} onSetDraft={actions.setDraft} onRetry={actions.retry} onFlush={actions.flush} doatNotConnected={feed?.doatNotConnected} canSend={feed?.canPost} editingMessage={editingMessage} onEditMessage={actions.edit} onCancelEdit={() => setEditingMessage(undefined)} /> : null}
            </> : <div className="gw-inbox-empty-selection"><h2>Select a conversation</h2><p>Choose one from the list or create a new local conversation.</p><button type="button" onClick={(event) => { createTriggerRef.current = event.currentTarget; openCreate('channel'); }}>New conversation</button></div>}
      </main>
      {(drawerOpen || threadRootId) && hasConversation && !activityActive && <div ref={drawerRef} className={`gw-inbox-side${isNarrow ? ' is-drawer' : ''}${threadRootId ? ' is-thread' : ''}`} role={isNarrow ? 'dialog' : 'complementary'} aria-modal={isNarrow ? true : undefined} aria-label={threadRootId ? 'Message thread' : 'Conversation details'} onKeyDown={(event) => {
        if (!isNarrow || event.key !== 'Tab') return;
        const nodes = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((node) => !(node as HTMLButtonElement).disabled && node.getClientRects().length > 0);
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || !nodes.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !nodes.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first?.focus(); }
      }}>
        {threadRootId && activeConversationId ? <ThreadPanel returnFocusTo={threadOpenerRef.current} highlightedMessageId={highlightedMessageId} scrollScopeKey={scopeActorKey} savedMessageIds={savedMessageIds} thread={thread} conversationId={activeConversationId} actor={{ kind: 'human', id: messagingState.selfPersonId ?? '' }} mentionCandidates={candidates} linkOptions={linkOptions} initialDraft={selectDraft(messagingState, scope, work, activeConversationId, threadRootId)?.body ?? ''} initialDraftRefs={selectDraft(messagingState, scope, work, activeConversationId, threadRootId)?.refs ?? []} onClose={() => { setThreadRootId(undefined); setDrawerOpen(false); }} onSendMessage={actions.send} onSetDraft={actions.setDraft} onRetry={actions.retry} onFlush={actions.flush} onEditMessage={actions.edit} onToggleReaction={actions.toggleReaction} onToggleSaved={actions.toggleSaved} onMarkUnread={actions.markUnread} onDelete={actions.remove} onOpenTask={onOpenTask} doatNotConnected={feed?.doatNotConnected} />
          : <>{feed ? <ContextPanel onClose={closeDrawer} feed={feed} work={work} scope={scope} messagingState={messagingState} onOpenTask={onOpenTask} /> : null}</>}
      </div>}
      {isNarrow && drawerOpen && hasConversation ? <button type="button" className="gw-inbox-scrim" aria-label="Close details drawer" onClick={closeDrawer} /> : null}
    </div>
    {createOpen ? <CreateConversationDialog error={status || undefined} initialKind={createKind} focus={createFocus} participants={eligibleParticipants} selfPersonId={messagingState.selfPersonId} onClose={closeCreate} onCreate={(kind, values) => {
      const result = kind === 'dm' ? actions.createDm(values.members[0]!) : kind === 'group' ? actions.createGroup(values.name, values.members) : actions.createChannel({ name: values.name, topic: values.topic, members: values.members, visibility: values.visibility });
      if (!result.ok) { setStatus(result.error.message); return; }
      setStatus(''); closeCreate();
      if (result.value.conversationId) select({ kind: 'conversation', id: result.value.conversationId });
    }} /> : null}
  </section>;
}

function MessageCollection({ title, views, onOpen, empty = 'Nothing here yet.' }: { title: string; views: readonly import('../messaging/domain/selectors.js').MessageView[]; onOpen: (conversationId: string, messageId: string) => void; empty?: string }): React.ReactElement {
  return <section className="gw-inbox-collection"><h2>{title}</h2>{views.length ? <ul>{views.map((view) => <li key={view.message.id}><button type="button" onClick={() => onOpen(view.message.conversationId, view.message.id)}><strong>{view.author.name}</strong><span>{view.message.body || 'Linked records'}</span></button></li>)}</ul> : <p>{empty}</p>}</section>;
}

type CreateKind = 'dm' | 'group' | 'channel';
type CreateFocus = 'doat' | undefined;

const CREATE_COPY: Record<CreateKind, { icon: 'hash' | 'users' | 'inbox'; label: string; title: string; blurb: string; action: string }> = {
  channel: { icon: 'hash', label: 'Channel', title: 'Create a channel', blurb: 'A shared space for one topic. Choose who can see it.', action: 'Create channel' },
  group: { icon: 'users', label: 'Group', title: 'Start a group', blurb: 'A small private conversation with the people you pick.', action: 'Create group' },
  dm: { icon: 'inbox', label: 'Direct message', title: 'New direct message', blurb: 'A one-to-one conversation.', action: 'Start direct message' }
};

export function CreateConversationDialog({ initialKind, focus, participants, selfPersonId, onClose, onCreate, error, availableKinds=['channel','group','dm'], storageNote='On this device only', saving=false }: { initialKind: CreateKind; error?: string; focus?: CreateFocus; participants: ParticipantView[]; selfPersonId: string | null; onClose: () => void; onCreate: (kind: CreateKind, values: { name: string; topic: string; members: ParticipantRef[]; visibility?: 'org' | 'private' }) => void; availableKinds?:CreateKind[];storageNote?:string;saving?:boolean }): React.ReactElement {
  const [kind, setKind] = useState<CreateKind>(initialKind);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [visibility, setVisibility] = useState<'org' | 'private'>('org');
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const peopleSearchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const doatOnly = focus === 'doat' && kind === 'dm';
  const eligiblePeople = participants.filter((participant) => !(participant.ref.kind === 'human' && participant.ref.id === selfPersonId) && (!doatOnly || participant.ref.kind === 'doat'));
  const matchingPeople = eligiblePeople.filter((participant) => participant.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const copy = doatOnly ? { ...CREATE_COPY.dm, title: 'Message a Doat', blurb: 'Start a conversation with one of your workspace Doats.', action: 'Start conversation' } : CREATE_COPY[kind];
  useEffect(() => {
    (kind === 'dm' ? peopleSearchRef : nameRef).current?.focus();
  }, [kind]);
  const togglePerson = (key: string): void => {
    setSelectedPeople((current) => current.includes(key)
      ? current.filter((selected) => selected !== key)
      : kind === 'dm' ? [key] : [...current, key]);
  };
  const peopleSelected = selectedPeople.flatMap((key) => {
    const participant = eligiblePeople.find((item) => `${item.ref.kind}:${item.ref.id}` === key);
    return participant ? [participant] : [];
  });
  const members = peopleSelected.map((participant) => participant.ref);
  const disabledReason = !selfPersonId ? 'Choose a local person first'
    : kind !== 'dm' && !name.trim() ? 'Add a name'
      : kind !== 'channel' && members.length === 0 ? (doatOnly ? 'Pick a Doat' : 'Add a person')
        : '';
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (disabledReason || saving) return;
    onCreate(kind, { name, topic, members, visibility });
  };
  const noun = kind === 'channel' ? 'Channel' : 'Group';
  return <div className="gw-inbox-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="gw-inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="gw-inbox-create-title" aria-describedby="gw-inbox-create-blurb" ref={dialogRef} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])') ?? [])].filter((node) => !(node as HTMLButtonElement).disabled && node.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }}>
      <header>
        <span className="gw-inbox-dialog__badge" aria-hidden="true"><ShellIcon name={doatOnly ? 'doats' : copy.icon} /></span>
        <div className="gw-inbox-dialog__heading"><h2 id="gw-inbox-create-title">{copy.title}</h2><p id="gw-inbox-create-blurb">{copy.blurb}</p></div>
        <button type="button" className="gw-inbox-dialog__close" aria-label="Close new conversation" onClick={onClose}><Icon name="close" /></button>
      </header>
      <form onSubmit={submit}>
        {error ? <p role="alert">{error}</p> : null}
        {!doatOnly ? <div className="gw-inbox-type-tabs" role="group" aria-label="Conversation type">
          {availableKinds.map((value) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setSelectedPeople([]); setQuery(''); }}>
            <ShellIcon name={CREATE_COPY[value].icon} />{CREATE_COPY[value].label}
          </button>)}
        </div> : null}
        {kind !== 'dm' ? <label className="gw-inbox-field"><span className="gw-inbox-field__label">Name</span>
          <span className="gw-inbox-input">
            <span className="gw-inbox-input__prefix" aria-hidden="true"><ShellIcon name={kind === 'channel' ? 'hash' : 'users'} /></span>
            <input ref={nameRef} aria-label={`${noun} name`} placeholder={kind === 'channel' ? 'e.g. launch planning' : 'e.g. Design crew'} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          </span>
        </label> : null}
        {kind === 'channel' ? <label className="gw-inbox-field"><span className="gw-inbox-field__label">Topic <em>Optional</em></span>
          <span className="gw-inbox-input"><input aria-label="Channel topic" placeholder="What is this channel for?" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={200} /></span>
        </label> : null}
        {kind === 'channel' ? <label className="gw-inbox-field"><span className="gw-inbox-field__label">Visibility</span><select aria-label="Channel visibility" value={visibility} onChange={event=>setVisibility(event.target.value as 'org'|'private')}><option value="org">Public · workspace</option><option value="private">Private · invited members</option></select></label> : null}
        <div className="gw-inbox-field">
          <span className="gw-inbox-field__label">{doatOnly ? 'Doat' : kind === 'dm' ? 'Person' : kind === 'channel' ? 'Initial members (optional)' : 'People'}{peopleSelected.length > 1 ? <em>{peopleSelected.length} selected</em> : null}</span>
          <div className="gw-inbox-people-picker">
            {peopleSelected.length ? <div className="gw-inbox-selected-people" aria-label="Selected people">
              {peopleSelected.map((participant) => {
                const key = `${participant.ref.kind}:${participant.ref.id}`;
                return <span className="gw-inbox-person-chip" key={key}>
                  <span className={`gw-inbox-person-avatar${participant.ref.kind === 'doat' ? ' is-doat' : ''}`} aria-hidden="true">{avatarInitials(participant.name)}</span>
                  {participant.name}{participant.ref.kind === 'doat' ? ' · Doat' : ''}
                  <button type="button" aria-label={`Remove ${participant.name}`} onClick={() => togglePerson(key)}><Icon name="close" /></button>
                </span>;
              })}
            </div> : null}
            <span className="gw-inbox-input">
              <span className="gw-inbox-input__prefix" aria-hidden="true"><ShellIcon name="search" /></span>
              <input ref={peopleSearchRef} className="gw-inbox-people-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={doatOnly ? 'Search Doats' : 'Search people or Doats'} aria-label={doatOnly ? 'Search Doats' : 'Search people or Doats'} />
            </span>
            <ul className="gw-inbox-person-list" aria-label={doatOnly ? 'Doats' : 'People and Doats'} onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
              const index = rows.indexOf(document.activeElement as HTMLButtonElement);
              const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
              if (next) { event.preventDefault(); next.focus(); }
            }}>
              {matchingPeople.map((participant) => {
                const key = `${participant.ref.kind}:${participant.ref.id}`;
                const picked = selectedPeople.includes(key);
                return <li key={key}><button type="button" className="gw-inbox-person-option" aria-pressed={picked} onClick={() => togglePerson(key)}>
                  <span className={`gw-inbox-person-avatar${participant.ref.kind === 'doat' ? ' is-doat' : ''}`} aria-hidden="true">{avatarInitials(participant.name)}</span>
                  <span className="gw-inbox-person-name">{participant.name}</span>{participant.ref.kind === 'doat' && !doatOnly ? <span className="gw-inbox-person-tag">Doat</span> : null}
                  <span className="gw-inbox-person-check" aria-hidden="true">{picked ? <Icon name="trace-check" /> : null}</span>
                </button></li>;
              })}
            </ul>
            {eligiblePeople.length === 0 ? <p className="gw-inbox-dialog-inline">{doatOnly ? 'No Doats are available in this workspace yet.' : 'No other workspace people or Doats are available.'}</p>
              : matchingPeople.length === 0 ? <p className="gw-inbox-dialog-inline" role="status">No matches for “{query.trim()}”.</p> : null}
          </div>
        </div>
        <footer>
          <span className="gw-inbox-dialog-footer-note">{storageNote}{disabledReason ? <span className="gw-inbox-dialog-reason" role="status"> · {disabledReason}</span> : null}</span>
          <div><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={Boolean(disabledReason)||saving}>{saving?'Creating…':copy.action}</button></div>
        </footer>
      </form>
    </section>
  </div>;
}
