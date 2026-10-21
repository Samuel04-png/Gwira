import { describe, expect, it } from 'vitest';
import { associateCodingTaskSession, codingTaskPrompt, createCodingTaskSendInputRequest, createCodingTaskStartRequest, mapCodexExitToAgentRun, mapCodexOutputToAgentRun, validateCodingTaskLaunch, validateCodingTaskStop } from '../../src/renderer/gwira/agents/codingTaskBridge.js';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import type { GwiraLocalState } from '../../src/renderer/gwira/domain/types.js';

const now = '2026-10-14T10:00:00.000Z';
const ids = {
  organizationId: '40000000-0000-4000-8000-000000000001',
  workspaceId: '40000000-0000-4000-8000-000000000002',
  agentId: '40000000-0000-4000-8000-000000000003',
  projectId: '40000000-0000-4000-8000-000000000004',
  taskId: '40000000-0000-4000-8000-000000000005'
};

function state(): GwiraLocalState {
  const empty = createEmptyLocalState(ids, now);
  return {
    ...empty,
    agents: [{ id: ids.agentId, workspaceId: ids.workspaceId, name: 'Codex', type: 'coding' as const, createdAt: now }],
    projects: [{ id: ids.projectId, workspaceId: ids.workspaceId, name: 'Gwira', codingProjectPath: '/work/gwira', createdAt: now }],
    tasks: [{ id: ids.taskId, workspaceId: ids.workspaceId, projectId: ids.projectId, title: 'Add focused tests', description: 'Keep the scope small.', status: 'todo' as const, priority: 'high' as const, assignee: { kind: 'agent' as const, id: ids.agentId }, createdAt: now, updatedAt: now }]
  };
}

describe('coding task bridge', () => {
  it('only launches a coding task against its exactly saved Codex project with safe defaults', () => {
    const result = validateCodingTaskLaunch(state(), ids.taskId, [{ id: 'saved', name: 'Gwira', path: '/work/gwira' }]);
    expect(result).toMatchObject({ ok: true, savedProject: { path: '/work/gwira' } });
    if (!result.ok) throw new Error('expected valid task');
    expect(createCodingTaskStartRequest(result)).toEqual({ cwd: '/work/gwira', permissionMode: 'default', webSearch: false });
    expect(createCodingTaskSendInputRequest(result.task, 'session-1')).toEqual({ sessionId: 'session-1', input: 'Add focused tests\n\nKeep the scope small.', permissionMode: 'default', webSearch: false });
  });

  it('rejects a merely similar project path instead of inferring permission', () => {
    expect(validateCodingTaskLaunch(state(), ids.taskId, [{ id: 'saved', name: 'Other', path: '/work/gwira-copy' }])).toEqual({ ok: false, reason: 'coding-project-not-saved' });
  });

  it('requires the task to be assigned to a known coding agent and forbids a concurrent run', () => {
    const personAssigned = state();
    personAssigned.tasks[0] = { ...personAssigned.tasks[0], assignee: undefined };
    expect(validateCodingTaskLaunch(personAssigned, ids.taskId, [])).toEqual({ ok: false, reason: 'task-not-assigned-to-coding-agent' });

    const running = state();
    running.tasks[0] = { ...running.tasks[0], agentRun: { sessionId: 'session-1', status: 'running', startedAt: now } };
    expect(validateCodingTaskLaunch(running, ids.taskId, [{ id: 'saved', name: 'Gwira', path: '/work/gwira' }])).toEqual({ ok: false, reason: 'agent-run-already-active' });
  });

  it('associates only session metadata and never persists output chunks', () => {
    const run = associateCodingTaskSession({ id: 'session-1', codexConversationId: 'conversation-1' }, now);
    const fromOutput = mapCodexOutputToAgentRun(run, { sessionId: 'session-1', role: 'codex', chunk: 'private streamed answer' });
    expect(fromOutput).toEqual(run);
    expect(JSON.stringify(fromOutput)).not.toContain('private streamed answer');
    expect(mapCodexOutputToAgentRun(run, { sessionId: 'other', role: 'codex', chunk: 'ignored' })).toBeUndefined();
  });

  it('maps matching exits to completed, stopped, or error metadata', () => {
    const run = associateCodingTaskSession({ id: 'session-1' }, now);
    expect(mapCodexExitToAgentRun(run, { sessionId: 'session-1', status: 'idle', exitCode: 0, session: { codexConversationId: 'conversation-1' } as never }, '2026-10-14T10:01:00.000Z')).toMatchObject({ status: 'completed', codexConversationId: 'conversation-1' });
    expect(mapCodexExitToAgentRun(run, { sessionId: 'session-1', status: 'idle', signal: 'SIGTERM' }, '2026-10-14T10:01:00.000Z')).toMatchObject({ status: 'stopped' });
    expect(mapCodexExitToAgentRun(run, { sessionId: 'session-1', status: 'idle', exitCode: 0 }, '2026-10-14T10:01:00.000Z', true)).toMatchObject({ status: 'stopped' });
    expect(mapCodexExitToAgentRun(run, { sessionId: 'session-1', status: 'error', error: 'Unable to start' }, '2026-10-14T10:01:00.000Z')).toMatchObject({ status: 'error', error: 'Unable to start' });
    expect(mapCodexExitToAgentRun(run, { sessionId: 'other', status: 'idle' }, '2026-10-14T10:01:00.000Z')).toBeUndefined();
  });

  it('only permits stopping the active run for the matching Codex session', () => {
    const task = state().tasks[0];
    expect(validateCodingTaskStop(task, 'session-1')).toEqual({ ok: false, reason: 'agent-run-not-active' });
    const running = { ...task, agentRun: { sessionId: 'session-1', status: 'running' as const, startedAt: now } };
    expect(validateCodingTaskStop(running, 'other')).toEqual({ ok: false, reason: 'session-does-not-match-task' });
    expect(validateCodingTaskStop(running, 'session-1')).toEqual({ ok: true, sessionId: 'session-1' });
  });

  it('uses a title-only prompt when the task has no description', () => {
    expect(codingTaskPrompt({ title: 'Review diff', description: '  ' })).toBe('Review diff');
  });
});
