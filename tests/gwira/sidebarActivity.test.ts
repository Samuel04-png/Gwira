import { describe, expect, it } from 'vitest';
import { recordedSidebarActivity } from '../../src/renderer/gwira/dashboard/sidebarActivity.js';
import type { AgentRun, GwiraLocalState } from '../../src/renderer/gwira/domain/types.js';
import type { Doat } from '../../src/renderer/gwira/doats/domain/types.js';
const doat: Pick<Doat, 'workspaceId' | 'operations'> = { workspaceId: 'workspace', operations: { status: 'working', activeTaskId: 'task', updatedAt: '2026-10-28' } };
function state(run?: AgentRun): Pick<GwiraLocalState, 'workspace' | 'tasks'> {
  return { workspace: { id: 'workspace', organizationId: 'org', name: 'Workspace', createdAt: '2026-10-28' }, tasks: [{ id: 'task', workspaceId: 'workspace', title: 'Test', status: 'in_progress', priority: 'medium', createdAt: '2026-10-28', updatedAt: '2026-10-28', agentRun: run }] };
}
describe('recorded navigation activity', () => {
  it('does not turn configured working status into live activity', () => { expect(recordedSidebarActivity(doat, state())).toEqual({}); });
  it('uses actual run state and excludes other workspaces', () => {
    const running = state({ sessionId: 'session', status: 'running', startedAt: 'start' });
    expect(recordedSidebarActivity(doat, running).status).toBe('working');
    expect(recordedSidebarActivity({ ...doat, workspaceId: 'other' }, running)).toEqual({});
  });
  it('keeps failures recognizable and requires a recorded completion time', () => {
    expect(recordedSidebarActivity(doat, state({ sessionId: 'session', status: 'error', startedAt: 'start' })).status).toBe('failed');
    expect(recordedSidebarActivity(doat, state({ sessionId: 'session', status: 'completed', startedAt: 'start' }))).toEqual({});
  });
  it('acknowledges a specific result without hiding the next completion', () => {
    const completed = state({ sessionId: 'session', status: 'completed', startedAt: 'start', completedAt: 'finish' });
    expect(recordedSidebarActivity(doat, completed).status).toBe('completed');
    expect(recordedSidebarActivity(doat, completed, 'session:finish').status).toBeUndefined();
    expect(recordedSidebarActivity(doat, completed, 'older:finish').status).toBe('completed');
  });
});
