import { describe, expect, it } from 'vitest';
import { buildGraph, layoutGraph } from '../../src/renderer/gwira/graph/graphModel.js';

describe('buildGraph', () => {
  it('returns no nodes or edges for empty input', () => expect(buildGraph({})).toEqual({ nodes: [], edges: [], unlinked: [] }));

  it('keeps unlinked tasks separate', () => {
    const graph = buildGraph({ tasks: [{ id: 'draft', title: 'Draft brief' }] });
    expect(graph.edges).toEqual([]);
    expect(graph.unlinked.map((node) => node.id)).toEqual(['step:draft']);
  });

  it('keeps objective containment out of the handoff graph', () => {
    const graph = buildGraph({ objectives: [{ id: 'launch', title: 'Launch', taskIds: ['copy', 'review'] }], tasks: [{ id: 'copy', title: 'Write' }, { id: 'review', title: 'Review' }] });
    expect(graph.edges).toEqual([]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['step:copy', 'step:review']);
  });

  it('models a blocked path only when its dependency is explicit', () => {
    const graph = buildGraph({ tasks: [{ id: 'legal', title: 'Legal', status: 'blocked', dependsOnTaskIds: ['draft'] }, { id: 'draft', title: 'Draft', status: 'working' }] });
    expect(graph.edges).toMatchObject([{ type: 'handoff', source: 'step:draft', target: 'step:legal' }]);
  });

  it('does not turn execution records into workflow steps or handoffs', () => {
    const graph = buildGraph({ tasks: [{ id: 'write', title: 'Write', doatRunId: 'run-1' }], doatRuns: [{ id: 'run-1', title: 'Writer', resultId: 'brief' }], results: [{ id: 'brief', title: 'Brief', status: 'completed' }] });
    expect(graph.nodes.map((node) => node.id)).toEqual(['step:write']);
    expect(graph.edges).toEqual([]);
  });

  it('keeps a failed run out of the workflow graph', () => {
    const graph = buildGraph({ tasks: [{ id: 'deploy', title: 'Deploy', doatRunId: 'run-2' }], doatRuns: [{ id: 'run-2', title: 'Deploy run', status: 'failed' }] });
    expect(graph.nodes.map((node) => node.id)).toEqual(['step:deploy']);
    expect(graph.edges).toEqual([]);
  });

  it('preserves IDs when a record changes during a rebuild', () => {
    const first = buildGraph({ tasks: [{ id: 'task-1', title: 'First title', status: 'working' }] });
    const second = buildGraph({ tasks: [{ id: 'task-1', title: 'Changed title', status: 'completed' }] });
    expect(second.nodes[0].id).toBe(first.nodes[0].id);
  });

  it('lays out graph data without changing its stable nodes or edges', () => {
    const graph = buildGraph({ tasks: [{ id: 'one', title: 'One', dependsOnTaskIds: ['two'] }, { id: 'two', title: 'Two' }] });
    const layout = layoutGraph(graph);
    expect(layout.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(layout.edges).toEqual(graph.edges);
    expect(layout.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
  });

  it('keeps neighbouring ranks far enough apart for smoothstep endpoints', () => {
    const layout = layoutGraph(buildGraph({ tasks: [{ id: 'second', title: 'Second', dependsOnTaskIds: ['first'] }, { id: 'first', title: 'First' }] }));
    const first = layout.nodes.find((node) => node.id === 'step:first')!;
    const second = layout.nodes.find((node) => node.id === 'step:second')!;
    expect(second.position.x - (first.position.x + 240)).toBeGreaterThanOrEqual(2 * 24 + 16);
  });
});
