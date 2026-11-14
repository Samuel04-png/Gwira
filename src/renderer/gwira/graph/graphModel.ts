import dagre from 'dagre';
import type { DoatAvatarSpec } from '../doats/ui/types.js';

export type WorkGraphNodeType = 'humanWork' | 'doatWork' | 'unassignedWork' | 'approval';
export type WorkGraphEdgeType = 'handoff' | 'gates';
export type WorkGraphStatus = 'default' | 'blocked' | 'waiting' | 'working' | 'completed' | 'failed' | 'paused';
export type WorkOwnerKind = 'person' | 'doat' | 'unassigned';

export interface WorkGraphRecord {
  id: string;
  title: string;
  subtitle?: string;
  status?: WorkGraphStatus;
  taskId?: string;
  resultId?: string;
}

export interface ObjectiveRecord extends WorkGraphRecord {
  taskIds?: string[];
}

export interface TaskRecord extends WorkGraphRecord {
  ownerKind?: WorkOwnerKind;
  ownerId?: string;
  ownerName?: string;
  avatar?: DoatAvatarSpec;
  description?: string;
  priority?: string;
  dueDate?: string;
  updatedAt?: string;
  dependsOnTaskIds?: string[];
  doatRunId?: string;
  humanWorkId?: string;
  resultId?: string;
  runStatus?: string;
  approvalId?: string;
  /** Recorded schedule facts only. Never derived or estimated. */
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  projectId?: string;
  projectName?: string;
  /** Optional plan. Not populated by the local store yet; kept separate from dueDate and from recorded runs. */
  plannedStart?: string;
  plannedEnd?: string;
}

export interface ApprovalRecord extends WorkGraphRecord {
  taskId?: string;
  reviewerName?: string;
  requestedByName?: string;
  decidedAt?: string;
  resultId?: string;
  createdAt?: string;
}

export interface WorkGraphRecords {
  objectives?: ObjectiveRecord[];
  tasks?: TaskRecord[];
  approvals?: ApprovalRecord[];
  doatRuns?: WorkGraphRecord[];
  humanWork?: WorkGraphRecord[];
  results?: WorkGraphRecord[];
}

export interface WorkGraphNode {
  id: string;
  type: WorkGraphNodeType;
  data: WorkGraphRecord & {
    type: WorkGraphNodeType;
    ownerKind?: WorkOwnerKind;
    ownerId?: string;
    ownerName?: string;
    avatar?: DoatAvatarSpec;
    description?: string;
    priority?: string;
    dueDate?: string;
    updatedAt?: string;
    runStatus?: string;
    doatRunId?: string;
    dependsOnTaskIds?: string[];
    taskId?: string;
    reviewerName?: string;
    requestedByName?: string;
    decidedAt?: string;
    resultId?: string;
    createdAt?: string;
  };
}

export interface WorkGraphEdge {
  id: string;
  source: string;
  target: string;
  type: WorkGraphEdgeType;
}

export interface WorkGraph {
  objectives: ObjectiveRecord[];
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  unlinked: WorkGraphNode[];
}

export interface WorkGraphLayoutNode extends WorkGraphNode {
  position: { x: number; y: number };
}

export interface WorkGraphLayout extends Omit<WorkGraph, 'nodes'> {
  nodes: WorkGraphLayoutNode[];
}

export function graphNodeId(type: WorkGraphNodeType, recordId: string): string {
  return `${type}:${recordId}`;
}

function taskNodeType(task: TaskRecord): WorkGraphNodeType {
  if (task.ownerKind === 'person' || task.humanWorkId) return 'humanWork';
  if (task.ownerKind === 'doat' || task.doatRunId) return 'doatWork';
  return 'unassignedWork';
}

/** Builds work and approval nodes from records and edges only from explicit links. */
export function buildGraph(records: WorkGraphRecords): WorkGraph {
  const taskNodes = (records.tasks ?? []).map((data) => ({
    id: graphNodeId(taskNodeType(data), data.id),
    type: taskNodeType(data),
    data: { ...data, type: taskNodeType(data) }
  }));
  const approvalNodes = (records.approvals ?? []).map((data) => ({
    id: graphNodeId('approval', data.id),
    type: 'approval' as const,
    data: { ...data, type: 'approval' as const }
  }));
  const nodes: WorkGraphNode[] = [...taskNodes, ...approvalNodes];
  const taskNodeByTaskId = new Map((records.tasks ?? []).map((task, index) => [task.id, taskNodes[index]]));
  const existing = new Set(nodes.map((node) => node.id));
  const edges: WorkGraphEdge[] = [];
  const add = (type: WorkGraphEdgeType, source: string, target: string) => {
    if (!existing.has(source) || !existing.has(target)) return;
    const id = `${type}:${source}->${target}`;
    if (!edges.some((edge) => edge.id === id)) edges.push({ id, source, target, type });
  };

  for (const task of records.tasks ?? []) {
    const target = taskNodeByTaskId.get(task.id);
    if (!target) continue;
    for (const dependencyId of task.dependsOnTaskIds ?? []) {
      const dependency = taskNodeByTaskId.get(dependencyId);
      if (dependency) add('handoff', dependency.id, target.id);
    }
  }

  for (const approval of records.approvals ?? []) {
    const task = approval.taskId ? taskNodeByTaskId.get(approval.taskId) : undefined;
    if (task) add('gates', graphNodeId('approval', approval.id), task.id);
  }

  const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return {
    objectives: records.objectives ?? [],
    nodes,
    edges,
    unlinked: taskNodes.filter((node) => !linked.has(node.id))
  };
}

function graphComponents(graph: WorkGraph): WorkGraphNode[][] {
  const adjacent = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    adjacent.get(edge.source)?.add(edge.target);
    adjacent.get(edge.target)?.add(edge.source);
  }
  const visited = new Set<string>();
  const components: WorkGraphNode[][] = [];
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    const component: WorkGraphNode[] = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length) {
      const id = queue.pop();
      if (!id) continue;
      const current = nodesById.get(id);
      if (current) component.push(current);
      for (const neighbor of adjacent.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

/** Lay out verified components independently so unrelated work never overlaps. */
export function layoutGraph(
  graph: WorkGraph,
  nodeSizes: ReadonlyMap<string, { width: number; height: number }> = new Map()
): WorkGraphLayout {
  const components = graphComponents(graph);
  const placedById = new Map<string, { x: number; y: number }>();
  let rowX = 0;
  let rowY = 0;
  let rowHeight = 0;
  const rowWidthLimit = 760;
  const componentGap = 56;

  for (const component of components) {
    const ids = new Set(component.map((node) => node.id));
    const layout = new dagre.graphlib.Graph();
    layout.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 64, marginx: 16, marginy: 16 });
    layout.setDefaultEdgeLabel(() => ({}));
    for (const node of component) {
      const measured = nodeSizes.get(node.id);
      layout.setNode(node.id, { width: measured?.width ?? 260, height: measured?.height ?? 80 });
    }
    for (const edge of graph.edges) {
      if (ids.has(edge.source) && ids.has(edge.target)) layout.setEdge(edge.source, edge.target);
    }
    dagre.layout(layout);
    const bounds = component.map((node) => {
      const placed = layout.node(node.id) as { x: number; y: number; width: number; height: number };
      return { node, x: placed.x - placed.width / 2, y: placed.y - placed.height / 2, width: placed.width, height: placed.height };
    });
    const minX = Math.min(...bounds.map((entry) => entry.x));
    const minY = Math.min(...bounds.map((entry) => entry.y));
    const width = Math.max(...bounds.map((entry) => entry.x + entry.width)) - minX;
    const height = Math.max(...bounds.map((entry) => entry.y + entry.height)) - minY;
    if (rowX > 0 && rowX + width > rowWidthLimit) {
      rowX = 0;
      rowY += rowHeight + componentGap;
      rowHeight = 0;
    }
    for (const entry of bounds) {
      placedById.set(entry.node.id, { x: rowX + entry.x - minX, y: rowY + entry.y - minY });
    }
    rowX += width + componentGap;
    rowHeight = Math.max(rowHeight, height);
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, position: placedById.get(node.id) ?? { x: 0, y: 0 } }))
  };
}
