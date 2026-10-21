import type { OrganizationChartUiModel, OrganizationDepartmentUiRecord } from './types.js';

export interface ChartDepartmentRow {
  department: OrganizationDepartmentUiRecord;
  level: number;
  hasInvalidParentReference: boolean;
}

/**
 * Creates a stable, cycle-safe primary-reporting display order. Missing or
 * cyclic parent references are surfaced to the UI instead of silently hidden.
 */
export function organizationChartRows(model: OrganizationChartUiModel): ChartDepartmentRow[] {
  const departments = new Map(model.departments.map((department) => [department.id, department]));
  const referenced = new Set<string>();
  for (const department of model.departments) {
    for (const childId of department.childDepartmentIds ?? []) {
      if (departments.has(childId)) referenced.add(childId);
    }
  }
  const roots = model.departments.filter((department) => !referenced.has(department.id));
  const result: ChartDepartmentRow[] = [];
  const seen = new Set<string>();

  const visit = (department: OrganizationDepartmentUiRecord, level: number, ancestry: ReadonlySet<string>) => {
    if (seen.has(department.id)) return;
    seen.add(department.id);
    const childIds = department.childDepartmentIds ?? [];
    const invalid = childIds.some((childId) => !departments.has(childId) || ancestry.has(childId));
    result.push({ department, level, hasInvalidParentReference: invalid });
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(department.id);
    for (const childId of childIds) {
      const child = departments.get(childId);
      if (child && !nextAncestry.has(childId)) visit(child, level + 1, nextAncestry);
    }
  };

  for (const root of roots) visit(root, 0, new Set());
  // A cyclic graph has no roots. Keep all departments visible and marked.
  for (const department of model.departments) {
    if (!seen.has(department.id)) {
      const before = result.length;
      visit(department, 0, new Set());
      if (result.length > before) result[before] = { ...result[before], hasInvalidParentReference: true };
    }
  }
  return result;
}

export function organizationWorkerLabel(worker: { kind: 'human' | 'doat'; name: string; role: string }): string {
  return `${worker.name}, ${worker.role} (${worker.kind === 'doat' ? 'Doat' : 'Human'})`;
}
