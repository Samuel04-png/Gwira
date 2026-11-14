import type { StorageLike } from '../../data/localStore.js';
import { MAX_RAW_PAYLOAD_CHARS, canonicalizeState, recomputeDerived, sanitizeMessagingState } from '../domain/validate.js';
import { MAX_MESSAGES_PER_CONVERSATION, MAX_MESSAGES_TOTAL, MAX_SERIALIZED_BYTES, createEmptyMessagingState } from '../domain/types.js';
import type { FailureReason, Id, Message, MessagingScope, MessagingState, MessagingWork } from '../domain/types.js';

/**
 * Separate from every Codex Desktop and Gwira work-state key. These two are the
 * legacy unscoped keys: they are only read (never written) so an older payload can
 * migrate into its own scope. Current data lives under the per-scope keys below.
 */
export const MESSAGING_STORAGE_KEY = 'gwira.messaging.local.v1';
export const MESSAGING_RECOVERY_KEY = 'gwira.messaging.local.recovery.v1';

type ScopeIds = Pick<MessagingScope, 'organizationId' | 'workspaceId'>;
export function messagingStorageKey(scope: ScopeIds): string { return `${MESSAGING_STORAGE_KEY}:${scope.organizationId}:${scope.workspaceId}`; }
export function messagingRecoveryKey(scope: ScopeIds): string { return `${MESSAGING_RECOVERY_KEY}:${scope.organizationId}:${scope.workspaceId}`; }

/** Best-effort owner of an unscoped legacy payload; never trusts anything but two string ids. */
function peekScope(raw: string): ScopeIds | undefined {
  if (raw.length > MAX_RAW_PAYLOAD_CHARS) return undefined;
  try {
    const value = JSON.parse(raw) as { organizationId?: unknown; workspaceId?: unknown } | null;
    return typeof value?.organizationId === 'string' && typeof value.workspaceId === 'string' && value.organizationId.length < 100 && value.workspaceId.length < 100 ? { organizationId: value.organizationId, workspaceId: value.workspaceId } : undefined;
  } catch {
    return undefined;
  }
}

export type { StorageLike };
export type EmptyMessagingFactory = (scope: MessagingScope) => MessagingState;

const encoder = new TextEncoder();
export function measureBytes(serialized: string): number { return encoder.encode(serialized).byteLength; }

/** Canonical (insertion-order independent) JSON of the complete state. */
export function serializeMessagingState(state: MessagingState): string {
  return JSON.stringify(canonicalizeState(state));
}

/** Only schema 1 exists. The supplied scope is never overridden by migration output. */
export function migrateMessagingState(value: unknown, _scope: MessagingScope): unknown {
  return value;
}

export type ParseStatus = 'empty' | 'ok' | 'repaired' | 'scope_mismatch' | 'invalid';
export interface ParseResult { state: MessagingState; status: ParseStatus; repairs: number; issues: string[] }

export function parseMessagingState(raw: string | null, scope: MessagingScope, work?: MessagingWork, empty: EmptyMessagingFactory = createEmptyMessagingState): ParseResult {
  const none = (status: ParseStatus, issues: string[] = []): ParseResult => ({ state: empty(scope), status, repairs: 0, issues });
  if (!raw) return none('empty');
  if (raw.length > MAX_RAW_PAYLOAD_CHARS) return none('invalid', ['payload too large']);
  try {
    const result = sanitizeMessagingState(migrateMessagingState(JSON.parse(raw), scope), scope, work);
    if (result.status === 'scope_mismatch') return none('scope_mismatch');
    if (result.status === 'invalid') return none('invalid', [result.issue]);
    return { state: result.state, status: result.repairs > 0 ? 'repaired' : 'ok', repairs: result.repairs, issues: result.issues };
  } catch {
    return none('invalid', ['not valid JSON']);
  }
}

export type RecoveryOutcome = 'none' | 'quarantined' | 'recovery_unavailable';
export interface LoadResult {
  state: MessagingState;
  status: ParseStatus | 'unavailable';
  recovery: RecoveryOutcome;
  /** True when a payload needed quarantine but the copy failed: it must not be overwritten. */
  writesBlocked: boolean;
  issues: string[];
}

/**
 * Loads for exactly the given scope. A mismatched, malformed or repaired payload is
 * copied to the recovery key first; if that copy fails the original is left in
 * place and writes stay blocked. Never throws.
 */
export function loadMessagingState(storage: StorageLike, scope: MessagingScope, work?: MessagingWork, empty: EmptyMessagingFactory = createEmptyMessagingState): LoadResult {
  const recoveryKey = messagingRecoveryKey(scope);
  let raw: string | null;
  let legacy = false;
  try {
    raw = storage.getItem(messagingStorageKey(scope));
    if (raw === null) {
      raw = storage.getItem(MESSAGING_STORAGE_KEY);
      legacy = raw !== null;
    }
  } catch {
    return { state: empty(scope), status: 'unavailable', recovery: 'none', writesBlocked: false, issues: ['storage unavailable'] };
  }
  const parsed = parseMessagingState(raw, scope, work, empty);
  if (raw && legacy && parsed.status === 'scope_mismatch') {
    // The legacy payload belongs to another scope and stays untouched for it to migrate; keep a recovery copy under that scope's key.
    const owner = peekScope(raw);
    let recovery: RecoveryOutcome = 'quarantined';
    if (owner) {
      try {
        if (storage.getItem(messagingStorageKey(owner)) === null && storage.getItem(messagingRecoveryKey(owner)) === null) storage.setItem(messagingRecoveryKey(owner), raw);
      } catch {
        recovery = 'recovery_unavailable';
      }
    }
    return { state: parsed.state, status: parsed.status, recovery, writesBlocked: false, issues: parsed.issues };
  }
  if (raw && (parsed.status === 'scope_mismatch' || parsed.status === 'invalid' || parsed.status === 'repaired')) {
    try {
      storage.setItem(recoveryKey, raw);
      return { state: parsed.state, status: parsed.status, recovery: 'quarantined', writesBlocked: false, issues: parsed.issues };
    } catch {
      return { state: parsed.state, status: parsed.status, recovery: 'recovery_unavailable', writesBlocked: true, issues: parsed.issues };
    }
  }
  return { state: parsed.state, status: parsed.status, recovery: 'none', writesBlocked: false, issues: parsed.issues };
}

// ---------------------------------------------------------------------------
// Bounding
// ---------------------------------------------------------------------------

function oldestFirst(a: Message, b: Message): number {
  return (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
    || (a.conversationId < b.conversationId ? -1 : a.conversationId > b.conversationId ? 1 : 0)
    || a.seq - b.seq
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Saved messages, thread roots/parents with replies, failed (unsaved) messages and caller-protected ids are never trimmed. */
function eligibleForTrim(state: MessagingState, protectedIds: ReadonlySet<Id>): Message[] {
  const keep = new Set<string>(protectedIds);
  for (const row of state.saved) keep.add(row.messageId);
  for (const message of state.messages) {
    if (message.threadRootId) keep.add(message.threadRootId);
    if (message.sendState === 'failed') keep.add(message.id);
  }
  return state.messages.filter((message) => !keep.has(message.id)).sort(oldestFirst);
}

function removeMessages(state: MessagingState, ids: ReadonlySet<Id>): MessagingState {
  if (ids.size === 0) return state;
  const messages = state.messages.filter((message) => !ids.has(message.id));
  const live = new Set(messages.map((message) => message.id));
  return recomputeDerived({
    ...state,
    messages,
    reactions: state.reactions.filter((row) => live.has(row.messageId)),
    saved: state.saved.filter((row) => live.has(row.messageId)),
    drafts: state.drafts.filter((draft) => !draft.threadRootId || live.has(draft.threadRootId))
  });
}

export interface BoundResult { state: MessagingState; serialized: string; bytes: number; removed: number; fits: boolean }

/**
 * Canonically orders the state, enforces count caps, then removes the oldest eligible
 * messages until the complete UTF-8 serialized payload fits MAX_SERIALIZED_BYTES.
 * `extraRemovals` forces additional oldest-first removal (used for a quota retry).
 */
export function boundForPersistence(input: MessagingState, protectedIds: ReadonlySet<Id> = new Set(), extraRemovals = 0): BoundResult {
  let state = canonicalizeState(input);
  let removed = 0;
  const drop = (messages: Message[]) => {
    const ids = new Set(messages.map((message) => message.id));
    state = removeMessages(state, ids);
    removed += ids.size;
  };
  // Count caps (best effort; protected messages may keep a count above the cap).
  const perConversation = new Map<string, number>();
  for (const message of state.messages) perConversation.set(message.conversationId, (perConversation.get(message.conversationId) ?? 0) + 1);
  for (const [conversationId, count] of perConversation) {
    if (count > MAX_MESSAGES_PER_CONVERSATION) drop(eligibleForTrim(state, protectedIds).filter((message) => message.conversationId === conversationId).slice(0, count - MAX_MESSAGES_PER_CONVERSATION));
  }
  if (state.messages.length > MAX_MESSAGES_TOTAL) drop(eligibleForTrim(state, protectedIds).slice(0, state.messages.length - MAX_MESSAGES_TOTAL));
  if (extraRemovals > 0) drop(eligibleForTrim(state, protectedIds).slice(0, extraRemovals));

  let serialized = serializeMessagingState(state);
  let bytes = measureBytes(serialized);
  for (let pass = 0; bytes > MAX_SERIALIZED_BYTES && pass < 64; pass += 1) {
    const candidates = eligibleForTrim(state, protectedIds);
    if (candidates.length === 0) break;
    let excess = bytes - MAX_SERIALIZED_BYTES;
    const batch: Message[] = [];
    for (const message of candidates) {
      if (excess <= 0) break;
      batch.push(message);
      excess -= measureBytes(JSON.stringify(message)) + 1;
    }
    drop(batch);
    serialized = serializeMessagingState(state);
    bytes = measureBytes(serialized);
  }
  return { state, serialized, bytes, removed, fits: bytes <= MAX_SERIALIZED_BYTES };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export type SaveFailure = 'storage_full' | 'storage_unavailable' | 'too_large';
export type SaveResult =
  | { ok: true; state: MessagingState; bytes: number; removed: number }
  | { ok: false; reason: SaveFailure; state: MessagingState };

export function classifyStorageError(error: unknown): 'storage_full' | 'storage_unavailable' {
  const item = error as { name?: unknown; code?: unknown; message?: unknown } | null;
  const name = typeof item?.name === 'string' ? item.name : '';
  const message = typeof item?.message === 'string' ? item.message : '';
  if (/quota/i.test(name) || /quota/i.test(message) || item?.code === 22 || item?.code === 1014) return 'storage_full';
  return 'storage_unavailable';
}

export function failureReasonFor(reason: SaveFailure | 'recovery_unavailable'): FailureReason {
  return reason === 'storage_unavailable' || reason === 'recovery_unavailable' ? 'storage_unavailable' : 'storage_full';
}

/**
 * Writes the bounded canonical state. Never writes an oversized payload. On a quota
 * error it retries once after additional safe oldest-first trimming. The caller keeps
 * the in-memory state either way and decides how to report the failure.
 */
export function saveMessagingState(storage: StorageLike, state: MessagingState, protectedIds: ReadonlySet<Id> = new Set()): SaveResult {
  const key = messagingStorageKey(state);
  const first = boundForPersistence(state, protectedIds);
  if (!first.fits) return { ok: false, reason: 'too_large', state };
  try {
    storage.setItem(key, first.serialized);
    return { ok: true, state: first.state, bytes: first.bytes, removed: first.removed };
  } catch (error) {
    const reason = classifyStorageError(error);
    if (reason !== 'storage_full') return { ok: false, reason, state };
    const retry = boundForPersistence(first.state, protectedIds, Math.max(1, Math.ceil(first.state.messages.length / 10)));
    retry.removed += first.removed;
    if (retry.removed <= first.removed || !retry.fits) return { ok: false, reason, state };
    try {
      storage.setItem(key, retry.serialized);
      return { ok: true, state: retry.state, bytes: retry.bytes, removed: retry.removed };
    } catch (second) {
      return { ok: false, reason: classifyStorageError(second), state };
    }
  }
}
