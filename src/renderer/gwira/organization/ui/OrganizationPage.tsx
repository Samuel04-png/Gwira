import React, { useMemo, useState } from 'react';
import type { GwiraLocalState } from '../../domain/types.js';
import type { OrganizationModelKind, OrganizationStructure } from '../domain/organizationTypes.js';
import { OrganizationChart } from './OrganizationChart.js';
import { DepartmentWorkspace } from './DepartmentWorkspace.js';
import type { DepartmentWorkspaceUiModel, OrganizationChartUiModel, OrganizationWorkerUiRecord } from './types.js';

export interface OrganizationPageProps {
  state: GwiraLocalState;
  onUpdate: (structure: OrganizationStructure) => void;
  onOpenTask: (taskId: string) => void;
}

function workers(state: GwiraLocalState): OrganizationWorkerUiRecord[] {
  return [
    ...state.people.map((person) => ({ id: person.id, name: person.name, role: person.role, kind: 'human' as const })),
    ...state.doats.filter((doat) => !doat.archivedAt).map((doat) => ({ id: doat.id, name: doat.identity.name, role: doat.identity.role, kind: 'doat' as const, avatarLabel: doat.identity.name, statusLabel: doat.operations.status.replaceAll('_', ' ') }))
  ];
}

/** Local organization editor and chart. It records structure only, never grants authority. */
export function OrganizationPage({ state, onUpdate, onOpenTask }: OrganizationPageProps): React.ReactElement {
  const [departmentName, setDepartmentName] = useState('');
  const [departmentDescription, setDepartmentDescription] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | undefined>();
  const allWorkers = useMemo(() => workers(state), [state]);
  const model = useMemo<OrganizationChartUiModel>(() => ({
    organizationName: state.organization.name,
    leadership: allWorkers.filter((worker) => /founder|owner|chief|director/i.test(worker.role)),
    departments: state.organizationStructure.departments.map((department) => ({
      id: department.id, name: department.name, description: department.description,
      manager: department.manager ? allWorkers.find((worker) => worker.id === department.manager?.id && (department.manager?.kind === 'person' ? worker.kind === 'human' : worker.kind === 'doat')) : undefined,
      humanMembers: department.humanMemberIds.flatMap((id) => allWorkers.filter((worker) => worker.id === id && worker.kind === 'human')),
      doatMembers: department.doatMemberIds.flatMap((id) => allWorkers.filter((worker) => worker.id === id && worker.kind === 'doat'))
    }))
  }), [allWorkers, state.organization.name, state.organizationStructure.departments]);
  const selected = state.organizationStructure.departments.find((department) => department.id === selectedDepartmentId);
  const workspace = selected ? departmentWorkspace(selected, state, allWorkers) : undefined;
  const addDepartment = (event: React.FormEvent) => {
    event.preventDefault();
    const name = departmentName.trim(); if (!name) return;
    const now = new Date().toISOString();
    onUpdate({ ...state.organizationStructure, updatedAt: now, departments: [...state.organizationStructure.departments, { id: crypto.randomUUID(), organizationId: state.organization.id, name, description: departmentDescription.trim() || undefined, objectives: [], humanMemberIds: [], doatMemberIds: [], assignedWorkIds: [], resourceRefs: [], toolRefs: [], policies: [], approvalIds: [], createdAt: now, updatedAt: now }] });
    setDepartmentName(''); setDepartmentDescription('');
  };
  return <section className="gwira-organization-page" aria-label="Organization">
    <header><div><h1>Organization</h1><p>Local structure and responsibility mapping. It does not grant tool access or approval authority.</p></div></header>
    <form className="gwira-workspace-form" onSubmit={addDepartment}><label>Organization model<select value={state.organizationStructure.model} onChange={(event) => onUpdate({ ...state.organizationStructure, model: event.target.value as OrganizationModelKind, updatedAt: new Date().toISOString() })}><option value="flat">Flat</option><option value="functional">Functional</option><option value="divisional">Divisional</option></select></label><label>Department name<input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="e.g. Engineering" /></label><label>Description<input value={departmentDescription} onChange={(event) => setDepartmentDescription(event.target.value)} /></label><button type="submit">Add department</button></form>
    {workspace ? <DepartmentWorkspace model={workspace} onBack={() => setSelectedDepartmentId(undefined)} onOpenTask={onOpenTask} /> : <OrganizationChart model={model} onOpenDepartment={setSelectedDepartmentId} />}
  </section>;
}

function departmentWorkspace(department: OrganizationStructure['departments'][number], state: GwiraLocalState, allWorkers: OrganizationWorkerUiRecord[]): DepartmentWorkspaceUiModel {
  const workerIds = new Set([...department.humanMemberIds, ...department.doatMemberIds]);
  const tasks = state.tasks.filter((task) => !task.assignee || workerIds.has(task.assignee.id));
  return { department: { id: department.id, name: department.name, description: department.description, humanMembers: allWorkers.filter((worker) => worker.kind === 'human' && workerIds.has(worker.id)), doatMembers: allWorkers.filter((worker) => worker.kind === 'doat' && workerIds.has(worker.id)) }, objectives: department.objectives.map((title, index) => ({ id: `${department.id}:objective:${index}`, title })), tasks: tasks.map((task) => ({ id: task.id, title: task.title, statusLabel: task.status, ownerName: task.assignee ? allWorkers.find((worker) => worker.id === task.assignee?.id)?.name : undefined })), approvals: state.approvals.filter((approval) => tasks.some((task) => task.id === approval.taskId)).map((approval) => ({ id: approval.id, summary: `Approval for ${state.tasks.find((task) => task.id === approval.taskId)?.title ?? 'task'}`, statusLabel: approval.status })), activity: state.activity.filter((event) => !event.taskId || tasks.some((task) => task.id === event.taskId)).slice(-12).map((event) => ({ id: event.id, summary: event.summary, occurredAt: event.occurredAt })) };
}
