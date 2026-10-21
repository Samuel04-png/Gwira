/**
 * Presentation-only contracts for organization surfaces. Domain records are
 * adapted by the application controller, keeping hierarchy and authorization
 * decisions outside the UI.
 */
export type OrganizationWorkerKind = 'human' | 'doat';

export interface OrganizationWorkerUiRecord {
  id: string;
  name: string;
  role: string;
  kind: OrganizationWorkerKind;
  /** A stable visual reference supplied for an existing Doat identity. */
  avatarLabel?: string;
  statusLabel?: string;
}

export interface OrganizationManagerUiRecord extends OrganizationWorkerUiRecord {
  kind: OrganizationWorkerKind;
}

export interface OrganizationDepartmentUiRecord {
  id: string;
  name: string;
  description?: string;
  manager?: OrganizationManagerUiRecord;
  humanMembers: readonly OrganizationWorkerUiRecord[];
  doatMembers: readonly OrganizationWorkerUiRecord[];
  /** Primary reporting lines only; project participation belongs elsewhere. */
  childDepartmentIds?: readonly string[];
}

export interface OrganizationChartUiModel {
  organizationName: string;
  leadership: readonly OrganizationWorkerUiRecord[];
  departments: readonly OrganizationDepartmentUiRecord[];
}

export interface OrganizationObjectiveUiRecord {
  id: string;
  title: string;
  statusLabel?: string;
}

export interface OrganizationTaskUiRecord {
  id: string;
  title: string;
  statusLabel: string;
  ownerName?: string;
}

export interface OrganizationApprovalUiRecord {
  id: string;
  summary: string;
  statusLabel: string;
}

export interface OrganizationActivityUiRecord {
  id: string;
  summary: string;
  occurredAt?: string;
}

export interface DepartmentWorkspaceUiModel {
  department: OrganizationDepartmentUiRecord;
  objectives: readonly OrganizationObjectiveUiRecord[];
  tasks: readonly OrganizationTaskUiRecord[];
  approvals: readonly OrganizationApprovalUiRecord[];
  activity: readonly OrganizationActivityUiRecord[];
  /** Displayed only when supplied by a measured data source. */
  metrics?: readonly { label: string; value: string }[];
}
