import { describe, expect, it } from 'vitest';
import { organizationChartRows, organizationWorkerLabel } from '../../src/renderer/gwira/organization/ui/organizationChartModel.js';
import type { OrganizationChartUiModel } from '../../src/renderer/gwira/organization/ui/types.js';

const worker = { id: 'person-1', name: 'Ama', role: 'Founder', kind: 'human' as const };

describe('organization presentation model', () => {
  it('orders primary reporting relationships without changing supplied records', () => {
    const model: OrganizationChartUiModel = { organizationName: 'Gwira', leadership: [worker], departments: [
      { id: 'engineering', name: 'Engineering', humanMembers: [], doatMembers: [], childDepartmentIds: ['quality'] },
      { id: 'quality', name: 'Quality', humanMembers: [], doatMembers: [] }
    ] };
    expect(organizationChartRows(model).map((row) => [row.department.name, row.level])).toEqual([['Engineering', 0], ['Quality', 1]]);
    expect(model.departments[0].childDepartmentIds).toEqual(['quality']);
  });

  it('keeps cyclic or missing reporting data visible for correction', () => {
    const model: OrganizationChartUiModel = { organizationName: 'Gwira', leadership: [], departments: [
      { id: 'a', name: 'A', humanMembers: [], doatMembers: [], childDepartmentIds: ['b'] },
      { id: 'b', name: 'B', humanMembers: [], doatMembers: [], childDepartmentIds: ['a', 'missing'] }
    ] };
    const rows = organizationChartRows(model);
    expect(rows.map((row) => row.department.id).sort()).toEqual(['a', 'b']);
    expect(rows.some((row) => row.hasInvalidParentReference)).toBe(true);
  });

  it('labels worker type explicitly instead of implying permissions', () => {
    expect(organizationWorkerLabel({ ...worker, kind: 'doat' })).toBe('Ama, Founder (Doat)');
  });
});
