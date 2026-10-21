import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../src/renderer/gwira/graph/graphModel.js';
import { localStateToGraphRecords } from '../../src/renderer/gwira/graph/localGraphAdapter.js';
import { createEmptyLocalState, type GwiraLocalState } from '../../src/renderer/gwira/domain/types.js';

function state(): GwiraLocalState { const now = '2026-10-16T10:00:00.000Z'; return { ...createEmptyLocalState({ organizationId: 'org', workspaceId: 'space' }, now), tasks: [{ id: 'task', workspaceId: 'space', title: 'Real task', status: 'in_progress', priority: 'medium', dueDate: '2026-10-20', assignee: { kind: 'agent', id: 'agent' }, agentRun: { sessionId: 'run', status: 'running', startedAt: now }, createdAt: now, updatedAt: now }], approvals: [{ id: 'approval', taskId: 'task', resultId: 'missing-result', requestedBy: { kind: 'agent', id: 'agent' }, status: 'pending', createdAt: now }] }; }
describe('localStateToGraphRecords', () => {
  it('renders assigned Doat work and its explicit approval gate without fabricating handoffs', () => {
    const graph = buildGraph(localStateToGraphRecords(state()));
    expect(graph.nodes.map((node) => node.id)).toEqual(['doatWork:task', 'approval:approval']);
    expect(graph.edges).toEqual([{ id: 'gates:approval:approval->doatWork:task', source: 'approval:approval', target: 'doatWork:task', type: 'gates' }]);
  });
  it('keeps recorded run state on its assigned work item', () => {
    const task = localStateToGraphRecords(state()).tasks?.[0];
    expect(task).toMatchObject({ ownerKind: 'doat', ownerName: 'Unknown Doat', status: 'working', runStatus: 'running', doatRunId: 'run', dueDate: '2026-10-20' });
  });

  it('maps an assigned employee to human work with the employee identity', () => {
    const source = state();
    source.tasks[0] = { ...source.tasks[0], assignee: { kind: 'person', id: 'person-1' } };
    source.people = [{ id: 'person-1', workspaceId: 'space', name: 'Maya Chen', role: 'Operations', createdAt: '2026-10-16T10:00:00.000Z' }];
    const task = localStateToGraphRecords(source).tasks?.[0];
    expect(task).toMatchObject({ ownerKind: 'person', ownerId: 'person-1', ownerName: 'Maya Chen' });
  });

  it('does not present the approval requester as its approver', () => {
    const source = state();
    source.people = [{ id: 'requester', workspaceId: 'space', name: 'Maya Chen', role: 'Operations', createdAt: '2026-10-16T10:00:00.000Z' }];
    source.approvals = [{
      id: 'approval',
      taskId: 'task',
      resultId: 'result',
      requestedBy: { kind: 'person', id: 'requester' },
      status: 'pending',
      createdAt: '2026-10-16T10:00:00.000Z'
    }];
    const pending = buildGraph(localStateToGraphRecords(source)).nodes.find((node) => node.id === 'approval:approval');
    expect(pending?.data).toMatchObject({ requestedByName: 'Maya Chen' });
    expect(pending?.data.reviewerName).toBeUndefined();

    source.approvals[0] = { ...source.approvals[0]!, decidedBy: { kind: 'person', id: 'requester' }, decidedAt: '2026-10-17T10:00:00.000Z', status: 'approved' };
    const decided = buildGraph(localStateToGraphRecords(source)).nodes.find((node) => node.id === 'approval:approval');
    expect(decided?.data).toMatchObject({ reviewerName: 'Maya Chen', decidedAt: '2026-10-17T10:00:00.000Z' });
  });
});
