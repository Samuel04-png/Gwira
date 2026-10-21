import { describe, expect, it } from 'vitest';
import { recoverInterruptedAgentRuns } from '../../src/renderer/gwira/domain/recovery.js';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';

const at = '2026-10-14T12:00:00.000Z';
const ids = { organizationId: '50000000-0000-4000-8000-000000000001', workspaceId: '50000000-0000-4000-8000-000000000002', agent: '50000000-0000-4000-8000-000000000003', task: '50000000-0000-4000-8000-000000000004' };

describe('interrupted coding-run recovery', () => {
  it('moves persisted running work back to todo and records an explicit stopped result', () => {
    const state = createEmptyLocalState(ids, at);
    const recovered = recoverInterruptedAgentRuns({ ...state, agents: [{ id: ids.agent, workspaceId: ids.workspaceId, name: 'Codex', type: 'coding', createdAt: at }], tasks: [{ id: ids.task, workspaceId: ids.workspaceId, title: 'Continue safely', status: 'in_progress', priority: 'high', assignee: { kind: 'agent', id: ids.agent }, agentRun: { sessionId: 'session', status: 'running', startedAt: at }, createdAt: at, updatedAt: at }] }, '2026-10-14T12:02:00.000Z', () => '50000000-0000-4000-8000-000000000005');
    expect(recovered.tasks[0]).toMatchObject({ status: 'todo', agentRun: { status: 'stopped', error: 'Interrupted when the local application restarted.' } });
    expect(recovered.activity.at(-1)?.summary).toContain('Recovered interrupted');
  });

  it('leaves a state with no running execution referentially unchanged', () => {
    const state = createEmptyLocalState(ids, at);
    expect(recoverInterruptedAgentRuns(state, at, () => ids.task)).toBe(state);
  });
});
