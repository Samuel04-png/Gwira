import { MAX_COMMENTS_PER_TASK, MAX_PERSISTED_ACTIVITY, createEmptyLocalState } from '../domain/types.js';
import type { ActivityEvent, Agent, Approval, Assignee, BusinessProject, DoatRecord, GwiraLocalState, Person, Task, TaskComment } from '../domain/types.js';
import { validateOrganizationStructure } from '../organization/domain/model.js';
import type { OrganizationStructure } from '../organization/domain/organizationTypes.js';
import type { LocalOnboardingState } from '../onboarding/onboardingModel.js';

/** Separate from every Codex Desktop preference and history key. */
export const GWIRA_LOCAL_STORAGE_KEY = 'gwira.local-prototype.v1';
/** Preserves the last malformed payload before the renderer creates fresh state. */
export const GWIRA_LOCAL_STORAGE_RECOVERY_KEY = 'gwira.local-prototype.recovery.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type EmptyStateFactory = () => GwiraLocalState;

const MAX_NAME = 200;
const MAX_DESCRIPTION = 16_000;
const MAX_COMMENT = 8_000;
const MAX_SUMMARY = 1_000;
const MAX_ERROR = 2_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function string(value: unknown, max = MAX_NAME): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function optionalString(value: unknown, max = MAX_DESCRIPTION): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= max);
}
function date(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
function id(value: unknown): value is string {
  // UUIDs are expected for v1 entities. This also makes malformed imported data fail closed.
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isArray(value: unknown): value is unknown[] { return Array.isArray(value); }
function assignee(value: unknown): value is Assignee {
  const item = record(value);
  return !!item && (item.kind === 'person' || item.kind === 'agent') && id(item.id);
}
function person(value: unknown): value is Person {
  const item = record(value);
  return !!item && id(item.id) && id(item.workspaceId) && string(item.name) && string(item.role) && date(item.createdAt);
}
function agent(value: unknown): value is Agent {
  const item = record(value);
  return !!item && id(item.id) && id(item.workspaceId) && string(item.name) && item.type === 'coding' && date(item.createdAt);
}
function doat(value: unknown): value is DoatRecord {
  const item = record(value);
  // The independent Doat module owns its deeper contract. This boundary only
  // accepts bounded, workspace-scoped records and fails closed on unknown data.
  return !!item && id(item.id) && id(item.workspaceId) && typeof item.identity === 'object' && item.identity !== null
    && typeof item.intelligence === 'object' && item.intelligence !== null && typeof item.governance === 'object' && item.governance !== null
    && typeof item.appearance === 'object' && item.appearance !== null && typeof item.operations === 'object' && item.operations !== null;
}
function project(value: unknown): value is BusinessProject {
  const item = record(value);
  return !!item && id(item.id) && id(item.workspaceId) && string(item.name) && optionalString(item.codingProjectPath, 8_000) && date(item.createdAt);
}
function task(value: unknown): value is Task {
  const item = record(value);
  const validStatus = item?.status === 'backlog' || item?.status === 'todo' || item?.status === 'in_progress' || item?.status === 'in_review' || item?.status === 'done' || item?.status === 'blocked';
  const validPriority = item?.priority === 'low' || item?.priority === 'medium' || item?.priority === 'high' || item?.priority === 'urgent';
  if (!item || !id(item.id) || !id(item.workspaceId) || (item.projectId !== undefined && !id(item.projectId)) || (item.parentStepId !== undefined && !id(item.parentStepId)) || (item.dependsOnTaskIds !== undefined && (!isArray(item.dependsOnTaskIds) || !item.dependsOnTaskIds.every(id))) || !string(item.title) || !optionalString(item.description) || !validStatus || !validPriority || (item.dueDate !== undefined && !date(item.dueDate)) || (item.assignee !== undefined && !assignee(item.assignee)) || !date(item.createdAt) || !date(item.updatedAt)) return false;
  if (item.agentRun !== undefined) {
    const run = record(item.agentRun);
    if (!run || !string(run.sessionId, 500) || (run.codexConversationId !== undefined && !string(run.codexConversationId, 500)) || !['running', 'completed', 'error', 'stopped'].includes(String(run.status)) || !date(run.startedAt) || (run.completedAt !== undefined && !date(run.completedAt)) || (run.error !== undefined && !optionalString(run.error, MAX_ERROR))) return false;
  }
  return true;
}
function comment(value: unknown): value is TaskComment {
  const item = record(value);
  return !!item && id(item.id) && id(item.taskId) && assignee(item.author) && string(item.body, MAX_COMMENT) && date(item.createdAt);
}
function approval(value: unknown): value is Approval {
  const item = record(value);
  return !!item && id(item.id) && id(item.taskId) && string(item.resultId, 500) && assignee(item.requestedBy) && ['pending', 'approved', 'changes_requested'].includes(String(item.status)) && date(item.createdAt) && (item.decidedAt === undefined || date(item.decidedAt)) && (item.decidedBy === undefined || assignee(item.decidedBy));
}
function activity(value: unknown): value is ActivityEvent {
  const item = record(value);
  const kinds = ['workspace_created', 'workspace_renamed', 'project_created', 'task_created', 'task_updated', 'task_status_changed', 'comment_added', 'agent_run_updated', 'approval_requested', 'approval_approved', 'approval_changes_requested', 'doat_created', 'doat_updated', 'organization_updated'];
  return !!item && id(item.id) && id(item.workspaceId) && kinds.includes(String(item.kind)) && date(item.occurredAt) && string(item.summary, MAX_SUMMARY) && (item.actor === undefined || assignee(item.actor)) && (item.taskId === undefined || id(item.taskId)) && (item.projectId === undefined || id(item.projectId)) && (item.approvalId === undefined || id(item.approvalId));
}

function unique(values: { id: string }[]): boolean { return new Set(values.map((value) => value.id)).size === values.length; }

/** Strict validation intentionally declines unsupported/malformed historical shapes. */
export function isValidGwiraLocalState(value: unknown): value is GwiraLocalState {
  const item = record(value);
  if (!item || item.schemaVersion !== 4 || !isArray(item.people) || !isArray(item.agents) || !isArray(item.doats) || !isArray(item.projects) || !isArray(item.tasks) || !isArray(item.comments) || !isArray(item.approvals) || !isArray(item.activity) || !onboarding(item.onboarding)) return false;
  const organization = record(item.organization);
  const workspace = record(item.workspace);
  if (!organization || !workspace || !id(organization.id) || !organizationStructure(item.organizationStructure, organization.id)) return false;
  if (!id(organization.id) || !string(organization.name) || !date(organization.createdAt) || !id(workspace.id) || workspace.organizationId !== organization.id || !string(workspace.name) || !date(workspace.createdAt) || !item.people.every(person) || !item.agents.every(agent) || !item.doats.every(doat) || !item.projects.every(project) || !item.tasks.every(task) || !item.comments.every(comment) || !item.approvals.every(approval) || !item.activity.every(activity)) return false;
  const state = item as unknown as GwiraLocalState;
  if (!unique(state.people) || !unique(state.agents) || !unique(state.doats) || !unique(state.projects) || !unique(state.tasks) || !unique(state.comments) || !unique(state.approvals) || !unique(state.activity)) return false;
  const personIds = new Set(state.people.filter((entry) => entry.workspaceId === workspace.id).map((entry) => entry.id));
  const agentIds = new Set(state.agents.filter((entry) => entry.workspaceId === workspace.id).map((entry) => entry.id));
  const doatIds = new Set(state.doats.filter((entry) => entry.workspaceId === workspace.id).map((entry) => entry.id));
  const projectIds = new Set(state.projects.filter((entry) => entry.workspaceId === workspace.id).map((entry) => entry.id));
  const validActor = (value: Assignee) => value.kind === 'person' ? personIds.has(value.id) : agentIds.has(value.id);
  return state.people.length === personIds.size && state.agents.length === agentIds.size && state.doats.every((entry) => entry.workspaceId === workspace.id)
    && organizationWorkerReferencesExist(state.organizationStructure, personIds, doatIds)
    && state.projects.length === projectIds.size
    && state.tasks.every((entry) => entry.workspaceId === workspace.id && (!entry.projectId || projectIds.has(entry.projectId)) && (!entry.assignee || validActor(entry.assignee)))
    && state.comments.every((entry) => state.tasks.some((taskEntry) => taskEntry.id === entry.taskId) && validActor(entry.author))
    && state.approvals.every((entry) => state.tasks.some((taskEntry) => taskEntry.id === entry.taskId) && validActor(entry.requestedBy) && (!entry.decidedBy || validActor(entry.decidedBy)))
    && state.activity.every((entry) => entry.workspaceId === workspace.id && (!entry.actor || validActor(entry.actor)) && (!entry.taskId || state.tasks.some((taskEntry) => taskEntry.id === entry.taskId)) && (!entry.projectId || projectIds.has(entry.projectId)) && (!entry.approvalId || state.approvals.some((approvalEntry) => approvalEntry.id === entry.approvalId)));
}

function organizationWorkerReferencesExist(structure: OrganizationStructure, personIds: ReadonlySet<string>, doatIds: ReadonlySet<string>): boolean {
  const exists = (worker: { kind: string; id: string } | undefined) => !worker || (worker.kind === 'person' ? personIds.has(worker.id) : worker.kind === 'doat' && doatIds.has(worker.id));
  return structure.divisions.every((division) => exists(division.manager))
    && structure.departments.every((department) => department.humanMemberIds.every((id) => personIds.has(id)) && department.doatMemberIds.every((id) => doatIds.has(id)) && exists(department.manager))
    && structure.teams.every((team) => team.members.every(exists) && exists(team.manager))
    && structure.reportingRelationships.every((relationship) => exists(relationship.worker) && exists(relationship.supervisor));
}

function organizationStructure(value: unknown, organizationId: string): value is OrganizationStructure {
  const item = record(value);
  if (!item || item.organizationId !== organizationId || !['functional', 'divisional', 'flat'].includes(String(item.model)) || !isArray(item.divisions) || !isArray(item.departments) || !isArray(item.teams) || !isArray(item.reportingRelationships) || !date(item.createdAt) || !date(item.updatedAt)) return false;
  return validateOrganizationStructure(item as unknown as OrganizationStructure).length === 0;
}

function onboarding(value: unknown): value is LocalOnboardingState {
  const item = record(value); const profile = item ? record(item.profile) : undefined;
  return !!item && item.version === 1 && ['business', 'organization', 'starting-point', 'team-guidance', 'complete'].includes(String(item.currentStep)) && !!profile && typeof profile.businessName === 'string'
    && (item.completedAt === undefined || date(item.completedAt));
}

/** Enforces retention at the persistence boundary without modifying Codex data. */
export function boundedForPersistence(state: GwiraLocalState): GwiraLocalState {
  const comments = state.comments.reduce<TaskComment[]>((all, entry) => {
    const recentForTask = [...all.filter((comment) => comment.taskId === entry.taskId), entry].slice(-MAX_COMMENTS_PER_TASK);
    return [...all.filter((comment) => comment.taskId !== entry.taskId), ...recentForTask];
  }, []);
  return { ...state, comments, activity: state.activity.slice(-MAX_PERSISTED_ACTIVITY) };
}

export function serializeGwiraLocalState(state: GwiraLocalState): string {
  if (!isValidGwiraLocalState(state)) throw new Error('Refusing to persist invalid Gwira local state');
  return JSON.stringify(boundedForPersistence(state));
}

export function parseGwiraLocalState(raw: string | null, empty: EmptyStateFactory): GwiraLocalState {
  if (!raw) return empty();
  try {
    const parsed: unknown = JSON.parse(raw);
    const migrated = migrateGwiraLocalState(parsed);
    return migrated && isValidGwiraLocalState(migrated) ? boundedForPersistence(migrated) : empty();
  } catch {
    return empty();
  }
}

/** Schema 1 had no Doat data. Migration is additive and never edits Codex records. */
function migrateGwiraLocalState(value: unknown): unknown {
  const item = record(value);
  const organization = item ? record(item.organization) : undefined;
  const workspace = item ? record(item.workspace) : undefined;
  const organizationId = organization?.id;
  const workspaceId = workspace?.id;
  const createdAt = organization?.createdAt;
  if (item?.schemaVersion === 3 && id(organizationId) && id(workspaceId)) {
    return { ...item, schemaVersion: 4, onboarding: { version: 1, currentStep: 'complete', profile: { businessName: typeof organization?.name === 'string' ? organization.name : 'Local organization' }, completedAt: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString() } };
  }
  if (item?.schemaVersion === 2 && id(organizationId) && id(workspaceId)) {
    const initial = createEmptyLocalState({ organizationId, workspaceId }, typeof createdAt === 'string' ? createdAt : new Date(0).toISOString());
    return { ...item, schemaVersion: 4, organizationStructure: initial.organizationStructure, onboarding: { version: 1, currentStep: 'complete', profile: { businessName: typeof organization?.name === 'string' ? organization.name : 'Local organization' }, completedAt: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString() } };
  }
  if (item?.schemaVersion === 1 && isArray(item.people) && isArray(item.agents) && isArray(item.projects) && isArray(item.tasks) && isArray(item.comments) && isArray(item.approvals) && isArray(item.activity)) {
    if (!id(organizationId) || !id(workspaceId)) return value;
    const initial = createEmptyLocalState({ organizationId, workspaceId }, typeof createdAt === 'string' ? createdAt : new Date(0).toISOString());
    return { ...item, schemaVersion: 4, doats: [], organizationStructure: initial.organizationStructure, onboarding: { version: 1, currentStep: 'complete', profile: { businessName: typeof organization?.name === 'string' ? organization.name : 'Local organization' }, completedAt: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString() } };
  }
  return value;
}

export function loadGwiraLocalState(storage: StorageLike, empty: EmptyStateFactory): GwiraLocalState {
  try {
    const raw = storage.getItem(GWIRA_LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isValidGwiraLocalState(migrateGwiraLocalState(parsed))) storage.setItem(GWIRA_LOCAL_STORAGE_RECOVERY_KEY, raw);
      } catch {
        storage.setItem(GWIRA_LOCAL_STORAGE_RECOVERY_KEY, raw);
      }
    }
    return parseGwiraLocalState(raw, empty);
  } catch {
    return empty();
  }
}

export function saveGwiraLocalState(storage: StorageLike, state: GwiraLocalState): void {
  storage.setItem(GWIRA_LOCAL_STORAGE_KEY, serializeGwiraLocalState(state));
}

/** Convenience factory for initial browser integration; callers supply UUIDs. */
export function createInitialLocalState(organizationId: string, workspaceId: string, now: string): GwiraLocalState {
  return createEmptyLocalState({ organizationId, workspaceId }, now);
}
