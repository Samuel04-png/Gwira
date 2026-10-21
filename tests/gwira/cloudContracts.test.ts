import { describe, expect, it } from 'vitest';
import { acknowledgeJobCancellation, completeJob, failJob, findIdempotentJob, requestJobCancellation, scheduleSafeRetry, startJob, type DurableJob } from '../../src/renderer/gwira/cloud/jobContract.js';
import { validateProviderConfiguration, type ProviderExecutionError } from '../../src/renderer/gwira/cloud/providerContract.js';

const now = '2026-10-14T00:00:00.000Z';
const error: ProviderExecutionError = { code: 'unavailable', message: 'Provider unavailable', retryable: true };
const job = (overrides: Partial<DurableJob> = {}): DurableJob => ({
  id: 'job-1', tenantId: 'tenant-a', providerId: 'gwira-cloud', idempotencyKey: 'work-1', status: 'queued', effectPolicy: 'read_only', attempt: 1, maxAttempts: 3, createdAt: now, updatedAt: now, ...overrides
});

describe('cloud provider contract', () => {
  it('rejects Codex as a production execution provider while retaining local development support', () => {
    expect(validateProviderConfiguration({ environment: 'production', providerId: 'codex-local', enabled: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'provider-not-allowed' })
    ]));
    expect(validateProviderConfiguration({ environment: 'development', providerId: 'codex-local', enabled: true })).toEqual([]);
  });

  it('requires a server credential reference and secure hosted endpoint', () => {
    expect(validateProviderConfiguration({ environment: 'production', providerId: 'gwira-cloud', enabled: true, endpoint: 'http://example.test' }).map((issue) => issue.code))
      .toEqual(['missing-credential-reference', 'invalid-endpoint']);
    expect(validateProviderConfiguration({ environment: 'production', providerId: 'self-hosted', enabled: true, credentialReference: 'secret-ref', endpoint: 'https://models.example.test' })).toEqual([]);
  });
});

describe('durable job contract', () => {
  it('models dispatch as a command rather than executing a provider', () => {
    expect(startJob(job(), now)).toEqual({ ok: true, job: expect.objectContaining({ status: 'running' }), command: 'dispatch' });
  });

  it('supports safe cancellation acknowledgement and refuses completion after cancellation', () => {
    const cancellation = requestJobCancellation({ ...job(), status: 'running' }, now);
    expect(cancellation).toEqual({ ok: true, job: expect.objectContaining({ status: 'cancel_requested' }), command: 'cancel_provider' });
    if (!cancellation.ok) throw new Error('expected cancellation');
    expect(completeJob(cancellation.job, now)).toEqual(expect.objectContaining({ ok: false }));
    expect(acknowledgeJobCancellation(cancellation.job, now)).toEqual({ ok: true, job: expect.objectContaining({ status: 'cancelled' }) });
  });

  it('retries only retryable, bounded, non-dangerous failures', () => {
    const failed = failJob({ ...job(), status: 'running' }, error, now);
    if (!failed.ok) throw new Error('expected failure transition');
    expect(scheduleSafeRetry(failed.job, now)).toEqual({ ok: true, job: expect.objectContaining({ status: 'retry_wait', attempt: 2 }) });
    expect(scheduleSafeRetry({ ...failed.job, effectPolicy: 'non_idempotent_external' }, now)).toEqual(expect.objectContaining({ ok: false }));
    expect(scheduleSafeRetry({ ...failed.job, attempt: 3 }, now)).toEqual(expect.objectContaining({ ok: false }));
  });

  it('scopes idempotency to the tenant', () => {
    const existing = job();
    expect(findIdempotentJob([existing], 'tenant-a', 'work-1')).toBe(existing);
    expect(findIdempotentJob([existing], 'tenant-b', 'work-1')).toBeUndefined();
  });
});
