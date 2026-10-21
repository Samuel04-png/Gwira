/**
 * Local organization-model contracts.
 *
 * These records describe accountability and structure only. They deliberately
 * contain neither provider credentials nor executable permissions: a manager
 * relationship must never grant a worker access to a tool or an approval.
 */
export type OrganizationEntityId = string;
export type IsoDate = string;

export type OrganizationModelKind = 'functional' | 'divisional' | 'flat';
export type WorkerKind = 'person' | 'doat';

/** A reference only; HR/profile data stays in the workforce domain. */
export interface OrganizationWorkerRef {
  kind: WorkerKind;
  id: OrganizationEntityId;
}

export interface OrganizationMetadata {
  legalEntityName?: string;
  registrationDetails?: string;
  governanceContactIds: OrganizationEntityId[];
  /** Metadata is not a claim of incorporation or regulatory compliance. */
  complianceNotice?: string;
}

export interface Division {
  id: OrganizationEntityId;
  organizationId: OrganizationEntityId;
  name: string;
  description?: string;
  manager?: OrganizationWorkerRef;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface DepartmentPolicy {
  id: OrganizationEntityId;
  title: string;
  summary: string;
  /** Policies are descriptive until a future governance evaluator enforces them. */
  status: 'draft' | 'active' | 'retired';
}

/** Observed counters only. Do not store invented performance scores here. */
export interface DepartmentOperationalMetrics {
  capturedAt: IsoDate;
  openTaskCount?: number;
  completedTaskCount?: number;
  blockedTaskCount?: number;
  pendingApprovalCount?: number;
}

export interface Department {
  id: OrganizationEntityId;
  organizationId: OrganizationEntityId;
  divisionId?: OrganizationEntityId;
  name: string;
  description?: string;
  objectives: string[];
  manager?: OrganizationWorkerRef;
  humanMemberIds: OrganizationEntityId[];
  doatMemberIds: OrganizationEntityId[];
  assignedWorkIds: OrganizationEntityId[];
  resourceRefs: string[];
  toolRefs: string[];
  policies: DepartmentPolicy[];
  approvalIds: OrganizationEntityId[];
  metrics?: DepartmentOperationalMetrics;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface Team {
  id: OrganizationEntityId;
  organizationId: OrganizationEntityId;
  divisionId?: OrganizationEntityId;
  departmentId?: OrganizationEntityId;
  name: string;
  description?: string;
  manager?: OrganizationWorkerRef;
  members: OrganizationWorkerRef[];
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * The primary reporting relationship is intentionally distinct from project
 * membership, allowing cross-department work without blurring accountability.
 */
export interface ReportingRelationship {
  id: OrganizationEntityId;
  organizationId: OrganizationEntityId;
  worker: OrganizationWorkerRef;
  supervisor: OrganizationWorkerRef;
  createdAt: IsoDate;
}

export interface OrganizationStructure {
  organizationId: OrganizationEntityId;
  model: OrganizationModelKind;
  metadata: OrganizationMetadata;
  divisions: Division[];
  departments: Department[];
  teams: Team[];
  reportingRelationships: ReportingRelationship[];
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface StandardDepartmentDefinition {
  key: string;
  name: string;
  description: string;
}

export interface OrganizationValidationIssue {
  code:
    | 'duplicate_id'
    | 'blank_name'
    | 'unknown_division'
    | 'unknown_department'
    | 'invalid_reporting_relationship'
    | 'duplicate_reporting_relationship'
    | 'reporting_cycle'
    | 'duplicate_member';
  message: string;
  entityId?: OrganizationEntityId;
}

export interface ReportingNode {
  worker: OrganizationWorkerRef;
  supervisor?: OrganizationWorkerRef;
  directReports: OrganizationWorkerRef[];
}
