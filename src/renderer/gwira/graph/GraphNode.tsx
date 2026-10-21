import type React from 'react';
import { DoatAvatar } from '../doats/ui/DoatAvatar.js';
import { createProceduralAvatarSpec } from '../doats/ui/avatarModel.js';
import type { DoatAvatarSpec } from '../doats/ui/types.js';
import type { WorkGraphNodeType, WorkGraphStatus, WorkOwnerKind } from './graphModel.js';

export type GraphNodeDisplay = 'full' | 'compact' | 'dot';
export type GraphNodeAppearance = 'selected' | 'dimmed';

export interface GraphNodeData extends Record<string, unknown> {
  type: WorkGraphNodeType;
  title: string;
  subtitle: string;
  status: WorkGraphStatus;
  ownerKind?: WorkOwnerKind;
  ownerId?: string;
  ownerName?: string;
  avatar?: DoatAvatarSpec;
  description?: string;
  priority?: string;
  dueDate?: string;
  updatedAt?: string;
  runStatus?: string;
  taskId?: string;
  reviewerName?: string;
  resultId?: string;
  createdAt?: string;
}

const statusLabels: Record<WorkGraphStatus, string> = {
  default: 'Ready',
  blocked: 'Blocked',
  waiting: 'Waiting',
  working: 'Working',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused'
};

function stateGlyph(status: WorkGraphStatus): string {
  if (status === 'completed') return '✓';
  if (status === 'working') return '◔';
  if (status === 'waiting') return '◐';
  if (status === 'failed') return '■';
  return '○';
}

function ownerLabel(data: GraphNodeData): string {
  if (data.type === 'approval') return data.reviewerName ?? 'Reviewer';
  return data.ownerName ?? (data.ownerKind === 'person' ? 'Employee' : data.ownerKind === 'doat' ? 'Doat' : 'Unassigned');
}

function ownerAvatar(data: GraphNodeData, size = 28): React.ReactElement {
  const label = ownerLabel(data);
  if (data.type === 'doatWork') {
    return <span className="gwira-work-node__avatar is-doat" aria-label={`${label} Doat`}>
      <DoatAvatar spec={data.avatar ?? createProceduralAvatarSpec(data.ownerId ?? label)} status={data.status === 'waiting' ? 'waiting_approval' : data.status === 'default' ? 'idle' : data.status} size={size} label={label} />
    </span>;
  }
  const initials = data.type === 'approval' || data.ownerKind === 'person'
    ? label.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : '—';
  return <span className="gwira-work-node__avatar is-person" aria-label={label}>{initials || '—'}</span>;
}

function titleForAria(data: GraphNodeData): string {
  const kind = data.type === 'humanWork' ? 'Human work' : data.type === 'doatWork' ? 'Doat work' : data.type === 'approval' ? 'Approval' : 'Unassigned work';
  return `${kind}: ${data.title}. ${ownerLabel(data)}. ${statusLabels[data.status]}.`;
}

export function GraphNode({ data, display = 'full', appearance }: { data: GraphNodeData; display?: GraphNodeDisplay; appearance?: GraphNodeAppearance }): React.ReactElement {
  const title = data.type === 'approval' ? `Approve: ${data.title}` : data.title;
  const kind = data.type === 'humanWork' ? 'Human work' : data.type === 'doatWork' ? 'Doat work' : data.type === 'approval' ? 'Approval' : 'Unassigned work';
  const label = `${titleForAria(data)}${data.description ? ` ${data.description}` : ''}`;
  if (display === 'dot') {
    return <div className={`gwira-work-node gwira-work-node--dot is-${data.status} ${appearance ? `is-${appearance}` : ''}`} aria-label={label} title={title}>
      {ownerAvatar(data, 24)}<span className={`gwira-work-node__glyph is-${data.status}`} aria-hidden="true">{stateGlyph(data.status)}</span>
    </div>;
  }
  if (display === 'compact') {
    return <div className={`gwira-work-node gwira-work-node--compact is-${data.status} ${appearance ? `is-${appearance}` : ''}`} aria-label={label} title={title}>
      {ownerAvatar(data, 24)}<strong>{title}</strong><span className={`gwira-work-node__glyph is-${data.status}`} aria-hidden="true">{stateGlyph(data.status)}</span>
    </div>;
  }
  return <div className={`gwira-work-node is-${data.status} is-${data.type} ${appearance ? `is-${appearance}` : ''}`} aria-label={label}>
    {ownerAvatar(data)}
    <span className="gwira-work-node__body">
      {data.type === 'approval' ? <small className="gwira-work-node__kind">Approval</small> : <small className="gwira-work-node__kind">{kind}</small>}
      <strong title={title}>{title}</strong>
      <span className="gwira-work-node__meta">{ownerLabel(data)} · {statusLabels[data.status]}</span>
    </span>
    <span className={`gwira-work-node__glyph is-${data.status}`} aria-hidden="true">{stateGlyph(data.status)}</span>
  </div>;
}
