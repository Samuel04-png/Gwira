import type { AgentRun, Task, TaskStatus } from '../../domain/types.js';

/**
 * Normalized execution fields consumed by the adapter. The Doat domain maps
 * its layered identity/intelligence/governance records to this small shape;
 * this keeps provider policy independent from profile and visual changes.
 */
export interface DoatExecutionDescriptor {
  id: string;
  active: boolean;
  providerId: string;
  paused: boolean;
  /** A non-positive value means this Doat cannot start new local work. */
  concurrentExecutionLimit: number;
  activeExecutionCount: number;
}

export type DoatProviderAvailability =
  | { available: true; providerId: 'codex-local'; label: 'Local Codex CLI' }
  | {
    available: false;
    providerId: string;
    reason: 'provider-not-configured';
    message: string;
  };

/**
 * No provider registry exists in the local prototype. This is intentionally a
 * fail-closed allow-list, rather than treating unknown provider ids as future
 * adapters that may be started.
 */
export function getDoatProviderAvailability(providerId: string): DoatProviderAvailability {
  if (providerId === 'codex-local') {
    return { available: true, providerId, label: 'Local Codex CLI' };
  }

  return {
    available: false,
    providerId,
    reason: 'provider-not-configured',
    message: providerId
      ? `The ${providerId} provider is not configured in this local prototype.`
      : 'No execution provider is configured for this Doat.'
  };
}

export type DoatExecutionPlanFailure =
  | 'doat-inactive'
  | 'doat-paused'
  | 'provider-unavailable'
  | 'task-not-assigned-to-doat'
  | 'task-not-ready'
  | 'agent-run-already-active'
  | 'concurrency-limit-reached'
  | 'coding-project-not-approved'
  | 'codex-bridge-rejected';

export type DoatExecutionPlan =
  | {
    ok: true;
    providerId: 'codex-local';
    executor: 'existing-coding-task-bridge';
    permissionMode: 'default';
    webSearch: false;
  }
  | { ok: false; reason: DoatExecutionPlanFailure; message: string };

export interface DoatExecutionPlanInput {
  doat: DoatExecutionDescriptor;
  task: Pick<Task, 'status' | 'assignee' | 'agentRun'>;
  /** True only after the existing coding-task bridge accepted an exact saved project. */
  codingProjectApproved: boolean;
  /** True only after the existing coding-task bridge's own launch validation passed. */
  codingBridgeAccepted: boolean;
}

/**
 * Plans a launch but never performs one. The renderer must pass a successful
 * plan to the existing coding-task bridge, which remains the only executor.
 */
export function planDoatExecution(input: DoatExecutionPlanInput): DoatExecutionPlan {
  const { doat, task } = input;
  if (!doat.active) return fail('doat-inactive', 'Activate this Doat before starting work.');
  if (doat.paused) return fail('doat-paused', 'This Doat is paused and cannot start new work.');

  const provider = getDoatProviderAvailability(doat.providerId);
  if (!provider.available) return fail('provider-unavailable', provider.message);

  if (task.assignee?.kind !== 'agent' || task.assignee.id !== doat.id) {
    return fail('task-not-assigned-to-doat', 'Assign this task to the selected Doat before starting it.');
  }
  if (task.status !== 'todo') return fail('task-not-ready', 'Only To do tasks can be started.');
  if (task.agentRun?.status === 'running') return fail('agent-run-already-active', 'This task already has an active run.');
  if (doat.concurrentExecutionLimit <= 0 || doat.activeExecutionCount >= doat.concurrentExecutionLimit) {
    return fail('concurrency-limit-reached', 'This Doat has reached its concurrent execution limit.');
  }
  if (!input.codingProjectApproved) {
    return fail('coding-project-not-approved', 'Link this task to an approved saved coding project before starting it.');
  }
  if (!input.codingBridgeAccepted) {
    return fail('codex-bridge-rejected', 'The existing local Codex safety checks did not approve this task.');
  }

  return {
    ok: true,
    providerId: 'codex-local',
    executor: 'existing-coding-task-bridge',
    permissionMode: 'default',
    webSearch: false
  };
}

function fail(reason: DoatExecutionPlanFailure, message: string): Extract<DoatExecutionPlan, { ok: false }> {
  return { ok: false, reason, message };
}

export type DoatOperationalStatus =
  | 'idle'
  | 'working'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'unavailable';

/**
 * Derives a readable operational state from actual task/run metadata. It does
 * not infer agent thoughts or manufacture progress for unavailable providers.
 */
export function mapTaskToDoatOperationalStatus(
  input: Pick<DoatExecutionDescriptor, 'paused' | 'providerId'>,
  task: Pick<Task, 'status' | 'agentRun'> | undefined
): DoatOperationalStatus {
  if (input.paused) return 'paused';
  if (!getDoatProviderAvailability(input.providerId).available) return 'unavailable';
  if (!task) return 'idle';

  if (task.agentRun?.status === 'running') return 'working';
  if (task.agentRun?.status === 'error') return 'failed';
  if (task.status === 'blocked') return 'blocked';
  if (task.status === 'in_review') return 'waiting_for_approval';
  if (task.status === 'done') return 'completed';
  return 'idle';
}

/** Useful for UI summaries without exposing run transcript content. */
export function countActiveDoatRuns(tasks: readonly Pick<Task, 'agentRun'>[]): number {
  return tasks.filter((task) => task.agentRun?.status === 'running').length;
}

/** Kept explicit for callers mapping a persisted task status into UI copy. */
export function isLaunchableTaskStatus(status: TaskStatus): boolean {
  return status === 'todo';
}
