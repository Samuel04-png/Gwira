import React from 'react';
import { organizationWorkerLabel } from './organizationChartModel.js';
import type { DepartmentWorkspaceUiModel } from './types.js';

export interface DepartmentWorkspaceProps {
  model: DepartmentWorkspaceUiModel;
  onBack?: () => void;
  onOpenTask?: (taskId: string) => void;
  onOpenApproval?: (approvalId: string) => void;
  onOpenWorker?: (workerId: string) => void;
}

/** A truthful department summary: all operational values are supplied by the domain adapter. */
export function DepartmentWorkspace({ model, onBack, onOpenTask, onOpenApproval, onOpenWorker }: DepartmentWorkspaceProps): React.ReactElement {
  const { department } = model;
  const members = [...department.humanMembers, ...department.doatMembers];
  return <section className="gwira-department-workspace" aria-label={`${department.name} department`}>
    <header><div>{onBack && <button type="button" onClick={onBack}>Back to organization</button>}<h1>{department.name}</h1><p>{department.description ?? 'No department description has been recorded.'}</p></div>{department.manager && <p><strong>Manager:</strong> {onOpenWorker ? <button type="button" onClick={() => onOpenWorker(department.manager!.id)}>{organizationWorkerLabel(department.manager)}</button> : organizationWorkerLabel(department.manager)}</p>}</header>
    <section aria-labelledby="department-objectives"><h2 id="department-objectives">Objectives</h2>{model.objectives.length === 0 ? <p>No objectives recorded.</p> : <ul>{model.objectives.map((objective) => <li key={objective.id}><strong>{objective.title}</strong>{objective.statusLabel && <span> · {objective.statusLabel}</span>}</li>)}</ul>}</section>
    <section aria-labelledby="department-members"><h2 id="department-members">Members</h2>{members.length === 0 ? <p>No members recorded.</p> : <ul>{members.map((member) => <li key={member.id}>{onOpenWorker ? <button type="button" onClick={() => onOpenWorker(member.id)}>{organizationWorkerLabel(member)}</button> : organizationWorkerLabel(member)}{member.statusLabel && <small> · {member.statusLabel}</small>}</li>)}</ul>}</section>
    <section aria-labelledby="department-work"><h2 id="department-work">Active work</h2>{model.tasks.length === 0 ? <p>No assigned work recorded.</p> : <ul>{model.tasks.map((task) => <li key={task.id}>{onOpenTask ? <button type="button" onClick={() => onOpenTask(task.id)}>{task.title}</button> : <strong>{task.title}</strong>}<span> · {task.statusLabel}</span>{task.ownerName && <small> · {task.ownerName}</small>}</li>)}</ul>}</section>
    <section aria-labelledby="department-approvals"><h2 id="department-approvals">Approvals</h2>{model.approvals.length === 0 ? <p>No approvals recorded.</p> : <ul>{model.approvals.map((approval) => <li key={approval.id}>{onOpenApproval ? <button type="button" onClick={() => onOpenApproval(approval.id)}>{approval.summary}</button> : <strong>{approval.summary}</strong>}<span> · {approval.statusLabel}</span></li>)}</ul>}</section>
    <section aria-labelledby="department-activity"><h2 id="department-activity">Activity</h2>{model.activity.length === 0 ? <p>No activity recorded.</p> : <ol>{model.activity.map((entry) => <li key={entry.id}>{entry.summary}{entry.occurredAt && <time dateTime={entry.occurredAt}> · {entry.occurredAt}</time>}</li>)}</ol>}</section>
    <section aria-labelledby="department-performance"><h2 id="department-performance">Performance</h2>{!model.metrics?.length ? <p>Performance metrics are not available until measured operational data is connected.</p> : <dl>{model.metrics.map((metric) => <React.Fragment key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></React.Fragment>)}</dl>}</section>
  </section>;
}
