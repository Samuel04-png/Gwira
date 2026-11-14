import { randomUUID } from 'node:crypto';
import { open, readFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  generatePlanProposal,
  parsePlanProposal,
  validatePlanProposal,
  PLAN_PROPOSAL_LIMITS,
  type ApplyResult,
  type PlanProposal,
  type PlanProposalGenerator,
  type ProposalAuditEvent,
  type ProposalOwner,
  type WorkflowSnapshot
} from '../../../shared/planProposals.js';

export type PlanProposalPermission = 'workflow.plan.propose' | 'workflow.plan.read' | 'workflow.plan.apply';
export interface CorePrincipal { subjectId: string; memberships: Readonly<Record<string, readonly PlanProposalPermission[]>>; }
export interface CoreAuthorizationProvider { authenticate(bearerToken: string): Promise<CorePrincipal | undefined>; }
export interface CoreWorkflowRecord { snapshot: WorkflowSnapshot; versions: readonly WorkflowSnapshot[]; owners: readonly ProposalOwner[]; }
export interface CoreStoredProposal { proposal: PlanProposal; application?: { previousSnapshot: WorkflowSnapshot; appliedVersion: number; undone: boolean }; }
export interface CoreApplyReceipt extends ApplyResult { confirmationToken?: string; preview?: WorkflowSnapshot; }
export interface CoreProposalState {
  schemaVersion: 1;
  workflows: Record<string, CoreWorkflowRecord>;
  proposals: Record<string, CoreStoredProposal>;
  idempotency: Record<string, { proposalId: string; actorId: string; result: ApplyResult }>;
  confirmations: Record<string, { proposalId: string; actorId: string; workflowId: string; baseVersion: number; expiresAt: string; consumed: boolean }>;
  audit: ProposalAuditEvent[];
}

export interface CorePlanProposalRepository { transact<T>(operation: (state: CoreProposalState) => Promise<T> | T): Promise<T>; }

export type PlanProposalCoreErrorCode = 'unauthenticated' | 'forbidden' | 'not-found' | 'invalid' | 'conflict' | 'expired' | 'storage';
export class PlanProposalCoreError extends Error {
  constructor(readonly code: PlanProposalCoreErrorCode, message: string) { super(message); this.name = 'PlanProposalCoreError'; }
}

const MAX_IDEMPOTENCY_KEY = 128;
const MAX_DATABASE_BYTES = 20 * 1024 * 1024;
const emptyState = (): CoreProposalState => ({ schemaVersion: 1, workflows: {}, proposals: {}, idempotency: {}, confirmations: {}, audit: [] });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const workflowKey = (organizationId: string, workflowId: string): string => JSON.stringify([organizationId, workflowId]);
const idempotencyKey = (organizationId: string, actorId: string, key: string): string => JSON.stringify([organizationId, actorId, key]);
const ownerMap = (owners: readonly ProposalOwner[]): ReadonlyMap<string, ProposalOwner['kind']> => new Map(owners.map((owner) => [owner.id, owner.kind]));

function validateState(value: unknown): CoreProposalState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlanProposalCoreError('storage', 'Core proposal storage has an invalid shape.');
  const state = value as Partial<CoreProposalState>;
  const isRecord = (entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry);
  if (state.schemaVersion !== 1 || !isRecord(state.workflows) || !isRecord(state.proposals) || !isRecord(state.idempotency) || !isRecord(state.confirmations) || !Array.isArray(state.audit)) {
    throw new PlanProposalCoreError('storage', 'Core proposal storage is corrupt or uses an unsupported schema.');
  }
  return state as CoreProposalState;
}

/**
 * Durable single-process repository for a Core service deployment. Production
 * multi-instance deployments must provide a database-backed implementation
 * with equivalent transaction and uniqueness guarantees.
 */
export class AtomicFileCorePlanProposalRepository implements CorePlanProposalRepository {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly filePath: string) {
    if (!path.isAbsolute(filePath)) throw new TypeError('Core proposal storage path must be absolute.');
  }

  async transact<T>(operation: (state: CoreProposalState) => Promise<T> | T): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const state = await this.read();
      const draft = clone(state);
      const result = await operation(draft);
      await this.write(draft);
      return result === undefined ? result : clone(result);
    } catch (error) {
      if (error instanceof PlanProposalCoreError) throw error;
      throw new PlanProposalCoreError('storage', `Core proposal transaction failed: ${error instanceof Error ? error.message : 'unknown storage error'}`);
    } finally {
      release();
    }
  }

  private async read(): Promise<CoreProposalState> {
    try {
      const contents = await readFile(this.filePath);
      if (contents.byteLength > MAX_DATABASE_BYTES) throw new PlanProposalCoreError('storage', 'Core proposal storage exceeds its configured size limit.');
      let parsed: unknown;
      try { parsed = JSON.parse(contents.toString('utf8')) as unknown; }
      catch { throw new PlanProposalCoreError('storage', 'Core proposal storage contains invalid JSON.'); }
      return validateState(parsed);
    } catch (error) {
      if (error instanceof PlanProposalCoreError) throw error;
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return emptyState();
      throw new PlanProposalCoreError('storage', `Unable to read Core proposal storage: ${error instanceof Error ? error.message : 'unknown storage error'}`);
    }
  }

  private async write(state: CoreProposalState): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(state)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, this.filePath);
    const directoryHandle = await open(directory, 'r');
    try { await directoryHandle.sync(); }
    finally { await directoryHandle.close(); }
  }
}

export interface GenerateProposalRequest { bearerToken: string; organizationId: string; workflowId: string; prompt: string; }
export interface ReadProposalRequest { bearerToken: string; proposalId: string; }
export interface ReadProposalAuditRequest { bearerToken: string; proposalId: string; }
export interface ReadWorkflowVersionsRequest { bearerToken: string; organizationId: string; workflowId: string; }
export interface PrepareApplyRequest { bearerToken: string; proposalId: string; }
export interface ApplyProposalRequest { bearerToken: string; proposalId: string; confirmationToken: string; idempotencyKey: string; }
export interface UndoProposalRequest { bearerToken: string; proposalId: string; }

export class CorePlanProposalService {
  constructor(
    private readonly authorization: CoreAuthorizationProvider,
    private readonly repository: CorePlanProposalRepository,
    private readonly generator: PlanProposalGenerator,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = randomUUID
  ) {}

  async generate(request: GenerateProposalRequest): Promise<PlanProposal> {
    const principal = await this.authorize(request.bearerToken, request.organizationId, 'workflow.plan.propose');
    if (!request.organizationId || request.organizationId.length > 128 || !request.workflowId || request.workflowId.length > 128) throw new PlanProposalCoreError('invalid', 'Organization and workflow references are required and must be bounded.');
    const workflow = await this.repository.transact((state) => {
      return this.requireWorkflow(state, request.organizationId, request.workflowId);
    });
    const createdAt = this.now();
    const proposal = await generatePlanProposal({
      prompt: request.prompt,
      organizationId: request.organizationId,
      workflowId: request.workflowId,
      baseVersion: workflow.snapshot.version,
      requestedBy: principal.subjectId,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 60 * 60 * 1_000).toISOString()
    }, this.generator);
    return this.repository.transact((state) => {
      const current = this.requireWorkflow(state, request.organizationId, request.workflowId);
      if (current.snapshot.version !== workflow.snapshot.version) throw new PlanProposalCoreError('conflict', 'The workflow changed while the proposal was being generated.');
      const storedProposal = { ...proposal, id: this.idFactory() };
      state.proposals[storedProposal.id] = { proposal: storedProposal };
      state.audit.push(this.auditEvent(storedProposal, request.organizationId, principal.subjectId, 'generated', 'Generated a bounded workflow plan proposal.'));
      return storedProposal;
    });
  }

  async read(request: ReadProposalRequest): Promise<PlanProposal> {
    const principal = await this.authenticate(request.bearerToken);
    return this.repository.transact((state) => {
      const stored = this.requireProposal(state, request.proposalId);
      this.assertAllowed(principal, stored.proposal.organizationId, 'workflow.plan.read');
      return stored.proposal;
    });
  }

  async readAudit(request: ReadProposalAuditRequest): Promise<readonly ProposalAuditEvent[]> {
    const principal = await this.authenticate(request.bearerToken);
    return this.repository.transact((state) => {
      const stored = this.requireProposal(state, request.proposalId);
      this.assertAllowed(principal, stored.proposal.organizationId, 'workflow.plan.read');
      return state.audit.filter((event) => event.proposalId === request.proposalId && event.organizationId === stored.proposal.organizationId);
    });
  }

  async readWorkflowVersions(request: ReadWorkflowVersionsRequest): Promise<readonly WorkflowSnapshot[]> {
    const principal = await this.authenticate(request.bearerToken);
    this.assertAllowed(principal, request.organizationId, 'workflow.plan.read');
    return this.repository.transact((state) => this.requireWorkflow(state, request.organizationId, request.workflowId).versions);
  }

  async prepareApply(request: PrepareApplyRequest): Promise<CoreApplyReceipt> {
    const principal = await this.authenticate(request.bearerToken);
    return this.repository.transact((state) => {
      const stored = this.requireProposal(state, request.proposalId);
      this.assertAllowed(principal, stored.proposal.organizationId, 'workflow.plan.apply');
      const workflow = this.requireWorkflow(state, stored.proposal.organizationId, stored.proposal.workflowId);
      if (Date.parse(stored.proposal.expiresAt) <= Date.parse(this.now())) return this.failedReceipt(stored.proposal, workflow.snapshot, 'expired');
      const validation = validatePlanProposal(workflow.snapshot, stored.proposal, ownerMap(workflow.owners), this.now());
      if (!validation.ok || !validation.preview) return this.failedReceipt(stored.proposal, workflow.snapshot, validation.issues.some((issue) => issue.code === 'base-version') ? 'conflict' : 'invalid');
      const confirmationToken = this.idFactory();
      state.confirmations[confirmationToken] = { proposalId: stored.proposal.id, actorId: principal.subjectId, workflowId: stored.proposal.workflowId, baseVersion: workflow.snapshot.version, expiresAt: new Date(Date.parse(this.now()) + 5 * 60 * 1_000).toISOString(), consumed: false };
      state.audit.push(this.auditEvent(stored.proposal, stored.proposal.organizationId, principal.subjectId, 'validated', 'Validated a proposal for explicit apply confirmation.'));
      return { ok: true, proposal: stored.proposal, snapshot: workflow.snapshot, preview: validation.preview, audit: state.audit.filter((entry) => entry.proposalId === stored.proposal.id), confirmationToken };
    });
  }

  async apply(request: ApplyProposalRequest): Promise<ApplyResult> {
    const principal = await this.authenticate(request.bearerToken);
    if (!request.idempotencyKey || request.idempotencyKey.length > MAX_IDEMPOTENCY_KEY || !/^[\w.:/-]+$/.test(request.idempotencyKey)) throw new PlanProposalCoreError('invalid', 'Idempotency key is missing or invalid.');
    return this.repository.transact((state) => {
      const stored = this.requireProposal(state, request.proposalId);
      this.assertAllowed(principal, stored.proposal.organizationId, 'workflow.plan.apply');
      const key = idempotencyKey(stored.proposal.organizationId, principal.subjectId, request.idempotencyKey);
      const prior = state.idempotency[key];
      if (prior) {
        if (prior.proposalId !== request.proposalId || prior.actorId !== principal.subjectId) throw new PlanProposalCoreError('conflict', 'Idempotency key is already bound to another proposal.');
        return prior.result;
      }
      const confirmation = state.confirmations[request.confirmationToken];
      if (!confirmation || confirmation.consumed || confirmation.proposalId !== request.proposalId || confirmation.actorId !== principal.subjectId) throw new PlanProposalCoreError('forbidden', 'A valid, unused confirmation token is required.');
      const workflow = this.requireWorkflow(state, stored.proposal.organizationId, stored.proposal.workflowId);
      if (confirmation.workflowId !== workflow.snapshot.workflowId || confirmation.baseVersion !== workflow.snapshot.version) throw new PlanProposalCoreError('conflict', 'The workflow changed after confirmation; review the proposal again.');
      if (Date.parse(confirmation.expiresAt) <= Date.parse(this.now())) throw new PlanProposalCoreError('expired', 'The apply confirmation has expired.');
      if (Date.parse(stored.proposal.expiresAt) <= Date.parse(this.now())) throw new PlanProposalCoreError('expired', 'The proposal has expired.');
      const validation = validatePlanProposal(workflow.snapshot, stored.proposal, ownerMap(workflow.owners), this.now());
      if (!validation.ok || !validation.preview) {
        if (validation.issues.some((issue) => issue.code === 'base-version')) throw new PlanProposalCoreError('conflict', 'The workflow changed; rebase and review the proposal.');
        throw new PlanProposalCoreError('invalid', 'The proposal failed validation at apply time.');
      }
      const before = clone(workflow.snapshot);
      const idMap = new Map(validation.preview.steps.filter((step) => step.id.startsWith('__proposal__:')).map((step) => [step.id, this.idFactory()]));
      const replace = (id: string) => idMap.get(id) ?? id;
      const snapshot: WorkflowSnapshot = {
        ...validation.preview,
        version: before.version + 1,
        steps: validation.preview.steps.map((step) => ({ ...step, id: replace(step.id), dependsOn: step.dependsOn.map(replace) })),
        approvalPolicies: validation.preview.approvalPolicies.map((policy) => ({ ...policy, taskId: replace(policy.taskId), id: policy.id.startsWith('__proposal_approval__:') ? this.idFactory() : policy.id }))
      };
      const updatedProposal = { ...stored.proposal, status: 'applied' as const };
      const audit = this.auditEvent(stored.proposal, stored.proposal.organizationId, principal.subjectId, 'applied', 'Applied a validated workflow proposal.', snapshot.version);
      const result: ApplyResult = { ok: true, snapshot, proposal: updatedProposal, audit: [audit] };
      state.workflows[workflowKey(snapshot.organizationId, snapshot.workflowId)] = { ...workflow, snapshot, versions: [...workflow.versions, snapshot] };
      state.proposals[request.proposalId] = { proposal: updatedProposal, application: { previousSnapshot: before, appliedVersion: snapshot.version, undone: false } };
      state.audit.push(audit);
      state.confirmations[request.confirmationToken] = { ...confirmation, consumed: true };
      state.idempotency[key] = { proposalId: request.proposalId, actorId: principal.subjectId, result };
      return result;
    });
  }

  async undo(request: UndoProposalRequest): Promise<ApplyResult> {
    const principal = await this.authenticate(request.bearerToken);
    return this.repository.transact((state) => {
      const stored = this.requireProposal(state, request.proposalId);
      this.assertAllowed(principal, stored.proposal.organizationId, 'workflow.plan.apply');
      const workflow = this.requireWorkflow(state, stored.proposal.organizationId, stored.proposal.workflowId);
      const application = stored.application;
      if (!application || application.undone || stored.proposal.status !== 'applied' || workflow.snapshot.version !== application.appliedVersion) throw new PlanProposalCoreError('conflict', 'Proposal cannot be undone because it is not the current applied version.');
      const snapshot = { ...application.previousSnapshot, version: workflow.snapshot.version + 1 };
      const undoneProposal = stored.proposal;
      const audit = this.auditEvent(stored.proposal, stored.proposal.organizationId, principal.subjectId, 'undone', 'Undid a proposal by creating a new workflow version.', snapshot.version);
      const result: ApplyResult = { ok: true, snapshot, proposal: undoneProposal, audit: [audit] };
      state.workflows[workflowKey(snapshot.organizationId, snapshot.workflowId)] = { ...workflow, snapshot, versions: [...workflow.versions, snapshot] };
      state.proposals[request.proposalId] = { proposal: undoneProposal, application: { ...application, undone: true } };
      state.audit.push(audit);
      return result;
    });
  }

  private async authenticate(token: string): Promise<CorePrincipal> {
    if (!token || token.length > 8_192) throw new PlanProposalCoreError('unauthenticated', 'Authentication is required.');
    const principal = await this.authorization.authenticate(token);
    if (!principal || !principal.subjectId || !principal.memberships || typeof principal.memberships !== 'object' || Array.isArray(principal.memberships)) throw new PlanProposalCoreError('unauthenticated', 'Authentication is required.');
    return principal;
  }

  private async authorize(token: string, organizationId: string, permission: PlanProposalPermission): Promise<CorePrincipal> {
    const principal = await this.authenticate(token);
    this.assertAllowed(principal, organizationId, permission);
    return principal;
  }

  private assertAllowed(principal: CorePrincipal, organizationId: string, permission: PlanProposalPermission): void {
    if (!principal.memberships[organizationId]?.includes(permission)) throw new PlanProposalCoreError('forbidden', 'Organization membership or required permission is missing.');
  }

  private requireProposal(state: CoreProposalState, id: string): CoreStoredProposal {
    const proposal = state.proposals[id];
    if (!Object.hasOwn(state.proposals, id) || !proposal) throw new PlanProposalCoreError('not-found', 'Proposal was not found.');
    const validated = parsePlanProposal(proposal.proposal);
    if (!validated.ok) throw new PlanProposalCoreError('storage', 'Stored proposal failed schema validation.');
    if (proposal.application) this.validateSnapshot(proposal.proposal.organizationId, proposal.proposal.workflowId, proposal.application.previousSnapshot);
    return proposal;
  }

  private requireWorkflow(state: CoreProposalState, organizationId: string, workflowId: string): CoreWorkflowRecord {
    const workflow = state.workflows[workflowKey(organizationId, workflowId)];
    if (!workflow || workflow.snapshot.organizationId !== organizationId || workflow.snapshot.workflowId !== workflowId) throw new PlanProposalCoreError('not-found', 'Workflow was not found in the authorized organization.');
    this.validateSnapshot(organizationId, workflowId, workflow.snapshot, workflow.owners);
    if (!Array.isArray(workflow.versions) || workflow.versions.length === 0 || workflow.versions.length > 10_000 ||
      workflow.versions.some((version, index) => version.version !== workflow.versions[0].version + index) ||
      workflow.versions.at(-1)?.version !== workflow.snapshot.version || JSON.stringify(workflow.versions.at(-1)) !== JSON.stringify(workflow.snapshot)) {
      throw new PlanProposalCoreError('storage', 'Workflow version history is missing, inconsistent, or non-monotonic.');
    }
    for (const version of workflow.versions) this.validateSnapshot(organizationId, workflowId, version);
    return workflow;
  }

  private validateSnapshot(organizationId: string, workflowId: string, snapshot: WorkflowSnapshot, owners?: readonly ProposalOwner[]): void {
    const invalid = (): never => { throw new PlanProposalCoreError('storage', 'Stored workflow snapshot or owner scope is invalid.'); };
    if (!snapshot || snapshot.organizationId !== organizationId || snapshot.workflowId !== workflowId || !Number.isSafeInteger(snapshot.version) || snapshot.version < 0 ||
      !Array.isArray(snapshot.steps) || snapshot.steps.length > PLAN_PROPOSAL_LIMITS.steps || !Array.isArray(snapshot.approvalPolicies) || snapshot.approvalPolicies.length > PLAN_PROPOSAL_LIMITS.steps ||
      (owners !== undefined && (!Array.isArray(owners) || owners.length > PLAN_PROPOSAL_LIMITS.steps))) invalid();
    const ownerIds = new Map<string, ProposalOwner['kind']>();
    for (const owner of owners ?? []) {
      if (!owner || (owner.kind !== 'person' && owner.kind !== 'agent') || !owner.id || owner.id.length > PLAN_PROPOSAL_LIMITS.identifier || ownerIds.has(owner.id)) invalid();
      ownerIds.set(owner.id, owner.kind);
    }
    const stepIds = new Set<string>(); let edgeCount = 0;
    for (const step of snapshot.steps) {
      if (!step || !step.id || step.id.length > PLAN_PROPOSAL_LIMITS.identifier || !step.title || step.title.length > PLAN_PROPOSAL_LIMITS.title ||
        (step.description !== undefined && (typeof step.description !== 'string' || step.description.length > PLAN_PROPOSAL_LIMITS.description)) ||
        !Array.isArray(step.dependsOn) || step.dependsOn.length > PLAN_PROPOSAL_LIMITS.dependenciesPerStep ||
        (step.owner !== undefined && ((step.owner.kind !== 'person' && step.owner.kind !== 'agent') || !step.owner.id || step.owner.id.length > PLAN_PROPOSAL_LIMITS.identifier || (owners !== undefined && ownerIds.get(step.owner.id) !== step.owner.kind)))) invalid();
      if (stepIds.has(step.id)) invalid();
      stepIds.add(step.id); edgeCount += step.dependsOn.length;
    }
    if (edgeCount > PLAN_PROPOSAL_LIMITS.totalDependencies) invalid();
    for (const step of snapshot.steps) if (new Set(step.dependsOn).size !== step.dependsOn.length || step.dependsOn.some((dependency) => typeof dependency !== 'string' || dependency.length > PLAN_PROPOSAL_LIMITS.identifier || !stepIds.has(dependency) || dependency === step.id)) invalid();
    const visiting = new Set<string>(); const visited = new Set<string>();
    const hasCycle = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const step = snapshot.steps.find((candidate) => candidate.id === id);
      const cycle = !!step && step.dependsOn.some(hasCycle);
      visiting.delete(id); visited.add(id);
      return cycle;
    };
    if ([...stepIds].some(hasCycle)) invalid();
    const approvalIds = new Set<string>();
    for (const approval of snapshot.approvalPolicies) {
      if (!approval || !approval.id || approval.id.length > PLAN_PROPOSAL_LIMITS.identifier || approvalIds.has(approval.id) || !stepIds.has(approval.taskId) ||
        (approval.stage !== 'before_execution' && approval.stage !== 'before_completion') || !approval.label || approval.label.length > PLAN_PROPOSAL_LIMITS.approvalLabel ||
        approval.humanApprovalRequired !== true || (approval.requiredApproverRole !== undefined && (typeof approval.requiredApproverRole !== 'string' || approval.requiredApproverRole.length > PLAN_PROPOSAL_LIMITS.ownerRole)) ||
        (approval.separationOfDuties !== undefined && typeof approval.separationOfDuties !== 'boolean')) invalid();
      approvalIds.add(approval.id);
    }
  }

  private failedReceipt(proposal: PlanProposal, snapshot: WorkflowSnapshot, reason: 'conflict' | 'invalid' | 'expired'): CoreApplyReceipt {
    return { ok: false, snapshot, proposal: { ...proposal, status: reason }, audit: [], reason };
  }

  private auditEvent(proposal: PlanProposal, organizationId: string, actorId: string, kind: ProposalAuditEvent['kind'], summary: string, workflowVersion?: number): ProposalAuditEvent {
    return { id: this.idFactory(), organizationId, actorId, proposalId: proposal.id, kind, occurredAt: this.now(), summary, workflowVersion };
  }
}
