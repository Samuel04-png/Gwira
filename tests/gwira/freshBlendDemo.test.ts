import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../src/renderer/gwira/graph/graphModel.js';
import { freshBlendDemo } from '../../src/renderer/gwira/graph/freshBlendDemo.js';

describe('FreshBlend development demo', () => {
  it.each(['morning', 'marketing', 'recovery'] as const)('keeps %s as an explicit, connected fixture graph', (scenario) => {
    const demo = freshBlendDemo(scenario);
    const graph = buildGraph(demo.records);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(6);
    expect(graph.edges.length).toBeGreaterThan(4);
    expect(demo.workers).toHaveLength(9);
    expect(demo.activity.length).toBeGreaterThan(2);
  });

  it('keeps the simulated purchase gated by an approval', () => {
    const graph = buildGraph(freshBlendDemo('morning').records);
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: 'handoff', source: 'step:recommend', target: 'step:approve' }));
  });
});
