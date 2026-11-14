import { useFirstRun } from './auth/FirstRunContext.js';
import { FirstRunHome } from './gwira/firstRun/FirstRunHome.js';
import {AccountGate} from './auth/AccountGate.js';
import {ConversationHeading} from './components/ConversationHeading.js';
import {formatSidebarTime as formatRelativeTime} from './components/SidebarConversationRow.js';
import { MessageComposer, ComposerInput, ComposerSendButton, QuickPrompt } from './components/MessageComposer.js';
import { NewTabLauncher } from './components/NewTabLauncher.js';
import {WorkspaceTools} from './workspaceTools/WorkspaceTools.js';
import {ViewsPage} from './gwira/views/ViewsPage.js';
import { sharedRepository } from './gwira/messaging/data/sharedRepository.js';
import { saveEmployeeInstruction } from './workSessions/localInstruction.js';
import { WorkSessions } from './workSessions/WorkSessions.js';
import { clampWorkspaceWidth, projectWorkSessions, restoreWorkPreferences, workPreferenceKey, type WorkSessionView } from './workSessions/model.js';
import { Icon, SkillGlyph as SkillIcon, ThreadSpinner, NewThreadIcon, StopIcon, LocalComputerIcon, FolderIcon, FolderPlusIcon, DeleteThreadIcon } from "./components/Icon.js";
import { ReferenceChips } from './components/ReferenceChips.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CodexBootstrapStatus, CodexModelInfo, CodexProjectCandidate, CodexReasoningLevel, CodexSession, CodexSkillDetail, CodexSkillInfo, CodexThreadHistory, GitBranchInfo, PermissionMode, ProjectFileInfo, ReasoningEffort, SessionMessage, SessionStatus } from '../shared/types.js';
import { filterBranches } from './branchSearch.js';
import { buildPromptWithAttachments, type ComposerAttachment, type ComposerFileReference, type ComposerSkillReference } from './composerAttachments.js';
import { composerTextareaHeight } from './composerTextarea.js';
import { mergeOutputIntoMessages } from './messageMerge.js';
import { searchProjectFiles } from './projectFileSearch.js';
import { viewAfterOpeningThread } from './navigationState.js';
import { WORKSPACE_NAVIGATION_ITEMS } from './navigationTypes.js';
import { canContinueProjectOnboarding, shouldBlockSendWithoutProject } from './projectOnboarding.js';
import { parseStoredProjectState } from './projectStateStorage.js';
import { clearLastActiveHomeSession, readLastActiveHomeSession, writeLastActiveHomeSession } from './homeSessionStorage.js';
import { permissionSelection } from './permissionSelection.js';
import { addProject, removeProject, type ProjectEntry, type ProjectState } from './projects.js';
import { findProjectIdForSession, mergeSessionIntoProjectHistories } from './sessionHistory.js';
import { ensureExpandedProject, reconcileExpandedProjects, removeExpandedProject, toggleExpandedProject } from './projectThreads.js';
import { copyText, LocalImagePreview, Transcript } from './components/Transcript.js';
import { activityTraceFixture } from './activityTraceFixtures.js';
import { ProjectSidebar, type WorkspaceNavigation } from './components/ProjectSidebar.js';
import { SkillsView } from './components/SkillsView.js';
import { WorkspaceShell } from './components/WorkspaceShell.js';
import { RightWorkspace } from './components/RightWorkspace.js';
import type { WorkspaceTabChoice } from './components/GlobalTopBar.js';
import { ComposerAddMenu } from './components/ComposerAddMenu.js';
import { ConversationExecutionControls } from './components/ConversationExecutionControls.js';
import { useConversationDraft } from './components/useConversationDraft.js';
import { useConversationScroll } from './components/useConversationScroll.js';
import { requestConversationStop } from './conversationModel.js';
import { GlobalAssistantPanel } from './components/GlobalAssistantPanel.js';
import { GlobalTopBar } from './components/GlobalTopBar.js';
import { inboxCounts } from './gwira/inbox/inboxViewModel.js';
import { collapseWorkspaceTools, reopenWorkspaceTools, resumeWorkspaceTool, closeWorkspaceTab, createDefaultWorkspaceTabs, destinationView, navigateGlobalTab, newGlobalTab, openWorkspaceTab, reorderWorkspaceTab, restoreWorkspaceTabs, selectWorkspaceTab, replaceWorkspaceTab, reopenWorkspaceTab, workspaceTabLabel, workspaceTabsStorageKey, type WorkspaceDestination, type WorkspaceTab, type WorkspaceTabsState } from './workspaceTabs.js';
import { InlineSelect } from './components/InlineSelect.js';
import { ProjectSelectorPopover, Welcome } from './components/ProjectControls.js';
import { MyWorkPage, type NewTaskInput, type TaskUpdateInput } from './gwira/work/MyWorkPage.js';
import type { Agent, Assignee, GwiraLocalState, Person, TaskStatus } from './gwira/domain/types.js';
import { reduceGwira, type GwiraCommand } from './gwira/domain/reducer.js';
import { createInitialLocalState, GWIRA_LOCAL_STORAGE_RECOVERY_KEY, loadGwiraLocalState, saveGwiraLocalState } from './gwira/data/localStore.js';
import { associateCodingTaskSession, createCodingTaskSendInputRequest, createCodingTaskStartRequest, mapCodexExitToAgentRun, validateCodingTaskLaunch, validateCodingTaskStop } from './gwira/agents/codingTaskBridge.js';
import { HomePage } from './gwira/home/HomePage.js';
import { DashboardSidebar } from './gwira/dashboard/DashboardSidebar.js';
import { DashboardPage } from './gwira/dashboard/DashboardPage.js';
import { DevNodeGallery } from './gwira/graph/DevNodeGallery.js';
import { InboxPage } from './gwira/inbox/InboxPage.js';
import {applyWorkforceAction, type WorkforceAction} from './gwira/workforce/model.js';
import { TeamsPage } from './gwira/workspace/TeamsPage.js';
import { AgentsPage, type NewCodingAgentInput } from './gwira/workspace/AgentsPage.js';
import { scheduleDraftInstruction } from './gwira/schedule/scheduleSuggestions.js';
import { SchedulePage } from './gwira/schedule/SchedulePage.js';
import { SettingsPage } from './gwira/workspace/SettingsPage.js';
import { recoverInterruptedAgentRuns } from './gwira/domain/recovery.js';
import { DoatDirectory } from './gwira/doats/ui/DoatDirectory.js';
import { DoatCreationWizard } from './gwira/doats/ui/DoatCreationWizard.js';
import { DoatProfile } from './gwira/doats/ui/DoatProfile.js';
import type { DoatDraft } from './gwira/doats/ui/types.js';
import type { Doat } from './gwira/doats/domain/types.js';
import { createProceduralVisualRevision, DOAT_PALETTES } from './gwira/doats/visual/avatar.js';
import { doatToUiRecord } from './gwira/doats/doatViewModel.js';
import { planDoatExecution } from './gwira/doats/execution/executionPlanner.js';
import { OrganizationPage } from './gwira/organization/ui/OrganizationPage.js';
import type { OrganizationStructure } from './gwira/organization/domain/organizationTypes.js';
import { OnboardingPage } from './gwira/onboarding/OnboardingPage.js';
import { createLocalOnboardingState, nextOnboardingState, previousOnboardingState, type LocalOnboardingState } from './gwira/onboarding/onboardingModel.js';
import { IntegrationsCatalogPage } from './gwira/integrations/ui/IntegrationsCatalogPage.js';
import { INTEGRATION_CATALOG } from './gwira/integrations/domain/catalog.js';
import { LibraryPage } from './gwira/library/LibraryPage.js';
import './tokens.css';
import './styles.css';
import './shell.css';
import './components/activityTrace.css';
import './components/sidebarQuality.css';
import './components/conversation.css';
import './components/globalAssistant.css';
import './components/messagePresentation.css';
import './globalVisualSystem.css';
import './workSessions/workSessions.css';

document.documentElement.dataset.platform = /Windows/i.test(navigator.userAgent) ? 'win32' : /Mac/i.test(navigator.userAgent) ? 'darwin' : 'linux';

const defaultModel = 'gwira-auto';
const projectsStorageKey = 'codex-desktop.projects.v1';

const reasoningOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' }
];

const fallbackModels: CodexModelInfo[] = [];
const emptyGitBranches: GitBranchInfo = { current: '', branches: [] };

const permissionOptions: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Workspace write' },
  { value: 'full-access', label: 'Full access' }
];

function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'idle': return 'Ready';
    case 'running': return 'Thinking';
    case 'error': return 'Error';
  }
}

function reasoningOptionLabel(value: CodexReasoningLevel): string {
  return reasoningOptions.find((option) => option.value === value || (option.value === 'xhigh' && value === 'extra-high'))?.label ?? value;
}

function normalizeReasoningLevel(value: CodexReasoningLevel): ReasoningEffort {
  return value === 'extra-high' ? 'xhigh' : value;
}

function supportedReasoningForModel(modelInfo?: CodexModelInfo): ReasoningEffort[] {
  const levels = modelInfo?.supportedReasoningLevels ?? [];
  return levels.map(normalizeReasoningLevel).filter((level, index, all) => all.indexOf(level) === index);
}

function commandMatches(value: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = value.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function trailingCommandQuery(value: string, marker: '/' | '@'): string | undefined {
  const match = new RegExp(`\\${marker}([^\\s]*)$`).exec(value);
  return match?.[1] ?? undefined;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read pasted image'));
    reader.readAsDataURL(file);
  });
}

function loadProjectState(): ProjectState {
  return parseStoredProjectState(localStorage.getItem(projectsStorageKey));
}

function normalizeProjectPath(value: string): string {
  return value.replace(/[\\/]+$/, '');
}

function gwiraId(): string {
  return crypto.randomUUID();
}

function createGwiraState(): GwiraLocalState {
  const now = new Date().toISOString();
  return createInitialLocalState(gwiraId(), gwiraId(), now);
}

function loadWorkspaceTabs(state: GwiraLocalState, projects: ProjectState): WorkspaceTabsState {
  try {
    return restoreWorkspaceTabs(localStorage.getItem(workspaceTabsStorageKey), (destination) =>
      destination.type === 'task'
        ? state.tasks.some((task) => task.id === destination.taskId)
        : destination.type === 'doat'
          ? state.doats.some((doat) => doat.id === destination.doatId && !doat.archivedAt)
          : destination.type === 'project'
            ? projects.projects.some((project) => project.id === destination.projectId)
          : destination.type === 'conversation'
            ? projects.projects.some((project) => project.id === destination.projectId)
          : true
    );
  } catch {
    return createDefaultWorkspaceTabs();
  }
}

function loadInitialGwiraState(): GwiraLocalState {
  return recoverInterruptedAgentRuns(loadGwiraLocalState(localStorage, createGwiraState), new Date().toISOString(), gwiraId);
}

function App(): React.ReactElement {
  const firstRun = useFirstRun();
  const firstRunActive = !!firstRun;
  const traceFixture = useMemo(() => import.meta.env.DEV ? activityTraceFixture(new URLSearchParams(window.location.search).get('activityTraceFixture')) : undefined, []);
  const [projectState, setProjectState] = useState<ProjectState>(() => loadProjectState());
  const [session, setSession] = useState<CodexSession | undefined>();
  const [sessionsById, setSessionsById] = useState<Record<string, CodexSession>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [scheduleDraftKey, setScheduleDraftKey] = useState<string>();
  const [input, setInput, setConversationDraft] = useConversationDraft(scheduleDraftKey ?? activeSessionId ?? `project:${projectState.activeProjectId ?? 'workspace'}`);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const [conversationNotices, setConversationNotices] = useState<Record<string, string>>({});
  const cancellingRef = useRef(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<ComposerSkillReference[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<ComposerFileReference[]>([]);
  const [availableSkills, setAvailableSkills] = useState<CodexSkillInfo[]>([]);
  const [activeView, setActiveView] = useState<WorkspaceNavigation>('home');
  const navigationHistoriesRef = useRef<Record<string, { views: WorkspaceNavigation[]; index: number }>>({});
  const [, setNavigationVersion] = useState(0);
  const [requestedSidebarChannel, setRequestedSidebarChannel] = useState<{ id: string; nonce: number }>();
  const [doatScreen, setDoatScreen] = useState<'directory' | 'create' | 'profile'>('directory');
  const [selectedDoatId, setSelectedDoatId] = useState<string | undefined>();
  const [requestedBusinessTaskId, setRequestedBusinessTaskId] = useState<string | undefined>();
  const [gwiraState, setGwiraState] = useState<GwiraLocalState>(loadInitialGwiraState);
  const [pendingScheduleReviews, setPendingScheduleReviews] = useState(0);
  useEffect(() => {
    let alive = true;
    setPendingScheduleReviews(0);
    const refresh = async (): Promise<void> => {
      try {
        const snapshot = await window.codexDesktop.schedules.read(gwiraState.workspace.id);
        if (alive) setPendingScheduleReviews(snapshot.runs.filter(run => run.status === 'awaiting_review' && snapshot.schedules.some(schedule => schedule.id === run.scheduleId)).length);
      } catch { /* SchedulePage provides storage errors and explicit retry. */ }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [gwiraState.workspace.id]);
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTabsState>(() => loadWorkspaceTabs(gwiraState, projectState));
  const [assistantOpen, setAssistantOpen] = useState(() => { try { return localStorage.getItem('gwira.chat.open') === 'true'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('gwira.chat.open', String(assistantOpen)); } catch { /* Open state remains usable in memory. */ } }, [assistantOpen]);
  const [workPreferences, setWorkPreferences] = useState(() => { try { return restoreWorkPreferences(localStorage.getItem(workPreferenceKey)); } catch { return restoreWorkPreferences(null); } });
  const [workspaceResizing, setWorkspaceResizing] = useState(false);
  const [activeDock, setActiveDock] = useState<'chat'|'work'>('work');
  const [rightDockCollapsed, setRightDockCollapsed] = useState(workspaceTabs.workspaceCollapsed===true || firstRunActive);
  const [wideDocks, setWideDocks] = useState(() => window.matchMedia('(min-width: 1560px)').matches);
  const [workLoading, setWorkLoading] = useState(false);
  const [workRefreshError, setWorkRefreshError] = useState('');
  useEffect(() => { const media = window.matchMedia('(min-width: 1560px)'); const change=()=>setWideDocks(media.matches); media.addEventListener('change',change); return()=>media.removeEventListener('change',change); },[]);
  useEffect(() => { try { localStorage.setItem(workPreferenceKey,JSON.stringify(workPreferences)); } catch { /* Preferences remain usable in memory. */ } },[workPreferences]);
  const globalTabs = workspaceTabs.globalTabs ?? workspaceTabs.tabs.filter(tab => ['view', 'task', 'doat', 'project', 'conversation'].includes(tab.destination.type));
  const workspaceTabList = workspaceTabs.workspaceTabs ?? workspaceTabs.tabs.filter(tab => ['launcher', 'files', 'file', 'terminal', 'work-sessions'].includes(tab.destination.type));
  const currentGlobalTab = globalTabs.find(tab => tab.id === workspaceTabs.activeGlobalTabId) ?? workspaceTabs.tabs.find(tab => ['view', 'task', 'doat', 'project', 'conversation'].includes(tab.destination.type));
  const currentWorkspaceTab = workspaceTabList.find(tab => tab.id === workspaceTabs.activeWorkspaceTabId) ?? workspaceTabs.tabs.find(tab => ['launcher', 'files', 'file', 'terminal', 'work-sessions'].includes(tab.destination.type));
  const currentTab = currentWorkspaceTab ?? currentGlobalTab;
  const activeFile = currentWorkspaceTab?.destination.type === 'file' ? currentWorkspaceTab.destination : undefined;
  const currentTool = currentWorkspaceTab?.destination.type === 'files' || activeFile ? 'files' : currentWorkspaceTab?.destination.type === 'terminal' ? 'terminal' : currentWorkspaceTab?.destination.type === 'work-sessions' ? 'sessions' : undefined;
  const launcherOpen = currentWorkspaceTab?.destination.type === 'launcher';
  const rightDockRequested = !rightDockCollapsed && (launcherOpen || !!currentTool || workPreferences.open);
  const showChatDock = assistantOpen && (!rightDockRequested || activeDock === 'chat');
  const showWorkDock = rightDockRequested && !showChatDock;

  const workRows = useMemo(() => projectWorkSessions(gwiraState,Object.values(sessionsById)),[gwiraState,sessionsById]);
  async function refreshWorkSessions(): Promise<void> {
    setWorkRefreshError('');
    const ids=[...new Set([...gwiraStateRef.current.tasks.filter(t=>t.workspaceId===gwiraStateRef.current.workspace.id).flatMap(t=>t.agentRun?[t.agentRun.sessionId]:[]),...Object.keys(sessionsByIdRef.current)])];
    const results=await Promise.allSettled(ids.map(async id=>{const value=await window.codexDesktop.getSession(id);if(value)cacheSession(value);}));
    if(results.some(result=>result.status==='rejected')){setWorkRefreshError('Could not refresh local records. Last confirmed data is shown. Try again.');throw Error('Local record refresh failed');}
  }
  useEffect(()=>{if(!showWorkDock&&activeView!=='work-sessions')return;setWorkLoading(true);void refreshWorkSessions().catch(()=>{}).finally(()=>setWorkLoading(false));},[showWorkDock,activeView==='work-sessions']);
  const [toolsTarget,setToolsTarget]=useState<HTMLDivElement|null>(null);
  const [toolsCanvasTarget,setToolsCanvasTarget]=useState<HTMLDivElement|null>(null);
  function toggleWorkSessions(): void {
    if (showWorkDock) { persistWorkspaceTabs(collapseWorkspaceTools(workspaceTabsRef.current)); setRightDockCollapsed(true); setWorkPreferences(p=>({...p,open:false})); requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.global-topbar [aria-label="Workspace tools"]')?.focus()); }
    else { const next=reopenWorkspaceTools(workspaceTabsRef.current);persistWorkspaceTabs(next);setActiveDock('work');setRightDockCollapsed(false);setWorkPreferences(p=>({...p,open:false})); }
  }
  function closeWorkSessions(): void { setWorkPreferences(p=>({...p,open:false}));requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.global-topbar [aria-label="Workspace tools"]')?.focus()); }
  function workConversation(row:WorkSessionView): void {
    if(row.workerKind==='person'){
      const current=gwiraStateRef.current,task=current.tasks.find(item=>item.workspaceId===current.workspace.id&&item.id===row.task?.id);
      if(row.task?.workspaceId!==current.workspace.id||task?.assignee?.kind!=='person'||task.assignee.id!==row.ownerId)return;
      const repository=sharedRepository(window.localStorage,{organizationId:current.organization.id,workspaceId:current.workspace.id},current);
      const result=repository.dispatch({type:'createDm',participant:{kind:'human',id:task.assignee.id}});
      if(!result.ok){setError(result.error.message);return;}
      setRequestedSidebarChannel(previous=>({id:result.value.conversationId!,nonce:(previous?.nonce??0)+1}));openWorkspaceView('inbox');return;
    }

    const saved=projectStateRef.current.projects.find(p=>p.path===(row.session?.cwd??gwiraStateRef.current.projects.find(p=>p.id===row.task?.projectId)?.codingProjectPath));
    if(!saved)return;
    const conversationId=row.session?.codexConversationId??row.task?.agentRun?.codexConversationId;
    if(conversationId)openWorkspaceDestination({type:'conversation',projectId:saved.id,conversationId});
    else if(row.session){openWorkspaceView('home');openCachedSession(saved,row.session);}
  }
  function canOpenWorkConversation(row:WorkSessionView): boolean {if(row.workerKind==='person')return !!row.ownerId&&gwiraState.people.some(person=>person.workspaceId===gwiraState.workspace.id&&person.id!==row.ownerId);return projectState.projects.some(p=>p.path===(row.session?.cwd??gwiraState.projects.find(p=>p.id===row.task?.projectId)?.codingProjectPath))&&!!(row.session||row.task?.agentRun?.codexConversationId);}
  function workPanel(expanded=false,contextual=false):React.ReactElement {return <WorkSessions key={`${gwiraState.organization.id}:${gwiraState.workspace.id}`} rows={workRows} preferences={workPreferences} onPreferences={setWorkPreferences} expanded={expanded} workspaceContext={contextual} onClose={contextual?()=>{const tab=workspaceTabsRef.current.workspaceTabs?.find(item=>item.id===workspaceTabsRef.current.activeWorkspaceTabId);if(tab)closeWorkspaceDestination(tab);}:expanded?()=>{setWorkPreferences(p=>({...p,open:true}));setActiveDock('work');closeWorkspaceDestination(workspaceTabsRef.current.tabs.find(t=>t.destination.type==='work-sessions')!);}:closeWorkSessions} onExpand={()=>openWorkspaceDestination({type:'work-sessions'})} onChat={()=>{setAssistantOpen(true);setActiveDock('chat');}} onConversation={workConversation} canOpenConversation={canOpenWorkConversation} scopeKey={`${gwiraState.organization.id}:${gwiraState.workspace.id}`} onInstruction={async (row,text,clientId)=>{const current=gwiraStateRef.current;const repository=sharedRepository(window.localStorage,{organizationId:current.organization.id,workspaceId:current.workspace.id},current);return saveEmployeeInstruction(repository,current,row,text,clientId);}} onDraftInstruction={(row,text)=>{const current=workRows.find(item=>item.id===row.id);if(!current?.session||!canOpenWorkConversation(current))return;const project=projectStateRef.current.projects.find(item=>item.path===current.session!.cwd);if(!project)return;setConversationDraft(current.session.id,text);openWorkspaceView('home');openCachedSession(project,current.session);}} onReview={row=>{if(row.task)openWorkspaceDestination({type:'task',taskId:row.task.id});}} onRefresh={refreshWorkSessions} onCancel={async row=>{const current=gwiraStateRef.current.tasks.find(task=>task.id===row.task?.id&&task.workspaceId===gwiraStateRef.current.workspace.id);return current&&row.workerKind!=='person'&&current.agentRun?.sessionId===row.task?.agentRun?.sessionId?stopCodingTask(current.id):false;}} stopping={stoppingCodingTaskIds} loading={workLoading} errorMessage={workRefreshError}/>;}
  const [dashboardInspectorOpen, setDashboardInspectorOpen] = useState(() => {
    try { return localStorage.getItem('gwira.dashboard.context-panel-open') !== 'false'; } catch { return true; }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('gwira.sidebar.collapsed') === 'true'; } catch { return false; }
  });
  const [narrowWindow, setNarrowWindow] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [narrowSidebarOpen, setNarrowSidebarOpen] = useState(false);
  const [firstRunSidebarOpened, setFirstRunSidebarOpened] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<CodexSkillDetail | undefined>();
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<{ project: ProjectEntry; history: CodexThreadHistory } | undefined>();
  const [availableFiles, setAvailableFiles] = useState<ProjectFileInfo[]>([]);
  const [commandMenu, setCommandMenu] = useState<'skills' | 'files' | undefined>();
  const [commandQuery, setCommandQuery] = useState('');
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);
  const [branchInfoByProject, setBranchInfoByProject] = useState<Record<string, GitBranchInfo>>({});
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [inlineMenuOpen, setInlineMenuOpen] = useState<'model' | 'reasoning' | 'permission' | undefined>();
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
  const [projectSelectorPosition, setProjectSelectorPosition] = useState<{ top: number; left: number } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [model, setModel] = useState(defaultModel);
  const [availableModels, setAvailableModels] = useState<CodexModelInfo[]>(fallbackModels);
  const pendingDraftsRef = useRef(new Map<string, string>());
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [fullAccessConfirmationOpen, setFullAccessConfirmationOpen] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<CodexBootstrapStatus | undefined>();
  const [bootstrapHelpOpen, setBootstrapHelpOpen] = useState(false);
  const [projectOnboardingOpen, setProjectOnboardingOpen] = useState(false);
  const [historyProjectCandidates, setHistoryProjectCandidates] = useState<CodexProjectCandidate[]>([]);
  const [selectedOnboardingProjectIds, setSelectedOnboardingProjectIds] = useState<Set<string>>(() => new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => { try { const saved: unknown = JSON.parse(localStorage.getItem('gwira.sidebar.expanded-projects.v1') ?? 'null'); if (Array.isArray(saved)) return new Set(saved.filter((id): id is string => typeof id === 'string')); } catch { /* preference only */ } return new Set(projectState.activeProjectId ? [projectState.activeProjectId] : []); });
  useEffect(() => { try { localStorage.setItem('gwira.sidebar.expanded-projects.v1', JSON.stringify([...expandedProjectIds])); } catch { /* preference only */ } }, [expandedProjectIds]);
  const [historiesByProject, setHistoriesByProject] = useState<Record<string, CodexThreadHistory[]>>({});
  const homeRestoreAttemptedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const conversationScroll = useConversationScroll(transcriptRef, session?.messages, activeSessionId, activeView === 'home' || activeView === 'chat');
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const branchControlRef = useRef<HTMLDivElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const projectMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const inlineMenuRef = useRef<HTMLDivElement | null>(null);
  const resizeComposerFrameRef = useRef<number | undefined>(undefined);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | undefined>();
  const [projectMenuPosition, setProjectMenuPosition] = useState<{ top: number; left: number } | undefined>();
  const projectStateRef = useRef(projectState);
  const sessionRef = useRef<CodexSession | undefined>(session);
  const sessionsByIdRef = useRef<Record<string, CodexSession>>({});
  const activeSessionIdRef = useRef<string | undefined>(activeSessionId);
  const recentSessionsRef = useRef<Record<string, CodexSession>>({});
  const gwiraStateRef = useRef(gwiraState);
  const workspaceTabsRef = useRef(workspaceTabs);
  const codingTaskLaunchesRef = useRef(new Set<string>());
  const dashboardHandoffRef = useRef(false);
  const intentionallyStoppedTaskSessionsRef = useRef(new Set<string>());
  const [startingCodingTaskIds, setStartingCodingTaskIds] = useState<Set<string>>(() => new Set());
  const [stoppingCodingTaskIds, setStoppingCodingTaskIds] = useState<Set<string>>(() => new Set());

  workspaceTabsRef.current = workspaceTabs;

  const activeProject = useMemo(() => projectState.projects.find((project) => project.id === projectState.activeProjectId) ?? projectState.projects[0], [projectState]);
  const openProjectMenu = useMemo(() => projectState.projects.find((project) => project.id === openProjectMenuId), [openProjectMenuId, projectState.projects]);
  const gitBranches = activeProject ? branchInfoByProject[activeProject.id] ?? emptyGitBranches : emptyGitBranches;
  const enabledSkills = useMemo(() => availableSkills.filter((skill) => skill.enabled !== false), [availableSkills]);
  const commandItems = useMemo(() => commandMenu === 'skills'
    ? enabledSkills.filter((skill) => commandMatches(`${skill.name} ${skill.description ?? ''} ${skill.id}`, commandQuery)).slice(0, 12)
    : searchProjectFiles(availableFiles, commandQuery, 18), [availableFiles, commandMenu, commandQuery, enabledSkills]);
  const selectedModelInfo = useMemo(() => availableModels.find((option) => option.slug === model), [availableModels, model]);
  const supportedReasoningOptions = useMemo(() => supportedReasoningForModel(selectedModelInfo), [selectedModelInfo]);
  const activeStatus = session?.status ?? 'idle';
  const canSend = activeStatus !== 'running' && (input.trim().length > 0 || attachments.length > 0 || selectedSkills.length > 0 || selectedFiles.length > 0);
  const hasConversationBreadcrumb = Boolean(session?.codexConversationId && session.messages.some((message) => message.role === 'user'));
  const doatRecords = useMemo(() => gwiraState.doats.map((entry) => doatToUiRecord(entry as Doat, gwiraState)), [gwiraState]);
  const selectedDoat = selectedDoatId ? doatRecords.find((entry) => entry.id === selectedDoatId) : undefined;
  const navigationTabId = workspaceTabs.activeGlobalTabId ?? '';
  const navigationHistory = navigationHistoriesRef.current[navigationTabId] ?? { views: [activeView], index: 0 };
  const canGoBack = navigationHistory.index > 0;
  const canGoForward = navigationHistory.index < navigationHistory.views.length - 1;

  function persistWorkspaceTabs(next: WorkspaceTabsState): void {
    workspaceTabsRef.current = next;
    setWorkspaceTabs(next);
  }

  function activateWorkspaceTab(tab: WorkspaceTab, restoreHome = false): void {
    const destination = tab.destination;
    const selected = selectWorkspaceTab(workspaceTabsRef.current, tab.id);
    const tool = ['launcher', 'files', 'file', 'terminal', 'work-sessions'].includes(destination.type);
    persistWorkspaceTabs(tool ? { ...selected, workspaceCollapsed: false } : selected);
    if (destination.type === 'launcher' || destination.type === 'files' || destination.type === 'file' || destination.type === 'terminal' || destination.type === 'work-sessions') {
      setWorkPreferences(current => ({ ...current, open: false }));
      setActiveDock('work');
      setRightDockCollapsed(false);
    } else if (destination.type === 'task') {
      setRequestedBusinessTaskId(destination.taskId);
      setActiveView('my-work');
    } else if (destination.type === 'doat') {
      const doat = gwiraStateRef.current.doats.find((entry) => entry.id === destination.doatId && !entry.archivedAt);
      if (!doat) {
        setError('This Doat is no longer available in the current workspace.');
        return;
      }
      setSelectedDoatId(doat.id);
      setDoatScreen('profile');
      setActiveView('doats');
    } else if (destination.type === 'project') {
      const project = projectStateRef.current.projects.find((entry) => entry.id === destination.projectId);
      if (project) selectProject(project);
      else setError('This project is no longer available.');
    } else if (destination.type === 'conversation') {
      const project = projectStateRef.current.projects.find((entry) => entry.id === destination.projectId);
      const history = historiesByProject[destination.projectId]?.find((entry) => entry.id === destination.conversationId);
      if (!project) {
        setError('The project for this conversation is no longer available.');
      } else if (history) {
        void openHistory(project, history);
      } else {
        setActiveView('home');
        void loadConversationTab(project, destination.conversationId);
      }
    } else {
      const view = destination.view;
      setActiveView(view);
      if (view === 'doats') {
        setDoatScreen('directory');
        setSelectedDoatId(undefined);
      }
      if (view === 'home') {
        if (restoreHome) openHome();
        else activateSession(undefined);
      }
    }
  }

  function openWorkspaceDestination(destination: WorkspaceDestination): void {
    const next = ['launcher', 'files', 'file', 'terminal', 'work-sessions'].includes(destination.type)
      ? openWorkspaceTab(workspaceTabsRef.current, destination)
      : navigateGlobalTab(workspaceTabsRef.current, destination);
    persistWorkspaceTabs(next);
    const active = next.tabs.find((tab) => tab.id === next.activeTabId);
    if (active) activateWorkspaceTab(active);
  }

  useEffect(()=>{const open=()=>{if(location.hash.startsWith('#views/'))openWorkspaceView('organization');};open();window.addEventListener('hashchange',open);return()=>window.removeEventListener('hashchange',open);},[]);
  function launchTool(id: 'files'|'terminal'|'sessions'): void {
    const destination: WorkspaceDestination = id === 'sessions' ? { type: 'work-sessions' } : { type: id };
    const state = workspaceTabsRef.current;
    const target = state.workspaceTabs?.find(tab => tab.id === state.activeWorkspaceTabId) ?? state.workspaceTabs?.[0];
    if (!target) {
      setError('Workspace tabs are unavailable. Reload Gwira and try again.');
      return;
    }
    const next = replaceWorkspaceTab(state, target.id, destination);
    persistWorkspaceTabs(next);
    const tab = next.tabs.find(item => item.id === next.activeTabId);
    if (tab) activateWorkspaceTab(tab);
  }

  function registerTerminalSession(sessionId: string, createNewTab: boolean): void {
    const state = workspaceTabsRef.current;
    const tabs = state.workspaceTabs ?? state.tabs.filter(tab => ['launcher', 'files', 'file', 'terminal', 'work-sessions'].includes(tab.destination.type));
    const active = tabs.find(tab => tab.id === state.activeWorkspaceTabId);
    let next: WorkspaceTabsState;
    if (!createNewTab && active?.destination.type === 'terminal') {
      const assignedBefore = tabs.slice(0, tabs.indexOf(active)).filter(tab => tab.destination.type === 'terminal' && !!tab.destination.sessionId).length;
      const destination: WorkspaceDestination = {
        type: 'terminal',
        sessionId,
        ...(assignedBefore > 0 ? { label: `Terminal ${assignedBefore + 1}` } : {})
      };
      next = replaceWorkspaceTab(state, active.id, destination);
    } else {
      const sessionCount = tabs.filter(tab => tab.destination.type === 'terminal' && !!tab.destination.sessionId).length;
      next = openWorkspaceTab(state, {
        type: 'terminal',
        sessionId,
        ...(sessionCount > 0 ? { label: `Terminal ${sessionCount + 1}` } : {})
      });
    }
    persistWorkspaceTabs(next);
    const tab = next.workspaceTabs?.find(item => item.id === next.activeWorkspaceTabId);
    if (tab) activateWorkspaceTab(tab);
  }

  function openWorkspaceView(view: WorkspaceNavigation): void {
    openWorkspaceDestination({ type: 'view', view: view === 'chat' ? 'home' : view });
  }

  useEffect(() => { if (activeView !== 'home' && activeView !== 'chat') setScheduleDraftKey(undefined); }, [activeView]);

  function draftScheduleSuggestion(instructions: string): void {
    // A distinct key preserves any existing Home/session draft verbatim.
    const key = `schedule-intake:${gwiraStateRef.current.workspace.id}:${crypto.randomUUID()}`;
    setConversationDraft(key, scheduleDraftInstruction(instructions));
    setScheduleDraftKey(key);
    activateSession(undefined);
    showHomeTabWithoutRestore();
    setCommandMenu(undefined);
    requestAnimationFrame(() => { const composer = composerTextareaRef.current; composer?.focus(); if (composer) composer.setSelectionRange(composer.value.length, composer.value.length); });
  }

  function showHomeTabWithoutRestore(): void {
    const next = navigateGlobalTab(workspaceTabsRef.current, { type: 'view', view: 'home' });
    persistWorkspaceTabs(next);
    setActiveView('home');
  }

  async function closeWorkspaceDestination(tab: WorkspaceTab): Promise<void> {
    if (tab.destination.type === 'terminal' && tab.destination.sessionId) {
      try {
        const closed = await window.codexDesktop.terminal.close(tab.destination.sessionId);
        if (!closed) return;
      } catch (reason) {
        setError(reason instanceof Error ? `Could not close the terminal: ${reason.message}` : 'Could not close the terminal. Try again.');
        return;
      }
    }
    const current = workspaceTabsRef.current;
    const next = closeWorkspaceTab(current, tab.id);
    persistWorkspaceTabs(next);
    const global = (current.globalTabs ?? []).some(item => item.id === tab.id);
    if (global ? current.activeGlobalTabId === tab.id : current.activeWorkspaceTabId === tab.id) {
      const activeId = global ? next.activeGlobalTabId : next.activeWorkspaceTabId;
      const active = next.tabs.find((item) => item.id === activeId);
      if (active) activateWorkspaceTab(active);
    }
  }

  function switchWorkspaceTab(direction: -1 | 1): void {
    const current = workspaceTabsRef.current;
    const globalTabsForCurrent = current.globalTabs ?? current.tabs.filter(tab => ['view', 'task', 'doat', 'project', 'conversation'].includes(tab.destination.type));
    const workspaceTabsForCurrent = current.workspaceTabs ?? current.tabs.filter(tab => ['launcher', 'files', 'file', 'terminal', 'work-sessions'].includes(tab.destination.type));
    const activeGroup = globalTabsForCurrent.some((tab) => tab.id === current.activeTabId) ? 'global' : 'workspace';
    const tabs = activeGroup === 'global' ? globalTabsForCurrent : workspaceTabsForCurrent;
    const index = tabs.findIndex((tab) => tab.id === current.activeTabId);
    if (index < 0 || tabs.length < 2) return;
    const next = tabs[(index + direction + tabs.length) % tabs.length]!;
    if (activeGroup === 'global') {
      const nextState = selectWorkspaceTab(current, next.id);
      persistWorkspaceTabs(nextState);
    } else {
      const nextState = selectWorkspaceTab(current, next.id);
      persistWorkspaceTabs(nextState);
    }
  }

  function labelForWorkspaceTab(tab: WorkspaceTab): string {
    const destination = tab.destination;
    if (destination.type === 'task') return gwiraState.tasks.find((task) => task.id === destination.taskId)?.title ?? 'Unavailable task';
    if (destination.type === 'doat') return gwiraState.doats.find((doat) => doat.id === destination.doatId)?.identity.name ?? 'Unavailable Doat';
    if (destination.type === 'project') return projectState.projects.find((project) => project.id === destination.projectId)?.name ?? 'Unavailable project';
    return workspaceTabLabel(destination, (item) => item.type === 'conversation'
      ? historiesByProject[item.projectId]?.find((history) => history.id === item.conversationId)?.title
      : undefined);
  }

  const workspaceTabChoices = useMemo<WorkspaceTabChoice[]>(() => {
    return [
      ...WORKSPACE_NAVIGATION_ITEMS.map(({ view, label }) => ({ destination: { type: 'view' as const, view }, label })),
      ...gwiraState.tasks.map((task) => ({ destination: { type: 'task' as const, taskId: task.id }, label: task.title, detail: 'Task · My Work' })),
      ...gwiraState.doats.filter((doat) => !doat.archivedAt).map((doat) => ({ destination: { type: 'doat' as const, doatId: doat.id }, label: doat.identity.name, detail: 'Doat profile' })),
      ...projectState.projects.map((project) => ({ destination: { type: 'project' as const, projectId: project.id }, label: project.name, detail: 'Project · Home' })),
      ...Object.entries(historiesByProject).flatMap(([projectId, histories]) => {
        const project = projectState.projects.find((entry) => entry.id === projectId);
        return project ? histories.map((history) => ({
          destination: { type: 'conversation' as const, projectId, conversationId: history.id },
          label: history.title || 'Untitled conversation',
          detail: `Conversation · ${project.name}`
        })) : [];
      })
    ];
  }, [gwiraState.doats, gwiraState.tasks, historiesByProject, projectState.projects]);

  useEffect(() => {
    try { localStorage.setItem(workspaceTabsStorageKey, JSON.stringify(workspaceTabs)); } catch (errorValue) {
      setError(errorValue instanceof Error ? `Could not save open tabs: ${errorValue.message}` : 'Could not save open tabs.');
    }
  }, [workspaceTabs]);

  useEffect(() => {
    try { localStorage.setItem('gwira.dashboard.context-panel-open', String(dashboardInspectorOpen)); } catch (errorValue) {
      setError(errorValue instanceof Error ? `Could not save inspector preference: ${errorValue.message}` : 'Could not save inspector preference.');
    }
  }, [dashboardInspectorOpen]);

  useEffect(() => {
    try { localStorage.setItem('gwira.sidebar.collapsed', String(sidebarCollapsed)); } catch { /* preference only */ }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 899px)');
    const onChange = (event: MediaQueryListEvent): void => { setNarrowWindow(event.matches); if (!event.matches) setNarrowSidebarOpen(false); };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => { setNarrowSidebarOpen(false); }, [activeView]);

  const [scheduleSidebarTarget, setScheduleSidebarTarget] = useState<HTMLDivElement | null>(null);
  const effectiveSidebarCollapsed = narrowWindow ? !narrowSidebarOpen : (firstRunActive && !firstRunSidebarOpened) || sidebarCollapsed;
  function workspaceWidthLimits(width = window.innerWidth): { min: number; max: number } {
    const availableSidebarWidth = effectiveSidebarCollapsed ? 64 : 324;
    const max = width <= 1100
      ? Math.min(650, width * 0.7, width - availableSidebarWidth)
      : Math.min(650, width - availableSidebarWidth - 460);
    const maxWidth = Math.max(0, Math.floor(max));
    return { min: Math.min(260, maxWidth), max: maxWidth };
  }
  function constrainedWorkspaceWidth(width: number, limits = workspaceWidthLimits()): number {
    return Math.max(limits.min, Math.min(limits.max, clampWorkspaceWidth(width)));
  }
  function setPreferredWorkspaceWidth(width: number): void {
    const nextWidth = constrainedWorkspaceWidth(width);
    setWorkPreferences(current => current.workspaceWidth === nextWidth ? current : { ...current, workspaceWidth: nextWidth });
  }
  useEffect(() => {
    let clampTimer: number | undefined;
    const clampSavedWidth = (): void => {
      const width = window.innerWidth;
      setViewportWidth(current => current === width ? current : width);
      if (clampTimer !== undefined) window.clearTimeout(clampTimer);
      clampTimer = window.setTimeout(() => {
        setWorkPreferences(current => {
          const workspaceWidth = constrainedWorkspaceWidth(current.workspaceWidth, workspaceWidthLimits(window.innerWidth));
          return current.workspaceWidth === workspaceWidth ? current : { ...current, workspaceWidth };
        });
      }, 120);
    };
    clampSavedWidth();
    window.addEventListener('resize', clampSavedWidth);
    return () => {
      window.removeEventListener('resize', clampSavedWidth);
      if (clampTimer !== undefined) window.clearTimeout(clampTimer);
    };
  }, [effectiveSidebarCollapsed, narrowWindow]);
  function toggleSidebar(): void {
    if (narrowWindow) setNarrowSidebarOpen((open) => !open);
    else if (firstRunActive && !firstRunSidebarOpened) { setFirstRunSidebarOpened(true); setSidebarCollapsed(false); }
    else setSidebarCollapsed((value) => !value);
  }

  useEffect(() => {
    const active = workspaceTabs.tabs.find((tab) => tab.id === workspaceTabs.activeTabId);
    if (active && ['launcher','files','file','terminal'].includes(active.destination.type)) {
      const base = (workspaceTabs.recent ?? []).map(id => workspaceTabs.tabs.find(tab => tab.id === id)).find(tab => tab && !['launcher','files','file','terminal'].includes(tab.destination.type));
      if (base) activateWorkspaceTab(base, true);
    }
    if (active) activateWorkspaceTab(active, true);
    // First-run Home starts with the right Workspace collapsed; opening the plan reveals it. Saved tabs are left untouched.
    if (firstRunActive) setRightDockCollapsed(true);
    // Restored navigation is applied once; tab changes are activated directly by interaction handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!navigationTabId) return;
    const history = navigationHistoriesRef.current[navigationTabId];
    if (!history) {
      navigationHistoriesRef.current[navigationTabId] = { views: [activeView], index: 0 };
      return;
    }
    if (history.views[history.index] === activeView) return;
    const views = [...history.views.slice(0, history.index + 1), activeView].slice(-100);
    navigationHistoriesRef.current[navigationTabId] = { views, index: views.length - 1 };
    setNavigationVersion((version) => version + 1);
  }, [activeView, navigationTabId]);

  function goBack(): void {
    const history = navigationHistoriesRef.current[navigationTabId];
    if (!history || history.index === 0) return;
    history.index -= 1;
    setNavigationVersion((version) => version + 1);
    openWorkspaceView(history.views[history.index] ?? 'home');
  }

  function goForward(): void {
    const history = navigationHistoriesRef.current[navigationTabId];
    if (!history || history.index >= history.views.length - 1) return;
    history.index += 1;
    setNavigationVersion((version) => version + 1);
    openWorkspaceView(history.views[history.index] ?? 'home');
  }

  useEffect(() => {
    projectStateRef.current = projectState;
    localStorage.setItem(projectsStorageKey, JSON.stringify(projectState));
  }, [projectState]);

  useEffect(() => {
    gwiraStateRef.current = gwiraState;
    try {
      saveGwiraLocalState(localStorage, gwiraState);
    } catch (value) {
      // A quota/privacy failure must not take down the renderer or imply the
      // operation was persisted. State remains available for this session.
      setError(`Gwira workspace could not be saved locally: ${value instanceof Error ? value.message : String(value)}`);
    }
  }, [gwiraState]);

  useEffect(() => {
    try {
      if (localStorage.getItem(GWIRA_LOCAL_STORAGE_RECOVERY_KEY)) {
        setError('Gwira found malformed local workspace data and preserved a recovery copy before starting a new local workspace.');
      }
    } catch {
      setError('Gwira local workspace storage is unavailable. Changes will not persist after restart.');
    }
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    void window.codexDesktop.listModels().then((models) => {
      const nextModels = models.length > 0 ? models : fallbackModels;
      setAvailableModels(nextModels);
    }).catch(() => {
      setAvailableModels([]);
    });
  }, []);

  useEffect(() => {
    void window.codexDesktop.getCodexBootstrapStatus().then((status) => {
      setBootstrapStatus(status);
      if (!status.installed) setBootstrapHelpOpen(true);
    }).catch(() => {
      setBootstrapStatus({ installed: false, platform: 'darwin', missing: ['Codex CLI'], canInstall: false });
      setBootstrapHelpOpen(true);
    });
  }, []);

  useEffect(() => {
    void window.codexDesktop.listSkills().then(setAvailableSkills);
  }, []);

  useEffect(() => {
    void window.codexDesktop.listHistoryProjects().then(setHistoryProjectCandidates).catch(() => setHistoryProjectCandidates([]));
  }, []);


  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;
    void window.codexDesktop.listProjectFiles(activeProject.path)
      .then((files) => {
        if (!cancelled) setAvailableFiles(files);
      })
      .catch((errorValue) => {
        if (!cancelled) setError(errorValue instanceof Error ? errorValue.message : 'Failed to load project files');
      });
    setBranchMenuOpen(false);
    setProjectSelectorOpen(false);
    setProjectSelectorPosition(undefined);
    return () => { cancelled = true; };
  }, [activeProject?.id, activeProject?.path]);

  useEffect(() => {
    if (projectState.projects.length > 0 && projectOnboardingOpen) setProjectOnboardingOpen(false);
  }, [projectOnboardingOpen, projectState.projects.length]);

  useEffect(() => {
    const projectKeys = new Set(projectState.projects.map((project) => project.id));
    setBranchInfoByProject((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([projectId]) => projectKeys.has(projectId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    const cancelledProjectIds = new Set<string>();
    for (const project of projectState.projects) {
      void window.codexDesktop.listGitBranches(project.path).then((info) => {
        if (cancelledProjectIds.has(project.id)) return;
        setBranchInfoByProject((current) => ({ ...current, [project.id]: info }));
      });
    }
    return () => {
      for (const project of projectState.projects) cancelledProjectIds.add(project.id);
    };
  }, [projectState.projects.map((project) => `${project.id}\0${project.path}`).join('\0')]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    function closeOnOutsidePointerDown(event: PointerEvent): void {
      if (branchControlRef.current?.contains(event.target as Node)) return;
      setBranchMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!inlineMenuOpen) return;
    function closeInlineMenuOnOutsidePointerDown(event: PointerEvent): void {
      if (inlineMenuRef.current?.contains(event.target as Node)) return;
      setInlineMenuOpen(undefined);
    }
    document.addEventListener('pointerdown', closeInlineMenuOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeInlineMenuOnOutsidePointerDown, true);
  }, [inlineMenuOpen]);

  useEffect(() => {
    if (!openProjectMenuId) return;
    function closeProjectMenuOnOutsidePointerDown(event: PointerEvent): void {
      if (projectMenuRef.current?.contains(event.target as Node)) return;
      setOpenProjectMenuId(undefined);
      setProjectMenuPosition(undefined);
    }
    document.addEventListener('pointerdown', closeProjectMenuOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeProjectMenuOnOutsidePointerDown, true);
  }, [openProjectMenuId]);

  useEffect(() => {
    if (!openProjectMenuId) return;
    function closeProjectMenuOnEscape(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpenProjectMenuId(undefined);
      setProjectMenuPosition(undefined);
      projectMenuTriggerRef.current?.focus();
    }
    document.addEventListener('keydown', closeProjectMenuOnEscape);
    return () => document.removeEventListener('keydown', closeProjectMenuOnEscape);
  }, [openProjectMenuId]);

  useEffect(() => {
    if (supportedReasoningOptions.includes(reasoningEffort)) return;
    setReasoningEffort(normalizeReasoningLevel(selectedModelInfo?.defaultReasoningLevel ?? supportedReasoningOptions[0] ?? 'high'));
  }, [reasoningEffort, selectedModelInfo?.defaultReasoningLevel, supportedReasoningOptions]);

  useEffect(() => {
    setExpandedProjectIds((current) => reconcileExpandedProjects(current, projectState.projects.map((project) => project.id), activeProject?.id));
  }, [activeProject?.id, projectState.projects]);

  useEffect(() => {
    refreshAllProjectHistories();
  }, [projectState.projects]);

  // Restore only the explicitly remembered conversation. This avoids a broad
  // history scan and, because resume only reads persisted messages, never
  // restarts a stopped execution or reruns an instruction.
  useEffect(() => {
    if (homeRestoreAttemptedRef.current) return;
    homeRestoreAttemptedRef.current = true;
    void restoreLastActiveHomeSession();
  }, []);

  useEffect(() => {
    const removeOutput = window.codexDesktop.onOutput((event) => {
      const current = sessionsByIdRef.current[event.sessionId];
      if (!current) return;
      const createdAt = new Date().toISOString();
      const messages = mergeOutputIntoMessages(current.messages, {
        id: `${event.sessionId}-${Date.now()}-${current.messages.length}`,
        role: event.role,
        chunk: event.chunk,
        createdAt
      });
      cacheSession({ ...current, messages, updatedAt: createdAt });
    });

    const removeExit = window.codexDesktop.onExit((event) => {
      const current = sessionsByIdRef.current[event.sessionId] ?? event.session;
      if (!current) return;
      const updatedAt = new Date().toISOString();
      const completedSession: CodexSession = {
        ...current,
        codexConversationId: event.session?.codexConversationId ?? current.codexConversationId,
        status: event.status,
        exitCode: event.exitCode,
        error: event.error,
        updatedAt: event.session?.updatedAt || updatedAt
      };
      cacheSession(completedSession);
      const savedDraft = pendingDraftsRef.current.get(event.sessionId);
      pendingDraftsRef.current.delete(event.sessionId);
      if (event.status === 'error' && savedDraft) {
        setConversationDraft(event.sessionId, value => value || savedDraft);
        if (activeSessionIdRef.current === event.sessionId) setError("Gwira couldn't complete this request right now. Your message is saved. Review any completed work before sending again.");
      }
      if (completedSession.codexConversationId) recentSessionsRef.current[completedSession.codexConversationId] = completedSession;
      mergeCompletedSessionHistory(completedSession);
      updateCodingTaskAfterExit(event, updatedAt);
      void refreshProjectHistories(completedSession.cwd);
    });

    return () => {
      removeOutput();
      removeExit();
    };
  }, []);



  useEffect(() => {
    scheduleComposerTextareaResize();
  }, [input, attachments.length, selectedSkills.length, selectedFiles.length, activeView]);

  useEffect(() => {
    if (commandActiveIndex >= commandItems.length) {
      setCommandActiveIndex(Math.max(0, commandItems.length - 1));
    }
  }, [commandActiveIndex, commandItems.length]);

  useEffect(() => {
    window.addEventListener('resize', scheduleComposerTextareaResize);
    return () => {
      window.removeEventListener('resize', scheduleComposerTextareaResize);
      if (resizeComposerFrameRef.current !== undefined) window.cancelAnimationFrame(resizeComposerFrameRef.current);
    };
  }, []);

  function cacheSession(nextSession: CodexSession): void {
    const nextSessions = { ...sessionsByIdRef.current, [nextSession.id]: nextSession };
    sessionsByIdRef.current = nextSessions;
    setSessionsById(nextSessions);
    if (activeSessionIdRef.current === nextSession.id) {
      sessionRef.current = nextSession;
      setSession(nextSession);
      const project = projectStateRef.current.projects.find((item) => normalizeProjectPath(item.path) === normalizeProjectPath(nextSession.cwd));
      if (project && nextSession.codexConversationId) rememberHomeSession(project, nextSession.codexConversationId, nextSession.updatedAt);
    }
  }

  function dispatchGwira(command: GwiraCommand): void {
    setGwiraState((current) => reduceGwira(current, command));
  }

  function currentPerson(): Assignee | undefined {
    const person = gwiraStateRef.current.people[0];
    return person ? { kind: 'person', id: person.id } : undefined;
  }

  function updateCodingTaskAfterExit(event: Parameters<typeof mapCodexExitToAgentRun>[1], at: string): void {
    const knownTask = gwiraStateRef.current.tasks.find((item) => item.agentRun?.sessionId === event.sessionId);
    if (knownTask) {
      codingTaskLaunchesRef.current.delete(knownTask.id);
      setStartingCodingTaskIds((ids) => { const next = new Set(ids); next.delete(knownTask.id); return next; });
      setStoppingCodingTaskIds((ids) => {
        if (!ids.has(knownTask.id)) return ids;
        const next = new Set(ids); next.delete(knownTask.id); return next;
      });
    }
    const wasStopped = intentionallyStoppedTaskSessionsRef.current.delete(event.sessionId);
    setGwiraState((current) => {
      const task = current.tasks.find((item) => item.agentRun?.sessionId === event.sessionId);
      if (!task) return current;
      const agentRun = mapCodexExitToAgentRun(task.agentRun, event, at, wasStopped);
      if (!agentRun) return current;
      let next = reduceGwira(current, { type: 'SET_AGENT_RUN', taskId: task.id, agentRun, at, activityId: gwiraId() });
      if (agentRun.status === 'completed' && task.status === 'in_progress') {
        next = reduceGwira(next, { type: 'TRANSITION_TASK', taskId: task.id, status: 'in_review', at, activityId: gwiraId(), actor: task.assignee });
        const resultId = agentRun.codexConversationId ?? agentRun.sessionId;
        next = reduceGwira(next, { type: 'REQUEST_APPROVAL', approval: { id: gwiraId(), taskId: task.id, resultId, requestedBy: task.assignee!, status: 'pending', createdAt: at }, activityId: gwiraId() });
      } else if (agentRun.status === 'stopped' && task.status === 'in_progress') {
        next = reduceGwira(next, { type: 'TRANSITION_TASK', taskId: task.id, status: 'todo', at, activityId: gwiraId(), actor: task.assignee });
      } else if (agentRun.status === 'error' && task.status === 'in_progress') {
        next = reduceGwira(next, { type: 'TRANSITION_TASK', taskId: task.id, status: 'blocked', at, activityId: gwiraId(), actor: task.assignee });
      }
      return next;
    });
  }

  function createTask(input: NewTaskInput): string {
    const now = new Date().toISOString();
    const id = gwiraId();
    dispatchGwira({ type: 'CREATE_TASK', task: { id, workspaceId: gwiraStateRef.current.workspace.id, title: input.title, description: input.description, projectId: input.projectId, priority: input.priority, dueDate: input.dueDate, assignee: input.assignee, status: 'todo', createdAt: now, updatedAt: now }, activityId: gwiraId() });
    return id;
  }

  function updateTask(taskId: string, input: TaskUpdateInput): void {
    dispatchGwira({ type: 'UPDATE_TASK', taskId, ...input, at: new Date().toISOString(), activityId: gwiraId() });
  }

  function transitionTask(taskId: string, status: TaskStatus): void {
    dispatchGwira({ type: 'TRANSITION_TASK', taskId, status, at: new Date().toISOString(), activityId: gwiraId(), actor: currentPerson() });
  }

  function addTaskComment(taskId: string, body: string): void {
    const author = currentPerson();
    if (!author) { setError('Add a team member before posting task comments.'); return; }
    const now = new Date().toISOString();
    dispatchGwira({ type: 'ADD_COMMENT', comment: { id: gwiraId(), taskId, author, body, createdAt: now }, activityId: gwiraId() });
  }

  function decideApproval(approvalId: string, status: 'approved' | 'changes_requested'): void {
    const actor = currentPerson();
    if (!actor) { setError('Add a team member before reviewing an approval.'); return; }
    dispatchGwira({ type: 'DECIDE_APPROVAL', approvalId, status, actor, at: new Date().toISOString(), activityId: gwiraId() });
  }

  function saveWorkforce(action: WorkforceAction): void {
    const current = gwiraStateRef.current;
    const next = applyWorkforceAction(current, action, gwiraId(), new Date().toISOString());
    try { saveGwiraLocalState(localStorage, next); } catch { throw new Error('Changes could not be saved on this device. Check device storage and try again.'); }
    gwiraStateRef.current = next;
    setGwiraState(next);
  }

  function addCodingAgent(input: NewCodingAgentInput): void {
    const agent: Agent = { id: gwiraId(), workspaceId: gwiraStateRef.current.workspace.id, name: input.name, type: 'coding', createdAt: new Date().toISOString() };
    dispatchGwira({ type: 'ADD_AGENT', agent });
  }

  function createDoat(draft: DoatDraft): void {
    const now = new Date().toISOString();
    const id = gwiraId();
    const providerAvailable = bootstrapStatus?.installed === true;
    const palette = DOAT_PALETTES.find((item) => item.primary.toLowerCase() === draft.avatar.primaryColor.toLowerCase()) ?? DOAT_PALETTES[0];
    const shape = ({ orb: 'orb', prism: 'prism', leaf: 'capsule', satellite: 'halo', arch: 'facet' } as const)[draft.avatar.shape];
    const visual = createProceduralVisualRevision({ doatId: id, name: draft.name, role: draft.role, personality: draft.personality, capabilityIds: providerAvailable ? ['codex-cli'] : [], generationKey: `initial:${draft.avatar.seed}`, shapePreference: shape, paletteId: palette.id, accessory: draft.avatar.accessory === 'halo' ? 'orbit' : draft.avatar.accessory ?? 'none' }, 1, now);
    const doat: Doat = {
      id, workspaceId: gwiraStateRef.current.workspace.id, createdAt: now, updatedAt: now,
      identity: { name: draft.name, role: draft.role, department: draft.roleCategory.replaceAll('_', ' '), description: draft.objective, personality: draft.personality, communicationStyle: draft.communicationStyle },
      intelligence: providerAvailable ? { providerId: 'codex-local', providerAvailability: 'configured', instructions: draft.instructions, businessContextRefs: [] } : { providerId: 'unavailable', providerAvailability: 'unavailable', unavailableReason: 'The local Codex CLI is not available.', instructions: draft.instructions, businessContextRefs: [] },
      capabilities: providerAvailable ? [{ id: 'codex-cli', name: 'Local Codex CLI', kind: 'tool', providerId: 'codex-local', available: true }] : [],
      governance: { supervisorPersonId: draft.supervisorId, autonomy: draft.approvalRequired ? 'approval-required' : 'supervised', approvalRequired: draft.approvalRequired, allowedProjectPaths: [], maxConcurrentRuns: 1 },
      appearance: { active: visual, history: [visual] },
      operations: { status: providerAvailable ? 'idle' : 'unavailable', updatedAt: now }
    };
    setGwiraState((current) => {
      let next = current;
      // The matching coding Agent is intentionally created only for the actual
      // local provider. The shared id lets the proven task bridge remain intact.
      if (providerAvailable) next = reduceGwira(next, { type: 'ADD_AGENT', agent: { id, workspaceId: current.workspace.id, name: draft.name, type: 'coding', createdAt: now } });
      next = reduceGwira(next, { type: 'ADD_DOAT', doat, at: now, activityId: gwiraId() });
      gwiraStateRef.current = next;
      return next;
    });
    setSelectedDoatId(id);
    setDoatScreen('profile');
    setError(undefined);
  }

  function updateDoatStatus(doatId: string, status: 'paused' | 'idle'): void {
    const current = gwiraStateRef.current.doats.find((item) => item.id === doatId) as Doat | undefined;
    if (!current || current.archivedAt) return;
    const now = new Date().toISOString();
    dispatchGwira({ type: 'UPDATE_DOAT', doat: { ...current, updatedAt: now, operations: { ...current.operations, status, updatedAt: now } }, at: now, activityId: gwiraId() });
  }

  function archiveDoat(doatId: string): void {
    const current = gwiraStateRef.current.doats.find((item) => item.id === doatId) as Doat | undefined;
    if (!current || current.operations.status === 'working') { setError('Stop active work before archiving a Doat.'); return; }
    const now = new Date().toISOString();
    dispatchGwira({ type: 'UPDATE_DOAT', doat: { ...current, updatedAt: now, archivedAt: now, operations: { ...current.operations, status: 'unavailable', updatedAt: now } }, at: now, activityId: gwiraId() });
    setDoatScreen('directory'); setSelectedDoatId(undefined);
  }

  function renameWorkspace(name: string): void {
    const next = reduceGwira(gwiraStateRef.current, { type: 'RENAME_WORKSPACE', name, at: new Date().toISOString(), activityId: gwiraId() });
    // Settings reports success only after the existing local store accepts it.
    saveGwiraLocalState(localStorage, next);
    gwiraStateRef.current = next;
    setGwiraState(next);
  }

  function updateOrganizationStructure(structure: OrganizationStructure): void {
    const now = new Date().toISOString();
    dispatchGwira({ type: 'SET_ORGANIZATION_STRUCTURE', structure, at: now, activityId: gwiraId() });
  }

  function updateOnboarding(onboarding: LocalOnboardingState): void {
    dispatchGwira({ type: 'SET_ONBOARDING', onboarding });
  }

  function continueOnboarding(): void {
    const now = new Date().toISOString();
    setGwiraState((current) => {
      const nextOnboarding = nextOnboardingState(current.onboarding, now);
      let next = reduceGwira(current, { type: 'SET_ONBOARDING', onboarding: nextOnboarding });
      if (current.onboarding.currentStep === 'organization' && current.onboarding.profile.organizationModel) {
        next = reduceGwira(next, { type: 'SET_ORGANIZATION_STRUCTURE', structure: { ...next.organizationStructure, model: current.onboarding.profile.organizationModel, updatedAt: now }, at: now, activityId: gwiraId() });
      }
      gwiraStateRef.current = next;
      return next;
    });
  }

  function openRecordedWorkRun(taskId: string): void {
    const current=gwiraStateRef.current;
    if(!current.tasks.some(task=>task.id===taskId&&task.workspaceId===current.workspace.id&&task.agentRun))return;
    setWorkPreferences(p=>({...p,open:true,selected:`task:${taskId}`}));
    openWorkspaceDestination({type:'work-sessions'});
  }

  function openBusinessTask(taskId: string): void {
    if (!gwiraStateRef.current.tasks.some((task) => task.id === taskId)) {
      setError('This task is not available in the current workspace.');
      return;
    }
    openWorkspaceDestination({ type: 'task', taskId });
  }

  function linkActiveCodexProject(): void {
    if (!activeProject) { setError('Add or select a local project before linking it to Gwira work.'); return; }
    if (gwiraStateRef.current.projects.some((project) => project.codingProjectPath === activeProject.path)) {
      setError('That local project is already linked to this workspace.');
      return;
    }
    const now = new Date().toISOString();
    dispatchGwira({ type: 'ADD_PROJECT', project: { id: gwiraId(), workspaceId: gwiraStateRef.current.workspace.id, name: activeProject.name, codingProjectPath: activeProject.path, createdAt: now }, activityId: gwiraId() });
    setError(undefined);
  }

  async function startCodingTask(taskId: string): Promise<void> {
    if (codingTaskLaunchesRef.current.has(taskId)) return;
    const validation = validateCodingTaskLaunch(gwiraStateRef.current, taskId, projectStateRef.current.projects);
    if (!validation.ok) { setError(`Cannot start coding task: ${validation.reason.replaceAll('-', ' ')}.`); return; }
    if (validation.task.status !== 'todo') { setError('Move the task to To do before starting the coding agent.'); return; }
    const doat = validation.task.assignee?.kind === 'agent' ? gwiraStateRef.current.doats.find((item) => item.id === validation.task.assignee?.id) as Doat | undefined : undefined;
    if (doat) {
      const activeExecutionCount = gwiraStateRef.current.tasks.filter((task) => task.assignee?.kind === 'agent' && task.assignee.id === doat.id && task.agentRun?.status === 'running').length;
      const plan = planDoatExecution({ doat: { id: doat.id, active: !doat.archivedAt, providerId: doat.intelligence.providerId, paused: doat.operations.status === 'paused', concurrentExecutionLimit: doat.governance.maxConcurrentRuns, activeExecutionCount }, task: validation.task, codingProjectApproved: Boolean(validation.project), codingBridgeAccepted: true });
      if (!plan.ok) { setError(`Cannot start Doat task: ${plan.message}`); return; }
    }
    codingTaskLaunchesRef.current.add(taskId);
    setStartingCodingTaskIds((ids) => new Set(ids).add(taskId));
    setError(undefined);
    const now = new Date().toISOString();
    let startedSession: CodexSession | undefined;
    try {
      const targetSession = await window.codexDesktop.startSession(createCodingTaskStartRequest(validation));
      startedSession = targetSession;
      const runningSession: CodexSession = {
        ...targetSession,
        status: 'running',
        permissionMode: 'default',
        webSearch: false,
        messages: [...targetSession.messages, { id: `task-${targetSession.id}`, role: 'user', text: validation.task.description ? `${validation.task.title}\n\n${validation.task.description}` : validation.task.title, createdAt: now }],
        updatedAt: now
      };
      cacheSession(runningSession);
      setGwiraState((current) => {
        let next = reduceGwira(current, { type: 'TRANSITION_TASK', taskId, status: 'in_progress', at: now, activityId: gwiraId(), actor: validation.task.assignee });
        next = reduceGwira(next, { type: 'SET_AGENT_RUN', taskId, agentRun: associateCodingTaskSession(targetSession, now), at: now, activityId: gwiraId() });
        gwiraStateRef.current = next;
        return next;
      });
      await window.codexDesktop.sendInput({ ...createCodingTaskSendInputRequest(validation.task, targetSession.id), skipUserAppend: true });
    } catch (value) {
      codingTaskLaunchesRef.current.delete(taskId);
      setStartingCodingTaskIds((ids) => { const next = new Set(ids); next.delete(taskId); return next; });
      const message = value instanceof Error ? value.message : String(value);
      setError(`Coding task could not start: ${message}`);
      if (startedSession) {
        const completedAt = new Date().toISOString();
        setGwiraState((current) => {
          const task = current.tasks.find((item) => item.id === taskId);
          if (!task?.agentRun || task.agentRun.sessionId !== startedSession?.id) return current;
          let next = reduceGwira(current, { type: 'SET_AGENT_RUN', taskId, agentRun: { ...task.agentRun, status: 'error', completedAt, error: message }, at: completedAt, activityId: gwiraId() });
          if (task.status === 'in_progress') next = reduceGwira(next, { type: 'TRANSITION_TASK', taskId, status: 'blocked', at: completedAt, activityId: gwiraId(), actor: task.assignee });
          return next;
        });
      }
    }
  }

  async function stopCodingTask(taskId: string): Promise<boolean> {
    const task = gwiraStateRef.current.tasks.find((item) => item.id === taskId);
    if (!task?.agentRun) { setError('This task has no active coding-agent run.'); return false; }
    const allowed = validateCodingTaskStop(task, task.agentRun.sessionId);
    if (!allowed.ok) { setError(`Cannot stop coding task: ${allowed.reason.replaceAll('-', ' ')}.`); return false; }
    intentionallyStoppedTaskSessionsRef.current.add(allowed.sessionId);
    setStoppingCodingTaskIds((ids) => new Set(ids).add(taskId));
    try {
      await window.codexDesktop.stopSession({ sessionId: allowed.sessionId });
      return true;
    } catch (value) {
      intentionallyStoppedTaskSessionsRef.current.delete(allowed.sessionId);
      setStoppingCodingTaskIds((ids) => { const next = new Set(ids); next.delete(taskId); return next; });
      setError(value instanceof Error ? value.message : 'Failed to stop coding task');
      return false;
    }
  }

  function activateSession(nextSession?: CodexSession): void {
    if (nextSession) setScheduleDraftKey(undefined);
    activeSessionIdRef.current = nextSession?.id;
    setActiveSessionId(nextSession?.id);
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (nextSession) {
      const nextSessions = { ...sessionsByIdRef.current, [nextSession.id]: nextSession };
      sessionsByIdRef.current = nextSessions;
      setSessionsById(nextSessions);
      if (nextSession.codexConversationId) recentSessionsRef.current[nextSession.codexConversationId] = nextSession;
    }
  }

  function rememberHomeSession(project: ProjectEntry, conversationId: string, updatedAt: string): void {
    try {
      writeLastActiveHomeSession(localStorage, { projectId: project.id, projectPath: project.path, conversationId, updatedAt });
    } catch {
      // Session restoration is an enhancement; unavailable storage must not
      // affect opening or continuing a conversation.
    }
  }

  function forgetHomeSession(): void {
    try { clearLastActiveHomeSession(localStorage); } catch { /* storage unavailable */ }
  }

  function sessionsForProject(project: ProjectEntry): CodexSession[] {
    return Object.values(sessionsById).filter((item) => normalizeProjectPath(item.cwd) === normalizeProjectPath(project.path));
  }

  function cachedSessionForHistory(project: ProjectEntry, history: CodexThreadHistory): CodexSession | undefined {
    return Object.values(sessionsByIdRef.current).find((item) => normalizeProjectPath(item.cwd) === normalizeProjectPath(project.path) && item.codexConversationId === history.id)
      ?? recentSessionsRef.current[history.id];
  }

  function openCachedSession(project: ProjectEntry, nextSession: CodexSession): void {
    setActiveView('home');
    setProjectState((current) => ({ ...current, activeProjectId: project.id }));
    setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    setError(undefined);
    setModel(availableModels.some(candidate => candidate.slug === nextSession.model) ? nextSession.model : defaultModel);
    activateSession(nextSession);
    if (nextSession.codexConversationId) rememberHomeSession(project, nextSession.codexConversationId, nextSession.updatedAt);
  }

  function refreshAllProjectHistories(): void {
    for (const project of projectState.projects) {
      void refreshProjectHistories(project.path);
    }
  }

  async function refreshProjectHistories(projectPath: string): Promise<void> {
    const project = projectStateRef.current.projects.find((item) => item.path === projectPath);
    if (!project) return;
    try {
      const histories = await window.codexDesktop.listHistories(project.path);
      if (!projectStateRef.current.projects.some((item) => item.id === project.id && item.path === project.path)) return;
      setHistoriesByProject((current) => {
        const projectCompletedSessions = Object.values(sessionsByIdRef.current)
          .filter((item) => item.status !== 'running' && normalizeProjectPath(item.cwd) === normalizeProjectPath(project.path));
        const mergedHistories = projectCompletedSessions.reduce(mergeSessionIntoProjectHistories, histories);
        return { ...current, [project.id]: mergedHistories };
      });
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Failed to load project history');
    }
  }

  function mergeCompletedSessionHistory(completedSession: CodexSession): void {
    const projectId = findProjectIdForSession(projectStateRef.current.projects, completedSession);
    if (!projectId) return;
    setHistoriesByProject((current) => ({
      ...current,
      [projectId]: mergeSessionIntoProjectHistories(current[projectId] || [], completedSession)
    }));
  }

  function startNewThread(project = activeProject): void {
    setScheduleDraftKey(undefined);
    showHomeTabWithoutRestore();
    if (project) {
      setProjectState((current) => ({ ...current, activeProjectId: project.id }));
      setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    }
    activateSession(undefined);
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedFiles([]);
    setError(undefined);
    forgetHomeSession();
  }

  function selectProject(project: ProjectEntry): void {
    setActiveView('home');
    setOpenProjectMenuId(undefined);
    setProjectMenuPosition(undefined);
    setProjectSelectorOpen(false);
    setProjectSelectorPosition(undefined);
    setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    setProjectState((current) => ({ ...current, activeProjectId: project.id }));
    activateSession(undefined);
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedFiles([]);
    setError(undefined);
  }

  function toggleProject(project: ProjectEntry): void {
    setExpandedProjectIds((current) => toggleExpandedProject(current, project.id));
  }

  async function openHistory(project: ProjectEntry, history: CodexThreadHistory): Promise<void> {
    setActiveView(viewAfterOpeningThread(activeView));
    setProjectState((current) => ({ ...current, activeProjectId: project.id }));
    setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    setError(undefined);
    let targetHistory = history;
    const cachedSession = cachedSessionForHistory(project, history);
    if (cachedSession) {
      openCachedSession(project, cachedSession);
      void refreshProjectHistories(project.path);
      return;
    }
    if (!history.filePath) {
      const refreshedHistories = await window.codexDesktop.listHistories(project.path);
      setHistoriesByProject((current) => ({ ...current, [project.id]: refreshedHistories }));
      targetHistory = refreshedHistories.find((item) => item.id === history.id) ?? history;
    }
    try {
      const recordedModel = targetHistory.model;
      const nextSession = await window.codexDesktop.resumeSession({
        cwd: project.path,
        codexConversationId: targetHistory.id,
        title: targetHistory.title,
        filePath: targetHistory.filePath,
        // An existing thread owns its model identity.  Passing the selector's
        // current value here would silently switch the provider/model on resume.
        model: recordedModel,
        reasoningEffort,
        permissionMode
      });
      if (recordedModel) {
        if (availableModels.some((candidate) => candidate.slug === recordedModel)) setModel(recordedModel);
        else setModel(defaultModel);
      }
      activateSession(nextSession);
      rememberHomeSession(project, targetHistory.id, targetHistory.updatedAt);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Failed to open thread');
    }
  }

  async function loadConversationTab(project: ProjectEntry, conversationId: string): Promise<void> {
    try {
      const histories = await window.codexDesktop.listHistories(project.path);
      setHistoriesByProject((current) => ({ ...current, [project.id]: histories }));
      const history = histories.find((item) => item.id === conversationId);
      if (!history) {
        setError('This conversation is no longer available in the selected project.');
        return;
      }
      await openHistory(project, history);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Failed to restore this conversation tab.');
    }
  }

  function requestDeleteHistory(event: React.MouseEvent<HTMLButtonElement>, project: ProjectEntry, history: CodexThreadHistory): void {
    event.preventDefault();
    event.stopPropagation();
    if (!history.filePath) return;
    setHistoryDeleteTarget({ project, history });
  }

  async function confirmDeleteHistory(): Promise<void> {
    const target = historyDeleteTarget;
    if (!target) return;
    setHistoryDeleteTarget(undefined);
    try {
      await window.codexDesktop.deleteHistory({ filePath: target.history.filePath });
      const matchingSessionIds = Object.values(sessionsByIdRef.current)
        .filter((item) => normalizeProjectPath(item.cwd) === normalizeProjectPath(target.project.path) && item.codexConversationId === target.history.id)
        .map((item) => item.id);
      const nextSessions = { ...sessionsByIdRef.current };
      for (const sessionId of matchingSessionIds) delete nextSessions[sessionId];
      sessionsByIdRef.current = nextSessions;
      setSessionsById(nextSessions);
      delete recentSessionsRef.current[target.history.id];
      setHistoriesByProject((current) => ({
        ...current,
        [target.project.id]: (current[target.project.id] || []).filter((history) => history.id !== target.history.id)
      }));
      if (sessionRef.current?.codexConversationId === target.history.id) activateSession(undefined);
      try {
        if (readLastActiveHomeSession(localStorage)?.conversationId === target.history.id) forgetHomeSession();
      } catch { /* storage unavailable */ }
      void refreshProjectHistories(target.project.path);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Failed to delete thread');
    }
  }

  async function restoreLastActiveHomeSession(): Promise<void> {
    let saved;
    try { saved = readLastActiveHomeSession(localStorage); } catch { return; }
    if (!saved) return;
    const project = projectStateRef.current.projects.find((item) => item.id === saved.projectId && normalizeProjectPath(item.path) === normalizeProjectPath(saved.projectPath));
    if (!project) { forgetHomeSession(); return; }
    try {
      const histories = await window.codexDesktop.listHistories(project.path);
      const history = histories.find((item) => item.id === saved!.conversationId);
      setHistoriesByProject((current) => ({ ...current, [project.id]: histories }));
      if (!history) { forgetHomeSession(); return; }
      await openHistory(project, history);
    } catch {
      // An unavailable disk entry is treated like a missing session. Home
      // remains a clean New Chat state rather than surfacing stale content.
      forgetHomeSession();
      activateSession(undefined);
    }
  }

  function openHome(): void {
    setActiveView('home');
    if (sessionRef.current) return;
    void restoreLastActiveHomeSession();
  }

  function handleThreadRowKeyDown(event: React.KeyboardEvent<HTMLElement>, action: () => void): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    action();
  }

  function createSidebarProject(name: string, path: string): void {
    setProjectState(current => {
      const existing = current.projects.some(project => project.path === path);
      const next = addProject(current, path);
      if (!existing) next.projects = next.projects.map(project => project.path === path ? { ...project, name } : project);
      setExpandedProjectIds(expanded => next.activeProjectId ? ensureExpandedProject(expanded, next.activeProjectId) : expanded);
      return next;
    });
    setOpenProjectMenuId(undefined);
    setProjectMenuPosition(undefined);
    setProjectSelectorOpen(false);
    setProjectSelectorPosition(undefined);
    activateSession(undefined);
    setError(undefined);
  }

  async function addProjectFromPicker(): Promise<void> {
    const result = await window.codexDesktop.selectDirectory();
    if (!result.canceled && result.path) {
      setOpenProjectMenuId(undefined);
      setProjectMenuPosition(undefined);
      setProjectSelectorOpen(false);
      setProjectSelectorPosition(undefined);
      setProjectState((current) => {
        const next = addProject(current, result.path!);
        setExpandedProjectIds((expanded) => next.activeProjectId ? ensureExpandedProject(expanded, next.activeProjectId) : expanded);
        return next;
      });
      activateSession(undefined);
      setProjectOnboardingOpen(false);
      setError(undefined);
    }
  }

  function addProjectsFromHistoryCandidates(): void {
    if (selectedOnboardingProjectIds.size === 0) return;
    setProjectState((current) => {
      let next = current;
      for (const candidate of historyProjectCandidates) {
        if (selectedOnboardingProjectIds.has(candidate.id)) next = addProject(next, candidate.path);
      }
      setExpandedProjectIds((expanded) => next.activeProjectId ? ensureExpandedProject(expanded, next.activeProjectId) : expanded);
      return next;
    });
    setSelectedOnboardingProjectIds(new Set());
    setProjectOnboardingOpen(false);
    setError(undefined);
  }

  function toggleOnboardingProject(projectId: string): void {
    setSelectedOnboardingProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleAllOnboardingProjects(): void {
    setSelectedOnboardingProjectIds((current) => {
      if (current.size === historyProjectCandidates.length) return new Set();
      return new Set(historyProjectCandidates.map((candidate) => candidate.id));
    });
  }

  function removeProjectById(projectId: string): void {
    setOpenProjectMenuId(undefined);
    setProjectMenuPosition(undefined);
    setExpandedProjectIds((current) => removeExpandedProject(current, projectId));
    setProjectState((current) => removeProject(current, projectId));
    const removedProject = projectStateRef.current.projects.find((project) => project.id === projectId);
    if (removedProject && sessionRef.current && normalizeProjectPath(sessionRef.current.cwd) === normalizeProjectPath(removedProject.path)) activateSession(undefined);
    setInput('');
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedFiles([]);
    setError(undefined);
  }

  async function stopSession(sendAfter = false): Promise<void> {
    const target = sessionRef.current;
    if (!target || cancellingRef.current) return;
    const original = input;
    const prompt = buildPromptWithAttachments(input, { attachments, skills: selectedSkills, files: selectedFiles }).trim();
    cancellingRef.current = true; setCancelling(true); setError(undefined);
    try {
      const acknowledgement = await requestConversationStop(window.codexDesktop, target.id);
      if (acknowledgement.status === 'error') throw new Error('The run ended with an error. Your draft is saved; review the result before sending again.');
      setConversationNotices((current) => ({ ...current, [target.id]: 'Run stopped. Completed actions were not undone.' }));
      if (sendAfter && prompt) {
        if (activeSessionIdRef.current !== target.id) throw new Error('The run stopped. Return to its conversation to send the saved draft.');
        const sent = await sendPrompt(prompt, target.context ?? 'coding', sessionsByIdRef.current[target.id]);
        if (sent) { setInput((value) => value === original ? '' : value); setAttachments([]); setSelectedFiles([]); setSelectedSkills([]); }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cancellation is not confirmed. Your draft is saved.'); }
    finally { cancellingRef.current = false; setCancelling(false); }
  }

  async function sendPrompt(directPrompt?: string, context: 'business' | 'coding' = 'coding', existingSession?: CodexSession): Promise<boolean> {
    const prompt = (directPrompt ?? buildPromptWithAttachments(input, { attachments, skills: selectedSkills, files: selectedFiles })).trim();
    if (!prompt || submittingRef.current || (existingSession ?? sessionRef.current)?.status === 'running') return false;
    if (shouldBlockSendWithoutProject(projectState.projects.length) || !activeProject) {
      setProjectOnboardingOpen(true);
      return false;
    }
    const currentSession = existingSession ?? sessionRef.current;
    if (currentSession) setConversationNotices((current) => ({ ...current, [currentSession.id]: '' }));
    submittingRef.current = true; setSubmitting(true);
    setError(undefined);

    let submittedSessionId: string | undefined;
    const optimisticId = `user-${Date.now()}`;
    try {
      const targetSession = currentSession ?? await window.codexDesktop.startSession({
        cwd: activeProject.path,
        model,
        reasoningEffort,
        permissionMode,
        webSearch: false,
        context
      });
      submittedSessionId = targetSession.id;
      const optimisticMessage: SessionMessage = {
        id: optimisticId,
        role: 'user',
        text: prompt,
        createdAt: new Date().toISOString()
      };
      const runningSession: CodexSession = {
        ...targetSession,
        model,
        reasoningEffort,
        permissionMode,
        webSearch: false,
        context: targetSession.context ?? context,
        status: 'running',
        messages: [...targetSession.messages, optimisticMessage],
        updatedAt: optimisticMessage.createdAt
      };
      if (!directPrompt) setConversationDraft(targetSession.id, input);
      activateSession(runningSession);
      const selectedModel = model;
      pendingDraftsRef.current.set(targetSession.id, prompt);
      await window.codexDesktop.sendInput({ sessionId: targetSession.id, input: prompt, model: selectedModel, reasoningEffort, permissionMode, webSearch: false, skipUserAppend: true });
      if (!directPrompt && sessionsByIdRef.current[targetSession.id]?.status !== 'error') { setConversationDraft(targetSession.id, ''); setInput(''); setAttachments([]); setSelectedSkills([]); setSelectedFiles([]); }
      return true;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      setError("Gwira couldn't complete this request right now. Your draft is saved.");
      const failedSession = submittedSessionId ? sessionsByIdRef.current[submittedSessionId] : undefined;
      if (failedSession) cacheSession({ ...failedSession, status: 'error', error: message, messages: failedSession.messages.filter((item) => item.id !== optimisticId) });
      return false;
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  async function startDashboardConversation(message: string): Promise<boolean> {
    if (!activeProject || activeStatus === 'running' || dashboardHandoffRef.current) return false;
    dashboardHandoffRef.current = true;
    // Creating the session before navigation gives the handoff a stable id and
    // means Strict Mode or a rerender cannot submit this message twice.
    try {
      const targetSession = await window.codexDesktop.startSession({ cwd: activeProject.path, model, reasoningEffort, permissionMode, webSearch: false, context: 'business' });
      activateSession(targetSession);
      showHomeTabWithoutRestore();
      const accepted = await sendPrompt(message, 'business', targetSession);
      if (!accepted) dashboardHandoffRef.current = false;
      return accepted;
    } catch (handoffError) {
      dashboardHandoffRef.current = false;
      setError(handoffError instanceof Error ? handoffError.message : 'Could not start a new conversation.');
      return false;
    }
  }

  function askAboutDashboardRecord(recordId: string): void {
    showHomeTabWithoutRestore();
    setInput(`Regarding record ${recordId}: `);
  }

  function selectModel(nextModel: string): void {
    setModel(nextModel);
    const current = sessionRef.current;
    if (!current || current.status === 'running' || current.model === nextModel) return;
    // This affects only the live continuation. Historical session metadata is
    // immutable, so a deliberate replacement remains explicit to the user.
    cacheSession({ ...current, model: nextModel, error: undefined });
    setError(undefined);
  }

  async function retryBusinessPrompt(): Promise<boolean> {
    const current = sessionRef.current;
    const lastUserMessage = [...(current?.messages ?? [])].reverse().find((message) => message.role === 'user');
    if (!current || !lastUserMessage || current.status === 'running') return false;
    const running = { ...current, status: 'running' as const, error: undefined };
    cacheSession(running);
    setError(undefined);
    try {
      await window.codexDesktop.sendInput({ sessionId: current.id, input: lastUserMessage.text, model: current.model, reasoningEffort: current.reasoningEffort, permissionMode: current.permissionMode, webSearch: false, skipUserAppend: true });
      return true;
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : String(retryError);
      cacheSession({ ...current, status: 'error', error: message });
      setError("Gwira couldn't complete this request right now. Your draft is saved.");
      return false;
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (commandMenu) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setCommandActiveIndex((current) => commandItems.length === 0 ? 0 : (current + direction + commandItems.length) % commandItems.length);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && commandItems.length > 0) {
        event.preventDefault();
        selectCommandItem(commandItems[Math.min(commandActiveIndex, commandItems.length - 1)]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCommandMenu();
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (sessionRef.current?.status !== 'running') void sendPrompt();
    }
  }

  function handleComposerChange(value: string): void {
    setInput(value);
    const skillQuery = trailingCommandQuery(value, '/');
    const fileQuery = trailingCommandQuery(value, '@');
    if (skillQuery !== undefined) {
      setCommandMenu('skills');
      setCommandQuery(skillQuery);
      setCommandActiveIndex(0);
    } else if (fileQuery !== undefined) {
      setCommandMenu('files');
      setCommandQuery(fileQuery);
      setCommandActiveIndex(0);
    } else if (commandMenu) {
      closeCommandMenu();
    }
  }

  function scheduleComposerTextareaResize(): void {
    if (resizeComposerFrameRef.current !== undefined) window.cancelAnimationFrame(resizeComposerFrameRef.current);
    resizeComposerFrameRef.current = window.requestAnimationFrame(() => {
      resizeComposerFrameRef.current = undefined;
      resizeComposerTextarea();
    });
  }

  function resizeComposerTextarea(): void {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const next = composerTextareaHeight({
      scrollHeight: textarea.scrollHeight,
      containerHeight: workspaceRef.current?.clientHeight || window.innerHeight,
      minHeight: 32
    });
    textarea.style.height = `${next.height}px`;
    textarea.style.overflowY = next.overflowY;
  }

  async function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const imageItems = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    event.preventDefault();
    for (const [index, item] of imageItems.entries()) {
      const file = item.getAsFile();
      if (!file) continue;
      const dataUrl = await readFileAsDataUrl(file);
      const saved = await window.codexDesktop.savePastedImage({ dataUrl, name: file.name || 'image.png' });
      setAttachments((current) => [...current, { id: `${Date.now()}-${index}-${saved.path}`, name: saved.name, path: saved.path, kind: 'image' }]);
    }
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function selectSkill(skill: CodexSkillInfo): void {
    setSelectedSkills((current) => current.some((item) => item.id === skill.id) ? current : [...current, { id: skill.id, name: skill.name, description: skill.description }]);
    setInput((current) => current.replace(/\/[^\s]*$/, '').trimStart());
    closeCommandMenu();
  }

  function selectFile(file: ProjectFileInfo): void {
    setSelectedFiles((current) => current.some((item) => item.path === file.path) ? current : [...current, file]);
    setInput((current) => current.replace(/@[^\s]*$/, '').trimStart());
    closeCommandMenu();
  }

  function selectCommandItem(item: CodexSkillInfo | ProjectFileInfo | undefined): void {
    if (!item) return;
    if (commandMenu === 'skills' && 'id' in item) selectSkill(item);
    if (commandMenu === 'files' && 'relativePath' in item) selectFile(item);
  }

  function closeCommandMenu(): void {
    setCommandMenu(undefined);
    setCommandQuery('');
    setCommandActiveIndex(0);
  }

  function removeSkill(id: string): void {
    setSelectedSkills((current) => current.filter((skill) => skill.id !== id));
  }

  function removeFile(pathValue: string): void {
    setSelectedFiles((current) => current.filter((file) => file.path !== pathValue));
  }

  async function addFilesFromPicker(): Promise<void> {
    try {
    const result = await window.codexDesktop.selectFiles();
    if (result.canceled) return;
    setAttachments((current) => [
      ...current,
      ...result.files.map((file) => ({
        id: `${Date.now()}-${file.path}`,
        name: file.name,
        path: file.path,
        kind: file.kind
      }))
    ]);
    } catch { setError('Could not add files. Your draft is saved. Try choosing the files again.'); }
  }

  async function refreshSkills(): Promise<void> {
    setSkillsLoading(true);
    try {
      setAvailableSkills(await window.codexDesktop.listSkills());
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Failed to load skills');
    } finally {
      setSkillsLoading(false);
    }
  }

  async function openSkillDetail(skillId: string): Promise<void> {
    const detail = await window.codexDesktop.getSkillDetail(skillId);
    if (detail) setSelectedSkillDetail(detail);
  }

  async function setSkillEnabled(skillId: string, enabled: boolean): Promise<void> {
    const skills = await window.codexDesktop.setSkillEnabled(skillId, enabled);
    setAvailableSkills(skills);
    const detail = await window.codexDesktop.getSkillDetail(skillId);
    setSelectedSkillDetail(current => current?.id === skillId ? detail : current);
  }

  async function uninstallSelectedSkill(skillId: string): Promise<void> {
    const skills = await window.codexDesktop.uninstallSkill(skillId);
    setAvailableSkills(skills);
    setSelectedSkillDetail(undefined);
  }

  function startSkillCreatorThread(): void {
    const creator = availableSkills.find((skill) => skill.id === 'skill-creator') ?? {
      id: 'skill-creator',
      name: 'Skill Creator',
      description: 'Guide for creating effective skills.',
      source: ''
    };
    startNewThread();
    setSelectedSkills([{ id: creator.id, name: creator.name, description: creator.description }]);
    setInput('帮我创建一个新的 Gwira skill。请先询问我这个 skill 的用途、触发场景和工作流程。');
  }

  function toggleProjectSelector(button: HTMLButtonElement): void {
    if (projectSelectorOpen) {
      setProjectSelectorOpen(false);
      setProjectSelectorPosition(undefined);
      return;
    }
    const rect = button.getBoundingClientRect();
    const popoverWidth = 340;
    setProjectSelectorPosition({
      top: rect.bottom + 3,
      left: Math.max(10, Math.min(rect.left + rect.width / 2 - popoverWidth / 2, window.innerWidth - popoverWidth - 10))
    });
    setProjectSelectorOpen(true);
  }

  function toggleProjectMenu(project: ProjectEntry, button: HTMLButtonElement): void {
    if (openProjectMenuId === project.id) {
      setOpenProjectMenuId(undefined);
      setProjectMenuPosition(undefined);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 258;
    const menuHeight = 250;
    setOpenProjectMenuId(project.id);
    projectMenuTriggerRef.current = button;
    setProjectMenuPosition({
      top: Math.min(rect.bottom + 7, window.innerHeight - menuHeight - 10),
      left: Math.max(10, Math.min(rect.right - menuWidth + 18, window.innerWidth - menuWidth - 10))
    });
  }

  function requestPermissionMode(nextMode: PermissionMode): void {
    const selection = permissionSelection(permissionMode, nextMode);
    setPermissionMode(selection.mode);
    setFullAccessConfirmationOpen(selection.requiresConfirmation);
  }

  async function switchBranch(branch: string): Promise<void> {
    if (!activeProject || activeStatus === 'running') return;
    const project = activeProject;
    setBranchMenuOpen(false);
    try {
      const next = await window.codexDesktop.switchGitBranch({ cwd: project.path, branch });
      setBranchInfoByProject((current) => ({ ...current, [project.id]: next }));
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Failed to switch Git branch');
    }
  }



  return (
    <main ref={shellRef} className={`shell${workspaceResizing ? ' is-resizing-workspace' : ''}`} style={{'--gw-work-width': `${workPreferences.width}px`,'--gw-workspace-width': `${workPreferences.workspaceWidth}px`,'--gw-shell-sidebar-width':'324px'} as React.CSSProperties} data-work-open={false} data-tools-open={showWorkDock} data-compact-tools={showWorkDock && !currentTool && !launcherOpen} data-assistant-open={showChatDock} data-sidebar={effectiveSidebarCollapsed ? 'collapsed' : 'expanded'} data-narrow={narrowWindow ? 'true' : undefined}>
      <GlobalTopBar
        tabs={workspaceTabs.tabs}
        globalTabs={workspaceTabs.globalTabs ?? globalTabs}
        workspaceTabs={workspaceTabs.workspaceTabs ?? workspaceTabList}
        activeTabId={workspaceTabs.activeTabId}
        activeGlobalTabId={workspaceTabs.activeGlobalTabId}
        activeWorkspaceTabId={workspaceTabs.activeWorkspaceTabId}
        choices={workspaceTabChoices}
        labelFor={labelForWorkspaceTab}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        sidebarCollapsed={effectiveSidebarCollapsed}
        chatOpen={assistantOpen}
        onOpenChat={() => {setActiveDock('chat');setAssistantOpen(open=>!open||!showChatDock);}}
        workSessionsOpen={showWorkDock}
        onOpenWorkSessions={toggleWorkSessions}
        inspectorAvailable={activeView === 'dashboard'}
        inspectorOpen={dashboardInspectorOpen}
        pendingNotifications={inboxCounts(gwiraState).pendingApprovals}
        pendingScheduleReviews={pendingScheduleReviews}
        onGoBack={goBack}
        onGoForward={goForward}
        onToggleSidebar={toggleSidebar}
        onToggleInspector={() => { if (assistantOpen) setAssistantOpen(false); else if (activeView === 'dashboard') setDashboardInspectorOpen((open) => !open); else setAssistantOpen(true); }}
        onActivate={activateWorkspaceTab}
        onActivateGlobal={activateWorkspaceTab}
        onActivateWorkspace={activateWorkspaceTab}
        onClose={closeWorkspaceDestination}
        onCloseGlobal={closeWorkspaceDestination}
        onCloseWorkspace={closeWorkspaceDestination}
        onOpen={(destination) => {
          if (destination.type === 'launcher' || destination.type === 'files' || destination.type === 'file' || destination.type === 'terminal' || destination.type === 'work-sessions') openWorkspaceDestination(destination);
          else openWorkspaceView(destination.type === 'view' ? destination.view : destination.type === 'task' ? 'my-work' : destination.type === 'doat' ? 'doats' : destination.type === 'project' ? 'home' : destination.type === 'conversation' ? 'home' : 'home');
        }}
        onOpenGlobal={(destination) => {
          if (destination.type === 'view') openWorkspaceView(destination.view);
          else if (destination.type === 'task') openWorkspaceView('my-work');
          else if (destination.type === 'doat') openWorkspaceView('doats');
          else if (destination.type === 'project' || destination.type === 'conversation') openWorkspaceView('home');
        }}
        onNewGlobal={() => {
          const next = newGlobalTab(workspaceTabsRef.current);
          persistWorkspaceTabs(next);
          activateSession(undefined);
          setActiveView('home');
        }}
        onOpenWorkspace={openWorkspaceDestination}
        onOpenInbox={() => openWorkspaceView('inbox')}
        onReorder={(tabId, targetId) => persistWorkspaceTabs(reorderWorkspaceTab(workspaceTabsRef.current, tabId, targetId))}
        onReorderGlobal={(tabId, targetId) => persistWorkspaceTabs(reorderWorkspaceTab(workspaceTabsRef.current, tabId, targetId))}
        onReorderWorkspace={(tabId, targetId) => persistWorkspaceTabs(reorderWorkspaceTab(workspaceTabsRef.current, tabId, targetId))}
        onSwitchRelative={switchWorkspaceTab}
        onReopen={() => {
          const next = reopenWorkspaceTab(workspaceTabsRef.current);
          persistWorkspaceTabs(next);
          const tab = (next.workspaceTabs ?? []).find(item => item.id === next.activeWorkspaceTabId) ?? (next.globalTabs ?? []).find(item => item.id === next.activeGlobalTabId);
          if (tab) activateWorkspaceTab(tab);
        }}
      />
      <ProjectSidebar
        dashboardSidebar={<DashboardSidebar key={`${gwiraState.organization.id}:${gwiraState.workspace.id}`} onOpenChannel={(id) => { setRequestedSidebarChannel(previous => ({ id, nonce: (previous?.nonce ?? 0) + 1 })); openWorkspaceView('inbox'); }} state={gwiraState} activeView={activeView} onNavigate={openWorkspaceView} onOpenDoat={(id) => openWorkspaceDestination({ type: 'doat', doatId: id })} onOpenPerson={() => openWorkspaceView('teams')} onCreateDoat={() => { setDoatScreen('create'); openWorkspaceView('doats'); }} onAddPerson={() => openWorkspaceView('teams')} />}
        activeProject={activeProject}
        activeSession={session}
        activeSessionId={activeSessionId}
        activeView={activeView}
        expandedProjectIds={expandedProjectIds}
        historiesByProject={historiesByProject}
        projects={projectState.projects}
        sessionsForProject={sessionsForProject}
        formatRelativeTime={formatRelativeTime}
        onAddProject={addProjectFromPicker}
        onCreateProject={createSidebarProject}
        onDeleteHistory={requestDeleteHistory}
        onNewThread={startNewThread}
        onOpenHistory={(project, history) => openWorkspaceDestination({ type: 'conversation', projectId: project.id, conversationId: history.id })}
        onOpenSession={(project, nextSession) => {
          if (nextSession.codexConversationId) {
            openWorkspaceDestination({ type: 'conversation', projectId: project.id, conversationId: nextSession.codexConversationId });
          } else {
            openWorkspaceView('home');
            openCachedSession(project, nextSession);
          }
        }}
        onProjectKeyDown={handleThreadRowKeyDown}
        scheduleSidebarRef={setScheduleSidebarTarget}
        collapsed={effectiveSidebarCollapsed}
        overlay={narrowWindow && narrowSidebarOpen}
        onSelectBusinessView={openWorkspaceView}
        onOpenHome={() => openWorkspaceView('home')}
        onSelectSkills={() => openWorkspaceView('skills')}
        onToggleProject={toggleProject}
        onToggleProjectMenu={toggleProjectMenu}
        openProjectMenuId={openProjectMenuId}
      />



      {openProjectMenu && projectMenuPosition ? (
        <div className="project-menu project-menu-floating gw-sidebar-overlay" role="menu" aria-label="Project options" onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const index = items.indexOf(document.activeElement as HTMLButtonElement); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus(); } }} ref={projectMenuRef} style={{ top: projectMenuPosition.top, left: projectMenuPosition.left }} onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" disabled title="Project pinning is not implemented yet."><Icon name="pin" /> Pin project</button>
          <button type="button" role="menuitem" disabled title="Task views are not available for projects yet."><Icon name="trace-check" /> View associated tasks</button>
          <button type="button" role="menuitem" disabled title="Opening the local project directory is not implemented yet."><Icon name="external" /> View local directory</button>
          <hr />
          <button type="button" role="menuitem" disabled title="Project details editing is not implemented yet."><Icon name="new-work" /> Edit project details</button>
          <button type="button" role="menuitem" className="danger" onClick={() => removeProjectById(openProjectMenu.id)}><Icon name="close" /> Remove</button>
        </div>
      ) : null}

      {bootstrapStatus && !bootstrapStatus.installed && bootstrapHelpOpen ? (
        <BootstrapHelpModal status={bootstrapStatus} onClose={() => setBootstrapHelpOpen(false)} onRestart={() => window.codexDesktop.restartApp()} />
      ) : null}

      {fullAccessConfirmationOpen ? (
        <FullAccessConfirmationModal
          onCancel={() => setFullAccessConfirmationOpen(false)}
          onConfirm={() => {
            setPermissionMode('full-access');
            setFullAccessConfirmationOpen(false);
          }}
        />
      ) : null}

      {historyDeleteTarget ? (
        <DeleteHistoryModal
          title={historyDeleteTarget.history.title}
          onCancel={() => setHistoryDeleteTarget(undefined)}
          onConfirm={() => { void confirmDeleteHistory(); }}
        />
      ) : null}

      {projectOnboardingOpen ? (
        <ProjectOnboardingModal
          candidates={historyProjectCandidates}
          selectedProjectIds={selectedOnboardingProjectIds}
          canContinue={canContinueProjectOnboarding(selectedOnboardingProjectIds.size)}
          platform={bootstrapStatus?.platform}
          onAddProject={addProjectFromPicker}
          onContinue={addProjectsFromHistoryCandidates}
          onToggleProject={toggleOnboardingProject}
          onToggleAll={toggleAllOnboardingProjects}
          onClose={() => {
            setProjectOnboardingOpen(false);
          }}
        />
      ) : null}

      {projectSelectorOpen ? (
        <ProjectSelectorPopover
          activeProjectId={activeProject?.id}
          position={projectSelectorPosition}
          projects={projectState.projects}
          onSelect={(project) => openWorkspaceDestination({ type: 'project', projectId: project.id })}
          onClose={() => { setProjectSelectorOpen(false); setProjectSelectorPosition(undefined); }}
          onAddProject={addProjectFromPicker}
        />
      ) : null}

      <GlobalAssistantPanel existingSessions={Object.values(sessionsById)} open={showChatDock} cwd={activeProject?.path} projectName={activeProject?.name} model={model} reasoningEffort={reasoningEffort} available={model === defaultModel || availableModels.some((candidate) => candidate.slug === model)} onClose={() => { setAssistantOpen(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.global-topbar [aria-label="Gwira Chat"]')?.focus()); }} />
      <RightWorkspace open={showWorkDock} single={currentTool === 'terminal' || currentTool === 'sessions' || !currentTool && !launcherOpen}
        launcherOpen={launcherOpen} canvasRef={setToolsCanvasTarget} toolsRef={setToolsTarget}
        width={constrainedWorkspaceWidth(workPreferences.workspaceWidth,workspaceWidthLimits(viewportWidth))}
        limits={workspaceWidthLimits(viewportWidth)} onWidthChange={setPreferredWorkspaceWidth} onResizingChange={setWorkspaceResizing}
        canvas={launcherOpen ? <NewTabLauncher onTool={launchTool} retainedTools={(workspaceTabs.suspendedWorkspaceTabs??[]).map(tab=>({id:tab.id,label:labelForWorkspaceTab(tab)}))} onResumeTool={id=>{const next=resumeWorkspaceTool(workspaceTabsRef.current,id);persistWorkspaceTabs(next);const tab=next.tabs.find(t=>t.id===id);if(tab)activateWorkspaceTab(tab);}} /> : null}
      />
      <WorkspaceTools
        key={`${gwiraState.organization.id}:${gwiraState.workspace.id}`}
        open={rightDockRequested && !launcherOpen}
        fixedTool={currentTool}
        onLaunchTool={launchTool}
        activeFile={activeFile}
        sidebarTarget={toolsTarget}
        canvasTarget={toolsCanvasTarget}
        sessions={workPanel(true, true)}
        onClose={currentTool ? () => {
          const tab = workspaceTabsRef.current.workspaceTabs?.find(item => item.id === workspaceTabsRef.current.activeWorkspaceTabId);
          if (tab) void closeWorkspaceDestination(tab);
        } : closeWorkSessions}
        terminalSessionId={currentWorkspaceTab?.destination.type === 'terminal' ? currentWorkspaceTab.destination.sessionId : undefined}
        terminalInitialCwd={projectState.activeProjectId ? activeProject?.path : undefined}
        onTerminalSessionStarted={sessionId => registerTerminalSession(sessionId, false)}
        onNewTerminalSession={sessionId => registerTerminalSession(sessionId, true)}
      />
      <WorkspaceShell
        activeView={activeView}

        workspaceRef={workspaceRef}
        businessViews={{
          'work-sessions': workPanel(true),
          schedule: <SchedulePage sidebarTarget={scheduleSidebarTarget} key={gwiraState.workspace.id} state={gwiraState} onDraftSchedule={draftScheduleSuggestion} onOpenTask={openBusinessTask} onReviewRun={(run, schedule) => {
            const current = gwiraStateRef.current;
            if (!current.tasks.some(task => task.id === run.id)) {
              const now = new Date().toISOString();
              if (run.workspaceId !== current.workspace.id || !current.agents.some(agent => agent.id === run.doatId) || !current.doats.some(doat => doat.id === run.doatId && !doat.archivedAt)) throw new Error('This Doat has no available coding executor. Choose an available Doat before preparing work.');
              const next = reduceGwira(current, { type: 'CREATE_TASK', task: { id: run.id, workspaceId: current.workspace.id, title: schedule.title, description: run.instructions, priority: 'medium', assignee: { kind: 'agent', id: run.doatId }, status: 'todo', createdAt: now, updatedAt: now }, activityId: gwiraId() });
              saveGwiraLocalState(localStorage, next);
              gwiraStateRef.current = next;
              setGwiraState(next);
            }
            openBusinessTask(run.id);
          }} />,
          library: <LibraryPage />,
          dashboard: <DashboardPage onTransitionTask={transitionTask} state={gwiraState} panelOpen={dashboardInspectorOpen && !showChatDock && !showWorkDock} onPanelOpenChange={(open) => { setDashboardInspectorOpen(open); if (open) { setAssistantOpen(false); setWorkPreferences(current=>({...current,open:false})); } }} onStartConversation={startDashboardConversation} onAskAboutRecord={askAboutDashboardRecord} onOpenTask={openBusinessTask} onCreateTask={createTask} onUpdateTask={updateTask} />,
          inbox: <InboxPage onOpenDaot={id=>openWorkspaceDestination({type:'doat',doatId:id})} onOpenWorkSessions={()=>openWorkspaceDestination({type:'work-sessions'})} requestedConversationId={requestedSidebarChannel} state={gwiraState} onOpenTask={openBusinessTask} />,
          'my-work': <MyWorkPage onOpenRunHistory={openRecordedWorkRun} key={`${gwiraState.organization.id}:${gwiraState.workspace.id}`} state={gwiraState} onCreateTask={createTask} onUpdateTask={updateTask} onTransitionTask={transitionTask} onAddComment={addTaskComment} onDecideApproval={decideApproval} onStartCodingTask={(taskId) => { void startCodingTask(taskId); }} onStopCodingTask={(taskId) => { void stopCodingTask(taskId); }} startingTaskIds={startingCodingTaskIds} stoppingTaskIds={stoppingCodingTaskIds} requestedTaskId={requestedBusinessTaskId} onRequestedTaskOpened={() => setRequestedBusinessTaskId(undefined)} activeCodexProjectName={activeProject?.name} onLinkActiveCodexProject={linkActiveCodexProject} />,
          organization: <ViewsPage key={`${gwiraState.organization.id}:${gwiraState.workspace.id}`} state={gwiraState} onUpdateTask={updateTask} onTransitionTask={transitionTask} onAddComment={addTaskComment} onDecideApproval={decideApproval} onStartCodingTask={taskId=>{void startCodingTask(taskId);}} onStopCodingTask={taskId=>{void stopCodingTask(taskId);}} startingTaskIds={startingCodingTaskIds} stoppingTaskIds={stoppingCodingTaskIds} onOpenRunHistory={openRecordedWorkRun} organizationStructure={<OrganizationPage state={gwiraState} onUpdate={updateOrganizationStructure} onOpenTask={openBusinessTask}/>}/> ,
          teams: <TeamsPage onOpenRunHistory={openRecordedWorkRun} onOpenTask={openBusinessTask} state={gwiraState} onSaveWorkforce={saveWorkforce} />,
          agents: <AgentsPage state={gwiraState} onAddCodingAgent={addCodingAgent} />,
          doats: doatScreen === 'create' ? <DoatCreationWizard supervisors={gwiraState.people.map((person) => ({ id: person.id, name: person.name }))} providerAvailable={bootstrapStatus?.installed === true} providerLabel={bootstrapStatus?.installed ? 'Local Codex CLI is available for supported coding tasks.' : 'Local Codex CLI is unavailable.'} onCancel={() => setDoatScreen('directory')} onCreate={createDoat} />
            : doatScreen === 'profile' && selectedDoat ? <DoatProfile onOpenRunHistory={openRecordedWorkRun} workState={gwiraState} onOpenTask={openBusinessTask} doat={selectedDoat} onBack={() => { setDoatScreen('directory'); setSelectedDoatId(undefined); }} onPause={(id) => updateDoatStatus(id, 'paused')} onResume={(id) => updateDoatStatus(id, 'idle')} onArchive={archiveDoat} onAssignTask={() => openWorkspaceView('my-work')} />
              : <DoatDirectory doats={doatRecords.filter((entry) => !entry.archived)} onOpenDoat={(id) => { setSelectedDoatId(id); setDoatScreen('profile'); }} onCreateDoat={() => setDoatScreen('create')} />,
          integrations: <IntegrationsCatalogPage catalog={INTEGRATION_CATALOG} />,
          settings: <SettingsPage state={gwiraState} onRenameWorkspace={renameWorkspace} />
        }}
        skills={(
          <SkillsView
            skills={availableSkills}
            search={skillSearch}
            loading={skillsLoading}
            onSearch={setSkillSearch}
            onRefresh={() => { void refreshSkills(); }}
            onCreate={startSkillCreatorThread}
            onLearnMore={() => { void window.codexDesktop.openExternalTarget({ target: 'https://developers.openai.com/codex/skills' }); }}
            onOpen={(skillId) => { void openSkillDetail(skillId); }}
            onToggle={setSkillEnabled}
          />
        )}
        chat={firstRun ? <FirstRunHome host={firstRun} onOpenDestination={openWorkspaceDestination} /> : (
        <>
        <header className="topbar">
          {traceFixture ? <span data-activity-trace-fixture>Development fixture · {traceFixture.name}</span> : null}
          {hasConversationBreadcrumb ? <ConversationHeading userText={session?.messages.find((message) => message.role === 'user')?.text} projectName={activeProject?.name} /> : null}
        </header>

        <div className="content" ref={transcriptRef} onScroll={conversationScroll.onScroll}>
          {traceFixture ? <Transcript messages={traceFixture.messages} isRunning={traceFixture.isRunning} /> : !session || session.messages.length === 0 ? (
            <Welcome
              projectName={activeProject?.name || gwiraState.workspace.name}
              open={projectSelectorOpen}
              onToggle={toggleProjectSelector}
              codingProject={Boolean(activeProject)}
            />
          ) : <Transcript messages={session.messages} outcome={session.status} isRunning={activeStatus === 'running'}  />}
        </div>
        <div className="conversation-scroll-controls" hidden={conversationScroll.following || !session}><button type="button" className="conversation-jump" onClick={conversationScroll.jump}><Icon name="sort-down" />Jump to latest</button></div>

        {!session && !traceFixture ? (
          <section className="suggestions" aria-label="Quick prompts">
            {activeProject ? <QuickPrompt onClick={() => setInput('Help me plan and build the next change in this project.')}><Icon name="agents" /><span>Start a coding session</span></QuickPrompt> : <>
              <QuickPrompt onClick={() => openWorkspaceView('my-work')}><Icon name="trace-check" /><span>Create a task</span></QuickPrompt>
              <QuickPrompt onClick={() => openWorkspaceView('doats')}><Icon name="doats" /><span>Assign work to a Doat</span></QuickPrompt>
              <QuickPrompt onClick={() => openWorkspaceView('inbox')}><Icon name="external" /><span>Review pending work</span></QuickPrompt>
            </>}
          </section>
        ) : null}

        <MessageComposer aria-label="Message composer" aria-busy={submitting}>
          <div className="composer-context"><span>{gwiraState.workspace.name}</span><button type="button" disabled={activeStatus === 'running' || submitting || cancelling} onClick={(event) => toggleProjectSelector(event.currentTarget)} title="Change conversation project"><Icon name="folder" /><span>{activeProject?.name ?? 'Choose project'}</span><Icon name="chevron-down" /></button></div>
          {commandMenu ? <CommandMenu mode={commandMenu} query={commandQuery} activeIndex={commandActiveIndex} items={commandItems} onSelect={selectCommandItem} /> : null}
          {selectedSkills.length > 0 || selectedFiles.length > 0 ? <ReferenceChips skills={selectedSkills} files={selectedFiles} onRemoveSkill={removeSkill} onRemoveFile={removeFile} /> : null}
          {attachments.length > 0 ? <ComposerAttachments attachments={attachments} onRemove={removeAttachment} /> : null}
          <ComposerInput ref={composerTextareaRef} value={input} onChange={(event) => handleComposerChange(event.target.value)} onPaste={(event) => { void handleComposerPaste(event); }} onKeyDown={handleComposerKeyDown} aria-label="Message Gwira" placeholder={activeStatus === 'running' ? 'Ask for follow-up changes' : 'Ask Gwira anything…'} disabled={submitting} />
          <div className="composer-footer">
            <div className="composer-tools">
              <ComposerAddMenu disabled={submitting || cancelling} onFiles={() => { void addFilesFromPicker(); }} onProject={toggleProjectSelector} onSkills={() => { setCommandMenu('skills'); setCommandQuery(''); composerTextareaRef.current?.focus(); }} />
              <InlineSelect id="permission" className="permission-inline-select" value={permissionMode} label={permissionOptions.find((option) => option.value === permissionMode)?.label ?? permissionMode} options={permissionOptions} open={inlineMenuOpen === 'permission'} disabled={activeStatus === 'running' || submitting} menuRef={inlineMenuRef} onOpenChange={(open) => setInlineMenuOpen(open ? 'permission' : undefined)} onChange={(value) => requestPermissionMode(value as PermissionMode)} />
              <InlineSelect
                id="model"
                className="model-inline-select"
                value={model}
                label={model === defaultModel ? 'Gwira Auto' : model.toUpperCase()}
                options={[{ value: defaultModel, label: 'Gwira Auto' }, ...availableModels.map((option) => ({ value: option.slug, label: option.slug.toUpperCase() }))]}
                open={inlineMenuOpen === 'model'}
                disabled={activeStatus === 'running'}
                menuRef={inlineMenuRef}
                onOpenChange={(open) => setInlineMenuOpen(open ? 'model' : undefined)}
                onChange={selectModel}
              />
              {model !== defaultModel && supportedReasoningOptions.length > 0 ? <InlineSelect
                id="reasoning"
                value={reasoningEffort}
                label={reasoningOptionLabel(reasoningEffort)}
                options={supportedReasoningOptions.map((option) => ({ value: option, label: reasoningOptionLabel(option) }))}
                open={inlineMenuOpen === 'reasoning'}
                disabled={activeStatus === 'running'}
                menuRef={inlineMenuRef}
                onOpenChange={(open) => setInlineMenuOpen(open ? 'reasoning' : undefined)}
                onChange={(value) => setReasoningEffort(value as ReasoningEffort)}
              /> : null}
            </div>
            <div className="composer-actions">{activeStatus === 'running' ? <ConversationExecutionControls busy={cancelling} hasDraft={input.trim().length > 0 || attachments.length > 0} onStop={() => { void stopSession(); }} onStopAndSend={() => { void stopSession(true); }} /> : <ComposerSendButton onClick={() => void sendPrompt()} disabled={!canSend || submitting} />}</div>
          </div>
      {activeView === 'home' && error ? <div className="composer-notice" role="alert">
        <span>{error}</span>
        <button type="button" aria-label="Dismiss error" onClick={() => setError(undefined)}>Dismiss</button>
      </div> : null}
          {activeSessionId && conversationNotices[activeSessionId] ? <p className="conversation-submit" role="status">{conversationNotices[activeSessionId]}</p> : null}
          {submitting ? <p className="conversation-submit" role="status">Sending your request…</p> : null}
        </MessageComposer>

        <footer className="footer-status">
          <div className="footer-left">
            <span><LocalComputerIcon className="footer-icon" /> Local</span>
          </div>
          <div className="branch-control" ref={branchControlRef}>
            <button className="footer-branch" type="button" onClick={() => setBranchMenuOpen((open) => !open)} disabled={gitBranches.branches.length === 0}>
              <span className="footer-icon"><Icon name="branch" /></span>
              <span>{gitBranches.current || 'No branch'}</span>
              <span className="select-chevron" aria-hidden="true"><Icon name="chevron-down" /></span>
            </button>
            {branchMenuOpen ? <BranchMenu info={gitBranches} onSwitch={(branch) => { void switchBranch(branch); }} /> : null}
          </div>
        </footer>
        </>
        )}
      />
      {selectedSkillDetail ? (
        <SkillDetailModal
          skill={selectedSkillDetail}
          onClose={() => setSelectedSkillDetail(undefined)}
          onOpenFolder={() => { void window.codexDesktop.openSkillFolder(selectedSkillDetail.id); }}
          onToggle={(enabled) => { void setSkillEnabled(selectedSkillDetail.id, enabled); }}
          onUninstall={() => { void uninstallSelectedSkill(selectedSkillDetail.id); }}
          onTry={() => {
            setSelectedSkills((current) => current.some((item) => item.id === selectedSkillDetail.id) ? current : [...current, { id: selectedSkillDetail.id, name: selectedSkillDetail.name, description: selectedSkillDetail.description }]);
            setActiveView('chat');
            setSelectedSkillDetail(undefined);
          }}
        />
      ) : null}
    </main>
  );
}





function DeleteHistoryModal({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }): React.ReactElement {
  return (
    <div className="skill-modal-layer" role="dialog" aria-modal="true" aria-labelledby="delete-history-title" aria-describedby="delete-history-description" onMouseDown={onCancel}>
      <section className="skill-modal delete-history-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onCancel} aria-label="Close"><Icon name="close" /></button>
        <div className="skill-modal-header delete-history-header">
          <div>
            <span className="delete-history-icon"><DeleteThreadIcon /></span>
            <h2 id="delete-history-title">Delete thread?</h2>
          </div>
        </div>
        <div className="skill-modal-body delete-history-body">
          <p id="delete-history-description">This will remove the local conversation history file for this conversation.</p>
          <strong>{title}</strong>
        </div>
        <footer className="skill-modal-actions delete-history-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <span />
          <button className="danger" type="button" onClick={onConfirm}>Delete</button>
        </footer>
      </section>
    </div>
  );
}

function ProjectOnboardingModal({
  candidates,
  selectedProjectIds,
  canContinue,
  platform,
  onAddProject,
  onContinue,
  onToggleProject,
  onToggleAll,
  onClose
}: {
  candidates: CodexProjectCandidate[];
  selectedProjectIds: ReadonlySet<string>;
  canContinue: boolean;
  platform?: string;
  onAddProject: () => void;
  onContinue: () => void;
  onToggleProject: (projectId: string) => void;
  onToggleAll: () => void;
  onClose: () => void;
}): React.ReactElement {
  const allSelected = candidates.length > 0 && selectedProjectIds.size === candidates.length;
  const isWindows = platform === 'win32';
  return (
    <div className="project-onboarding-layer" role="dialog" aria-modal="true" aria-labelledby="project-onboarding-title" aria-describedby="project-onboarding-description">
      <section className={`project-onboarding-modal ${isWindows ? 'windows' : 'mac'}`}>
        <ProjectWindowControls platform={platform} onClose={onClose} onMinimize={onClose} />
        <div className="project-onboarding-brand">Gwira</div>
        <div className="project-onboarding-copy">
          <h2 id="project-onboarding-title">Select a project</h2>
          <p id="project-onboarding-description">Gwira will be able to edit files and run commands in selected folders.</p>
        </div>
        {candidates.length > 0 ? (
          <div className="project-candidate-list">
            <button className="project-candidate-row select-all" type="button" onClick={onToggleAll}>
              <span className={allSelected ? 'candidate-check checked' : 'candidate-check'}>{allSelected ? <Icon name="trace-check" /> : null}</span>
              <strong>Select all</strong>
            </button>
            {candidates.slice(0, 8).map((candidate) => {
              const selected = selectedProjectIds.has(candidate.id);
              return (
                <button className="project-candidate-row" type="button" key={candidate.id} onClick={() => onToggleProject(candidate.id)}>
                  <span className={selected ? 'candidate-check checked' : 'candidate-check'}>{selected ? <Icon name="trace-check" /> : null}</span>
                  <span className="candidate-copy">
                    <strong>{candidate.name}</strong>
                    <small>{candidate.path}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <button className="project-onboarding-empty" type="button" onClick={onAddProject}>
            <FolderPlusIcon className="project-onboarding-icon" />
            <strong>No projects yet</strong>
            <span>Add a local project folder to start a new Gwira conversation.</span>
          </button>
        )}
        <div className="project-onboarding-actions">
          <button type="button" onClick={onAddProject}>Add project</button>
          <button className="primary" type="button" onClick={onContinue} disabled={!canContinue}>Continue</button>
        </div>
        <button className="project-onboarding-skip" type="button" onClick={onClose}>Skip</button>
      </section>
    </div>
  );
}

function ProjectWindowControls({ platform, onClose, onMinimize }: { platform?: string; onClose: () => void; onMinimize: () => void }): React.ReactElement {
  const isWindows = platform === 'win32' || (!platform && /Windows/i.test(navigator.userAgent));
  return (
    <div className={`project-window-controls ${isWindows ? 'windows' : 'mac'}`}>
      {isWindows ? (
        <>
          <button type="button" onClick={onMinimize} aria-label="Minimize">—</button>
          <button type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </>
      ) : (
        <>
          <button className="close" type="button" onClick={onClose} aria-label="Close" />
          <button className="minimize" type="button" onClick={onMinimize} aria-label="Minimize" />
        </>
      )}
    </div>
  );
}

function BootstrapHelpModal({ status, onClose, onRestart }: { status: CodexBootstrapStatus; onClose: () => void; onRestart: () => void }): React.ReactElement {
  const missing = status.missing.length ? status.missing : ['Codex CLI'];
  const isWindows = status.platform === 'win32';
  return (
    <div className="skill-modal-layer" onMouseDown={onClose}>
      <section className="skill-modal bootstrap-help-modal" role="dialog" aria-modal="true" aria-labelledby="bootstrap-help-title" aria-describedby="bootstrap-help-description" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <div className="skill-modal-header bootstrap-help-header">
          <div>
            <span className="bootstrap-help-icon"><Icon name="help" /></span>
            <h2 id="bootstrap-help-title">Codex CLI setup required</h2>
          </div>
        </div>
        <div className="skill-modal-body bootstrap-help-body">
          <p id="bootstrap-help-description">Gwira uses your local Codex CLI. The app could not run this command from its runtime environment:</p>
          <div className="bootstrap-missing-list">
            {missing.map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className="bootstrap-help-section">
            <h3>Install or verify</h3>
            <ol>
              <li>{isWindows ? 'Install Codex CLI from PowerShell, then reopen Gwira.' : 'Install Codex CLI from Terminal, then reopen Gwira.'}</li>
              <li>Confirm it works in a terminal with <code>codex --version</code>.</li>
              <li>If Terminal works but this app still shows this prompt, restart Gwira so it can reload your shell PATH.</li>
            </ol>
          </div>
          <div className="bootstrap-help-section">
            <h3>Commands</h3>
            <pre>{'npm install -g @openai/codex\ncodex --version'}</pre>
          </div>
          <p className="bootstrap-help-note">Git is not required for this startup check. The app only verifies that <code>codex --version</code> can run.</p>
        </div>
        <footer className="skill-modal-actions bootstrap-help-actions">
          <button type="button" onClick={onClose}>Later</button>
          <span />
          <button className="try-skill" type="button" onClick={onRestart}>Restart app</button>
        </footer>
      </section>
    </div>
  );
}

function FullAccessConfirmationModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }): React.ReactElement {
  return (
    <div className="skill-modal-layer" onMouseDown={onCancel} role="presentation">
      <section className="skill-modal" role="dialog" aria-modal="true" aria-labelledby="full-access-title" aria-describedby="full-access-description" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onCancel} aria-label="Close"><Icon name="close" /></button>
        <h2 id="full-access-title">Enable Full Access?</h2>
        <p id="full-access-description">Full Access lets Gwira bypass sandboxing and approval checks for this desktop session. Only enable it for a project and prompt you trust.</p>
        <div className="skill-modal-actions">
          <button type="button" onClick={onCancel}>Keep workspace write</button>
          <button className="danger" type="button" onClick={onConfirm}>Enable Full Access</button>
        </div>
      </section>
    </div>
  );
}

function SkillDetailModal({
  skill,
  onClose,
  onOpenFolder,
  onToggle,
  onUninstall,
  onTry
}: {
  skill: CodexSkillDetail;
  onClose: () => void;
  onOpenFolder: () => void;
  onToggle: (enabled: boolean) => void;
  onUninstall: () => void;
  onTry: () => void;
}): React.ReactElement {
  const body = stripSkillFrontmatter(skill.content);
  const example = skill.description || `Use ${skill.name} for the current task.`;
  return (
    <div className="skill-modal-layer" onMouseDown={onClose}>
      <section className="skill-modal" role="dialog" aria-modal="true" aria-labelledby="skill-detail-title" aria-describedby="skill-detail-description" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <div className="skill-modal-header">
          <SkillIcon skill={skill} large />
          <button type="button" onClick={onOpenFolder}>Open folder <Icon name="external" /></button>
        </div>
        <div className="skill-modal-body">
          <h2 id="skill-detail-title">{skill.name}</h2>
          <p id="skill-detail-description">{skill.description || 'No description'}</p>
          <div className="skill-example">
            <div>
              <span>Example prompt</span>
              <button type="button" aria-label="Copy example" onClick={() => { void copyText(example); }}><Icon name="trace-copy" /></button>
            </div>
            <pre>{example}</pre>
          </div>
          <div className="skill-detail-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        </div>
        <footer className="skill-modal-actions">
          <button className="danger" type="button" onClick={onUninstall}>Uninstall</button>
          <button type="button" onClick={() => onToggle(!skill.enabled)}>{skill.enabled ? 'Disable' : 'Enable'}</button>
          <span />
          <button className="try-skill" type="button" onClick={onTry}><Icon name="new-work" /> Try</button>
        </footer>
      </section>
    </div>
  );
}



function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim() || 'No additional instructions.';
}

















function CommandMenu({ mode, query, activeIndex, items, onSelect }: {
  mode: 'skills' | 'files';
  query: string;
  activeIndex: number;
  items: Array<CodexSkillInfo | ProjectFileInfo>;
  onSelect: (item: CodexSkillInfo | ProjectFileInfo) => void;
}): React.ReactElement {
  return (
    <div className="command-menu">
      <div className="command-search">Search {mode === 'files' ? 'project files' : 'skills'}{query ? <span>{query}</span> : null}</div>
      {mode === 'skills' ? (
        <>
          <div className="command-section">Skills</div>
          {(items as CodexSkillInfo[]).map((skill, index) => (
            <button className={`command-item ${index === activeIndex ? 'active' : ''}`} type="button" key={skill.id} onClick={() => onSelect(skill)}>
              <span className="command-icon"><Icon name="skills" /></span><strong>{skill.name}</strong><span>{skill.description}</span><em>Personal</em>
            </button>
          ))}
          {items.length === 0 ? <div className="command-empty">No matching skills</div> : null}
        </>
      ) : (
        <>
          <div className="command-section">Files</div>
          {(items as ProjectFileInfo[]).map((file, index) => (
            <button className={`command-item ${index === activeIndex ? 'active' : ''}`} type="button" key={file.path} onClick={() => onSelect(file)}>
              <span className="command-icon"><Icon name="file" /></span><strong>{file.relativePath}</strong><span>{file.path}</span>
            </button>
          ))}
          {items.length === 0 ? <div className="command-empty">No matching files</div> : null}
        </>
      )}
    </div>
  );
}



function BranchMenu({ info, onSwitch }: { info: GitBranchInfo; onSwitch: (branch: string) => void }): React.ReactElement {
  const status = info.status;
  const [query, setQuery] = useState('');
  const branches = filterBranches(info.branches, query);
  return (
    <div className="branch-menu">
      <label className="branch-search">
        <span><Icon name="search" /></span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches" autoFocus />
      </label>
      <div className="branch-title">Branches</div>
      {branches.map((branch) => (
        <button className="branch-item" type="button" key={branch.name} onClick={() => onSwitch(branch.name)}>
          <span><Icon name="branch" /></span>
          <span className="branch-copy">
            <strong>{branch.name}</strong>
            {branch.current && status ? (
              <small>
                Uncommitted: {status.uncommittedFiles} files <b className="branch-plus">+{status.added}</b> <b className="branch-minus">-{status.removed}</b>
              </small>
            ) : null}
          </span>
          {branch.current ? <em><Icon name="trace-check" /></em> : null}
        </button>
      ))}
      {branches.length === 0 ? <div className="branch-empty">No matching branches</div> : null}
      <div className="branch-divider" />
      <button className="branch-create" type="button" disabled title="Branch creation is not implemented yet."><Icon name="plus" /> Create and checkout new branch...</button>
    </div>
  );
}

function ComposerAttachments({ attachments, onRemove }: { attachments: ComposerAttachment[]; onRemove: (id: string) => void }): React.ReactElement {
  return (
    <div className="composer-attachments" aria-label="File attachments">
      {attachments.map((attachment) => (
        <div className="composer-attachment" key={attachment.id}>
          {(attachment.kind ?? 'image') === 'image' ? <LocalImagePreview imagePath={attachment.path} name={attachment.name} compact /> : <span className="file-attachment-icon" aria-hidden="true" />}
          <span className="composer-attachment-name" title={attachment.name}>{attachment.name}</span>
          <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}><Icon name="close" /></button>
        </div>
      ))}
    </div>
  );
}

function DevOnboardingPreview(): React.ReactElement {
  const [state, setState] = useState(createLocalOnboardingState);
  return <OnboardingPage finishLabel="Restart preview" state={state} onChange={setState} onBack={() => setState(previousOnboardingState)} onContinue={() => setState(current => nextOnboardingState(current, new Date().toISOString()))} onFinish={() => setState(createLocalOnboardingState())} />;
}

function RendererRoot(): React.ReactElement {
  // This route is compiled out of production behavior and is never reachable
  // through the application navigation.
  if (import.meta.env.DEV && window.location.pathname === '/dev/nodes') return <DevNodeGallery />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/onboarding') return <DevOnboardingPreview />;
  return <AccountGate><App /></AccountGate>;
}

try { const theme=localStorage.getItem('gwira.desktop.theme');if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme; } catch { /* Keep the default theme when preferences are unavailable. */ }

createRoot(document.getElementById('root')!).render(<React.StrictMode><RendererRoot /></React.StrictMode>);
