import { describe, expect, it } from 'vitest';
import { allowedTaskTransitions, canTransitionTask } from '../../src/renderer/gwira/domain/lifecycle.js';
import { reduceGwira } from '../../src/renderer/gwira/domain/reducer.js';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';

const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  personId: '00000000-0000-4000-8000-000000000003',
  agentId: '00000000-0000-4000-8000-000000000004',
  projectId: '00000000-0000-4000-8000-000000000005',
  taskId: '00000000-0000-4000-8000-000000000006',
  approvalId: '00000000-0000-4000-8000-000000000007'
};
const now = '2026-10-14T10:00:00.000Z';
const state = () => createEmptyLocalState(ids, now);
const task = () => ({ id: ids.taskId, workspaceId: ids.workspaceId, title: 'Ship a safe change', status: 'backlog' as const, priority: 'high' as const, createdAt: now, updatedAt: now });

describe('Gwira task lifecycle', () => {
  it('only permits the documented lifecycle transitions', () => {
    expect(allowedTaskTransitions('backlog')).toEqual(['todo']);
    expect(canTransitionTask('in_progress', 'in_review')).toBe(true);
    expect(canTransitionTask('backlog', 'done')).toBe(false);
    expect(canTransitionTask('done', 'in_review')).toBe(true);
  });

  it('rejects an invalid state jump without recording activity', () => {
    const created = reduceGwira(state(), { type: 'CREATE_TASK', task: task(), activityId: '00000000-0000-4000-8000-000000000010' });
    const rejected = reduceGwira(created, { type: 'TRANSITION_TASK', taskId: ids.taskId, status: 'done', at: now, activityId: '00000000-0000-4000-8000-000000000011' });
    expect(rejected).toBe(created);
    expect(rejected.activity).toHaveLength(1);
  });

  it('keeps coding run metadata bounded to correlation rather than output', () => {
    let current = reduceGwira(state(), { type: 'ADD_AGENT', agent: { id: ids.agentId, workspaceId: ids.workspaceId, name: 'Codex', type: 'coding', createdAt: now } });
    current = reduceGwira(current, { type: 'CREATE_TASK', task: { ...task(), assignee: { kind: 'agent', id: ids.agentId } }, activityId: '00000000-0000-4000-8000-000000000012' });
    current = reduceGwira(current, { type: 'SET_AGENT_RUN', taskId: ids.taskId, at: now, activityId: '00000000-0000-4000-8000-000000000013', agentRun: { sessionId: 'session-1', status: 'running', startedAt: now } });
    expect(current.tasks[0].agentRun).toEqual({ sessionId: 'session-1', status: 'running', startedAt: now });
    expect(JSON.stringify(current.tasks[0].agentRun)).not.toContain('output');
  });

  it('requires an explicit approval decision to update the task', () => {
    let current = reduceGwira(state(), { type: 'ADD_PERSON', person: { id: ids.personId, workspaceId: ids.workspaceId, name: 'Amina', role: 'Manager', createdAt: now } });
    current = reduceGwira(current, { type: 'CREATE_TASK', task: task(), activityId: '00000000-0000-4000-8000-000000000014' });
    current = reduceGwira(current, { type: 'TRANSITION_TASK', taskId: ids.taskId, status: 'todo', at: now, activityId: '00000000-0000-4000-8000-000000000015' });
    current = reduceGwira(current, { type: 'TRANSITION_TASK', taskId: ids.taskId, status: 'in_progress', at: now, activityId: '00000000-0000-4000-8000-000000000016' });
    current = reduceGwira(current, { type: 'TRANSITION_TASK', taskId: ids.taskId, status: 'in_review', at: now, activityId: '00000000-0000-4000-8000-000000000017' });
    current = reduceGwira(current, { type: 'REQUEST_APPROVAL', approval: { id: ids.approvalId, taskId: ids.taskId, resultId: 'result-1', requestedBy: { kind: 'person', id: ids.personId }, status: 'pending', createdAt: now }, activityId: '00000000-0000-4000-8000-000000000018' });
    expect(current.tasks[0].status).toBe('in_review');
    expect(reduceGwira(current, { type: 'TRANSITION_TASK', taskId: ids.taskId, status: 'done', actor: { kind: 'person', id: ids.personId }, at: now, activityId: '00000000-0000-4000-8000-000000000020' })).toBe(current);
    current = reduceGwira(current, { type: 'DECIDE_APPROVAL', approvalId: ids.approvalId, status: 'approved', actor: { kind: 'person', id: ids.personId }, at: now, activityId: '00000000-0000-4000-8000-000000000019' });
    expect(current.tasks[0].status).toBe('done');
    expect(current.approvals[0].status).toBe('approved');
    expect(current.activity.at(-1)?.kind).toBe('approval_approved');
  });

  it('refuses organization structures that reference workers outside the local workspace', () => {
    const current = state();
    const invalid = {
      ...current.organizationStructure,
      departments: [{ id: 'department-1', organizationId: ids.organizationId, name: 'Engineering', objectives: [], humanMemberIds: ['missing-person'], doatMemberIds: [], assignedWorkIds: [], resourceRefs: [], toolRefs: [], policies: [], approvalIds: [], createdAt: now, updatedAt: now }]
    };
    expect(reduceGwira(current, { type: 'SET_ORGANIZATION_STRUCTURE', structure: invalid, at: now, activityId: '00000000-0000-4000-8000-000000000021' })).toBe(current);
  });
});
