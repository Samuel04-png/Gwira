import type {
  ApprovalCheckpoint, HumanApprovalDecision, WorkflowPlan, WorkflowTaskDefinition, WorkflowTaskProgress
} from './workflowTypes.js';

export type WorkflowValidationIssue =
  | { kind: 'duplicate-task-id'; taskId: string }
  | { kind: 'empty-task-id'; taskIndex: number }
  | { kind: 'self-dependency'; taskId: string }
  | { kind: 'unknown-dependency'; taskId: string; dependencyId: string }
  | { kind: 'cyclic-dependency'; taskIds: readonly string[] }
  | { kind: 'duplicate-checkpoint-id'; checkpointId: string }
  | { kind: 'unknown-checkpoint-task'; checkpointId: string; taskId: string }
  | { kind: 'unknown-task-checkpoint'; taskId: string; checkpointId: string };

export type WorkflowValidation =
  | { ok: true; topologicalTaskIds: readonly string[] }
  | { ok: false; issues: readonly WorkflowValidationIssue[] };

/**
 * Validates only plan structure. It is deterministic and does not mutate the
 * input or choose a worker. Topological order is lexical when independent so
 * identical plans always produce the same presentation/order.
 */
export function validateWorkflowPlan(plan: WorkflowPlan): WorkflowValidation {
  const issues: WorkflowValidationIssue[] = [];
  const taskIds = new Set<string>();
  const tasks = [...plan.tasks];

  tasks.forEach((task, taskIndex) => {
    if (!task.id) issues.push({ kind: 'empty-task-id', taskIndex });
    else if (taskIds.has(task.id)) issues.push({ kind: 'duplicate-task-id', taskId: task.id });
    else taskIds.add(task.id);
  });

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      if (dependencyId === task.id) issues.push({ kind: 'self-dependency', taskId: task.id });
      else if (!taskIds.has(dependencyId)) issues.push({ kind: 'unknown-dependency', taskId: task.id, dependencyId });
    }
  }

  validateCheckpoints(plan, taskIds, issues);
  if (issues.length > 0) return { ok: false, issues };

  const topologicalTaskIds = topologicalOrder(tasks);
  if (topologicalTaskIds.length !== tasks.length) {
    const ordered = new Set(topologicalTaskIds);
    return { ok: false, issues: [{ kind: 'cyclic-dependency', taskIds: tasks.map((task) => task.id).filter((id) => !ordered.has(id)).sort() }] };
  }
  return { ok: true, topologicalTaskIds };
}

function validateCheckpoints(plan: WorkflowPlan, taskIds: ReadonlySet<string>, issues: WorkflowValidationIssue[]): void {
  const checkpointIds = new Set<string>();
  for (const checkpoint of plan.approvalCheckpoints ?? []) {
    if (checkpointIds.has(checkpoint.id)) issues.push({ kind: 'duplicate-checkpoint-id', checkpointId: checkpoint.id });
    else checkpointIds.add(checkpoint.id);
    if (!taskIds.has(checkpoint.taskId)) {
      issues.push({ kind: 'unknown-checkpoint-task', checkpointId: checkpoint.id, taskId: checkpoint.taskId });
    }
  }
  for (const task of plan.tasks) {
    for (const checkpointId of task.approvalCheckpointIds ?? []) {
      if (!checkpointIds.has(checkpointId)) issues.push({ kind: 'unknown-task-checkpoint', taskId: task.id, checkpointId });
    }
  }
}

function topologicalOrder(tasks: readonly WorkflowTaskDefinition[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const remaining = new Map(tasks.map((task) => [task.id, task.dependsOn.length]));
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      const list = dependents.get(dependencyId) ?? [];
      list.push(task.id);
      dependents.set(dependencyId, list);
    }
  }
  const ready = [...remaining.entries()].filter(([, count]) => count === 0).map(([id]) => id).sort();
  const ordered: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    ordered.push(id);
    for (const dependentId of (dependents.get(id) ?? []).sort()) {
      const next = (remaining.get(dependentId) ?? 0) - 1;
      remaining.set(dependentId, next);
      if (next === 0) {
        ready.push(dependentId);
        ready.sort();
      }
    }
  }
  // Keep this map lookup so incorrect external input cannot accidentally
  // alter ordering through a missing node. Structural validation catches it.
  return ordered.filter((id) => byId.has(id));
}

export function readyWorkflowTaskIds(plan: WorkflowPlan, progress: readonly WorkflowTaskProgress[], decisions: readonly HumanApprovalDecision[]): readonly string[] {
  if (!validateWorkflowPlan(plan).ok) return [];
  const stateByTaskId = new Map(progress.map((entry) => [entry.taskId, entry.state]));
  return plan.tasks
    .filter((task) => stateByTaskId.get(task.id) === 'not_started')
    .filter((task) => task.dependsOn.every((dependencyId) => stateByTaskId.get(dependencyId) === 'completed'))
    .filter((task) => checkpointsPermit(task, 'before_execution', plan.approvalCheckpoints ?? [], decisions))
    .map((task) => task.id)
    .sort();
}

export type CheckpointStatus = 'not_required' | 'pending' | 'approved' | 'rejected' | 'changes_requested';

export function checkpointStatus(checkpoint: ApprovalCheckpoint, decisions: readonly HumanApprovalDecision[]): CheckpointStatus {
  const relevant = decisions.filter((decision) => decision.checkpointId === checkpoint.id);
  if (!relevant.length) return 'pending';
  const latest = [...relevant].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.actor.id.localeCompare(left.actor.id))[0];
  if (checkpoint.requiredApproverRole && latest.actor.role !== checkpoint.requiredApproverRole) return 'pending';
  return latest.decision;
}

export function checkpointsPermit(
  task: WorkflowTaskDefinition,
  stage: ApprovalCheckpoint['stage'],
  checkpoints: readonly ApprovalCheckpoint[],
  decisions: readonly HumanApprovalDecision[]
): boolean {
  const taskCheckpoints = checkpoints.filter((checkpoint) => checkpoint.taskId === task.id && checkpoint.stage === stage);
  return taskCheckpoints.every((checkpoint) => checkpointStatus(checkpoint, decisions) === 'approved');
}
