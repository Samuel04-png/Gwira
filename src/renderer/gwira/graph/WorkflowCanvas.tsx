import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BaseEdge, Handle, MarkerType, Panel, Position, ReactFlow, ReactFlowProvider, getSmoothStepPath, useNodesInitialized, useNodesState, useReactFlow, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './workflow.css';
import type { GraphNodeData, GraphNodeDisplay } from './GraphNode.js';
import { GraphNode } from './GraphNode.js';
import { buildGraph, layoutGraph, type WorkGraphEdge, type WorkGraphNode, type WorkGraphRecords, type WorkGraphStatus } from './graphModel.js';

type FlowNode = Node<GraphNodeData, 'workGraph'>;
type FlowEdge = Omit<WorkGraphEdge, 'type'> & {
  type: 'workflow';
  data: { relationship: WorkGraphEdge['type']; state: WorkGraphStatus };
};
const ViewportZoomContext = createContext(1);

function graphNodeData(node: WorkGraphNode): GraphNodeData {
  const subtitleOwner = node.data.subtitle?.split('·')[0]?.trim();
  return {
    ...node.data,
    type: node.type,
    title: node.data.title,
    subtitle: node.data.subtitle ?? '',
    status: node.data.status ?? 'default',
    ownerKind: node.data.ownerKind ?? (node.type === 'humanWork' ? 'person' : node.type === 'doatWork' ? 'doat' : 'unassigned'),
    ownerName: node.data.ownerName ?? (node.type === 'approval' ? node.data.reviewerName : subtitleOwner) ?? (node.type === 'doatWork' ? 'Doat' : node.type === 'humanWork' ? 'Employee' : 'Unassigned')
  };
}

function flowData(node: WorkGraphNode, records: WorkGraphRecords): GraphNodeData {
  if (node.type !== 'approval') return graphNodeData(node);
  const task = records.tasks?.find((item) => item.id === node.data.taskId);
  return {
    ...graphNodeData(node),
    title: node.data.title.startsWith('Approve') ? node.data.title : task?.title ?? node.data.title,
    taskId: node.data.taskId
  };
}

function graphToFlow(records: WorkGraphRecords, sizes?: ReadonlyMap<string, { width: number; height: number }>): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const graph = buildGraph(records);
  const layout = layoutGraph(graph, sizes);
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const nodes = layout.nodes.map((node) => ({
    id: node.id,
    type: 'workGraph' as const,
    position: node.position,
    data: flowData(node, records),
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    draggable: false
  }));
  const edges = layout.edges.map((edge) => {
    const statusNode = edge.type === 'gates' ? byId.get(edge.source) : byId.get(edge.target);
    return {
      ...edge,
      type: 'workflow' as const,
      sourceHandle: 'source',
      targetHandle: 'target',
      data: { relationship: edge.type, state: statusNode?.data.status ?? 'default' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8 }
    };
  });
  return { nodes, edges };
}

function displayForZoom(zoom: number, important: boolean): GraphNodeDisplay {
  if (zoom >= 0.8 || (important && zoom >= 0.5)) return 'full';
  return zoom >= 0.5 || important ? 'compact' : 'dot';
}

const WorkflowNode = memo(function WorkflowNode({ id, data, selected }: NodeProps<FlowNode>): React.ReactElement {
  const zoom = useContext(ViewportZoomContext);
  const important = selected || data.status === 'waiting' || data.status === 'failed' || data.status === 'blocked';
  return <div className="gwira-workflow-node" data-node-id={id}>
    <Handle className="gwira-workflow-handle" type="target" position={Position.Top} id="target" isConnectable={false} />
    <GraphNode data={data} display={displayForZoom(zoom, important)} appearance={selected ? 'selected' : undefined} />
    <Handle className="gwira-workflow-handle" type="source" position={Position.Bottom} id="source" isConnectable={false} />
  </div>;
});

const WorkflowEdge = memo(function WorkflowEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data, markerEnd }: EdgeProps): React.ReactElement {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8, offset: 24 });
  const relationshipLabel = data?.relationship === 'gates' ? 'Approval gate' : 'Work handoff';
  return <g aria-label={relationshipLabel}>
    <title>{relationshipLabel}</title>
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      className={`gwira-workflow-edge is-${data?.relationship ?? 'handoff'} is-${data?.state ?? 'default'}${selected ? ' is-selected' : ''}`}
      style={{ strokeWidth: 1.5 }}
    />
  </g>;
});

const nodeTypes = { workGraph: WorkflowNode };
const edgeTypes = { workflow: WorkflowEdge };

function canvasFitOptions(): { padding: number; maxZoom: number } {
  const canvas = document.querySelector<HTMLElement>('.gwira-workflow-canvas__interaction');
  return { padding: 48 / Math.max(1, Math.min(canvas?.clientWidth ?? 1, canvas?.clientHeight ?? 1)), maxZoom: 1.15 };
}

function CanvasControls({ zoom }: { zoom: number }): React.ReactElement {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  return <Panel position="bottom-left" className="gwira-workflow-controls">
    <div className="gwira-workflow-controls__row" role="group" aria-label="Workflow canvas controls">
      <button type="button" aria-label="Zoom out" onClick={() => void zoomOut({ duration: 150 })}>−</button>
      <output aria-label="Zoom percentage">{zoom}%</output>
      <button type="button" aria-label="Zoom in" onClick={() => void zoomIn({ duration: 150 })}>+</button>
      <button type="button" title="Fit workflow to canvas" onClick={() => void fitView({ ...canvasFitOptions(), duration: 150 })}>Fit</button>
    </div>
  </Panel>;
}

function connectedPath(edges: FlowEdge[], selectedNodeId?: string): Set<string> {
  if (!selectedNodeId) return new Set();
  const visited = new Set<string>();
  const queue = [selectedNodeId];
  while (queue.length) {
    const id = queue.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    edges.forEach((edge) => {
      if (edge.source === id && !visited.has(edge.target)) queue.push(edge.target);
      if (edge.target === id && !visited.has(edge.source)) queue.push(edge.source);
    });
  }
  return visited;
}

function Surface({ records, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge }: { records: WorkGraphRecords; selectedNodeId?: string; selectedEdgeId?: string; onSelectNode?: (id: string) => void; onSelectEdge?: (id?: string) => void }): React.ReactElement {
  const graphModel = useMemo(() => buildGraph(records), [records]);
  const flow = useMemo(() => graphToFlow(records), [records]);
  const structureKey = useMemo(() => `${flow.nodes.map((node) => `${node.id}:${node.type}`).join('|')}::${flow.edges.map((edge) => edge.id).join('|')}`, [flow.edges, flow.nodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [viewportZoom, setViewportZoom] = useState(100);
  const [layoutKey, setLayoutKey] = useState('');
  const previousStructureKey = useRef(structureKey);
  const nodesInitialized = useNodesInitialized();
  const { fitView, getNodes, zoomIn, zoomOut } = useReactFlow();
  const connected = useMemo(() => connectedPath(flow.edges, selectedNodeId), [flow.edges, selectedNodeId]);

  useEffect(() => {
    const changedStructure = previousStructureKey.current !== structureKey;
    previousStructureKey.current = structureKey;
    if (changedStructure) setLayoutKey('');
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));
      return flow.nodes.map((node) => ({ ...node, position: previous.get(node.id)?.position ?? node.position }));
    });
  }, [flow.nodes, setNodes, structureKey]);

  useEffect(() => {
    if (!nodesInitialized || layoutKey === structureKey) return;
    const sizes = new Map(getNodes().flatMap((node) => node.measured?.width && node.measured.height ? [[node.id, { width: node.measured.width, height: node.measured.height }] as const] : []));
    if (sizes.size !== flow.nodes.length || !flow.nodes.every((node) => sizes.has(node.id))) return;
    const positions = new Map(layoutGraph(graphModel, sizes).nodes.map((node) => [node.id, node.position]));
    setNodes((current) => current.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })));
    setLayoutKey(structureKey);
    requestAnimationFrame(() => requestAnimationFrame(() => void fitView({ ...canvasFitOptions(), duration: 0 })));
  }, [fitView, flow.nodes, getNodes, graphModel, layoutKey, nodesInitialized, setNodes, structureKey]);

  const onMoveEnd = useCallback((_: unknown, viewport: { zoom: number }) => setViewportZoom(Math.round(viewport.zoom * 100)), []);
  const clearSelection = useCallback(() => onSelectNode?.(''), [onSelectNode]);
  const keyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSelection();
    } else if (event.key === '0') {
      event.preventDefault();
      void fitView({ ...canvasFitOptions(), duration: 150 });
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      void zoomIn({ duration: 150 });
    } else if (event.key === '-') {
      event.preventDefault();
      void zoomOut({ duration: 150 });
    }
  }, [clearSelection, fitView, zoomIn, zoomOut]);
  const nodesWithSelection = useMemo(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    className: selectedNodeId && !connected.has(node.id) ? 'is-dimmed' : ''
  })), [connected, nodes, selectedNodeId]);

  return <div className="gwira-workflow-canvas__interaction" data-edge-count={flow.edges.length} tabIndex={0} onKeyDown={keyDown} aria-label="Workflow canvas. Use plus and minus to zoom, zero to fit, Escape to clear selection.">
    <ViewportZoomContext.Provider value={viewportZoom / 100}>
      <ReactFlow
        nodes={nodesWithSelection}
        edges={flow.edges.map((edge) => ({ ...edge, selected: edge.id === selectedEdgeId }))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => { onSelectEdge?.(undefined); onSelectNode?.(node.id); }}
        onNodeDoubleClick={(_, node) => { onSelectEdge?.(undefined); onSelectNode?.(node.id); }}
        onEdgeClick={(_, edge) => { onSelectEdge?.(edge.id); }}
        onPaneClick={() => { onSelectEdge?.(undefined); clearSelection(); }}
        onMoveEnd={onMoveEnd}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        nodesFocusable
        minZoom={0.25}
        maxZoom={1.5}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        aria-label="Workflow graph"
      >
        <Background gap={16} size={1} color="#d8dde0" />
        <CanvasControls zoom={viewportZoom} />
      </ReactFlow>
    </ViewportZoomContext.Provider>
  </div>;
}

export function WorkflowCanvas({ records, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, showObjectiveSummary = true }: { records?: WorkGraphRecords; scope?: string; selectedNodeId?: string; selectedEdgeId?: string; onSelectNode?: (id: string) => void; onSelectEdge?: (id?: string) => void; showObjectiveSummary?: boolean } = {}): React.ReactElement {
  const active = records ?? {};
  const graph = useMemo(() => buildGraph(active), [active]);
  const objective = active.objectives?.[0];
  const workNodes = graph.nodes.filter((node) => node.data.type !== 'approval');
  const completeCount = workNodes.filter((node) => node.data.status === 'completed').length;
  const waitingApprovals = graph.nodes.filter((node) => node.data.type === 'approval' && node.data.status === 'waiting').length;
  return <div className="gwira-workflow-canvas" data-testid="workflow-canvas">
    {showObjectiveSummary ? <header className="gwira-workflow-objective">
      <span>Objective</span>
      <strong>{objective?.title ?? 'No objective recorded'}</strong>
      <small>{objective ? `${completeCount} of ${workNodes.length} work items complete${waitingApprovals ? ` · ${waitingApprovals} ${waitingApprovals === 1 ? 'approval' : 'approvals'} waiting` : ''}` : `${workNodes.length} work items · Objective not set`}</small>
    </header> : null}
    {graph.nodes.length === 0 ? <div className="gwira-workflow-empty" data-testid="workflow-empty">
      <strong>No workflow work yet</strong>
      <span>Recorded human work, Doat work and approvals will appear here.</span>
    </div> : <ReactFlowProvider><Surface records={active} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} onSelectNode={onSelectNode} onSelectEdge={onSelectEdge} /></ReactFlowProvider>}
    <span className="gwira-visually-hidden" aria-live="polite">{graph.nodes.length} workflow nodes. {objective?.title ?? 'No objective recorded.'}</span>
  </div>;
}
