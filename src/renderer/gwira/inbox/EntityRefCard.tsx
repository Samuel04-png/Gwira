import React from 'react';
import { approvalStatusLabel, taskStatusLabel } from './contextModel.js';
import type { ContextEntity } from './contextModel.js';

export interface EntityRefCardProps {
  entity: ContextEntity;
  onOpenTask?: (taskId: string) => void;
}

function TaskLink({ taskId, children, onOpenTask }: { taskId?: string; children: React.ReactNode; onOpenTask?: (taskId: string) => void }): React.ReactElement {
  return taskId && onOpenTask
    ? <button type="button" className="gw-msg-ctx-card__task-link" onClick={() => onOpenTask(taskId)}>{children}</button>
    : <span className="gw-msg-ctx-card__task-title">{children}</span>;
}

function ContextTime({ value }: { value: string }): React.ReactElement | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return <time className="gw-msg-ctx-card__meta" dateTime={value}>{date.toLocaleString()}</time>;
}

export function EntityRefCard({ entity, onOpenTask }: EntityRefCardProps): React.ReactElement {
  if (!entity.available) {
    return <article className="gw-msg-ctx-card is-unavailable">
      <span className="gw-msg-ctx-card__kind">{entity.kind.replace('_', ' ')}</span>
      <strong className="gw-msg-ctx-card__title">No longer available</strong>
    </article>;
  }

  if (entity.kind === 'task') return <article className="gw-msg-ctx-card">
    <span className="gw-msg-ctx-card__kind">Linked task</span>
    <TaskLink taskId={entity.taskId} onOpenTask={onOpenTask}>{entity.title}</TaskLink>
    <span className="gw-msg-ctx-card__meta">{taskStatusLabel(entity.status)} · {entity.priority} priority</span>
    {entity.dueDate ? <time className="gw-msg-ctx-card__meta" dateTime={entity.dueDate}>Due {entity.dueDate}</time> : null}
  </article>;

  if (entity.kind === 'approval') return <article className="gw-msg-ctx-card">
    <span className="gw-msg-ctx-card__kind">Approval · {approvalStatusLabel(entity.status)}</span>
    <TaskLink taskId={entity.taskId} onOpenTask={onOpenTask}>{entity.taskTitle}</TaskLink>
    <span className="gw-msg-ctx-card__meta">Result reference: {entity.resultId}</span>
    <span className="gw-msg-ctx-card__note">Approval decisions happen in the task workflow.</span>
  </article>;

  if (entity.kind === 'activity') return <article className="gw-msg-ctx-card">
    <span className="gw-msg-ctx-card__kind">Workspace activity</span>
    {entity.taskId
      ? <TaskLink taskId={entity.taskId} onOpenTask={onOpenTask}>{entity.title}</TaskLink>
      : <strong className="gw-msg-ctx-card__title">{entity.title}</strong>}
    <ContextTime value={entity.occurredAt} />
  </article>;

  return <article className="gw-msg-ctx-card">
    <span className="gw-msg-ctx-card__kind">Doat run metadata</span>
    <strong className="gw-msg-ctx-card__title">{entity.doatName}</strong>
    <TaskLink taskId={entity.taskId} onOpenTask={onOpenTask}>{entity.taskTitle}</TaskLink>
    <span className="gw-msg-ctx-card__meta">Run status: {entity.status}</span>
    <ContextTime value={entity.startedAt} />
    {entity.completedAt ? <ContextTime value={entity.completedAt} /> : null}
    <span className="gw-msg-ctx-card__note">A Doat reference is not proof of execution.</span>
  </article>;
}
