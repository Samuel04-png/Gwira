/**
 * Business records for Gwira's local-only prototype. These records are kept
 * deliberately separate from Codex projects, histories and execution output.
 */
import type { Doat } from '../doats/domain/types.js';
import type { OrganizationStructure } from '../organization/domain/organizationTypes.js';
import { createOrganizationStructure } from '../organization/domain/model.js';
import { createLocalOnboardingState } from '../onboarding/onboardingModel.js';
import type { LocalOnboardingState } from '../onboarding/onboardingModel.js';
/** Schema 2 adds independent Doat records without changing Codex data. */
export const GWIRA_SCHEMA_VERSION = 4 as const;
export const MAX_PERSISTED_ACTIVITY = 500;
export const MAX_COMMENTS_PER_TASK = 100;

export type IsoDate = string;
export type EntityId = string;

export interface Organization {
  id: EntityId;
  name: string;
  createdAt: IsoDate;
}

export interface Workspace {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  createdAt: IsoDate;
}

export interface Person {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  role: string;
  /** Stable owner colour; assigned in palette order by the person creator. */
  colorKey?: 'plum' | 'rose' | 'slate' | 'olive' | 'coral' | 'indigo' | 'sage' | 'teal';
  createdAt: IsoDate;
}

export type AgentType = 'coding';

export interface Agent {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  type: AgentType;
  createdAt: IsoDate;
}

export type DoatRecord = Doat;

/** A local business project may point at, but never owns, a Codex project. */
export interface BusinessProject {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  codingProjectPath?: string;
  createdAt: IsoDate;
}

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type Assignee = { kind: 'person' | 'agent'; id: EntityId };
export type AgentRunStatus = 'running' | 'completed' | 'error' | 'stopped';

/** Metadata only: the Codex JSONL transcript remains the canonical output. */
export interface AgentRun {
  sessionId: string;
  codexConversationId?: string;
  status: AgentRunStatus;
  startedAt: IsoDate;
  completedAt?: IsoDate;
  error?: string;
}

export interface Task {
  id: EntityId;
  workspaceId: EntityId;
  projectId?: EntityId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: IsoDate;
  assignee?: Assignee;
  agentRun?: AgentRun;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  /** Optional local hierarchy for workflow drill-down; never execution state. */
  parentStepId?: EntityId;
  /** Explicit predecessor task ids. A task waits for each listed task. */
  dependsOnTaskIds?: EntityId[];
}

export interface TaskComment {
  id: EntityId;
  taskId: EntityId;
  author: Assignee;
  body: string;
  createdAt: IsoDate;
}

export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested';

/** resultId is an exact, caller supplied identifier for the completed result. */
export interface Approval {
  id: EntityId;
  taskId: EntityId;
  resultId: string;
  requestedBy: Assignee;
  status: ApprovalStatus;
  createdAt: IsoDate;
  decidedAt?: IsoDate;
  decidedBy?: Assignee;
}

export type ActivityKind =
  | 'workspace_created' | 'workspace_renamed' | 'project_created' | 'task_created'
  | 'task_updated' | 'task_status_changed' | 'comment_added' | 'agent_run_updated'
  | 'approval_requested' | 'approval_approved' | 'approval_changes_requested'
  | 'doat_created' | 'doat_updated' | 'organization_updated';

export interface ActivityEvent {
  id: EntityId;
  workspaceId: EntityId;
  kind: ActivityKind;
  occurredAt: IsoDate;
  actor?: Assignee;
  taskId?: EntityId;
  projectId?: EntityId;
  approvalId?: EntityId;
  /** Short, structured summary only. Never model output, credentials or logs. */
  summary: string;
}

export interface GwiraLocalState {
  schemaVersion: typeof GWIRA_SCHEMA_VERSION;
  organization: Organization;
  workspace: Workspace;
  people: Person[];
  agents: Agent[];
  /** Configured workforce records. A Codex-capable Doat shares its id with its coding Agent. */
  doats: DoatRecord[];
  /** Accountability structure only; never a source of execution permission. */
  organizationStructure: OrganizationStructure;
  /** Local setup progress. Existing workspaces migrate as complete to avoid surprise setup prompts. */
  onboarding: LocalOnboardingState;
  projects: BusinessProject[];
  tasks: Task[];
  comments: TaskComment[];
  approvals: Approval[];
  activity: ActivityEvent[];
}

export interface NewLocalStateIds {
  organizationId: EntityId;
  workspaceId: EntityId;
}

export function createEmptyLocalState(ids: NewLocalStateIds, now: IsoDate, organizationName = 'Local organization', workspaceName = 'My workspace'): GwiraLocalState {
  return {
    schemaVersion: GWIRA_SCHEMA_VERSION,
    organization: { id: ids.organizationId, name: organizationName, createdAt: now },
    workspace: { id: ids.workspaceId, organizationId: ids.organizationId, name: workspaceName, createdAt: now },
    people: [], agents: [], doats: [], organizationStructure: createOrganizationStructure(ids.organizationId, 'flat', now), onboarding: createLocalOnboardingState(), projects: [], tasks: [], comments: [], approvals: [], activity: []
  };
}
