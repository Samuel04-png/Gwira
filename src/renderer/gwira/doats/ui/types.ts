/**
 * Renderer-only adapter contract for Doat surfaces.  The domain layer owns
 * persistence, permissions and execution; these records deliberately contain
 * only data that can be safely displayed.
 */
export type DoatOperationalStatus = 'idle' | 'working' | 'planning' | 'waiting_approval' | 'blocked' | 'completed' | 'failed' | 'paused' | 'unavailable';
export type DoatShape = 'orb' | 'prism' | 'leaf' | 'satellite' | 'arch';
export type DoatExpression = 'calm' | 'focused' | 'curious' | 'alert' | 'concerned' | 'celebrating' | 'resting' | 'quiet';

export interface DoatAvatarSpec {
  /** Stable saved seed; the avatar must not change between renders. */
  seed: string;
  shape: DoatShape;
  primaryColor: string;
  secondaryColor: string;
  expression?: DoatExpression;
  accessory?: 'none' | 'halo' | 'visor' | 'antenna' | 'orbit';
  version?: number;
}

export interface DoatUiTask {
  id: string;
  title: string;
  status: string;
  updatedAt?: string;
}

export interface DoatUiRecord {
  id: string;
  name: string;
  role: string;
  department?: string;
  description?: string;
  status: DoatOperationalStatus;
  avatar: DoatAvatarSpec;
  communicationStyle?: string;
  personality?: string;
  capabilities?: readonly string[];
  tools?: readonly string[];
  supervisorName?: string;
  activeTask?: DoatUiTask;
  tasks?: readonly DoatUiTask[];
  completedTaskCount?: number;
  failedTaskCount?: number;
  executionDurationMs?: number;
  providerAvailable: boolean;
  providerLabel?: string;
  archived?: boolean;
}

export type DoatRoleCategory = 'software_development' | 'research' | 'customer_support' | 'marketing' | 'finance_reporting' | 'operations' | 'scheduling' | 'documentation' | 'custom';

export interface DoatDraft {
  name: string;
  role: string;
  roleCategory: DoatRoleCategory;
  objective: string;
  instructions?: string;
  restrictions?: string;
  escalationRules?: string;
  communicationStyle: string;
  personality: string;
  avatar: DoatAvatarSpec;
  supervisorId?: string;
  approvalRequired: boolean;
}

export interface DoatSupervisorOption { id: string; name: string; }
