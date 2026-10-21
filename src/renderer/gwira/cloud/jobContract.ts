/**
 * Durable-job state transitions only. This module has no queue, timer,
 * persistence, provider, or side effect; a backend must persist and enact the
 * returned commands before any execution can be claimed.
 */
import type { ProviderExecutionError, ProviderId } from './providerContract.js';

export type JobStatus = 'queued' | 'awaiting_approval' | 'running' | 'retry_wait' | 'cancel_requested' | 'succeeded' | 'failed' | 'cancelled';
export type JobEffectPolicy = 'read_only' | 'idempotent_external' | 'non_idempotent_external';

export interface DurableJob {
  readonly id: string;
  readonly tenantId: string;
  readonly providerId: ProviderId;
  readonly idempotencyKey: string;
  readonly status: JobStatus;
  readonly effectPolicy: JobEffectPolicy;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: ProviderExecutionError;
}

export type JobTransition =
  | { readonly ok: true; readonly job: DurableJob; readonly command?: 'dispatch' | 'cancel_provider' }
  | { readonly ok: false; readonly reason: string };

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

/** Idempotency is scoped by tenant: identical work in another tenant is never reused. */
export function findIdempotentJob(jobs: readonly DurableJob[], tenantId: string, idempotencyKey: string): DurableJob | undefined {
  return jobs.find((job) => job.tenantId === tenantId && job.idempotencyKey === idempotencyKey);
}

export function startJob(job: DurableJob, now: string): JobTransition {
  if (job.status !== 'queued' && job.status !== 'retry_wait') return reject(`Job ${job.id} is not dispatchable from ${job.status}.`);
  return accept({ ...job, status: 'running', updatedAt: now }, 'dispatch');
}

export function requestJobCancellation(job: DurableJob, now: string): JobTransition {
  if (job.status === 'queued' || job.status === 'retry_wait' || job.status === 'awaiting_approval') {
    return accept({ ...job, status: 'cancelled', updatedAt: now });
  }
  if (job.status === 'running') return accept({ ...job, status: 'cancel_requested', updatedAt: now }, 'cancel_provider');
  if (job.status === 'cancel_requested' || isTerminalJobStatus(job.status)) return accept(job);
  return reject(`Job ${job.id} cannot be cancelled from ${job.status}.`);
}

export function acknowledgeJobCancellation(job: DurableJob, now: string): JobTransition {
  if (job.status !== 'cancel_requested') return reject(`Job ${job.id} has no pending cancellation.`);
  return accept({ ...job, status: 'cancelled', updatedAt: now });
}

export function completeJob(job: DurableJob, now: string): JobTransition {
  if (job.status !== 'running') return reject(`Job ${job.id} cannot complete from ${job.status}.`);
  return accept({ ...job, status: 'succeeded', updatedAt: now });
}

export function failJob(job: DurableJob, error: ProviderExecutionError, now: string): JobTransition {
  if (job.status !== 'running' && job.status !== 'cancel_requested') return reject(`Job ${job.id} cannot fail from ${job.status}.`);
  // A provider result that arrives after cancellation is recorded as cancelled,
  // never as a successful or retryable run.
  if (job.status === 'cancel_requested') return accept({ ...job, status: 'cancelled', updatedAt: now, lastError: error });
  return accept({ ...job, status: 'failed', updatedAt: now, lastError: error });
}

/**
 * Non-idempotent external actions require a person to create a new job. This
 * prevents an automatic retry from duplicating an invoice, message, or write.
 */
export function scheduleSafeRetry(job: DurableJob, now: string): JobTransition {
  if (job.status !== 'failed') return reject(`Job ${job.id} is not failed.`);
  if (!job.lastError?.retryable) return reject(`Job ${job.id} did not fail with a retryable error.`);
  if (job.effectPolicy === 'non_idempotent_external') return reject(`Job ${job.id} has a non-idempotent external effect and requires explicit review.`);
  if (job.attempt >= job.maxAttempts) return reject(`Job ${job.id} exhausted ${job.maxAttempts} attempts.`);
  return accept({ ...job, status: 'retry_wait', attempt: job.attempt + 1, updatedAt: now });
}

function accept(job: DurableJob, command?: 'dispatch' | 'cancel_provider'): JobTransition {
  return command ? { ok: true, job, command } : { ok: true, job };
}

function reject(reason: string): JobTransition {
  return { ok: false, reason };
}
