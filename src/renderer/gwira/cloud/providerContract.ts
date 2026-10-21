/**
 * Provider contracts are intentionally transport-free. They describe the
 * boundary a hosted runtime will implement; importing this module cannot make
 * a network request or execute a model.
 */
export type ProviderId = 'gwira-cloud' | 'self-hosted' | 'codex-local';
export type ProviderEnvironment = 'development' | 'test' | 'production';
export type ProviderCapability = 'streaming' | 'structured-output' | 'tools' | 'cancellation' | 'usage';

export interface ProviderConfiguration {
  readonly environment: ProviderEnvironment;
  readonly providerId: ProviderId;
  readonly enabled: boolean;
  /** A server-owned reference, never a secret value. */
  readonly credentialReference?: string;
  readonly endpoint?: string;
}

export interface ProviderValidationIssue {
  readonly code: 'provider-not-allowed' | 'missing-credential-reference' | 'invalid-endpoint';
  readonly message: string;
}

/** Production is intentionally unable to select a user-local Codex process. */
export function validateProviderConfiguration(configuration: ProviderConfiguration): readonly ProviderValidationIssue[] {
  const issues: ProviderValidationIssue[] = [];
  if (configuration.environment === 'production' && configuration.providerId === 'codex-local') {
    issues.push({ code: 'provider-not-allowed', message: 'codex-local is available only for development and test execution.' });
  }
  if (configuration.enabled && configuration.providerId !== 'codex-local' && !configuration.credentialReference?.trim()) {
    issues.push({ code: 'missing-credential-reference', message: 'An enabled hosted provider needs a server-managed credential reference.' });
  }
  if (configuration.endpoint && !isSecureEndpoint(configuration.endpoint, configuration.environment)) {
    issues.push({ code: 'invalid-endpoint', message: 'Hosted provider endpoints must use HTTPS outside local development.' });
  }
  return issues;
}

function isSecureEndpoint(endpoint: string, environment: ProviderEnvironment): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' || (environment === 'development' && url.protocol === 'http:' && url.hostname === 'localhost');
  } catch {
    return false;
  }
}

export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface StructuredOutputRequest {
  readonly schema: Readonly<Record<string, unknown>>;
  readonly strict: boolean;
}

export interface ModelExecutionRequest {
  readonly executionId: string;
  readonly tenantId: string;
  readonly prompt: string;
  readonly tools: readonly ModelToolDefinition[];
  readonly structuredOutput?: StructuredOutputRequest;
  readonly timeoutMs: number;
  readonly idempotencyKey: string;
}

export type ProviderStreamEvent =
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'tool_call'; readonly callId: string; readonly toolName: string; readonly input: Readonly<Record<string, unknown>> }
  | { readonly type: 'tool_result'; readonly callId: string; readonly output: unknown }
  | { readonly type: 'usage'; readonly usage: ProviderUsage }
  | { readonly type: 'error'; readonly error: ProviderExecutionError };

export interface ProviderUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly costMicros?: number;
}

export interface ProviderExecutionError {
  readonly code: 'cancelled' | 'timeout' | 'rate_limited' | 'unavailable' | 'invalid_request' | 'provider_error';
  readonly message: string;
  readonly retryable: boolean;
}

export type ProviderExecutionResult =
  | { readonly ok: true; readonly text: string; readonly structuredOutput?: unknown; readonly usage?: ProviderUsage }
  | { readonly ok: false; readonly error: ProviderExecutionError; readonly usage?: ProviderUsage };

export interface CancellationHandle {
  readonly executionId: string;
  readonly cancel: () => Promise<void>;
}

/** Implementations belong to the future hosted runtime, not the renderer. */
export interface ModelProvider {
  readonly id: ProviderId;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  execute(request: ModelExecutionRequest): Promise<ProviderExecutionResult>;
  stream(request: ModelExecutionRequest): AsyncIterable<ProviderStreamEvent>;
  cancel(executionId: string): Promise<void>;
}
