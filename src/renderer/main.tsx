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
import { canContinueProjectOnboarding, shouldBlockSendWithoutProject } from './projectOnboarding.js';
import { parseStoredProjectState } from './projectStateStorage.js';
import { clearLastActiveHomeSession, readLastActiveHomeSession, writeLastActiveHomeSession } from './homeSessionStorage.js';
import { permissionSelection } from './permissionSelection.js';
import { addProject, removeProject, type ProjectEntry, type ProjectState } from './projects.js';
import { findProjectIdForSession, mergeSessionIntoProjectHistories } from './sessionHistory.js';
import { ensureExpandedProject, reconcileExpandedProjects, removeExpandedProject, toggleExpandedProject } from './projectThreads.js';
import { copyText, LocalImagePreview, Transcript } from './components/Transcript.js';
import { ProjectSidebar, type WorkspaceNavigation } from './components/ProjectSidebar.js';
import { SkillsView } from './components/SkillsView.js';
import { WorkspaceShell } from './components/WorkspaceShell.js';
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
import { TeamsPage, type NewPersonInput } from './gwira/workspace/TeamsPage.js';
import { AgentsPage, type NewCodingAgentInput } from './gwira/workspace/AgentsPage.js';
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
import { nextOnboardingState, previousOnboardingState, type LocalOnboardingState } from './gwira/onboarding/onboardingModel.js';
import { IntegrationsCatalogPage } from './gwira/integrations/ui/IntegrationsCatalogPage.js';
import { INTEGRATION_CATALOG } from './gwira/integrations/domain/catalog.js';
import { LibraryPage } from './gwira/library/LibraryPage.js';
import './styles.css';

const defaultModel = 'gpt-5.5';
const projectsStorageKey = 'codex-desktop.projects.v1';

const reasoningOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' }
];

const fallbackReasoningLevels: CodexReasoningLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
const fallbackModels: CodexModelInfo[] = [{ slug: defaultModel, defaultReasoningLevel: 'high', supportedReasoningLevels: fallbackReasoningLevels }];
const emptyGitBranches: GitBranchInfo = { current: '', branches: [] };

const permissionOptions: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Workspace write (recommended)' },
  { value: 'full-access', label: 'Full access (use with care)' }
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
  const levels = modelInfo?.supportedReasoningLevels.length ? modelInfo.supportedReasoningLevels : fallbackReasoningLevels;
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

function formatRelativeTime(iso: string): string {
  const deltaMs = Math.max(0, Date.now() - Date.parse(iso));
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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

function loadInitialGwiraState(): GwiraLocalState {
  return recoverInterruptedAgentRuns(loadGwiraLocalState(localStorage, createGwiraState), new Date().toISOString(), gwiraId);
}

function App(): React.ReactElement {
  const [projectState, setProjectState] = useState<ProjectState>(() => loadProjectState());
  const [session, setSession] = useState<CodexSession | undefined>();
  const [sessionsById, setSessionsById] = useState<Record<string, CodexSession>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<ComposerSkillReference[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<ComposerFileReference[]>([]);
  const [availableSkills, setAvailableSkills] = useState<CodexSkillInfo[]>([]);
  const [activeView, setActiveView] = useState<WorkspaceNavigation>('home');
  const navigationHistoryRef = useRef<WorkspaceNavigation[]>(['home']);
  const navigationIndexRef = useRef(0);
  const [, setNavigationVersion] = useState(0);
  const [doatScreen, setDoatScreen] = useState<'directory' | 'create' | 'profile'>('directory');
  const [selectedDoatId, setSelectedDoatId] = useState<string | undefined>();
  const [requestedBusinessTaskId, setRequestedBusinessTaskId] = useState<string | undefined>();
  const [gwiraState, setGwiraState] = useState<GwiraLocalState>(loadInitialGwiraState);
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
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [fullAccessConfirmationOpen, setFullAccessConfirmationOpen] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<CodexBootstrapStatus | undefined>();
  const [bootstrapHelpOpen, setBootstrapHelpOpen] = useState(false);
  const [projectOnboardingOpen, setProjectOnboardingOpen] = useState(false);
  const [historyProjectCandidates, setHistoryProjectCandidates] = useState<CodexProjectCandidate[]>([]);
  const [selectedOnboardingProjectIds, setSelectedOnboardingProjectIds] = useState<Set<string>>(() => new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set(projectState.activeProjectId ? [projectState.activeProjectId] : []));
  const [historiesByProject, setHistoriesByProject] = useState<Record<string, CodexThreadHistory[]>>({});
  const homeRestoreAttemptedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
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
  const codingTaskLaunchesRef = useRef(new Set<string>());
  const dashboardHandoffRef = useRef(false);
  const intentionallyStoppedTaskSessionsRef = useRef(new Set<string>());
  const [startingCodingTaskIds, setStartingCodingTaskIds] = useState<Set<string>>(() => new Set());
  const [stoppingCodingTaskIds, setStoppingCodingTaskIds] = useState<Set<string>>(() => new Set());

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
  const currentTitle = session?.messages.find((message) => message.role === 'user')?.text.slice(0, 18) || 'New thread';
  const hasConversationBreadcrumb = Boolean(session?.codexConversationId && session.messages.some((message) => message.role === 'user'));
  const doatRecords = useMemo(() => gwiraState.doats.map((entry) => doatToUiRecord(entry as Doat, gwiraState)), [gwiraState]);
  const selectedDoat = selectedDoatId ? doatRecords.find((entry) => entry.id === selectedDoatId) : undefined;
  const canGoBack = navigationIndexRef.current > 0;
  const canGoForward = navigationIndexRef.current < navigationHistoryRef.current.length - 1;

  useEffect(() => {
    const history = navigationHistoryRef.current;
    const index = navigationIndexRef.current;
    if (history[index] === activeView) return;
    navigationHistoryRef.current = [...history.slice(0, index + 1), activeView];
    navigationIndexRef.current = navigationHistoryRef.current.length - 1;
    setNavigationVersion((version) => version + 1);
  }, [activeView]);

  function goBack(): void {
    if (navigationIndexRef.current === 0) return;
    navigationIndexRef.current -= 1;
    setNavigationVersion((version) => version + 1);
    setActiveView(navigationHistoryRef.current[navigationIndexRef.current]);
  }

  function goForward(): void {
    if (navigationIndexRef.current >= navigationHistoryRef.current.length - 1) return;
    navigationIndexRef.current += 1;
    setNavigationVersion((version) => version + 1);
    setActiveView(navigationHistoryRef.current[navigationIndexRef.current]);
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
      setModel((current) => nextModels.some((option) => option.slug === current) ? current : nextModels[0].slug);
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
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [session?.messages]);

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

  function createTask(input: NewTaskInput): void {
    const now = new Date().toISOString();
    dispatchGwira({ type: 'CREATE_TASK', task: { id: gwiraId(), workspaceId: gwiraStateRef.current.workspace.id, title: input.title, description: input.description, projectId: input.projectId, priority: input.priority, dueDate: input.dueDate, assignee: input.assignee, status: 'todo', createdAt: now, updatedAt: now }, activityId: gwiraId() });
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

  function addPerson(input: NewPersonInput): void {
    const person: Person = { id: gwiraId(), workspaceId: gwiraStateRef.current.workspace.id, name: input.name, role: input.role, createdAt: new Date().toISOString() };
    dispatchGwira({ type: 'ADD_PERSON', person });
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
    dispatchGwira({ type: 'RENAME_WORKSPACE', name, at: new Date().toISOString(), activityId: gwiraId() });
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

  function openBusinessTask(taskId: string): void {
    setRequestedBusinessTaskId(taskId);
    setActiveView('my-work');
  }

  function linkActiveCodexProject(): void {
    if (!activeProject) { setError('Add or select a local Codex project before linking it to Gwira work.'); return; }
    if (gwiraStateRef.current.projects.some((project) => project.codingProjectPath === activeProject.path)) {
      setError('That local Codex project is already linked to this workspace.');
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

  async function stopCodingTask(taskId: string): Promise<void> {
    const task = gwiraStateRef.current.tasks.find((item) => item.id === taskId);
    if (!task?.agentRun) { setError('This task has no active coding-agent run.'); return; }
    const allowed = validateCodingTaskStop(task, task.agentRun.sessionId);
    if (!allowed.ok) { setError(`Cannot stop coding task: ${allowed.reason.replaceAll('-', ' ')}.`); return; }
    intentionallyStoppedTaskSessionsRef.current.add(allowed.sessionId);
    setStoppingCodingTaskIds((ids) => new Set(ids).add(taskId));
    try {
      await window.codexDesktop.stopSession({ sessionId: allowed.sessionId });
    } catch (value) {
      intentionallyStoppedTaskSessionsRef.current.delete(allowed.sessionId);
      setStoppingCodingTaskIds((ids) => { const next = new Set(ids); next.delete(taskId); return next; });
      setError(value instanceof Error ? value.message : 'Failed to stop coding task');
    }
  }

  function activateSession(nextSession?: CodexSession): void {
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
    setActiveView('home');
    if (project) {
      setProjectState((current) => ({ ...current, activeProjectId: project.id }));
      setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    }
    activateSession(undefined);
    setInput('');
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
    setInput('');
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
        else setError(`This conversation uses ${recordedModel}, which is not available from the configured provider. Choose an available model before continuing.`);
      }
      activateSession(nextSession);
      rememberHomeSession(project, targetHistory.id, targetHistory.updatedAt);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Failed to open thread');
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

  async function stopSession(): Promise<void> {
    if (!session) return;
    await window.codexDesktop.stopSession({ sessionId: session.id });
    cacheSession({ ...session, status: 'idle' });
  }

  async function sendPrompt(directPrompt?: string, context: 'business' | 'coding' = 'coding', existingSession?: CodexSession): Promise<boolean> {
    const prompt = (directPrompt ?? buildPromptWithAttachments(input, { attachments, skills: selectedSkills, files: selectedFiles })).trim();
    if (!prompt || activeStatus === 'running') return false;
    if (shouldBlockSendWithoutProject(projectState.projects.length) || !activeProject) {
      setProjectOnboardingOpen(true);
      return false;
    }
    const currentSession = existingSession ?? sessionRef.current;
    if (currentSession && !availableModels.some((candidate) => candidate.slug === currentSession.model)) {
      setError(`This conversation uses ${currentSession.model}, which is unavailable. Choose an available model to continue.`);
      return false;
    }
    if (!directPrompt) { setInput(''); setAttachments([]); setSelectedSkills([]); setSelectedFiles([]); }
    setError(undefined);

    try {
      const targetSession = currentSession ?? await window.codexDesktop.startSession({
        cwd: activeProject.path,
        model,
        reasoningEffort,
        permissionMode,
        webSearch: false,
        context
      });
      const optimisticMessage: SessionMessage = {
        id: `user-${Date.now()}`,
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
      activateSession(runningSession);
      const selectedModel = targetSession.context === 'business' || context === 'business' ? targetSession.model : model;
      await window.codexDesktop.sendInput({ sessionId: targetSession.id, input: prompt, model: selectedModel, reasoningEffort, permissionMode, webSearch: false, skipUserAppend: true });
      return true;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      setError('Couldn\'t connect to the AI service. Check your connection or model settings.');
      if (sessionRef.current) cacheSession({ ...sessionRef.current, status: 'error', error: message });
      return false;
    }
  }

  async function startDashboardConversation(message: string): Promise<boolean> {
    if (!activeProject || activeStatus === 'running' || dashboardHandoffRef.current) return false;
    dashboardHandoffRef.current = true;
    // Creating the session before navigation gives the handoff a stable id and
    // means Strict Mode or a rerender cannot submit this message twice.
    try {
      const targetSession = await window.codexDesktop.startSession({ cwd: activeProject.path, model, reasoningEffort, permissionMode, webSearch: false, context: 'business' });
      activateSession(targetSession);
      setActiveView('home');
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
    setActiveView('home');
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
      setError('Couldn\'t connect to the AI service. Check your connection or model settings.');
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt();
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
      minHeight: 38
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
    setSelectedSkillDetail(detail);
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
    setInput('帮我创建一个新的 Codex skill。请先询问我这个 skill 的用途、触发场景和工作流程。');
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
    <main className="shell">
      <ProjectSidebar
        dashboardSidebar={<DashboardSidebar state={gwiraState} activeView={activeView} onNavigate={setActiveView} onOpenDoat={(id) => { setSelectedDoatId(id); setDoatScreen('profile'); setActiveView('doats'); }} onCreateDoat={() => { setDoatScreen('create'); setActiveView('doats'); }} onAddPerson={() => setActiveView('teams')} />}
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
        onDeleteHistory={requestDeleteHistory}
        onNewThread={startNewThread}
        onOpenHistory={(project, history) => { void openHistory(project, history); }}
        onOpenSession={openCachedSession}
        onProjectKeyDown={handleThreadRowKeyDown}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoBack={goBack}
        onGoForward={goForward}
        onSelectBusinessView={setActiveView}
        onOpenHome={openHome}
        onSelectSkills={() => setActiveView('skills')}
        onToggleProject={toggleProject}
        onToggleProjectMenu={toggleProjectMenu}
        openProjectMenuId={openProjectMenuId}
      />

      {error ? <div className="global-error-banner" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError(undefined)}>Dismiss</button></div> : null}

      {openProjectMenu && projectMenuPosition ? (
        <div className="project-menu project-menu-floating" ref={projectMenuRef} style={{ top: projectMenuPosition.top, left: projectMenuPosition.left }} onClick={(event) => event.stopPropagation()}>
          <button disabled title="Project pinning is not implemented yet.">☆ Pin project</button>
          <button disabled title="Task views are not available for projects yet.">✓ View associated tasks</button>
          <button disabled title="Opening the local project directory is not implemented yet.">↗ View local directory</button>
          <hr />
          <button disabled title="Project details editing is not implemented yet.">✎ Edit project details</button>
          <button className="danger" onClick={() => removeProjectById(openProjectMenu.id)}>× Remove</button>
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
          onSelect={selectProject}
          onClose={() => { setProjectSelectorOpen(false); setProjectSelectorPosition(undefined); }}
          onAddProject={addProjectFromPicker}
        />
      ) : null}

      <WorkspaceShell
        activeView={activeView}
        workspaceRef={workspaceRef}
        businessViews={{
          library: <LibraryPage />,
          dashboard: <DashboardPage state={gwiraState} onStartConversation={startDashboardConversation} onAskAboutRecord={askAboutDashboardRecord} />,
          inbox: <InboxPage state={gwiraState} onOpenTask={openBusinessTask} />,
          'my-work': <MyWorkPage state={gwiraState} onCreateTask={createTask} onUpdateTask={updateTask} onTransitionTask={transitionTask} onAddComment={addTaskComment} onDecideApproval={decideApproval} onStartCodingTask={(taskId) => { void startCodingTask(taskId); }} onStopCodingTask={(taskId) => { void stopCodingTask(taskId); }} startingTaskIds={startingCodingTaskIds} stoppingTaskIds={stoppingCodingTaskIds} requestedTaskId={requestedBusinessTaskId} onRequestedTaskOpened={() => setRequestedBusinessTaskId(undefined)} activeCodexProjectName={activeProject?.name} onLinkActiveCodexProject={linkActiveCodexProject} />,
          organization: <OrganizationPage state={gwiraState} onUpdate={updateOrganizationStructure} onOpenTask={openBusinessTask} />,
          teams: <TeamsPage state={gwiraState} onAddPerson={addPerson} />,
          agents: <AgentsPage state={gwiraState} onAddCodingAgent={addCodingAgent} />,
          doats: doatScreen === 'create' ? <DoatCreationWizard supervisors={gwiraState.people.map((person) => ({ id: person.id, name: person.name }))} providerAvailable={bootstrapStatus?.installed === true} providerLabel={bootstrapStatus?.installed ? 'Local Codex CLI is available for supported coding tasks.' : 'Local Codex CLI is unavailable.'} onCancel={() => setDoatScreen('directory')} onCreate={createDoat} />
            : doatScreen === 'profile' && selectedDoat ? <DoatProfile doat={selectedDoat} onBack={() => { setDoatScreen('directory'); setSelectedDoatId(undefined); }} onPause={(id) => updateDoatStatus(id, 'paused')} onResume={(id) => updateDoatStatus(id, 'idle')} onArchive={archiveDoat} onAssignTask={() => setActiveView('my-work')} />
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
            onToggle={(skillId, enabled) => { void setSkillEnabled(skillId, enabled); }}
          />
        )}
        chat={(
        <>
        <header className="topbar">
          {hasConversationBreadcrumb ? <div className="thread-heading"><strong>{currentTitle}</strong><span>{activeProject?.name || 'No project'}</span><span>•••</span></div> : null}
        </header>

        <div className="content" ref={transcriptRef}>
          {!session || session.messages.length === 0 ? (
            <Welcome
              projectName={activeProject?.name || gwiraState.workspace.name}
              open={projectSelectorOpen}
              onToggle={toggleProjectSelector}
              codingProject={Boolean(activeProject)}
            />
          ) : <Transcript messages={session.messages} isRunning={activeStatus === 'running'} hideSystem={session.context === 'business'} />}
        </div>

        {!session ? (
          <section className="suggestions" aria-label="Quick prompts">
            {activeProject ? <button onClick={() => setInput('Help me plan and build the next change in this project.')}>⌘<span>Start a coding session</span></button> : <>
              <button onClick={() => setActiveView('my-work')}>✓<span>Create a task</span></button>
              <button onClick={() => setActiveView('doats')}>◌<span>Assign work to a Doat</span></button>
              <button onClick={() => setActiveView('inbox')}>↗<span>Review pending work</span></button>
            </>}
          </section>
        ) : null}

        <section className="composer-panel">
          {commandMenu ? <CommandMenu mode={commandMenu} query={commandQuery} activeIndex={commandActiveIndex} items={commandItems} onSelect={selectCommandItem} /> : null}
          {selectedSkills.length > 0 || selectedFiles.length > 0 ? <ReferenceChips skills={selectedSkills} files={selectedFiles} onRemoveSkill={removeSkill} onRemoveFile={removeFile} /> : null}
          {attachments.length > 0 ? <ComposerAttachments attachments={attachments} onRemove={removeAttachment} /> : null}
          <textarea ref={composerTextareaRef} value={input} onChange={(event) => handleComposerChange(event.target.value)} onPaste={(event) => { void handleComposerPaste(event); }} onKeyDown={handleComposerKeyDown} placeholder={session ? 'Ask for follow-up changes' : 'Ask Codex anything, @ to add files, / for commands'} disabled={activeStatus === 'running'} />
          <div className="composer-footer">
            <div className="composer-tools">
              <button onClick={addFilesFromPicker}>＋</button>
              <InlineSelect
                id="model"
                className="model-inline-select"
                value={model}
                label={model.toUpperCase()}
                options={availableModels.map((option) => ({ value: option.slug, label: option.slug.toUpperCase() }))}
                open={inlineMenuOpen === 'model'}
                disabled={activeStatus === 'running'}
                menuRef={inlineMenuRef}
                onOpenChange={(open) => setInlineMenuOpen(open ? 'model' : undefined)}
                onChange={selectModel}
              />
              <InlineSelect
                id="reasoning"
                value={reasoningEffort}
                label={reasoningOptionLabel(reasoningEffort)}
                options={supportedReasoningOptions.map((option) => ({ value: option, label: reasoningOptionLabel(option) }))}
                open={inlineMenuOpen === 'reasoning'}
                disabled={activeStatus === 'running'}
                menuRef={inlineMenuRef}
                onOpenChange={(open) => setInlineMenuOpen(open ? 'reasoning' : undefined)}
                onChange={(value) => setReasoningEffort(value as ReasoningEffort)}
              />
            </div>
            <div className="composer-actions">{activeStatus === 'running' ? <button className="send stop" onClick={stopSession} aria-label="Stop"><StopIcon /></button> : <button className="send" onClick={() => void sendPrompt()} disabled={!canSend}>↑</button>}</div>
          </div>
        </section>

        <footer className="footer-status">
          <div className="footer-left">
            <span><LocalComputerIcon className="footer-icon" /> Local</span>
            <InlineSelect
              id="permission"
              className="permission-inline-select"
              value={permissionMode}
              label={permissionOptions.find((option) => option.value === permissionMode)?.label ?? permissionMode}
              options={permissionOptions}
              open={inlineMenuOpen === 'permission'}
              disabled={activeStatus === 'running'}
              menuRef={inlineMenuRef}
              onOpenChange={(open) => setInlineMenuOpen(open ? 'permission' : undefined)}
              onChange={(value) => requestPermissionMode(value as PermissionMode)}
            />
          </div>
          <div className="branch-control" ref={branchControlRef}>
            <button className="footer-branch" type="button" onClick={() => setBranchMenuOpen((open) => !open)} disabled={gitBranches.branches.length === 0}>
              <span className="footer-icon">⑂</span>
              <span>{gitBranches.current || 'No branch'}</span>
              <span className="select-chevron" aria-hidden="true" />
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

function ThreadSpinner(): React.ReactElement {
  return (
    <svg className="thread-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Running" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="38" strokeDashoffset="10" />
    </svg>
  );
}

function DeleteThreadIcon(): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="14" height="4" rx="1.2" />
      <path d="M4.5 8v7.5A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V8" />
      <path d="M8 11.5h4" />
    </svg>
  );
}

function DeleteHistoryModal({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }): React.ReactElement {
  return (
    <div className="skill-modal-layer" role="dialog" aria-modal="true" onMouseDown={onCancel}>
      <section className="skill-modal delete-history-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onCancel}>×</button>
        <div className="skill-modal-header delete-history-header">
          <div>
            <span className="delete-history-icon"><DeleteThreadIcon /></span>
            <h2>Delete thread?</h2>
          </div>
        </div>
        <div className="skill-modal-body delete-history-body">
          <p>This will remove the local Codex history file for this conversation.</p>
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
    <div className="project-onboarding-layer" role="dialog" aria-modal="true">
      <section className={`project-onboarding-modal ${isWindows ? 'windows' : 'mac'}`}>
        <ProjectWindowControls platform={platform} onClose={onClose} onMinimize={onClose} />
        <div className="project-onboarding-brand">Codex</div>
        <div className="project-onboarding-copy">
          <h2>Select a project</h2>
          <p>Codex will be able to edit files and run commands in selected folders.</p>
        </div>
        {candidates.length > 0 ? (
          <div className="project-candidate-list">
            <button className="project-candidate-row select-all" type="button" onClick={onToggleAll}>
              <span className={allSelected ? 'candidate-check checked' : 'candidate-check'}>{allSelected ? '✓' : ''}</span>
              <strong>Select all</strong>
            </button>
            {candidates.slice(0, 8).map((candidate) => {
              const selected = selectedProjectIds.has(candidate.id);
              return (
                <button className="project-candidate-row" type="button" key={candidate.id} onClick={() => onToggleProject(candidate.id)}>
                  <span className={selected ? 'candidate-check checked' : 'candidate-check'}>{selected ? '✓' : ''}</span>
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
            <span>Add a local project folder to start a new Codex conversation.</span>
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
          <button type="button" onClick={onClose} aria-label="Close">×</button>
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
      <section className="skill-modal bootstrap-help-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onClose}>×</button>
        <div className="skill-modal-header bootstrap-help-header">
          <div>
            <span className="bootstrap-help-icon">⌁</span>
            <h2>Codex CLI setup required</h2>
          </div>
        </div>
        <div className="skill-modal-body bootstrap-help-body">
          <p>Codex Desktop uses your local Codex CLI. The app could not run this command from its runtime environment:</p>
          <div className="bootstrap-missing-list">
            {missing.map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className="bootstrap-help-section">
            <h3>Install or verify</h3>
            <ol>
              <li>{isWindows ? 'Install Codex CLI from PowerShell, then reopen Codex Desktop.' : 'Install Codex CLI from Terminal, then reopen Codex Desktop.'}</li>
              <li>Confirm it works in a terminal with <code>codex --version</code>.</li>
              <li>If Terminal works but this app still shows this prompt, restart Codex Desktop so it can reload your shell PATH.</li>
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
      <section className="skill-modal" role="dialog" aria-modal="true" aria-labelledby="full-access-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onCancel} aria-label="Close">×</button>
        <h2 id="full-access-title">Enable Full Access?</h2>
        <p>Full Access lets Codex bypass sandboxing and approval checks for this desktop session. Only enable it for a project and prompt you trust.</p>
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
      <section className="skill-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onClose}>×</button>
        <div className="skill-modal-header">
          <SkillIcon skill={skill} large />
          <button type="button" onClick={onOpenFolder}>Open folder ↗</button>
        </div>
        <div className="skill-modal-body">
          <h2>{skill.name}</h2>
          <p>{skill.description || 'No description'}</p>
          <div className="skill-example">
            <div>
              <span>Example prompt</span>
              <button type="button" onClick={() => { void copyText(example); }}>⧉</button>
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
          <button className="try-skill" type="button" onClick={onTry}>✎ Try</button>
        </footer>
      </section>
    </div>
  );
}

function SkillIcon({ skill, large = false }: { skill: Pick<CodexSkillInfo, 'id' | 'name'>; large?: boolean }): React.ReactElement {
  const key = `${skill.id} ${skill.name}`.toLowerCase();
  let symbol = '▣';
  if (key.includes('pdf')) symbol = 'PDF';
  else if (key.includes('image')) symbol = '◒';
  else if (key.includes('review')) symbol = '☃';
  else if (key.includes('plugin')) symbol = '✎';
  return <span className={`skill-icon ${large ? 'large' : ''} ${symbol === 'PDF' ? 'pdf' : ''}`}>{symbol}</span>;
}

function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim() || 'No additional instructions.';
}

function NewThreadIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 4H5.5A2.5 2.5 0 0 0 3 6.5v12A2.5 2.5 0 0 0 5.5 21h12A2.5 2.5 0 0 0 20 18.5V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AutomationsIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkillsNavIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="7" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function StopIcon(): React.ReactElement {
  return (
    <svg className="stop-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

function LocalComputerIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 19H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6 19H18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7.5C4 6.67 4.67 6 5.5 6H9.2L10.8 8H18.5C19.33 8 20 8.67 20 9.5V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 10H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FolderPlusIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 6.5C3 5.67 3.67 5 4.5 5H9L11 7H19.5C20.33 7 21 7.67 21 8.5V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8.5V17.5C3 18.33 3.67 19 4.5 19H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 17H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6A1.65 1.65 0 0 0 10.4 2.92V3a2 2 0 1 1 4 0v-.08A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.33.34.64.6 1 .3.37.69.6 1.08.6H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
              <span className="command-icon">◈</span><strong>{skill.name}</strong><span>{skill.description}</span><em>Personal</em>
            </button>
          ))}
          {items.length === 0 ? <div className="command-empty">No matching skills</div> : null}
        </>
      ) : (
        <>
          <div className="command-section">Files</div>
          {(items as ProjectFileInfo[]).map((file, index) => (
            <button className={`command-item ${index === activeIndex ? 'active' : ''}`} type="button" key={file.path} onClick={() => onSelect(file)}>
              <span className="command-icon">▤</span><strong>{file.relativePath}</strong><span>{file.path}</span>
            </button>
          ))}
          {items.length === 0 ? <div className="command-empty">No matching files</div> : null}
        </>
      )}
    </div>
  );
}

function ReferenceChips({ skills, files, onRemoveSkill, onRemoveFile }: {
  skills: ComposerSkillReference[];
  files: ComposerFileReference[];
  onRemoveSkill: (id: string) => void;
  onRemoveFile: (path: string) => void;
}): React.ReactElement {
  return (
    <div className="reference-chips">
      {skills.map((skill) => <button className="reference-chip skill" type="button" key={skill.id} onClick={() => onRemoveSkill(skill.id)}>◈ {skill.name} <span>×</span></button>)}
      {files.map((file) => <button className="reference-chip file" type="button" key={file.path} onClick={() => onRemoveFile(file.path)}>@ {file.relativePath} <span>×</span></button>)}
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
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches" autoFocus />
      </label>
      <div className="branch-title">Branches</div>
      {branches.map((branch) => (
        <button className="branch-item" type="button" key={branch.name} onClick={() => onSwitch(branch.name)}>
          <span>⑂</span>
          <span className="branch-copy">
            <strong>{branch.name}</strong>
            {branch.current && status ? (
              <small>
                Uncommitted: {status.uncommittedFiles} files <b className="branch-plus">+{status.added}</b> <b className="branch-minus">-{status.removed}</b>
              </small>
            ) : null}
          </span>
          {branch.current ? <em>✓</em> : null}
        </button>
      ))}
      {branches.length === 0 ? <div className="branch-empty">No matching branches</div> : null}
      <div className="branch-divider" />
      <button className="branch-create" type="button" disabled title="Branch creation is not implemented yet.">＋ Create and checkout new branch...</button>
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
          <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>×</button>
        </div>
      ))}
    </div>
  );
}

function RendererRoot(): React.ReactElement {
  // This route is compiled out of production behavior and is never reachable
  // through the application navigation.
  if (import.meta.env.DEV && window.location.pathname === '/dev/nodes') return <DevNodeGallery />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><RendererRoot /></React.StrictMode>);
