import { describe, expect, it } from 'vitest';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import { reduceGwira } from '../../src/renderer/gwira/domain/reducer.js';
import { associateCodingTaskSession, mapCodexExitToAgentRun, validateCodingTaskLaunch } from '../../src/renderer/gwira/agents/codingTaskBridge.js';

const at = '2026-10-14T12:00:00.000Z';
const ids = {
  organization: '10000000-0000-4000-8000-000000000001', workspace: '10000000-0000-4000-8000-000000000002',
  person: '10000000-0000-4000-8000-000000000003', agent: '10000000-0000-4000-8000-000000000004',
  project: '10000000-0000-4000-8000-000000000005', task: '10000000-0000-4000-8000-000000000006', approval: '10000000-0000-4000-8000-000000000007'
};

describe('local Gwira coding-task workflow', () => {
  it('links a saved project, runs safely, requests approval, and records the final result', () => {
    let state = createEmptyLocalState({ organizationId: ids.organization, workspaceId: ids.workspace }, at);
    state = reduceGwira(state, { type: 'ADD_PERSON', person: { id: ids.person, workspaceId: ids.workspace, name: 'Founder', role: 'Founder', createdAt: at } });
    state = reduceGwira(state, { type: 'ADD_AGENT', agent: { id: ids.agent, workspaceId: ids.workspace, name: 'Local Codex', type: 'coding', createdAt: at } });
    state = reduceGwira(state, { type: 'ADD_PROJECT', project: { id: ids.project, workspaceId: ids.workspace, name: 'Gwira Development', codingProjectPath: '/tmp/gwira', createdAt: at }, activityId: crypto.randomUUID() });
    state = reduceGwira(state, { type: 'CREATE_TASK', task: { id: ids.task, workspaceId: ids.workspace, projectId: ids.project, title: 'Add a focused test', status: 'todo', priority: 'high', assignee: { kind: 'agent', id: ids.agent }, createdAt: at, updatedAt: at }, activityId: crypto.randomUUID() });

    expect(validateCodingTaskLaunch(state, ids.task, [{ id: 'saved', name: 'Gwira', path: '/tmp/gwira' }])).toMatchObject({ ok: true });
    state = reduceGwira(state, { type: 'TRANSITION_TASK', taskId: ids.task, status: 'in_progress', at, activityId: crypto.randomUUID(), actor: { kind: 'agent', id: ids.agent } });
    const running = associateCodingTaskSession({ id: 'session-1' }, at);
    state = reduceGwira(state, { type: 'SET_AGENT_RUN', taskId: ids.task, agentRun: running, at, activityId: crypto.randomUUID() });
    const completedAt = '2026-10-14T12:01:00.000Z';
    const completed = mapCodexExitToAgentRun(running, { sessionId: 'session-1', status: 'idle', session: { codexConversationId: 'conversation-1' } as never }, completedAt);
    expect(completed).toMatchObject({ status: 'completed', codexConversationId: 'conversation-1' });
    state = reduceGwira(state, { type: 'SET_AGENT_RUN', taskId: ids.task, agentRun: completed!, at: completedAt, activityId: crypto.randomUUID() });
    state = reduceGwira(state, { type: 'TRANSITION_TASK', taskId: ids.task, status: 'in_review', at: completedAt, activityId: crypto.randomUUID(), actor: { kind: 'agent', id: ids.agent } });
    state = reduceGwira(state, { type: 'REQUEST_APPROVAL', approval: { id: ids.approval, taskId: ids.task, resultId: 'conversation-1', requestedBy: { kind: 'agent', id: ids.agent }, status: 'pending', createdAt: completedAt }, activityId: crypto.randomUUID() });
    state = reduceGwira(state, { type: 'DECIDE_APPROVAL', approvalId: ids.approval, status: 'approved', actor: { kind: 'person', id: ids.person }, at: completedAt, activityId: crypto.randomUUID() });

    expect(state.tasks[0]).toMatchObject({ status: 'done', agentRun: { status: 'completed', codexConversationId: 'conversation-1' } });
    expect(state.approvals[0]).toMatchObject({ status: 'approved', decidedBy: { kind: 'person', id: ids.person } });
    expect(state.activity.map((event) => event.kind)).toContain('approval_approved');
  });
});
