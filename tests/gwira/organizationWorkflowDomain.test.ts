import { describe, expect, it } from 'vitest';
import { evaluateAssignmentCandidates } from '../../src/renderer/gwira/organization/domain/assignment.js';
import { workflowAuditEvent } from '../../src/renderer/gwira/organization/domain/audit.js';
import { checkpointStatus, readyWorkflowTaskIds, validateWorkflowPlan } from '../../src/renderer/gwira/organization/domain/workflow.js';
import type { OrganizationWorker, WorkflowPlan, WorkflowTaskDefinition } from '../../src/renderer/gwira/organization/domain/workflowTypes.js';

const task = (id: string, dependsOn: readonly string[] = []): WorkflowTaskDefinition => ({
  id, title: id, dependsOn, requiredCapabilities: ['research'], requiredTools: ['documents'], risk: 'medium'
});

const worker = (id: string, overrides: Partial<OrganizationWorker> = {}): OrganizationWorker => ({
  id, kind: 'person', name: id, active: true, availability: 'available', departmentIds: ['ops'],
  capabilities: ['research'], allowedTools: ['documents'], riskLimit: 'high', activeTaskCount: 0, maxConcurrentTasks: 2,
  ...overrides
});

describe('organizational workflow domain', () => {
  it('accepts an acyclic plan with deterministic dependency order', () => {
    const plan: WorkflowPlan = { id: 'w', requestId: 'r', tasks: [task('publish', ['review']), task('research'), task('review', ['research'])] };
    expect(validateWorkflowPlan(plan)).toEqual({ ok: true, topologicalTaskIds: ['research', 'review', 'publish'] });
  });

  it('rejects unknown, self, and duplicate dependencies without attempting execution', () => {
    const plan: WorkflowPlan = {
      id: 'w', requestId: 'r', tasks: [task('a', ['b']), task('b', ['a']), task('a'), task('self', ['self']), task('unknown', ['missing'])]
    };
    const result = validateWorkflowPlan(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining([
      'duplicate-task-id', 'self-dependency', 'unknown-dependency'
    ]));
  });

  it('rejects dependency cycles', () => {
    const result = validateWorkflowPlan({ id: 'w', requestId: 'r', tasks: [task('a', ['b']), task('b', ['a'])] });
    expect(result).toEqual({ ok: false, issues: [{ kind: 'cyclic-dependency', taskIds: ['a', 'b'] }] });
  });

  it('gates ready work on completed dependencies and explicit human approval', () => {
    const plan: WorkflowPlan = {
      id: 'w', requestId: 'r', tasks: [
        { ...task('spec'), approvalCheckpointIds: ['sign-off'] }, task('build', ['spec'])
      ],
      approvalCheckpoints: [{ id: 'sign-off', taskId: 'spec', stage: 'before_execution', label: 'Founder sign-off', humanApprovalRequired: true, requiredApproverRole: 'Founder' }]
    };
    expect(readyWorkflowTaskIds(plan, [{ taskId: 'spec', state: 'not_started' }, { taskId: 'build', state: 'not_started' }], [])).toEqual([]);
    const approval = { checkpointId: 'sign-off', decision: 'approved' as const, actor: { kind: 'person' as const, id: 'p', role: 'Founder' }, occurredAt: '2026-10-14T00:00:00.000Z' };
    expect(checkpointStatus(plan.approvalCheckpoints![0], [approval])).toBe('approved');
    expect(readyWorkflowTaskIds(plan, [{ taskId: 'spec', state: 'not_started' }, { taskId: 'build', state: 'not_started' }], [approval])).toEqual(['spec']);
    expect(readyWorkflowTaskIds(plan, [{ taskId: 'spec', state: 'completed' }, { taskId: 'build', state: 'not_started' }], [approval])).toEqual(['build']);
  });

  it('makes candidate ranking deterministic and rejects unsafe or ineligible workers', () => {
    const allocationTask = { ...task('research'), departmentId: 'ops', humanSupervisorRequired: true };
    const result = evaluateAssignmentCandidates(allocationTask, [
      worker('zoe'), worker('byte', { kind: 'doat', supervisorPersonId: 'founder' }), worker('blocked', { activeTaskCount: 2 }),
      worker('unsafe', { kind: 'doat', riskLimit: 'low', supervisorPersonId: undefined })
    ]);
    expect(result.candidates.map((candidate) => candidate.workerId)).toEqual(['byte', 'zoe']);
    expect(result.rejected).toEqual(expect.arrayContaining([
      { workerId: 'blocked', reasons: ['workload-limit'] },
      { workerId: 'unsafe', reasons: ['risk-limit', 'missing-human-supervisor'] }
    ]));
    expect(evaluateAssignmentCandidates({ ...allocationTask, humanRequired: true }, [worker('byte', { kind: 'doat', supervisorPersonId: 'founder' })]).rejected[0].reasons).toContain('human-required');
  });

  it('uses caller-supplied audit metadata and never manufactures an actor, time, or decision', () => {
    expect(workflowAuditEvent({ id: 'e', workflowId: 'w', kind: 'approval_requested', occurredAt: '2026-10-14T00:00:00.000Z', taskId: 't', checkpointId: 'c', summary: 'Founder approval required' })).toEqual({
      id: 'e', workflowId: 'w', kind: 'approval_requested', occurredAt: '2026-10-14T00:00:00.000Z', taskId: 't', checkpointId: 'c', summary: 'Founder approval required'
    });
  });
});
