import type { ParticipantRef } from './types.js';

const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,127}$/;

export function isLocalId(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_ID.test(value);
}

/** Client idempotency keys may contain ':' (e.g. `sys:<approvalId>:<status>`). */
export function isClientId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Sortable id: `<prefix>_<time36>-<random36>`. `now` and `rand` are injected for tests. */
export function newId(prefix: string, nowMs: number, rand: () => number): string {
  const random = Math.floor(rand() * 36 ** 8).toString(36).padStart(8, '0');
  return `${prefix}_${Math.max(0, Math.floor(nowMs)).toString(36)}-${random}`;
}

/** Collision-checked against existing ids; falls back to a counter suffix if the injected rand repeats. */
export function newUniqueId(prefix: string, nowMs: number, rand: () => number, exists: (id: string) => boolean): string {
  const base = newId(prefix, nowMs, rand);
  if (!exists(base)) return base;
  for (let counter = 1; counter < 10_000; counter += 1) {
    const candidate = `${base}${counter.toString(36)}`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error('Unable to allocate a unique messaging id');
}

/** Stable across retries; created by the composer when the user presses send. */
export function newClientId(nowMs: number, rand: () => number): string {
  return newId('cid', nowMs, rand);
}

export function participantKey(participant: ParticipantRef): string {
  return `${participant.kind}:${participant.id}`;
}

export function dmKeyFor(a: ParticipantRef, b: ParticipantRef): string {
  return [participantKey(a), participantKey(b)].sort().join('|');
}

export function sameParticipant(a: ParticipantRef, b: ParticipantRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}
