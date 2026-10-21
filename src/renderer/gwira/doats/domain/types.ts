/**
 * Doat records are local configuration, not provider credentials or execution
 * transcripts.  The independently nested layers make it impossible for an
 * appearance update to implicitly alter execution permissions.
 */
export type DoatId = string;
export type IsoDate = string;

export type DoatProviderId = 'codex-local' | 'unavailable';
export type DoatProviderAvailability = 'configured' | 'unavailable';
export type DoatAutonomy = 'supervised' | 'approval-required' | 'limited';
export type DoatOperationalStatus =
  | 'idle'
  | 'working'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'unavailable';

export type DoatShape = 'orb' | 'prism' | 'capsule' | 'halo' | 'facet';
export type DoatExpressionStyle = 'precise' | 'warm' | 'curious' | 'composed';
export type DoatTone = 'calm' | 'bright' | 'muted';
export type DoatAccessory = 'none' | 'visor' | 'antenna' | 'orbit' | 'badge';

export interface DoatIdentity {
  name: string;
  role: string;
  department?: string;
  description?: string;
  personality?: string;
  communicationStyle?: string;
}

/** Provider information only; credentials must never be represented here. */
export interface DoatIntelligence {
  providerId: DoatProviderId;
  providerAvailability: DoatProviderAvailability;
  unavailableReason?: string;
  model?: string;
  instructions?: string;
  reasoningPreference?: string;
  businessContextRefs: string[];
}

export interface DoatCapability {
  id: string;
  name: string;
  kind: 'skill' | 'tool' | 'integration' | 'action';
  providerId?: DoatProviderId;
  available: boolean;
  unavailableReason?: string;
}

export interface DoatGovernance {
  supervisorPersonId?: string;
  autonomy: DoatAutonomy;
  approvalRequired: boolean;
  allowedProjectPaths: string[];
  maxConcurrentRuns: number;
  budgetLimit?: number;
}

export interface DoatVisualSpec {
  seed: string;
  shape: DoatShape;
  paletteId: string;
  expressionStyle: DoatExpressionStyle;
  tone: DoatTone;
  accessory: DoatAccessory;
}

export interface DoatVisualRevision {
  id: string;
  revision: number;
  createdAt: IsoDate;
  source: 'procedural';
  spec: DoatVisualSpec;
}

/** Candidate visual changes stay separate until the user accepts them. */
export interface DoatAppearance {
  active: DoatVisualRevision;
  candidate?: DoatVisualRevision;
  history: DoatVisualRevision[];
}

/** Bounded operational facts, never streamed provider output. */
export interface DoatOperations {
  status: DoatOperationalStatus;
  activeTaskId?: string;
  activeRunId?: string;
  lastCompletedTaskId?: string;
  lastError?: string;
  updatedAt: IsoDate;
}

export interface Doat {
  id: DoatId;
  workspaceId: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  archivedAt?: IsoDate;
  identity: DoatIdentity;
  intelligence: DoatIntelligence;
  capabilities: DoatCapability[];
  governance: DoatGovernance;
  appearance: DoatAppearance;
  operations: DoatOperations;
}

export interface DoatVisualGenerationInput {
  doatId: DoatId;
  name: string;
  role: string;
  capabilityIds?: string[];
  personality?: string;
  shapePreference?: DoatShape;
  paletteId?: string;
  expressionStyle?: DoatExpressionStyle;
  tone?: DoatTone;
  accessory?: DoatAccessory;
  /** A stable caller-supplied key; a new key intentionally produces a candidate. */
  generationKey: string;
}

export interface DoatOperationalFacts {
  providerAvailable: boolean;
  paused?: boolean;
  activeTask?: boolean;
  activeRun?: boolean;
  pendingApproval?: boolean;
  blocked?: boolean;
  failed?: boolean;
  completed?: boolean;
}

export type DoatMood = 'calm' | 'focused' | 'alert' | 'concerned' | 'bright' | 'resting' | 'dimmed';
