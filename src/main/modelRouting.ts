/** Only the already configured CLI provider is used. Unknown policy means no switch. */
export const AUTO_MODEL = 'gwira-auto';
export const MODEL_FAILURE_MESSAGE = "Gwira couldn't complete this request right now. Your message is saved. Review any completed work before trying again.";
export type ModelCapability = 'tools' | 'structured-output' | 'documents' | 'images' | 'streaming' | 'agents';
export interface ApprovedModelRoute {
  model: string;
  provider: string;
  capabilities: readonly ModelCapability[];
  contextWindow: number;
  /** Verified by the configured provider/policy adapter, never the renderer. */
  approved: boolean;
  privacyClass: string;
  maxCostMicros: number;
}
export interface RoutingPolicy {
  preferred: ApprovedModelRoute;
  alternatives: readonly ApprovedModelRoute[];
  requiredCapabilities: readonly ModelCapability[];
  requiredContext: number;
  budgetMicros: number;
}
export type RoutingFailure = 'unavailable' | 'rate-limit' | 'temporary' | 'timeout' | 'restricted' | 'unknown';
export function classifyRoutingFailure(message: string): RoutingFailure {
  if (/permission|unauthori[sz]ed|not authorized|not permitted|does not have access|do not have access|content_filter|forbidden|access.denied|safety|refus|insufficient.quota|billing|budget|spend|401|403/i.test(message)) return 'restricted';
  if (/model[^\n]*(?:not found|not available|unavailable|does not exist|not supported)|model_not_found/i.test(message)) return 'unavailable';
  if (/rate.limit|429/i.test(message)) return 'rate-limit';
  if (/timed? ?out|timeout/i.test(message)) return 'timeout';
  if (/503|502|504|service unavailable|temporar|overloaded/i.test(message)) return 'temporary';
  return 'unknown';
}
export function compatibleFallback(policy: RoutingPolicy, attempted: ReadonlySet<string>): ApprovedModelRoute | undefined {
  const source = policy.preferred;
  return policy.alternatives.find(candidate => candidate.approved && !attempted.has(candidate.model)
    && candidate.provider === source.provider && candidate.privacyClass === source.privacyClass
    && Number.isFinite(candidate.maxCostMicros) && candidate.maxCostMicros >= 0
    && candidate.maxCostMicros <= Math.min(source.maxCostMicros, policy.budgetMicros)
    && candidate.contextWindow >= Math.max(source.contextWindow, policy.requiredContext)
    && [...source.capabilities, ...policy.requiredCapabilities].every(capability => candidate.capabilities.includes(capability)));
}
export interface RoutingDiagnostic {
  sessionId: string; requestedModel: string; attemptedProvider: string; attemptedModel: string;
  fallbackModel?: string; failureReason?: RoutingFailure; retryCount: number; latencyMs: number;
  outcome: 'retrying' | 'completed' | 'failed' | 'cancelled'; usage: unknown; costMicros: number | null;
}
