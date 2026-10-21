import type { AssignmentCandidate, AssignmentEvaluation, AssignmentRejection, OrganizationWorker, WorkRisk, WorkflowTaskDefinition } from './workflowTypes.js';

const riskRank: Readonly<Record<WorkRisk, number>> = { low: 0, medium: 1, high: 2, sensitive: 3 };

/**
 * Produces transparent recommendations only. An integration must show the
 * result to an authorized human and explicitly record an assignment; this
 * function never dispatches tasks or starts a Doat.
 */
export function evaluateAssignmentCandidates(
  task: WorkflowTaskDefinition,
  workers: readonly OrganizationWorker[]
): AssignmentEvaluation {
  const candidates: AssignmentCandidate[] = [];
  const rejected: { workerId: string; reasons: readonly AssignmentRejection[] }[] = [];

  for (const worker of [...workers].sort((left, right) => left.id.localeCompare(right.id))) {
    const reasons = rejectionReasons(task, worker);
    if (reasons.length) rejected.push({ workerId: worker.id, reasons });
    else candidates.push(candidateFor(task, worker));
  }
  candidates.sort((left, right) => right.score - left.score || left.workerKind.localeCompare(right.workerKind) || left.workerId.localeCompare(right.workerId));
  return { candidates, rejected };
}

function rejectionReasons(task: WorkflowTaskDefinition, worker: OrganizationWorker): AssignmentRejection[] {
  const reasons: AssignmentRejection[] = [];
  if (!worker.active) reasons.push('inactive');
  if (worker.availability !== 'available') reasons.push('unavailable');
  if (task.departmentId && !worker.departmentIds.includes(task.departmentId)) reasons.push('department-mismatch');
  if (!task.requiredCapabilities.every((capability) => worker.capabilities.includes(capability))) reasons.push('missing-capability');
  if (!(task.requiredTools ?? []).every((tool) => worker.allowedTools.includes(tool))) reasons.push('missing-tool-access');
  if (riskRank[worker.riskLimit] < riskRank[task.risk]) reasons.push('risk-limit');
  if (task.humanRequired && worker.kind !== 'person') reasons.push('human-required');
  if (task.humanSupervisorRequired && worker.kind === 'doat' && !worker.supervisorPersonId) reasons.push('missing-human-supervisor');
  if (worker.maxConcurrentTasks <= 0 || worker.activeTaskCount >= worker.maxConcurrentTasks) reasons.push('workload-limit');
  return reasons;
}

function candidateFor(task: WorkflowTaskDefinition, worker: OrganizationWorker): AssignmentCandidate {
  const departmentMatch = task.departmentId ? 40 : 0;
  const capabilityMatch = task.requiredCapabilities.length * 10;
  const toolMatch = (task.requiredTools ?? []).length * 5;
  const capacity = worker.maxConcurrentTasks - worker.activeTaskCount;
  // Ties remain stable by kind then id in evaluateAssignmentCandidates.
  const score = 100 + departmentMatch + capabilityMatch + toolMatch + Math.min(capacity, 10);
  return {
    workerId: worker.id,
    workerKind: worker.kind,
    score,
    reasons: [
      ...(task.departmentId ? ['department matches'] : []),
      ...task.requiredCapabilities.map((capability) => `has ${capability}`),
      ...(task.requiredTools ?? []).map((tool) => `can use ${tool}`),
      `has ${capacity} available work slot${capacity === 1 ? '' : 's'}`
    ]
  };
}
