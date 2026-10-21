import type React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { WorkGraphNodeType, WorkGraphStatus } from './graphModel.js';

export type GraphNodeGalleryState = WorkGraphStatus | 'hover' | 'focus' | 'selected' | 'loading';

export interface GraphNodeData extends Record<string, unknown> {
  type: WorkGraphNodeType;
  title: string;
  subtitle: string;
  status: WorkGraphStatus;
}

export interface GraphNodeProps {
  data: GraphNodeData;
  state?: GraphNodeGalleryState;
}

/** The @xyflow/react node contract is exported for the future canvas only. */
export type WorkGraphFlowNode = Node<GraphNodeData, 'workGraph'>;

const typeLabel: Record<WorkGraphNodeType, string> = {
  step: 'Step'
};

const statusLabel: Record<WorkGraphStatus, string> = {
  default: 'Ready', blocked: 'Blocked', waiting: 'Waiting', working: 'Working', completed: 'Completed', failed: 'Failed'
};

/** Shared visual node. It intentionally contains no canvas, layout, or graph interaction. */
export function GraphNode({ data, state }: GraphNodeProps): React.ReactElement {
  const status = state === 'hover' || state === 'focus' || state === 'selected' || state === 'loading' ? data.status : state ?? data.status;
  if (state === 'loading') {
    return <div className="gwira-graph-node gwira-graph-node--loading" aria-label={`${typeLabel[data.type]} loading`} aria-busy="true">
      <span className="gwira-graph-node__skeleton gwira-graph-node__skeleton--title" />
      <span className="gwira-graph-node__skeleton gwira-graph-node__skeleton--subtitle" />
      <span className="gwira-graph-node__skeleton gwira-graph-node__skeleton--status" />
    </div>;
  }
  return <div className={`gwira-graph-node gwira-graph-node--${data.type} gwira-graph-node--${status} ${state === 'hover' ? 'is-hovered' : ''} ${state === 'focus' ? 'is-focused' : ''} ${state === 'selected' ? 'is-selected' : ''}`} aria-label={`${typeLabel[data.type]}. ${data.title}. ${statusLabel[status]}. ${data.subtitle}.`} tabIndex={state === 'focus' ? 0 : undefined}>
    <div className="gwira-graph-node__title" title={data.title}>{data.title}</div>
    <div className="gwira-graph-node__subtitle" title={data.subtitle}>{data.subtitle}</div>
    <div className="gwira-graph-node__status"><span aria-hidden="true" className="gwira-graph-node__glyph" />{statusLabel[status]}</div>
  </div>;
}

/** Adapter keeps the one visual node component reusable without rendering a canvas here. */
export function WorkGraphFlowNodeComponent({ data, selected }: NodeProps<WorkGraphFlowNode>): React.ReactElement {
  return <GraphNode data={data} state={selected ? 'selected' : undefined} />;
}
