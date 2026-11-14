import { canReadConversation, createLocalContext } from '../domain/authorize.js';
import type { MessagingRepository, AuthContext, NewMessageInput } from '../contracts/hosted.js';
import { applyMessagingAction } from '../domain/reducer.js';
import type { MessagingAction, MessagingContext } from '../domain/reducer.js';
import { sameScope, messagingError } from '../domain/types.js';
import type { Conversation, Id, Message, MessagingError, MessagingScope, MessagingState, MessagingWork, ReadCursor, Result } from '../domain/types.js';
import { failureReasonFor, loadMessagingState, saveMessagingState } from './messagingStore.js';
import type { RecoveryOutcome, SaveFailure, StorageLike } from './messagingStore.js';

export interface RepositorySnapshot {
  state: MessagingState;
  /** False after a failed write until a later write succeeds: UI must say "Not durably saved · Retry". */
  durable: boolean;
  /** In-memory changes not yet written (deferred draft writes or failed writes). */
  dirty: boolean;
  /** Older history was trimmed by a successful save; show "Older history trimmed". */
  trimmed: boolean;
  recovery: RecoveryOutcome;
  writesBlocked: boolean;
  lastError?: SaveFailure | 'recovery_unavailable';
}

export type DispatchResult =
  | { ok: true; value: { conversationId?: Id; messageId?: Id; duplicate?: boolean }; durable: boolean }
  | { ok: false; error: MessagingError };

export interface LocalRepositoryOptions {
  storage: StorageLike;
  scope: MessagingScope;
  getWork: () => MessagingWork;
  now?: () => string;
  rand?: () => number;
}

/**
 * The only repository implementation. State lives in memory and every accepted
 * change is written through `saveMessagingState`; a failed write keeps the change in
 * memory and is reported through `snapshot.durable`, never as "saved".
 */
export class LocalMessagingRepository implements MessagingRepository {
  private snapshot: RepositorySnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly options: LocalRepositoryOptions;

  constructor(options: LocalRepositoryOptions) {
    this.options = options;
    const loaded = loadMessagingState(options.storage, options.scope, options.getWork());
    this.snapshot = {
      state: loaded.state, durable: !loaded.writesBlocked, dirty: false, trimmed: false, recovery: loaded.recovery, writesBlocked: loaded.writesBlocked,
      ...(loaded.writesBlocked ? { lastError: 'recovery_unavailable' as const } : {})
    };
    this.reconcileSelf();
  }

  getSnapshot = (): RepositorySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(patch: Partial<RepositorySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private context(): MessagingContext {
    return { scope: this.options.scope, work: this.options.getWork(), now: (this.options.now ?? (() => new Date().toISOString()))(), rand: this.options.rand };
  }

  /** Keeps the local actor a current-workspace person (defaults to the first one; never invents a person). */
  reconcileSelf(): void {
    const people = this.options.getWork().people.filter((person) => person.workspaceId === this.options.scope.workspaceId);
    const current = this.snapshot.state.selfPersonId;
    if (current && people.some((person) => person.id === current)) return;
    const next = people[0]?.id ?? null;
    if (next === current) return;
    this.set({ state: { ...this.snapshot.state, selfPersonId: next }, dirty: true });
  }

  /** `deferPersist` is for high-frequency changes (drafts); call `flush()` afterwards. */
  dispatch(action: MessagingAction, options: { deferPersist?: boolean } = {}): DispatchResult {
    const before = this.snapshot.state;
    const result = applyMessagingAction(before, action, this.context());
    if (!result.ok) return { ok: false, error: result.error as MessagingError };
    const value = result.value;
    if (result.state === before) return { ok: true, value, durable: this.snapshot.durable };
    this.set({ state: result.state, dirty: true });
    if (options.deferPersist) return { ok: true, value, durable: this.snapshot.durable };
    const target = action.type === 'sendMessage' || action.type === 'retryMessage' ? value.messageId : undefined;
    return { ok: true, value, durable: this.persist(target) };
  }

  /** Writes any pending in-memory changes. Returns whether the state is durably saved. */
  flush(): boolean {
    return this.snapshot.dirty || !this.snapshot.durable ? this.persist(undefined) : true;
  }

  dismissTrimNotice(): void {
    if (this.snapshot.trimmed) this.set({ trimmed: false });
  }

  private persist(messageId: Id | undefined): boolean {
    const state = this.snapshot.state;
    if (this.snapshot.writesBlocked) return this.recordFailure('recovery_unavailable', messageId);
    const saved = saveMessagingState(this.options.storage, state, new Set(messageId ? [messageId] : []));
    if (!saved.ok) return this.recordFailure(saved.reason, messageId);
    this.set({ state: saved.state, durable: true, dirty: false, trimmed: this.snapshot.trimmed || saved.removed > 0, lastError: undefined });
    return true;
  }

  private recordFailure(reason: SaveFailure | 'recovery_unavailable', messageId: Id | undefined): false {
    let state = this.snapshot.state;
    if (messageId) {
      const marked = applyMessagingAction(state, { type: 'markSendFailed', messageId, reason: failureReasonFor(reason) }, this.context());
      if (marked.ok) state = marked.state;
    }
    this.set({ state, durable: false, dirty: true, lastError: reason });
    return false;
  }

  // ---- Promise-shaped contract (same shape the hosted repository will have) ----

  private authorize(ctx: AuthContext): { ok: false; error: MessagingError } | { ok: true } {
    if (!sameScope(ctx, this.options.scope) || !sameScope(this.snapshot.state, ctx)) return messagingError('scope_mismatch', 'Stale organization or workspace.');
    if (ctx.actorPersonId !== this.snapshot.state.selfPersonId) return messagingError('invalid_actor', 'Actor is not the selected local person.');
    return { ok: true };
  }

  async listConversations(ctx: AuthContext): Promise<Result<Conversation[]>> {
    const auth = this.authorize(ctx);
    if (!auth.ok) return auth;
    const local = createLocalContext(this.options.scope, ctx.actorPersonId, this.options.getWork());
    const state = this.snapshot.state;
    return { ok: true, value: state.conversations.filter((conv) => canReadConversation(local, conv, state.memberships)) };
  }

  async listMessages(ctx: AuthContext, conversationId: Id, opts: { afterSeq?: number; limit: number }): Promise<Result<Message[]>> {
    const auth = this.authorize(ctx);
    if (!auth.ok) return auth;
    const state = this.snapshot.state;
    const conv = state.conversations.find((item) => item.id === conversationId);
    const local = createLocalContext(this.options.scope, ctx.actorPersonId, this.options.getWork());
    if (!conv || !canReadConversation(local, conv, state.memberships)) return messagingError('not_found', 'Conversation not found.');
    const limit = Math.max(1, Math.min(500, Math.floor(opts.limit)));
    return { ok: true, value: state.messages.filter((m) => m.conversationId === conv.id && m.seq > (opts.afterSeq ?? 0)).sort((a, b) => a.seq - b.seq).slice(0, limit) };
  }

  async appendMessage(ctx: AuthContext, input: NewMessageInput): Promise<Result<Message>> {
    const auth = this.authorize(ctx);
    if (!auth.ok) return auth;
    const result = this.dispatch({ type: 'sendMessage', ...input });
    if (!result.ok) return result;
    const message = this.snapshot.state.messages.find((item) => item.id === result.value.messageId);
    return message ? { ok: true, value: message } : messagingError('not_found', 'Message not found.');
  }

  async markRead(ctx: AuthContext, conversationId: Id, seq: number): Promise<Result<ReadCursor>> {
    const auth = this.authorize(ctx);
    if (!auth.ok) return auth;
    const result = this.dispatch({ type: 'markRead', conversationId, seq });
    if (!result.ok) return result;
    const cursor = this.snapshot.state.readCursors.find((item) => item.conversationId === conversationId && item.actorPersonId === ctx.actorPersonId);
    return cursor ? { ok: true, value: cursor } : { ok: true, value: { conversationId, actorPersonId: ctx.actorPersonId, lastReadSeq: 0, updatedAt: this.context().now } };
  }
}
