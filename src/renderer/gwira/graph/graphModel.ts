import dagre from 'dagre';

/**
 * The work-graph contract is deliberately independent from React and the
 * persisted workspace schema.  Callers adapt local records into these small
 * record shapes, keeping graph construction deterministic and testable.
 */
/** The canvas renders workflow Steps only; execution records remain context. */
export type WorkGraphNodeType = 'step';
export type WorkGraphEdgeType = 'handoff';
export type WorkGraphStatus = 'default' | 'blocked' | 'waiting' | 'working' | 'completed' | 'failed';

export interface WorkGraphRecord {
  id: string;
  title: string;
  subtitle?: string;
  status?: WorkGraphStatus;
}

export interface ObjectiveRecord extends WorkGraphRecord { taskIds?: string[]; }
export interface TaskRecord extends WorkGraphRecord {
  parentStepId?: string;
  tools?: string[];
  dependsOnTaskIds?: string[];
  doatRunId?: string;
  humanWorkId?: string;
  approvalId?: string;
  resultId?: string;
}
export interface DoatRunRecord extends WorkGraphRecord { taskId?: string; resultId?: string; }
export interface HumanWorkRecord extends WorkGraphRecord { taskId?: string; resultId?: string; }
export interface ApprovalRecord extends WorkGraphRecord { taskId?: string; resultId?: string; }
export interface ResultRecord extends WorkGraphRecord { producedByDoatRunId?: string; producedByHumanWorkId?: string; }

export interface WorkGraphRecords {
  objectives?: ObjectiveRecord[];
  tasks?: TaskRecord[];
  doatRuns?: DoatRunRecord[];
  humanWork?: HumanWorkRecord[];
  approvals?: ApprovalRecord[];
  results?: ResultRecord[];
}

export interface WorkGraphNode {
  id: string;
  type: WorkGraphNodeType;
  data: WorkGraphRecord;
}

export interface WorkGraphEdge {
  id: string;
  source: string;
  target: string;
  type: WorkGraphEdgeType;
}

export interface WorkGraph {
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  /** Existing records with no explicit relationship to another existing record. */
  unlinked: WorkGraphNode[];
}

export interface WorkGraphLayoutNode extends WorkGraphNode {
  position: { x: number; y: number };
}

export interface WorkGraphLayout extends Omit<WorkGraph, 'nodes'> {
  nodes: WorkGraphLayoutNode[];
}

const recordGroups: ReadonlyArray<readonly [WorkGraphNodeType, keyof WorkGraphRecords]> = [
  ['step', 'tasks']
];

export function graphNodeId(type: WorkGraphNodeType, recordId: string): string {
  return `${type}:${recordId}`;
}

/** Builds only relationships named by a record; dates and statuses never create edges. */
export function buildGraph(records: WorkGraphRecords): WorkGraph {
  const nodes: WorkGraphNode[] = recordGroups.flatMap(([type, group]) =>
    (records[group] ?? []).map((data) => ({ id: graphNodeId(type, data.id), type, data }))
  );
  const existing = new Set(nodes.map((node) => node.id));
  const edges: WorkGraphEdge[] = [];
  const add = (type: WorkGraphEdgeType, source: string, target: string) => {
    if (!existing.has(source) || !existing.has(target)) return;
    const id = `${type}:${source}->${target}`;
    if (!edges.some((edge) => edge.id === id)) edges.push({ id, source, target, type });
  };
  const id = graphNodeId;

  // Objectives are section headers, never executable Steps and never handoffs.
  // A handoff is an explicit predecessor/successor relationship between Steps.
  for (const task of records.tasks ?? []) {
    for (const dependencyId of task.dependsOnTaskIds ?? []) add('handoff', id('step', dependencyId), id('step', task.id));
  }

  const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return { nodes, edges, unlinked: nodes.filter((node) => !linked.has(node.id)) };
}

/**
 * A deterministic dagre layout for a future graph surface. It is data-only:
 * this does not mount a canvas or add any movement behavior.
 */
/**
 * Arrange the explicit handoff graph left-to-right.  The canvas supplies its
 * measured node dimensions after React Flow has mounted the nodes; the small
 * fallback only applies during the first measurement pass.
 */
export function layoutGraph(
  graph: WorkGraph,
  nodeSizes: ReadonlyMap<string, { width: number; height: number }> = new Map()
): WorkGraphLayout {
  const layout = new dagre.graphlib.Graph();
  layout.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 96 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) {
    const measured = nodeSizes.get(node.id);
    layout.setNode(node.id, { width: measured?.width ?? 240, height: measured?.height ?? 72 });
  }
  for (const edge of graph.edges) layout.setEdge(edge.source, edge.target);
  dagre.layout(layout);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const placed = layout.node(node.id) as { x: number; y: number; width: number; height: number };
      return { ...node, position: { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2 } };
    })
  };
}
