import { describe, expect, it } from 'vitest';
import { LocalPlanProposalService, parsePlanProposal, parseProposalOperations, validatePlanProposal, type PlanProposal, type WorkflowSnapshot } from '../../src/renderer/gwira/proposals/planProposals.js';

const now = '2026-10-18T10:00:00.000Z';
const snapshot: WorkflowSnapshot = { organizationId: 'org', workflowId: 'workflow', version: 3, steps: [{ id: 'research', title: 'Research', dependsOn: [] }], approvalPolicies: [] };
const proposal = (operations: PlanProposal['operations']): PlanProposal => ({ id: 'proposal', organizationId: 'org', workflowId: 'workflow', baseVersion: 3, requestedBy: 'manager', createdAt: now, expiresAt: '2026-10-19T10:00:00.000Z', status: 'generated', operations });
const service = () => { let number = 0; return new LocalPlanProposalService(snapshot, new Map([['person-1', 'person']]), () => `id-${++number}`, () => now); };

describe('safe plan proposals', () => {
  it('parses only the safe operation vocabulary', () => {
    expect(parseProposalOperations([{ kind: 'add_step', clientKey: 'brief', title: 'Write brief', owner: { kind: 'person', id: 'person-1' } }]).ok).toBe(true);
    expect(parseProposalOperations([{ kind: 'add_approval_policy', stepId: 'research', policy: { stage: 'before_completion', label: 'Manager sign-off' } }]).ok).toBe(true);
    expect(parseProposalOperations([{ kind: 'tool_call', command: 'rm -rf /' }]).ok).toBe(false);
  });

  it('rejects malformed owners, unknown fields, over-limit arrays, and invalid timestamps', () => {
    expect(parseProposalOperations([{ kind: 'add_step', clientKey: 'a', title: 'A', owner: { kind: 'admin', id: 'user' } }]).ok).toBe(false);
    expect(parseProposalOperations([{ kind: 'add_step', clientKey: 'a', title: 'A', execute: true }]).ok).toBe(false);
    expect(parseProposalOperations([{ kind: 'update_step', stepId: 'research', patch: { owner: null } }])).toEqual({ ok: true, operations: [{ kind: 'update_step', stepId: 'research', patch: { title: undefined, description: undefined, owner: null } }] });
    expect(parseProposalOperations(Array.from({ length: 101 }, (_, index) => ({ kind: 'remove_step', stepId: `step-${index}` }))).ok).toBe(false);
    expect(parsePlanProposal({ ...proposal([]), unexpected: 'value' }).ok).toBe(false);
    expect(validatePlanProposal(snapshot, { ...proposal([]), expiresAt: 'not-a-date' }, new Map(), now).ok).toBe(false);
    expect(validatePlanProposal(snapshot, { ...proposal([]), expiresAt: '2026-10-20T10:00:00.000Z' }, new Map(), now).ok).toBe(false);
  });

  it('validates client references and produces an explicit handoff preview without mutating the source', () => {
    const source = structuredClone(snapshot);
    const value = validatePlanProposal(source, proposal([{ kind: 'add_step', clientKey: 'brief', title: 'Write brief', owner: { kind: 'person', id: 'person-1' } }, { kind: 'add_handoff', predecessorId: 'research', successorId: 'client:brief' }]), new Map([['person-1', 'person']]), now);
    expect(value.ok).toBe(true); expect(value.preview?.steps.find((step) => step.title === 'Write brief')?.dependsOn).toEqual(['research']); expect(source).toEqual(snapshot);
  });

  it('rejects cyclic handoffs, unknown owners, and mismatched workflow versions', () => {
    const cyclic = proposal([{ kind: 'add_handoff', predecessorId: 'research', successorId: 'research' }]);
    expect(validatePlanProposal(snapshot, cyclic, new Map(), now).issues.some((issue) => issue.code === 'invalid-plan')).toBe(true);
    expect(validatePlanProposal(snapshot, { ...proposal([{ kind: 'add_step', clientKey: 'a', title: 'A', owner: { kind: 'person', id: 'missing' } }]), baseVersion: 2 }, new Map(), now).issues.map((issue) => issue.code)).toContain('base-version');
    expect(validatePlanProposal(snapshot, proposal([{ kind: 'add_step', clientKey: 'a', title: 'A', owner: { kind: 'person', id: 'missing' } }]), new Map(), now).issues.map((issue) => issue.code)).toContain('unknown-owner');
    expect(validatePlanProposal(snapshot, proposal([{ kind: 'add_step', clientKey: 'a', title: 'A', owner: { kind: 'person', id: 'agent-1' } }]), new Map([['agent-1', 'agent']]), now).issues.some((issue) => issue.code === 'unknown-owner')).toBe(true);
    const multiStepCycle = proposal([
      { kind: 'add_step', clientKey: 'a', title: 'A' },
      { kind: 'add_step', clientKey: 'b', title: 'B' },
      { kind: 'add_handoff', predecessorId: 'client:a', successorId: 'client:b' },
      { kind: 'add_handoff', predecessorId: 'client:b', successorId: 'client:a' }
    ]);
    expect(validatePlanProposal(snapshot, multiStepCycle, new Map(), now).issues.some((issue) => issue.code === 'invalid-plan')).toBe(true);
  });

  it('applies atomically once per idempotency key and never creates a run or tool call', () => {
    const local = service(); const input = proposal([{ kind: 'add_step', clientKey: 'brief', title: 'Write brief' }, { kind: 'add_handoff', predecessorId: 'research', successorId: 'client:brief' }]);
    const first = local.apply(input, 'request-1'); const repeated = local.apply(input, 'request-1');
    expect(first.ok).toBe(true); expect(repeated).toEqual(first); expect(local.current().version).toBe(4); expect(local.current().steps).toHaveLength(2); expect(JSON.stringify(first)).not.toMatch(/run|tool|credential/i);
  });

  it('does not undo over a later workflow change', () => {
    const local = service(); const first = local.apply(proposal([{ kind: 'add_step', clientKey: 'brief', title: 'Write brief' }]), 'request-1');
    expect(first.ok).toBe(true); expect(local.apply({ ...proposal([]), id: 'other-proposal' }, 'request-1').reason).toBe('conflict');
    expect(local.undo('other-proposal').reason).toBe('conflict'); expect(local.undo('proposal').ok).toBe(true); expect(local.undo('proposal').reason).toBe('conflict');
  });
});
