export type ProposalStatus = 'draft' | 'generated' | 'validating' | 'ready' | 'invalid' | 'conflict' | 'applying' | 'applied' | 'failed' | 'expired';
export type ProposalOwner = { kind: 'person' | 'agent'; id: string };
export type ProposalStep = { id: string; title: string; description?: string; owner?: ProposalOwner; dependsOn: readonly string[] };
export interface ProposalApprovalPolicy { id: string; taskId: string; stage: 'before_execution' | 'before_completion'; label: string; humanApprovalRequired: true; requiredApproverRole?: string; separationOfDuties?: boolean; }
export type ApprovalPolicyDraft = Omit<ProposalApprovalPolicy, 'id' | 'taskId'> & { id?: string };

export type ProposalOperation =
  | { kind: 'add_step'; clientKey: string; title: string; description?: string; owner?: ProposalOwner }
  | { kind: 'update_step'; stepId: string; patch: { title?: string; description?: string; owner?: ProposalOwner | null } }
  | { kind: 'remove_step'; stepId: string }
  | { kind: 'add_handoff'; predecessorId: string; successorId: string }
  | { kind: 'remove_handoff'; predecessorId: string; successorId: string }
  | { kind: 'add_approval_policy'; stepId: string; policy: ApprovalPolicyDraft };

export type ProposalIssue =
  | { code: 'base-version'; message: string }
  | { code: 'unknown-step'; stepId: string }
  | { code: 'unknown-owner'; ownerId: string }
  | { code: 'duplicate-client-key'; clientKey: string }
  | { code: 'invalid-operation'; message: string }
  | { code: 'invalid-plan'; message: string };

export interface ProposalValidation { ok: boolean; issues: readonly ProposalIssue[]; preview?: WorkflowSnapshot; }
export interface WorkflowSnapshot {
  organizationId: string;
  workflowId: string;
  version: number;
  steps: readonly ProposalStep[];
  approvalPolicies: readonly ProposalApprovalPolicy[];
}
export interface PlanProposal {
  id: string;
  organizationId: string;
  workflowId: string;
  baseVersion: number;
  requestedBy: string;
  createdAt: string;
  expiresAt: string;
  status: ProposalStatus;
  operations: readonly ProposalOperation[];
}
export interface ProposalAuditEvent { id: string; proposalId: string; kind: 'generated' | 'validated' | 'applied' | 'undone'; occurredAt: string; summary: string; organizationId?: string; actorId?: string; workflowVersion?: number; }
export interface ApplyResult { ok: boolean; snapshot: WorkflowSnapshot; proposal?: PlanProposal; audit: readonly ProposalAuditEvent[]; reason?: 'conflict' | 'invalid' | 'expired'; }

export const PLAN_PROPOSAL_LIMITS = {
  operations: 100,
  steps: 1_000,
  dependenciesPerStep: 500,
  totalDependencies: 20_000,
  identifier: 128,
  title: 200,
  description: 4_000,
  approvalLabel: 200,
  ownerRole: 100,
  lifetimeMs: 24 * 60 * 60 * 1_000
} as const;

const proposalStepPrefix = '__proposal__:';
const ref = (id: string, added: ReadonlyMap<string, string>): string | undefined => id.startsWith('client:') ? added.get(id.slice('client:'.length)) : id;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function text(value: unknown, maxLength: number = PLAN_PROPOSAL_LIMITS.identifier): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
  if (!match) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const date = new Date(parsed);
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) && date.getUTCMinutes() === Number(match[5]) && date.getUTCSeconds() === Number(match[6]);
}

function parseOwner(value: unknown): ProposalOwner | undefined | null | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const owner = record(value);
  if (!owner || !hasOnlyKeys(owner, ['kind', 'id']) || (owner.kind !== 'person' && owner.kind !== 'agent') || !text(owner.id)) return false;
  return { kind: owner.kind, id: owner.id };
}

/** Strictly accepts only bounded, known proposal operations and fields. */
export function parseProposalOperations(value: unknown): { ok: true; operations: ProposalOperation[] } | { ok: false; issues: ProposalIssue[] } {
  if (!Array.isArray(value) || value.length > PLAN_PROPOSAL_LIMITS.operations) return { ok: false, issues: [{ code: 'invalid-operation', message: `Proposal operations must be an array of at most ${PLAN_PROPOSAL_LIMITS.operations} items.` }] };
  const operations: ProposalOperation[] = [];
  const issues: ProposalIssue[] = [];
  for (const entry of value) {
    const operation = record(entry);
    if (!operation || !text(operation.kind, 40)) { issues.push({ code: 'invalid-operation', message: 'Proposal operation must be a supported object.' }); continue; }
    if (operation.kind === 'add_step') {
      if (!hasOnlyKeys(operation, ['kind', 'clientKey', 'title', 'description', 'owner']) || !text(operation.clientKey) || !text(operation.title, PLAN_PROPOSAL_LIMITS.title) || (operation.description !== undefined && (typeof operation.description !== 'string' || operation.description.length > PLAN_PROPOSAL_LIMITS.description))) {
        issues.push({ code: 'invalid-operation', message: 'An added step contains invalid fields or exceeds its input limits.' }); continue;
      }
      const owner = parseOwner(operation.owner);
      if (owner === null || owner === false) { issues.push({ code: 'invalid-operation', message: 'An added step owner must be a valid person or agent reference.' }); continue; }
      operations.push({ kind: 'add_step', clientKey: operation.clientKey, title: operation.title.trim(), description: typeof operation.description === 'string' ? operation.description.trim() : undefined, owner });
    } else if (operation.kind === 'update_step') {
      const patch = record(operation.patch);
      if (!hasOnlyKeys(operation, ['kind', 'stepId', 'patch']) || !text(operation.stepId) || !patch || !hasOnlyKeys(patch, ['title', 'description', 'owner']) || Object.keys(patch).length === 0 ||
        (patch.title !== undefined && !text(patch.title, PLAN_PROPOSAL_LIMITS.title)) ||
        (patch.description !== undefined && (typeof patch.description !== 'string' || patch.description.length > PLAN_PROPOSAL_LIMITS.description))) {
        issues.push({ code: 'invalid-operation', message: 'A step update contains invalid fields or exceeds its input limits.' }); continue;
      }
      const owner = parseOwner(patch.owner);
      if (owner === false) { issues.push({ code: 'invalid-operation', message: 'An updated owner must be a valid person or agent reference.' }); continue; }
      operations.push({ kind: 'update_step', stepId: operation.stepId, patch: { title: typeof patch.title === 'string' ? patch.title.trim() : undefined, description: typeof patch.description === 'string' ? patch.description.trim() : undefined, owner } });
    } else if (operation.kind === 'remove_step') {
      if (!hasOnlyKeys(operation, ['kind', 'stepId']) || !text(operation.stepId)) { issues.push({ code: 'invalid-operation', message: 'A removed step needs a valid step id.' }); continue; }
      operations.push({ kind: 'remove_step', stepId: operation.stepId });
    } else if (operation.kind === 'add_handoff' || operation.kind === 'remove_handoff') {
      if (!hasOnlyKeys(operation, ['kind', 'predecessorId', 'successorId']) || !text(operation.predecessorId) || !text(operation.successorId)) { issues.push({ code: 'invalid-operation', message: 'A handoff needs valid predecessor and successor ids.' }); continue; }
      operations.push({ kind: operation.kind, predecessorId: operation.predecessorId, successorId: operation.successorId });
    } else if (operation.kind === 'add_approval_policy') {
      const policy = record(operation.policy);
      if (!hasOnlyKeys(operation, ['kind', 'stepId', 'policy']) || !text(operation.stepId) || !policy ||
        !hasOnlyKeys(policy, ['id', 'stage', 'label', 'humanApprovalRequired', 'requiredApproverRole', 'separationOfDuties']) ||
        (policy.id !== undefined && !text(policy.id)) ||
        (policy.stage !== 'before_execution' && policy.stage !== 'before_completion') ||
        !text(policy.label, PLAN_PROPOSAL_LIMITS.approvalLabel) ||
        (policy.humanApprovalRequired !== undefined && policy.humanApprovalRequired !== true) ||
        (policy.requiredApproverRole !== undefined && !text(policy.requiredApproverRole, PLAN_PROPOSAL_LIMITS.ownerRole)) ||
        (policy.separationOfDuties !== undefined && typeof policy.separationOfDuties !== 'boolean')) {
        issues.push({ code: 'invalid-operation', message: 'The approval policy contains invalid fields.' }); continue;
      }
      operations.push({ kind: 'add_approval_policy', stepId: operation.stepId, policy: { id: typeof policy.id === 'string' ? policy.id : undefined, stage: policy.stage, label: policy.label.trim(), humanApprovalRequired: true, requiredApproverRole: typeof policy.requiredApproverRole === 'string' ? policy.requiredApproverRole.trim() : undefined, separationOfDuties: typeof policy.separationOfDuties === 'boolean' ? policy.separationOfDuties : undefined } });
    } else {
      issues.push({ code: 'invalid-operation', message: 'The proposal contains an unsupported operation.' });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, operations };
}

export function parsePlanProposal(value: unknown): { ok: true; proposal: PlanProposal } | { ok: false; issues: ProposalIssue[] } {
  const proposal = record(value);
  const required = ['id', 'organizationId', 'workflowId', 'baseVersion', 'requestedBy', 'createdAt', 'expiresAt', 'status', 'operations'];
  if (!proposal || !hasOnlyKeys(proposal, required) || Object.keys(proposal).length !== required.length ||
    !text(proposal.id) || !text(proposal.organizationId) || !text(proposal.workflowId) || !Number.isSafeInteger(proposal.baseVersion) || (proposal.baseVersion as number) < 0 ||
    !text(proposal.requestedBy) || !timestamp(proposal.createdAt) || !timestamp(proposal.expiresAt) ||
    !['draft', 'generated', 'validating', 'ready', 'invalid', 'conflict', 'applying', 'applied', 'failed', 'expired'].includes(String(proposal.status))) {
    return { ok: false, issues: [{ code: 'invalid-operation', message: 'The proposal envelope is malformed or contains unsupported fields.' }] };
  }
  const parsedOperations = parseProposalOperations(proposal.operations);
  if (!parsedOperations.ok) return parsedOperations;
  return { ok: true, proposal: { id: proposal.id, organizationId: proposal.organizationId, workflowId: proposal.workflowId, baseVersion: proposal.baseVersion as number, requestedBy: proposal.requestedBy, createdAt: proposal.createdAt, expiresAt: proposal.expiresAt, status: proposal.status as ProposalStatus, operations: parsedOperations.operations } };
}

export interface ProposalGenerationInput { prompt: string; organizationId: string; workflowId: string; baseVersion: number; requestedBy: string; createdAt: string; expiresAt: string; }
export interface PlanProposalGenerator { generate(input: ProposalGenerationInput): Promise<unknown>; }

/** No model or tool authority: development generator emits one bounded add-step proposal. */
export class DeterministicPlanProposalGenerator implements PlanProposalGenerator {
  async generate(input: ProposalGenerationInput): Promise<unknown> {
    return { id: `proposal-${input.createdAt}`, organizationId: input.organizationId, workflowId: input.workflowId, baseVersion: input.baseVersion, requestedBy: input.requestedBy, createdAt: input.createdAt, expiresAt: input.expiresAt, status: 'generated', operations: [{ kind: 'add_step', clientKey: 'requested-step', title: input.prompt }] };
  }
}

export async function generatePlanProposal(input: ProposalGenerationInput, generator: PlanProposalGenerator): Promise<PlanProposal> {
  if (!text(input.prompt, PLAN_PROPOSAL_LIMITS.description) || !text(input.organizationId) || !text(input.workflowId) || !Number.isSafeInteger(input.baseVersion) || input.baseVersion < 0 || !text(input.requestedBy) || !timestamp(input.createdAt) || !timestamp(input.expiresAt)) throw new Error('Proposal generation input is invalid.');
  const created = Date.parse(input.createdAt); const expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created || expires - created > PLAN_PROPOSAL_LIMITS.lifetimeMs) throw new Error('Proposal generation expiry is invalid.');
  const parsed = parsePlanProposal(await generator.generate(input));
  if (!parsed.ok) throw new Error(`Generated proposal rejected: ${parsed.issues.map((issue) => issue.code).join(', ')}.`);
  if (parsed.proposal.organizationId !== input.organizationId || parsed.proposal.workflowId !== input.workflowId || parsed.proposal.baseVersion !== input.baseVersion || parsed.proposal.requestedBy !== input.requestedBy || parsed.proposal.status !== 'generated') throw new Error('Generated proposal does not match its authorized request context.');
  return parsed.proposal;
}

export function validatePlanProposal(snapshot: WorkflowSnapshot, untrustedProposal: unknown, ownerIds: ReadonlyMap<string, ProposalOwner['kind']>, now: string): ProposalValidation {
  const issues: ProposalIssue[] = [];
  const parsed = parsePlanProposal(untrustedProposal);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  const proposal = parsed.proposal;
  const currentTime = timestamp(now) ? Date.parse(now) : Number.NaN;
  const createdAt = Date.parse(proposal.createdAt);
  const expiresAt = Date.parse(proposal.expiresAt);
  if (!timestamp(now) || !Number.isFinite(currentTime) || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt > currentTime || expiresAt <= currentTime || expiresAt <= createdAt || expiresAt - createdAt > PLAN_PROPOSAL_LIMITS.lifetimeMs) {
    issues.push({ code: 'invalid-operation', message: 'Proposal timestamps or expiry are invalid.' });
  }
  if (proposal.status !== 'generated' && proposal.status !== 'ready') issues.push({ code: 'invalid-operation', message: 'Only generated proposals can be validated.' });
  if (proposal.organizationId !== snapshot.organizationId || proposal.workflowId !== snapshot.workflowId) issues.push({ code: 'invalid-operation', message: 'The proposal does not belong to this workflow.' });
  if (proposal.baseVersion !== snapshot.version) issues.push({ code: 'base-version', message: 'The workflow changed. Review the proposal against the latest version.' });
  if (snapshot.steps.length > PLAN_PROPOSAL_LIMITS.steps || proposal.operations.length > PLAN_PROPOSAL_LIMITS.operations) issues.push({ code: 'invalid-operation', message: 'The workflow or proposal exceeds configured limits.' });
  if (issues.length) return { ok: false, issues };

  const steps = clone(snapshot.steps) as ProposalStep[];
  const approvals = clone(snapshot.approvalPolicies) as ProposalApprovalPolicy[];
  if (steps.some((step) => !text(step.id) || !text(step.title, PLAN_PROPOSAL_LIMITS.title) || !Array.isArray(step.dependsOn) || step.dependsOn.length > PLAN_PROPOSAL_LIMITS.dependenciesPerStep)) return { ok: false, issues: [{ code: 'invalid-operation', message: 'The current workflow contains malformed or oversized steps.' }] };
  for (const step of steps) {
    if (step.owner && ownerIds.get(step.owner.id) !== step.owner.kind) issues.push({ code: 'unknown-owner', ownerId: step.owner.id });
  }
  const clientKeys = new Set<string>(); const added = new Map<string, string>();
  const find = (id: string) => steps.find((step) => step.id === ref(id, added));
  const ownerIsValid = (owner: ProposalOwner): boolean => ownerIds.get(owner.id) === owner.kind;
  for (const operation of proposal.operations) {
    if (operation.kind === 'add_step') {
      if (clientKeys.has(operation.clientKey)) { issues.push({ code: 'duplicate-client-key', clientKey: operation.clientKey }); continue; }
      clientKeys.add(operation.clientKey);
      if (operation.owner && !ownerIsValid(operation.owner)) issues.push({ code: 'unknown-owner', ownerId: operation.owner.id });
      const id = `${proposalStepPrefix}${operation.clientKey}`; added.set(operation.clientKey, id); steps.push({ id, title: operation.title.trim(), description: operation.description?.trim() || undefined, owner: operation.owner, dependsOn: [] });
    } else if (operation.kind === 'update_step') {
      const step = find(operation.stepId); if (!step) { issues.push({ code: 'unknown-step', stepId: operation.stepId }); continue; }
      if (operation.patch.owner && !ownerIsValid(operation.patch.owner)) issues.push({ code: 'unknown-owner', ownerId: operation.patch.owner.id });
      Object.assign(step, { ...operation.patch, title: operation.patch.title?.trim() || step.title, description: operation.patch.description?.trim() || undefined });
    } else if (operation.kind === 'remove_step') {
      const id = ref(operation.stepId, added); const index = steps.findIndex((step) => step.id === id);
      if (index < 0) issues.push({ code: 'unknown-step', stepId: operation.stepId }); else steps.splice(index, 1);
    } else if (operation.kind === 'add_handoff' || operation.kind === 'remove_handoff') {
      const predecessor = ref(operation.predecessorId, added); const successor = find(operation.successorId);
      if (!predecessor || !steps.some((step) => step.id === predecessor)) issues.push({ code: 'unknown-step', stepId: operation.predecessorId });
      if (!successor) { issues.push({ code: 'unknown-step', stepId: operation.successorId }); continue; }
      if (!predecessor || !steps.some((step) => step.id === predecessor)) continue;
      successor.dependsOn = operation.kind === 'add_handoff' ? [...new Set([...successor.dependsOn, predecessor])] : successor.dependsOn.filter((id) => id !== predecessor);
    } else if (operation.kind === 'add_approval_policy') {
      const step = find(operation.stepId); if (!step) { issues.push({ code: 'unknown-step', stepId: operation.stepId }); continue; }
      approvals.push({ ...operation.policy, id: operation.policy.id ?? `__proposal_approval__:${approvals.length}`, taskId: step.id, humanApprovalRequired: true });
    }
  }
  if (steps.length > PLAN_PROPOSAL_LIMITS.steps || steps.some((step) => step.dependsOn.length > PLAN_PROPOSAL_LIMITS.dependenciesPerStep) || steps.reduce((sum, step) => sum + step.dependsOn.length, 0) > PLAN_PROPOSAL_LIMITS.totalDependencies) issues.push({ code: 'invalid-operation', message: 'The resulting workflow exceeds configured limits.' });
  if (issues.length) return { ok: false, issues };
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length) issues.push({ code: 'invalid-plan', message: 'Workflow contains duplicate step ids.' });
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) issues.push({ code: 'invalid-plan', message: `Workflow step ${step.id} refers to an unknown dependency.` });
      if (dependency === step.id) issues.push({ code: 'invalid-plan', message: `Workflow step ${step.id} depends on itself.` });
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const step = steps.find((candidate) => candidate.id === id);
    const cycle = !!step && step.dependsOn.some((dependency) => ids.has(dependency) && hasCycle(dependency));
    visiting.delete(id); visited.add(id);
    return cycle;
  };
  if ([...ids].some(hasCycle)) issues.push({ code: 'invalid-plan', message: 'Workflow dependencies must not contain cycles.' });
  const approvalIds = new Set<string>();
  for (const approval of approvals) {
    if (approvalIds.has(approval.id)) issues.push({ code: 'invalid-plan', message: 'Workflow contains duplicate approval policy ids.' });
    approvalIds.add(approval.id);
    if (!ids.has(approval.taskId)) issues.push({ code: 'invalid-plan', message: 'Approval policy refers to an unknown step.' });
  }
  return issues.length ? { ok: false, issues } : { ok: true, issues: [], preview: { ...snapshot, steps, approvalPolicies: approvals } };
}

/** In-memory test/development helper only; never authorizes or persists Core changes. */
export class LocalPlanProposalService {
  private readonly appliedByKey = new Map<string, { proposalId: string; result: ApplyResult }>();
  private readonly appliedSnapshots = new Map<string, { before: WorkflowSnapshot; appliedVersion: number; undone: boolean }>();
  private readonly proposals = new Map<string, PlanProposal>();
  readonly audit: ProposalAuditEvent[] = [];
  constructor(private snapshot: WorkflowSnapshot, private readonly ownerIds: ReadonlyMap<string, ProposalOwner['kind']>, private readonly idFactory: () => string, private readonly now: () => string) {}
  current(): WorkflowSnapshot { return clone(this.snapshot); }
  apply(proposal: PlanProposal, idempotencyKey: string): ApplyResult {
    const parsed = parsePlanProposal(proposal);
    if (!parsed.ok) return this.result(proposal, false, 'invalid');
    proposal = parsed.proposal;
    const prior = this.appliedByKey.get(idempotencyKey);
    if (prior) return prior.proposalId === proposal.id ? clone(prior.result) : this.result(proposal, false, 'conflict');
    if (timestamp(proposal.expiresAt) && timestamp(this.now()) && Date.parse(proposal.expiresAt) <= Date.parse(this.now())) return this.result(proposal, false, 'expired');
    const validation = validatePlanProposal(this.snapshot, proposal, this.ownerIds, this.now());
    if (!validation.ok || !validation.preview) return this.result(proposal, false, proposal.baseVersion === this.snapshot.version ? 'invalid' : 'conflict');
    const before = this.current();
    const idMap = new Map(validation.preview.steps.filter((step) => step.id.startsWith(proposalStepPrefix)).map((step) => [step.id, this.idFactory()]));
    const replace = (id: string) => idMap.get(id) ?? id;
    const next: WorkflowSnapshot = { ...validation.preview, version: before.version + 1, steps: validation.preview.steps.map((step) => ({ ...step, id: replace(step.id), dependsOn: step.dependsOn.map(replace) })), approvalPolicies: validation.preview.approvalPolicies.map((policy) => ({ ...policy, taskId: replace(policy.taskId), id: policy.id.startsWith('__proposal_approval__:') ? this.idFactory() : policy.id })) };
    const event: ProposalAuditEvent = { id: this.idFactory(), proposalId: proposal.id, kind: 'applied', occurredAt: this.now(), summary: 'Applied a validated workflow proposal.' };
    this.snapshot = next; this.audit.push(event); this.appliedSnapshots.set(proposal.id, { before, appliedVersion: next.version, undone: false });
    const appliedProposal = { ...proposal, status: 'applied' as const };
    const result: ApplyResult = { ok: true, snapshot: this.current(), proposal: appliedProposal, audit: [event] };
    this.proposals.set(proposal.id, appliedProposal);
    this.appliedByKey.set(idempotencyKey, { proposalId: proposal.id, result: clone(result) }); return result;
  }
  undo(proposalId: string): ApplyResult {
    const application = this.appliedSnapshots.get(proposalId); const last = this.audit.at(-1);
    if (!application || application.undone || this.snapshot.version !== application.appliedVersion || last?.proposalId !== proposalId || last.kind !== 'applied') return { ok: false, snapshot: this.current(), proposal: this.proposals.get(proposalId), audit: [], reason: 'conflict' };
    this.snapshot = { ...application.before, version: this.snapshot.version + 1 };
    application.undone = true;
    const event: ProposalAuditEvent = { id: this.idFactory(), proposalId, kind: 'undone', occurredAt: this.now(), summary: 'Undid the most recent proposal application.' };
    this.audit.push(event); return { ok: true, snapshot: this.current(), proposal: this.proposals.get(proposalId), audit: [event] };
  }
  private result(proposal: PlanProposal, ok: false, reason: NonNullable<ApplyResult['reason']>): ApplyResult { return { ok, reason, snapshot: this.current(), proposal: { ...proposal, status: reason === 'conflict' ? 'conflict' : reason === 'expired' ? 'expired' : 'invalid' }, audit: [] }; }
}
