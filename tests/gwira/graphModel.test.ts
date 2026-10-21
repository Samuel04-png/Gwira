import { describe, expect, it } from 'vitest';
import { buildGraph, layoutGraph } from '../../src/renderer/gwira/graph/graphModel.js';

describe('buildGraph', () => {
  it('returns no nodes or edges for empty input', () => expect(buildGraph({})).toEqual({ objectives: [], nodes: [], edges: [], unlinked: [] }));

  it('keeps unlinked tasks separate', () => {
    const graph = buildGraph({ tasks: [{ id: 'draft', title: 'Draft brief' }] });
    expect(graph.edges).toEqual([]);
    expect(graph.unlinked.map((node) => node.id)).toEqual(['unassignedWork:draft']);
  });

  it('retains objectives as context without inventing task dependencies', () => {
    const graph = buildGraph({ objectives: [{ id: 'launch', title: 'Launch', taskIds: ['copy', 'review'] }], tasks: [{ id: 'copy', title: 'Write' }, { id: 'review', title: 'Review' }] });
    expect(graph.edges).toEqual([]);
    expect(graph.objectives.map((objective) => objective.title)).toEqual(['Launch']);
    expect(graph.nodes.map((node) => node.id)).toEqual(['unassignedWork:copy', 'unassignedWork:review']);
  });

  it('models a blocked path only when its dependency is explicit', () => {
    const graph = buildGraph({ tasks: [{ id: 'legal', title: 'Legal', status: 'blocked', dependsOnTaskIds: ['draft'] }, { id: 'draft', title: 'Draft', status: 'working' }] });
    expect(graph.edges).toMatchObject([{ type: 'handoff', source: 'unassignedWork:draft', target: 'unassignedWork:legal' }]);
  });

  it('uses the task as the Doat work item rather than rendering an execution node', () => {
    const graph = buildGraph({ tasks: [{ id: 'write', title: 'Write', doatRunId: 'run-1' }] });
    expect(graph.nodes.map((node) => node.id)).toEqual(['doatWork:write']);
    expect(graph.edges).toEqual([]);
  });

  it('keeps run details on the Doat work item', () => {
    const graph = buildGraph({ tasks: [{ id: 'deploy', title: 'Deploy', doatRunId: 'run-2' }] });
    expect(graph.nodes.map((node) => node.id)).toEqual(['doatWork:deploy']);
    expect(graph.edges).toEqual([]);
  });

  it('preserves IDs when a record changes during a rebuild', () => {
    const first = buildGraph({ tasks: [{ id: 'task-1', title: 'First title', status: 'working' }] });
    const second = buildGraph({ tasks: [{ id: 'task-1', title: 'Changed title', status: 'completed' }] });
    expect(second.nodes[0].id).toBe(first.nodes[0].id);
  });

  it('creates approval gates only for their explicitly associated work item', () => {
    const graph = buildGraph({
      tasks: [{ id: 'purchase', title: 'Make purchase', ownerKind: 'doat' }, { id: 'unrelated', title: 'Count stock' }],
      approvals: [{ id: 'approval-1', title: 'Approve purchase', status: 'waiting', taskId: 'purchase' }]
    });
    expect(graph.nodes.map((node) => node.type)).toEqual(['doatWork', 'unassignedWork', 'approval']);
    expect(graph.edges).toEqual([{
      id: 'gates:approval:approval-1->doatWork:purchase',
      source: 'approval:approval-1',
      target: 'doatWork:purchase',
      type: 'gates'
    }]);
  });

  it('ignores missing dependency and approval references without inventing edges', () => {
    const graph = buildGraph({
      objectives: [{ id: 'goal', title: 'Reach the goal', taskIds: ['work'] }],
      tasks: [{ id: 'work', title: 'Complete work', dependsOnTaskIds: ['missing'] }],
      approvals: [{ id: 'approval', title: 'Unlinked approval', taskId: 'missing' }]
    });
    expect(graph.edges).toEqual([]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['unassignedWork:work', 'approval:approval']);
    expect(graph.unlinked.map((node) => node.id)).toEqual(['unassignedWork:work']);
  });

  it('lays out graph data without changing its stable nodes or edges', () => {
    const graph = buildGraph({ tasks: [{ id: 'one', title: 'One', dependsOnTaskIds: ['two'] }, { id: 'two', title: 'Two' }] });
    const layout = layoutGraph(graph);
    expect(layout.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(layout.edges).toEqual(graph.edges);
    expect(layout.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
  });

  it('places independent work separately without drawing or inventing dependencies', () => {
    const graph = buildGraph({ tasks: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }, { id: 'three', title: 'Three' }] });
    const layout = layoutGraph(graph);
    expect(graph.edges).toEqual([]);
    expect(new Set(layout.nodes.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(3);
    expect(new Set(layout.nodes.map((node) => node.position.y)).size).toBeGreaterThan(1);
  });

  it('keeps neighbouring ranks far enough apart for smoothstep endpoints', () => {
    const layout = layoutGraph(buildGraph({ tasks: [{ id: 'second', title: 'Second', dependsOnTaskIds: ['first'] }, { id: 'first', title: 'First' }] }));
    const first = layout.nodes.find((node) => node.id === 'unassignedWork:first')!;
    const second = layout.nodes.find((node) => node.id === 'unassignedWork:second')!;
    expect(second.position.y - (first.position.y + 80)).toBeGreaterThanOrEqual(2 * 24 + 16);
  });
});
