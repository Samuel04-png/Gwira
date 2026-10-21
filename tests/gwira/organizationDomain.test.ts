import { describe, expect, it } from 'vitest';
import {
  STANDARD_DEPARTMENTS,
  buildReportingNodes,
  createOrganizationStructure,
  hasReportingCycle,
  standardDepartmentDefinition,
  validateOrganizationStructure
} from '../../src/renderer/gwira/organization/domain/model.js';
import type { Department, OrganizationStructure, ReportingRelationship, Team } from '../../src/renderer/gwira/organization/domain/organizationTypes.js';

const now = '2026-10-14T10:00:00.000Z';
const base = (): OrganizationStructure => createOrganizationStructure('org-1', 'divisional', now);

const operations: Department = {
  id: 'operations', organizationId: 'org-1', divisionId: 'division-1', name: 'Operations',
  objectives: ['Deliver reliable work'], manager: { kind: 'person', id: 'p-manager' },
  humanMemberIds: ['p-manager'], doatMemberIds: ['d-ops'], assignedWorkIds: [], resourceRefs: [], toolRefs: [], policies: [], approvalIds: [], createdAt: now, updatedAt: now
};

describe('local organization domain', () => {
  it('starts empty so small, flat organizations are not forced into standard departments', () => {
    const organization = createOrganizationStructure('org-1', 'flat', now);
    expect(organization.departments).toEqual([]);
    expect(STANDARD_DEPARTMENTS).toHaveLength(6);
    expect(standardDepartmentDefinition('finance')?.name).toBe('Finance & Accounting');
  });

  it('allows a divisional department and cross-functional team while preserving primary reporting separately', () => {
    const organization = base();
    organization.divisions.push({ id: 'division-1', organizationId: 'org-1', name: 'Gwira Core', createdAt: now, updatedAt: now });
    organization.departments.push(operations);
    const team: Team = {
      id: 'launch-team', organizationId: 'org-1', name: 'Launch team', departmentId: 'operations',
      members: [{ kind: 'person', id: 'p-manager' }, { kind: 'doat', id: 'd-ops' }], createdAt: now, updatedAt: now
    };
    organization.teams.push(team);
    organization.reportingRelationships.push({ id: 'r-1', organizationId: 'org-1', worker: { kind: 'doat', id: 'd-ops' }, supervisor: { kind: 'person', id: 'p-manager' }, createdAt: now });

    expect(validateOrganizationStructure(organization)).toEqual([]);
    expect(buildReportingNodes(organization.reportingRelationships)).toEqual(expect.arrayContaining([
      expect.objectContaining({ worker: { kind: 'person', id: 'p-manager' }, directReports: [{ kind: 'doat', id: 'd-ops' }] })
    ]));
  });

  it('rejects broken references, duplicate membership, and an accountability cycle', () => {
    const organization = base();
    organization.departments.push({ ...operations, divisionId: 'missing', humanMemberIds: ['p-manager', 'p-manager'] });
    organization.teams.push({ id: 'team-1', organizationId: 'org-1', name: 'Team', departmentId: 'missing', members: [], createdAt: now, updatedAt: now });
    organization.reportingRelationships.push(
      { id: 'r-1', organizationId: 'org-1', worker: { kind: 'person', id: 'a' }, supervisor: { kind: 'doat', id: 'b' }, createdAt: now },
      { id: 'r-2', organizationId: 'org-1', worker: { kind: 'doat', id: 'b' }, supervisor: { kind: 'person', id: 'a' }, createdAt: now }
    );

    expect(validateOrganizationStructure(organization).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'unknown_division', 'unknown_department', 'duplicate_member', 'reporting_cycle'
    ]));
    expect(hasReportingCycle(organization.reportingRelationships)).toBe(true);
  });

  it('does not mistake human and Doat identifiers with the same value for the same worker', () => {
    const relationships: ReportingRelationship[] = [
      { id: 'r-1', organizationId: 'org-1', worker: { kind: 'person', id: 'shared' }, supervisor: { kind: 'doat', id: 'shared' }, createdAt: now }
    ];
    expect(hasReportingCycle(relationships)).toBe(false);
  });
});
