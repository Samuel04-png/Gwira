import type {
  Department,
  OrganizationEntityId,
  OrganizationModelKind,
  OrganizationStructure,
  OrganizationValidationIssue,
  OrganizationWorkerRef,
  ReportingNode,
  ReportingRelationship,
  StandardDepartmentDefinition,
  Team
} from './organizationTypes.js';

export const STANDARD_DEPARTMENTS: readonly StandardDepartmentDefinition[] = [
  { key: 'management', name: 'Management & Leadership', description: 'Business direction, policy, and accountable leadership.' },
  { key: 'operations', name: 'Operations', description: 'Delivery, operational coordination, and internal processes.' },
  { key: 'finance', name: 'Finance & Accounting', description: 'Financial records, budgets, and accountable approvals.' },
  { key: 'sales-marketing', name: 'Sales & Marketing', description: 'Customer research, sales, and market communication.' },
  { key: 'human-resources', name: 'Human Resources', description: 'Workforce support and people operations.' },
  { key: 'customer-support', name: 'Customer Support', description: 'Customer assistance, feedback, and service operations.' }
];

export function createOrganizationStructure(
  organizationId: OrganizationEntityId,
  model: OrganizationModelKind,
  now: string
): OrganizationStructure {
  return {
    organizationId,
    model,
    metadata: { governanceContactIds: [] },
    divisions: [],
    departments: [],
    teams: [],
    reportingRelationships: [],
    createdAt: now,
    updatedAt: now
  };
}

export function workerRefKey(worker: OrganizationWorkerRef): string {
  return `${worker.kind}:${worker.id}`;
}

export function sameWorker(left: OrganizationWorkerRef, right: OrganizationWorkerRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/** Standard departments are optional templates, never mandatory database rows. */
export function standardDepartmentDefinition(key: string): StandardDepartmentDefinition | undefined {
  return STANDARD_DEPARTMENTS.find((department) => department.key === key);
}

export function findDepartment(structure: OrganizationStructure, departmentId: OrganizationEntityId): Department | undefined {
  return structure.departments.find((department) => department.id === departmentId);
}

export function findDivisionName(structure: OrganizationStructure, divisionId?: OrganizationEntityId): string | undefined {
  return divisionId === undefined ? undefined : structure.divisions.find((division) => division.id === divisionId)?.name;
}

export function departmentMembers(department: Department): OrganizationWorkerRef[] {
  return [
    ...department.humanMemberIds.map((id) => ({ kind: 'person' as const, id })),
    ...department.doatMemberIds.map((id) => ({ kind: 'doat' as const, id }))
  ];
}

export function teamMemberKeys(team: Team): string[] {
  return team.members.map(workerRefKey);
}

/**
 * Build a display-friendly primary reporting graph. It does not infer a
 * supervisor from department management, because reporting must be explicit.
 */
export function buildReportingNodes(relationships: readonly ReportingRelationship[]): ReportingNode[] {
  const nodes = new Map<string, ReportingNode>();
  const ensure = (worker: OrganizationWorkerRef): ReportingNode => {
    const key = workerRefKey(worker);
    const existing = nodes.get(key);
    if (existing) return existing;
    const next: ReportingNode = { worker, directReports: [] };
    nodes.set(key, next);
    return next;
  };

  for (const relationship of relationships) {
    const workerNode = ensure(relationship.worker);
    const supervisorNode = ensure(relationship.supervisor);
    workerNode.supervisor = relationship.supervisor;
    if (!supervisorNode.directReports.some((worker) => sameWorker(worker, relationship.worker))) {
      supervisorNode.directReports.push(relationship.worker);
    }
  }
  return [...nodes.values()];
}

export function validateOrganizationStructure(structure: OrganizationStructure): OrganizationValidationIssue[] {
  const issues: OrganizationValidationIssue[] = [];
  const ids = new Set<string>();
  const register = (id: string, label: string): void => {
    if (ids.has(id)) issues.push({ code: 'duplicate_id', entityId: id, message: `Duplicate ${label} id: ${id}.` });
    ids.add(id);
  };
  const requireName = (id: string, name: string, label: string): void => {
    if (!name.trim()) issues.push({ code: 'blank_name', entityId: id, message: `${label} must have a name.` });
  };

  for (const division of structure.divisions) {
    register(division.id, 'division');
    requireName(division.id, division.name, 'Division');
  }
  const divisionIds = new Set(structure.divisions.map((division) => division.id));
  for (const department of structure.departments) {
    register(department.id, 'department');
    requireName(department.id, department.name, 'Department');
    if (department.divisionId && !divisionIds.has(department.divisionId)) {
      issues.push({ code: 'unknown_division', entityId: department.id, message: `Department references unknown division ${department.divisionId}.` });
    }
    addDuplicateMemberIssues(issues, department.id, departmentMembers(department));
  }
  const departmentIds = new Set(structure.departments.map((department) => department.id));
  for (const team of structure.teams) {
    register(team.id, 'team');
    requireName(team.id, team.name, 'Team');
    if (team.divisionId && !divisionIds.has(team.divisionId)) {
      issues.push({ code: 'unknown_division', entityId: team.id, message: `Team references unknown division ${team.divisionId}.` });
    }
    if (team.departmentId && !departmentIds.has(team.departmentId)) {
      issues.push({ code: 'unknown_department', entityId: team.id, message: `Team references unknown department ${team.departmentId}.` });
    }
    addDuplicateMemberIssues(issues, team.id, team.members);
  }

  const primarySupervisorByWorker = new Map<string, OrganizationWorkerRef>();
  const seenRelationships = new Set<string>();
  for (const relationship of structure.reportingRelationships) {
    register(relationship.id, 'reporting relationship');
    const workerKey = workerRefKey(relationship.worker);
    const supervisorKey = workerRefKey(relationship.supervisor);
    if (!relationship.worker.id || !relationship.supervisor.id || workerKey === supervisorKey) {
      issues.push({ code: 'invalid_reporting_relationship', entityId: relationship.id, message: 'A reporting relationship needs distinct worker and supervisor references.' });
      continue;
    }
    const relationshipKey = `${workerKey}->${supervisorKey}`;
    if (seenRelationships.has(relationshipKey) || primarySupervisorByWorker.has(workerKey)) {
      issues.push({ code: 'duplicate_reporting_relationship', entityId: relationship.id, message: 'Each worker can have one explicit primary supervisor.' });
      continue;
    }
    seenRelationships.add(relationshipKey);
    primarySupervisorByWorker.set(workerKey, relationship.supervisor);
  }

  if (hasReportingCycle(structure.reportingRelationships)) {
    issues.push({ code: 'reporting_cycle', message: 'Reporting relationships cannot form a cycle.' });
  }
  return issues;
}

export function hasReportingCycle(relationships: readonly ReportingRelationship[]): boolean {
  const supervisorByWorker = new Map<string, string>();
  for (const relationship of relationships) {
    const worker = workerRefKey(relationship.worker);
    const supervisor = workerRefKey(relationship.supervisor);
    if (worker === supervisor) return true;
    if (!supervisorByWorker.has(worker)) supervisorByWorker.set(worker, supervisor);
  }
  for (const start of supervisorByWorker.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = supervisorByWorker.get(current);
    }
  }
  return false;
}

function addDuplicateMemberIssues(issues: OrganizationValidationIssue[], entityId: string, members: readonly OrganizationWorkerRef[]): void {
  const seen = new Set<string>();
  for (const member of members) {
    const key = workerRefKey(member);
    if (seen.has(key)) {
      issues.push({ code: 'duplicate_member', entityId, message: `Worker ${key} appears more than once.` });
    }
    seen.add(key);
  }
}
