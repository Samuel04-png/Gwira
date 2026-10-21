import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../src/renderer/gwira/graph/graphModel.js';
import { localStateToGraphRecords } from '../../src/renderer/gwira/graph/localGraphAdapter.js';
import { createEmptyLocalState, type GwiraLocalState } from '../../src/renderer/gwira/domain/types.js';

function state(): GwiraLocalState { const now = '2026-10-16T10:00:00.000Z'; return { ...createEmptyLocalState({ organizationId: 'org', workspaceId: 'space' }, now), tasks: [{ id: 'task', workspaceId: 'space', title: 'Real task', status: 'in_progress', priority: 'medium', assignee: { kind: 'agent', id: 'agent' }, agentRun: { sessionId: 'run', status: 'running', startedAt: now }, createdAt: now, updatedAt: now }], approvals: [{ id: 'approval', taskId: 'task', resultId: 'missing-result', requestedBy: { kind: 'agent', id: 'agent' }, status: 'pending', createdAt: now }] }; }
describe('localStateToGraphRecords', () => {
  it('keeps persisted runs and approvals as context, without fabricating handoffs', () => { const graph = buildGraph(localStateToGraphRecords(state())); expect(graph.nodes.map((node) => node.id)).toEqual(['step:task']); expect(graph.edges).toEqual([]); });
  it('maps recorded running executions to working', () => expect(localStateToGraphRecords(state()).doatRuns?.[0]?.status).toBe('working'));
});
