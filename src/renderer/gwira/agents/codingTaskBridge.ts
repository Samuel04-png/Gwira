import type { CodexExitEvent, CodexOutputEvent, CodexSession, PermissionMode, SendInputRequest, StartSessionRequest } from '../../../shared/types.js';
import type { ProjectEntry } from '../../projects.js';
import type { AgentRun, BusinessProject, GwiraLocalState, Task } from '../domain/types.js';

/**
 * Renderer-only translation between a Gwira coding task and the existing Codex
 * desktop API. It deliberately performs no IPC and stores no transcript text.
 */
export const DEFAULT_CODING_TASK_PERMISSION: PermissionMode = 'default';

export type CodingTaskLaunchFailure =
  | 'task-not-found'
  | 'task-not-assigned-to-coding-agent'
  | 'coding-project-not-configured'
  | 'coding-project-not-saved'
  | 'agent-run-already-active';

export type CodingTaskLaunchValidation =
  | { ok: true; task: Task; project: BusinessProject; savedProject: ProjectEntry }
  | { ok: false; reason: CodingTaskLaunchFailure };

export type AgentRunStopValidation =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'agent-run-not-active' | 'session-does-not-match-task' };

/**
 * A saved Codex project is an explicit capability grant. Paths are compared
 * exactly: this bridge never normalizes, resolves, or infers another folder.
 */
export function validateCodingTaskLaunch(
  state: GwiraLocalState,
  taskId: string,
  savedProjects: readonly ProjectEntry[]
): CodingTaskLaunchValidation {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, reason: 'task-not-found' };

  const assignedAgent = task.assignee?.kind === 'agent'
    ? state.agents.find((agent) => agent.id === task.assignee?.id)
    : undefined;
  if (!assignedAgent || assignedAgent.type !== 'coding') {
    return { ok: false, reason: 'task-not-assigned-to-coding-agent' };
  }

  const project = task.projectId ? state.projects.find((item) => item.id === task.projectId) : undefined;
  if (!project?.codingProjectPath) return { ok: false, reason: 'coding-project-not-configured' };

  const savedProject = savedProjects.find((item) => item.path === project.codingProjectPath);
  if (!savedProject) return { ok: false, reason: 'coding-project-not-saved' };

  if (task.agentRun?.status === 'running') return { ok: false, reason: 'agent-run-already-active' };
  return { ok: true, task, project, savedProject };
}

export function codingTaskPrompt(task: Pick<Task, 'title' | 'description'>): string {
  return task.description?.trim()
    ? `${task.title.trim()}\n\n${task.description.trim()}`
    : task.title.trim();
}

export function createCodingTaskStartRequest(validation: Extract<CodingTaskLaunchValidation, { ok: true }>): StartSessionRequest {
  return {
    cwd: validation.savedProject.path,
    permissionMode: DEFAULT_CODING_TASK_PERMISSION,
    webSearch: false
  };
}

/** The caller supplies the session id returned by the existing startSession API. */
export function createCodingTaskSendInputRequest(task: Pick<Task, 'title' | 'description'>, sessionId: string): SendInputRequest {
  return {
    sessionId,
    input: codingTaskPrompt(task),
    permissionMode: DEFAULT_CODING_TASK_PERMISSION,
    webSearch: false
  };
}

/**
 * AgentRun is correlation metadata only. Codex's own session/history remains
 * the canonical transcript and no output is copied into Gwira local state.
 */
export function associateCodingTaskSession(session: Pick<CodexSession, 'id' | 'codexConversationId'>, startedAt: string): AgentRun {
  return {
    sessionId: session.id,
    ...(session.codexConversationId ? { codexConversationId: session.codexConversationId } : {}),
    status: 'running',
    startedAt
  };
}

/**
 * A matching output event proves the run is still active, but its chunk is
 * deliberately discarded. Returning metadata lets a caller record activity
 * without accidentally persisting CLI output.
 */
export function mapCodexOutputToAgentRun(run: AgentRun | undefined, event: CodexOutputEvent): AgentRun | undefined {
  if (!run || run.status !== 'running' || event.sessionId !== run.sessionId) return undefined;
  return { ...run };
}

export function mapCodexExitToAgentRun(run: AgentRun | undefined, event: CodexExitEvent, completedAt: string, wasStopped = false): AgentRun | undefined {
  if (!run || event.sessionId !== run.sessionId) return undefined;

  const codexConversationId = event.session?.codexConversationId ?? run.codexConversationId;
  if (event.status === 'error') {
    return {
      ...run,
      ...(codexConversationId ? { codexConversationId } : {}),
      status: 'error',
      completedAt,
      ...(event.error ? { error: event.error } : {})
    };
  }

  return {
    ...run,
    ...(codexConversationId ? { codexConversationId } : {}),
    status: wasStopped || event.signal ? 'stopped' : 'completed',
    completedAt
  };
}

export function validateCodingTaskStop(task: Pick<Task, 'agentRun'>, sessionId: string): AgentRunStopValidation {
  if (!task.agentRun || task.agentRun.status !== 'running') return { ok: false, reason: 'agent-run-not-active' };
  if (task.agentRun.sessionId !== sessionId) return { ok: false, reason: 'session-does-not-match-task' };
  return { ok: true, sessionId };
}
