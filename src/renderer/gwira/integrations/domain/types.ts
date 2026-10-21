/**
 * Connector contracts for the Gwira integration catalog.
 *
 * These types deliberately contain references and user-visible status only.
 * They do not contain OAuth tokens, passwords, API keys, webhook secrets, or
 * a mechanism for making network requests from the renderer.
 */

export type IntegrationCategory =
  | 'communication'
  | 'development'
  | 'productivity'
  | 'business'
  | 'payments';

export type ConnectorAvailability = 'planned' | 'unavailable';
export type ConnectorConnectionStatus =
  | 'not_connected'
  | 'authorizing'
  | 'connected'
  | 'error'
  | 'disconnected'
  | 'unavailable';

/** A narrowly stated permission requested from a provider. */
export interface ConnectorScope {
  id: string;
  label: string;
  access: 'read' | 'write' | 'admin';
  description: string;
  sensitive?: boolean;
}

export interface ConnectorCatalogItem {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  availability: ConnectorAvailability;
  requestedScopes: readonly ConnectorScope[];
  /** Human-readable reason until a backend-owned connector exists. */
  availabilityMessage: string;
}

/**
 * Safe metadata for a future server-owned connection. Secrets and raw provider
 * responses are intentionally absent; those belong to a backend secret store.
 */
export interface ConnectorConnection {
  id: string;
  organizationId: string;
  connectorId: string;
  status: ConnectorConnectionStatus;
  grantedScopeIds: readonly string[];
  authorizedAccountLabel?: string;
  lastSuccessfulSyncAt?: string;
  error?: ConnectorError;
  createdAt: string;
  updatedAt: string;
}

export type ConnectorErrorCode =
  | 'authorization_denied'
  | 'authorization_expired'
  | 'scope_not_granted'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'network_failure'
  | 'configuration_missing'
  | 'unsupported_in_local_prototype';

export interface ConnectorError {
  code: ConnectorErrorCode;
  message: string;
  retryable: boolean;
  occurredAt: string;
}

export interface ConnectorAuthorizationRequest {
  connectorId: string;
  organizationId: string;
  requestedScopeIds: readonly string[];
  /** Authorization must be performed by a backend-owned approved flow. */
  returnPath?: string;
}

export interface ConnectorCapabilityGrant {
  connectionId: string;
  workerId: string;
  workerKind: 'person' | 'doat';
  scopeIds: readonly string[];
  approvedByPersonId: string;
  createdAt: string;
  revokedAt?: string;
}
