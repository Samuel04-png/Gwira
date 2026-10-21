import React, { useMemo, useState } from 'react';
import { organizationChartRows, organizationWorkerLabel } from './organizationChartModel.js';
import type { OrganizationChartUiModel, OrganizationDepartmentUiRecord, OrganizationWorkerUiRecord } from './types.js';

export interface OrganizationChartProps {
  model: OrganizationChartUiModel;
  onOpenDepartment?: (departmentId: string) => void;
  onOpenWorker?: (workerId: string) => void;
}

function WorkerList({ label, workers, onOpenWorker }: { label: string; workers: readonly OrganizationWorkerUiRecord[]; onOpenWorker?: (workerId: string) => void }): React.ReactElement {
  return <section aria-label={label}><h4>{label}</h4>{workers.length === 0 ? <p>None recorded.</p> : <ul>{workers.map((worker) => <li key={worker.id}>{onOpenWorker ? <button type="button" onClick={() => onOpenWorker(worker.id)}>{organizationWorkerLabel(worker)}</button> : <span>{organizationWorkerLabel(worker)}</span>}{worker.statusLabel && <small> · {worker.statusLabel}</small>}</li>)}</ul>}</section>;
}

function DepartmentCard({ department, invalid, onOpenDepartment, onOpenWorker }: { department: OrganizationDepartmentUiRecord; invalid: boolean; onOpenDepartment?: (departmentId: string) => void; onOpenWorker?: (workerId: string) => void }): React.ReactElement {
  return <article className="gwira-organization-chart__department">
    <h3>{onOpenDepartment ? <button type="button" onClick={() => onOpenDepartment(department.id)}>{department.name}</button> : department.name}</h3>
    {department.description && <p>{department.description}</p>}
    <p><strong>Manager:</strong> {department.manager ? (onOpenWorker ? <button type="button" onClick={() => onOpenWorker(department.manager!.id)}>{organizationWorkerLabel(department.manager)}</button> : organizationWorkerLabel(department.manager)) : 'Not assigned'}</p>
    {invalid && <p role="status">This reporting relationship needs review.</p>}
    <WorkerList label="Human members" workers={department.humanMembers} onOpenWorker={onOpenWorker} />
    <WorkerList label="Doat members" workers={department.doatMembers} onOpenWorker={onOpenWorker} />
  </article>;
}

/** Renders primary reporting lines only; it never derives authority from hierarchy. */
export function OrganizationChart({ model, onOpenDepartment, onOpenWorker }: OrganizationChartProps): React.ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(model.departments.map((department) => department.id)));
  const rows = useMemo(() => organizationChartRows(model), [model]);
  return <section className="gwira-organization-chart" aria-label="Organization chart">
    <header><h1>{model.organizationName}</h1><p>Primary reporting relationships. Project participation and execution permissions are managed separately.</p></header>
    <section aria-labelledby="organization-leadership"><h2 id="organization-leadership">Leadership</h2>{model.leadership.length === 0 ? <p>No leadership records have been added.</p> : <WorkerList label="Business leadership" workers={model.leadership} onOpenWorker={onOpenWorker} />}</section>
    <section aria-labelledby="organization-departments"><h2 id="organization-departments">Departments</h2>{rows.length === 0 ? <p>No departments have been added. This workspace can remain flat until structure is useful.</p> : <ol>{rows.map((row) => <li key={row.department.id} style={{ marginInlineStart: `${row.level * 1.5}rem` }}><button type="button" aria-expanded={expanded.has(row.department.id)} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(row.department.id)) next.delete(row.department.id); else next.add(row.department.id); return next; })}>{expanded.has(row.department.id) ? 'Collapse' : 'Expand'} {row.department.name}</button>{expanded.has(row.department.id) && <DepartmentCard department={row.department} invalid={row.hasInvalidParentReference} onOpenDepartment={onOpenDepartment} onOpenWorker={onOpenWorker} />}</li>)}</ol>}</section>
  </section>;
}
