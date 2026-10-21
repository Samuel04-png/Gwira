/**
 * Pure organizational workflow records. Separate from persisted Gwira state
 * and the Codex execution bridge: they describe a plan or recommendation only.
 */
export type OrganizationWorkerKind = 'person' | 'doat';
export type WorkRisk = 'low' | 'medium' | 'high' | 'sensitive';
export type WorkflowTaskState = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export interface WorkflowTaskDefinition {
  id: string;
  title: string;
  departmentId?: string;
  dependsOn: readonly string[];
  requiredCapabilities: readonly string[];
  requiredTools?: readonly string[];
  risk: WorkRisk;
  humanRequired?: boolean;
  humanSupervisorRequired?: boolean;
  approvalCheckpointIds?: readonly string[];
}

export interface WorkflowPlan {
  id: string;
  requestId: string;
  tasks: readonly WorkflowTaskDefinition[];
  approvalCheckpoints?: readonly ApprovalCheckpoint[];
}

export interface WorkflowTaskProgress { taskId: string; state: WorkflowTaskState; }
export type ApprovalCheckpointStage = 'before_execution' | 'before_completion';

/** Approval is a governance record, not an execution permission. */
export interface ApprovalCheckpoint {
  id: string;
  taskId: string;
  stage: ApprovalCheckpointStage;
  label: string;
  humanApprovalRequired: true;
  requiredApproverRole?: string;
  separationOfDuties?: boolean;
}

export interface HumanApprovalDecision {
  checkpointId: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
  actor: { kind: 'person'; id: string; role?: string };
  occurredAt: string;
  note?: string;
}

export interface OrganizationWorker {
  id: string;
  kind: OrganizationWorkerKind;
  name: string;
  active: boolean;
  availability: 'available' | 'busy' | 'unavailable';
  departmentIds: readonly string[];
  capabilities: readonly string[];
  allowedTools: readonly string[];
  riskLimit: WorkRisk;
  activeTaskCount: number;
  maxConcurrentTasks: number;
  supervisorPersonId?: string;
}

export type AssignmentRejection =
  | 'inactive' | 'unavailable' | 'department-mismatch' | 'missing-capability'
  | 'missing-tool-access' | 'risk-limit' | 'human-required'
  | 'missing-human-supervisor' | 'workload-limit';

export interface AssignmentCandidate {
  workerId: string;
  workerKind: OrganizationWorkerKind;
  score: number;
  reasons: readonly string[];
}

export interface AssignmentEvaluation {
  candidates: readonly AssignmentCandidate[];
  rejected: readonly { workerId: string; reasons: readonly AssignmentRejection[] }[];
}

export type WorkflowAuditEventKind =
  | 'request_recorded' | 'plan_validated' | 'assignment_recommended' | 'assignment_confirmed'
  | 'task_blocked' | 'handoff_recorded' | 'approval_requested' | 'approval_decided' | 'workflow_completed';

/** An appendable audit shape; callers supply IDs/timestamps, never this module. */
export interface WorkflowAuditEvent {
  id: string;
  workflowId: string;
  kind: WorkflowAuditEventKind;
  occurredAt: string;
  actor?: { kind: OrganizationWorkerKind; id: string };
  taskId?: string;
  checkpointId?: string;
  summary: string;
}
