import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AtomicFileCorePlanProposalRepository, CorePlanProposalService, PlanProposalCoreError, type CorePrincipal, type CoreProposalState } from '../../src/main/gwira/core/planProposalCore.js';
import { DeterministicPlanProposalGenerator, type WorkflowSnapshot } from '../../src/shared/planProposals.js';

const instant = '2026-10-18T10:00:00.000Z';
const initialSnapshot: WorkflowSnapshot = { organizationId: 'org-a', workflowId: 'workflow-a', version: 1, steps: [{ id: 'research', title: 'Research', dependsOn: [] }], approvalPolicies: [] };
const manager: CorePrincipal = { subjectId: 'manager-a', memberships: { 'org-a': ['workflow.plan.propose', 'workflow.plan.read', 'workflow.plan.apply'] } };
const denied: CorePrincipal = { subjectId: 'outsider', memberships: { 'org-b': ['workflow.plan.propose', 'workflow.plan.read', 'workflow.plan.apply'] } };
const proposerOnly: CorePrincipal = { subjectId: 'proposer-a', memberships: { 'org-a': ['workflow.plan.propose', 'workflow.plan.read'] } };

async function setup(): Promise<{ directory: string; filePath: string; repository: AtomicFileCorePlanProposalRepository; service: CorePlanProposalService; advanceTime: (value: string) => void }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gwira-plan-core-'));
  const filePath = path.join(directory, 'core-proposals.json');
  const repository = new AtomicFileCorePlanProposalRepository(filePath);
  await repository.transact((state) => {
    state.workflows[JSON.stringify(['org-a', 'workflow-a'])] = {
      snapshot: structuredClone(initialSnapshot),
      versions: [structuredClone(initialSnapshot)],
      owners: [{ kind: 'person', id: 'person-a' }, { kind: 'agent', id: 'agent-a' }]
    };
  });
  const actors = new Map([['valid-token', manager], ['denied-token', denied], ['proposer-token', proposerOnly]]);
  let id = 0;
  let currentTime = instant;
  const service = new CorePlanProposalService(
    { authenticate: async (token) => actors.get(token) },
    repository,
    new DeterministicPlanProposalGenerator(),
    () => currentTime,
    () => `id-${++id}`
  );
  return { directory, filePath, repository, service, advanceTime: (value) => { currentTime = value; } };
}

describe('Core PlanProposal contracts', () => {
  it('authorizes generation and persists a strictly validated generated proposal', async () => {
    const { directory, repository, service } = await setup();
    try {
      await expect(service.generate({ bearerToken: 'denied-token', organizationId: 'org-a', workflowId: 'workflow-a', prompt: 'Write a brief' })).rejects.toMatchObject({ code: 'forbidden' });
      const proposal = await service.generate({ bearerToken: 'valid-token', organizationId: 'org-a', workflowId: 'workflow-a', prompt: 'Write a campaign brief' });
      expect(proposal.requestedBy).toBe(manager.subjectId);
      expect(proposal.operations).toEqual([{ kind: 'add_step', clientKey: 'requested-step', title: 'Write a campaign brief', description: undefined, owner: undefined }]);
      const state = await repository.transact((current) => current as CoreProposalState);
      expect(state.proposals[proposal.id].proposal).toEqual(proposal);
      expect(state.audit.map((entry) => entry.kind)).toContain('generated');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires organization authorization, explicit confirmation, and current-version validation before atomic apply', async () => {
    const { directory, repository, service } = await setup();
    try {
      await expect(service.generate({ bearerToken: 'valid-token', organizationId: 'org-b', workflowId: 'workflow-a', prompt: 'Cross tenant' })).rejects.toMatchObject({ code: 'forbidden' });
      const proposal = await service.generate({ bearerToken: 'valid-token', organizationId: 'org-a', workflowId: 'workflow-a', prompt: 'Write a brief' });
      await expect(service.prepareApply({ bearerToken: 'denied-token', proposalId: proposal.id })).rejects.toMatchObject({ code: 'forbidden' });
      await expect(service.prepareApply({ bearerToken: 'proposer-token', proposalId: proposal.id })).rejects.toMatchObject({ code: 'forbidden' });
      const prepared = await service.prepareApply({ bearerToken: 'valid-token', proposalId: proposal.id });
      expect(prepared.confirmationToken).toBeTruthy();
      const applied = await service.apply({ bearerToken: 'valid-token', proposalId: proposal.id, confirmationToken: prepared.confirmationToken!, idempotencyKey: 'apply-1' });
      expect(applied.ok).toBe(true);
      expect(applied.snapshot.version).toBe(2);
      expect(applied.snapshot.steps).toHaveLength(2);
      expect(applied.audit[0]).toMatchObject({ kind: 'applied', actorId: manager.subjectId, organizationId: 'org-a' });
      const state = await repository.transact((current) => current);
      expect(state.workflows[JSON.stringify(['org-a', 'workflow-a'])].snapshot).toEqual(applied.snapshot);
      expect(state.workflows[JSON.stringify(['org-a', 'workflow-a'])].versions.map((version) => version.version)).toEqual([1, 2]);
      expect(applied.audit[0].workflowVersion).toBe(2);
      expect(state.audit.filter((entry) => entry.kind === 'applied')).toHaveLength(1);
      const visibleProposal = await service.read({ bearerToken: 'valid-token', proposalId: proposal.id });
      expect(visibleProposal).toMatchObject({ id: proposal.id, status: 'applied' });
      expect(visibleProposal).not.toHaveProperty('application');
      expect((await service.readAudit({ bearerToken: 'valid-token', proposalId: proposal.id })).map((entry) => entry.kind)).toEqual(['generated', 'validated', 'applied']);
      await expect(service.readAudit({ bearerToken: 'denied-token', proposalId: proposal.id })).rejects.toMatchObject({ code: 'forbidden' });
      await expect(service.apply({ bearerToken: 'valid-token', proposalId: proposal.id, confirmationToken: prepared.confirmationToken!, idempotencyKey: 'different-proposal-key' })).rejects.toMatchObject({ code: 'forbidden' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('makes apply idempotent across service recreation, binds keys to one proposal, and prevents repeated undo', async () => {
    const { directory, filePath, repository, service } = await setup();
    try {
      const proposal = await service.generate({ bearerToken: 'valid-token', organizationId: 'org-a', workflowId: 'workflow-a', prompt: 'Write a brief' });
      const prepared = await service.prepareApply({ bearerToken: 'valid-token', proposalId: proposal.id });
      const request = { bearerToken: 'valid-token', proposalId: proposal.id, confirmationToken: prepared.confirmationToken!, idempotencyKey: 'same-key' };
      const [first, concurrentRetry] = await Promise.all([service.apply(request), service.apply(request)]);
      expect(concurrentRetry).toEqual(first);
      const restarted = new CorePlanProposalService({ authenticate: async (token) => token === 'valid-token' ? manager : undefined }, new AtomicFileCorePlanProposalRepository(filePath), new DeterministicPlanProposalGenerator(), () => instant, () => 'unused');
      expect(await restarted.apply(request)).toEqual(first);
      const secondProposal = await restarted.generate({ bearerToken: 'valid-token', organizationId: 'org-a', workflowId: 'workflow-a', prompt: 'Another brief' });
      const secondConfirmation = await restarted.prepareApply({ bearerToken: 'valid-token', proposalId: secondProposal.id });
      await expect(restarted.apply({ bearerToken: 'valid-token', proposalId: secondProposal.id, confirmationToken: secondConfirmation.confirmationToken!, idempotencyKey: 'same-key' })).rejects.toMatchObject({ code: 'conflict' });
      const undone = await restarted.undo({ bearerToken: 'valid-token', proposalId: proposal.id });
      expect(undone.snapshot.version).toBe(3);
      expect(undone.audit[0].workflowVersion).toBe(3);
      expect((await restarted.readWorkflowVersions({ bearerToken: 'valid-token', organizationId: 'org-a', workflowId: 'workflow-a' })).map((version) => version.version)).toEqual([1, 2, 3]);
      await expect(restarted.undo({ bearerToken: 'valid-token', proposalId: proposal.id })).rejects.toMatchObject({ code: 'conflict' });
      const onDisk = JSON.parse(await readFile(filePath, 'utf8')) as CoreProposalState;
      expect(onDisk.audit.filter((entry) => entry.proposalId === proposal.id && entry.kind === 'undone')).toHaveLength(1);
      expect(onDisk.workflows[JSON.stringify(['org-a', 'workflow-a'])].snapshot.version).toBe(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not persist a stale apply and rejects malformed, forged, or expired confirmation data', async () => {
    const { directory, repository, service } = await setup();
    try {
      const proposal = await service.generate({ bearerToken: 'valid-token', organizationId: 'org-a', workflowId: 'workflow-a', prompt: 'Write a brief' });
      const prepared = await service.prepareApply({ bearerToken: 'valid-token', proposalId: proposal.id });
      await repository.transact((state) => {
        const key = JSON.stringify(['org-a', 'workflow-a']);
        const changedVersion = { ...state.workflows[key].snapshot, version: 2 };
        state.workflows[key] = { ...state.workflows[key], snapshot: changedVersion, versions: [initialSnapshot, changedVersion] };
      });
      await expect(service.apply({ bearerToken: 'valid-token', proposalId: proposal.id, confirmationToken: prepared.confirmationToken!, idempotencyKey: 'stale' })).rejects.toMatchObject({ code: 'conflict' });
      await expect(service.apply({ bearerToken: 'valid-token', proposalId: proposal.id, confirmationToken: 'forged', idempotencyKey: 'forged' })).rejects.toBeInstanceOf(PlanProposalCoreError);
      const state = await repository.transact((current) => current);
      expect(state.audit.filter((entry) => entry.kind === 'applied')).toHaveLength(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects expired proposal and confirmation windows without writing workflow versions', async () => {
    const { directory, repository, service, advanceTime } = await setup();
    try {
      const proposal = await service.generate({ bearerToken: 'valid-token', organizationId: 'org-a', workflowId: 'workflow-a', prompt: 'Write a brief' });
      const prepared = await service.prepareApply({ bearerToken: 'valid-token', proposalId: proposal.id });
      advanceTime('2026-10-18T11:00:01.000Z');
      expect((await service.prepareApply({ bearerToken: 'valid-token', proposalId: proposal.id })).reason).toBe('expired');
      await expect(service.apply({ bearerToken: 'valid-token', proposalId: proposal.id, confirmationToken: prepared.confirmationToken!, idempotencyKey: 'expired' })).rejects.toMatchObject({ code: 'expired' });
      const state = await repository.transact((current) => current);
      expect(state.workflows[JSON.stringify(['org-a', 'workflow-a'])].versions.map((version) => version.version)).toEqual([1]);
      expect(state.audit.filter((entry) => entry.kind === 'applied')).toHaveLength(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
