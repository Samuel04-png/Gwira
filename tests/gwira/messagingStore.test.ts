import { describe, expect, it } from 'vitest';
import { LocalMessagingRepository } from '../../src/renderer/gwira/messaging/data/localRepository.js';
import { MESSAGING_RECOVERY_KEY, MESSAGING_STORAGE_KEY, boundForPersistence, messagingRecoveryKey, messagingStorageKey, loadMessagingState, measureBytes, parseMessagingState, saveMessagingState, serializeMessagingState } from '../../src/renderer/gwira/messaging/data/messagingStore.js';
import { selectDraft, selectFailedMessages, selectFeed } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import { MAX_BODY, MAX_SERIALIZED_BYTES, MAX_UNSAVED_MESSAGES, createEmptyMessagingState } from '../../src/renderer/gwira/messaging/domain/types.js';
import type { Message, MessagingState } from '../../src/renderer/gwira/messaging/domain/types.js';
import { validateMessagingState } from '../../src/renderer/gwira/messaging/domain/validate.js';
import { A, APPROVAL, B, DOAT, OUTSIDER, TASK, channel, harness, human, makeWork, memoryStorage, otherWorkspace, rawMessage, scope, send, t0 } from './messagingFixtures.js';

function repo(storage: ReturnType<typeof memoryStorage>, work = makeWork()) {
  let tick = 0;
  let r = 0;
  return new LocalMessagingRepository({ storage, scope, getWork: () => work, now: () => new Date(Date.parse(t0) + tick++ * 1000).toISOString(), rand: () => { r += 0.000001; return r; } });
}

/** A state whose serialized size exceeds the 2 MiB budget, built directly (bypassing per-send checks). */
function oversizedState(extra: (state: MessagingState, conv: string) => Partial<MessagingState> = () => ({})): { state: MessagingState; conv: string; messages: Message[] } {
  const h = harness();
  const conv = channel(h, 'big');
  const other = channel(h, 'big2');
  const messages: Message[] = [];
  for (let i = 1; i <= 300; i += 1) {
    const at = new Date(Date.parse(t0) + i * 1000).toISOString();
    messages.push(rawMessage(h.state, conv, i, `${i} `.padEnd(MAX_BODY, 'x'), at));
    messages.push({ ...rawMessage(h.state, other, i, `${i} `.padEnd(MAX_BODY, 'y'), at), id: `msg_other${i}`, clientId: `o${i}` });
  }
  const base = { ...h.state, messages };
  return { state: { ...base, conversations: base.conversations.map((c) => ({ ...c, lastMessageSeq: 300 })), ...extra(base, conv) }, conv, messages };
}

describe('messaging persistence: round trip and recovery', () => {
  it('round-trips losslessly through serialize/parse with canonical order', () => {
    const h = harness();
    const conv = channel(h);
    const root = send(h, conv, 'root', 'c1');
    send(h, conv, 'reply', 'c2', { threadRootId: root });
    h.ok({ type: 'toggleReaction', messageId: root, emoji: '👍' });
    h.ok({ type: 'toggleSaved', messageId: root });
    h.ok({ type: 'markRead', conversationId: conv });
    h.ok({ type: 'setDraft', conversationId: conv, body: 'draft' });
    const json = serializeMessagingState(h.state);
    const parsed = parseMessagingState(json, scope, h.work);
    expect(parsed.status).toBe('ok');
    expect(serializeMessagingState(parsed.state)).toBe(json);
    const shuffled = { ...h.state, messages: [...h.state.messages].reverse(), conversations: [...h.state.conversations].reverse() };
    expect(serializeMessagingState(shuffled)).toBe(json);
  });

  it('copies corrupt/unsupported payloads to the recovery key and returns an empty state', () => {
    for (const raw of ['{not json', JSON.stringify({ schemaVersion: 99 }), JSON.stringify({ ...createEmptyMessagingState(scope), conversations: 'x' })]) {
      const storage = memoryStorage({ [messagingStorageKey(scope)]: raw });
      const loaded = loadMessagingState(storage, scope);
      expect(loaded.state).toEqual(createEmptyMessagingState(scope));
      expect(storage.values.get(messagingRecoveryKey(scope))).toBe(raw);
      expect(loaded.recovery).toBe('quarantined');
    }
  });

  it('does not crash when storage throws on read', () => {
    const storage = memoryStorage();
    storage.behaviour.failRead = true;
    const loaded = loadMessagingState(storage, scope);
    expect(loaded.state).toEqual(createEmptyMessagingState(scope));
    expect(loaded.status).toBe('unavailable');
  });

  it('quarantines org/workspace mismatches and never hydrates them', () => {
    const h = harness();
    const conv = channel(h);
    send(h, conv, 'private to workspace 1', 'c1');
    const raw = serializeMessagingState(h.state);
    for (const other of [{ ...scope, workspaceId: otherWorkspace }, { ...scope, organizationId: '10000000-0000-4000-8000-0000000000ee' }]) {
      const storage = memoryStorage({ [messagingStorageKey(other)]: raw });
      const loaded = loadMessagingState(storage, other);
      expect(loaded.state).toEqual(createEmptyMessagingState(other));
      expect(loaded.status).toBe('scope_mismatch');
      expect(storage.values.get(messagingRecoveryKey(other))).toBe(raw);
    }
  });

  it('blocks writes (and keeps the original payload) when quarantine itself fails', () => {
    const h = harness();
    const conv = channel(h);
    send(h, conv, 'old', 'c1');
    const raw = serializeMessagingState(h.state);
    const storage = memoryStorage({ [messagingStorageKey({ ...scope, workspaceId: otherWorkspace })]: raw, [messagingStorageKey(scope)]: raw });
    storage.behaviour.failWrites = 'unavailable';
    storage.behaviour.failKey = messagingRecoveryKey({ ...scope, workspaceId: otherWorkspace });
    const repository = repo(storage, makeWork());
    const mismatched = new LocalMessagingRepository({ storage, scope: { ...scope, workspaceId: otherWorkspace }, getWork: () => makeWork() });
    expect(mismatched.getSnapshot().recovery).toBe('recovery_unavailable');
    expect(mismatched.getSnapshot().writesBlocked).toBe(true);
    expect(mismatched.getSnapshot().durable).toBe(false);
    expect(repository.getSnapshot().state.messages).toHaveLength(1);
    storage.behaviour.failWrites = undefined;
    expect(mismatched.flush()).toBe(false);
    expect(storage.values.get(messagingStorageKey({ ...scope, workspaceId: otherWorkspace }))).toBe(raw);
  });
});

describe('messaging persistence: scoped keys', () => {
  const other = { ...scope, workspaceId: otherWorkspace };
  function populated() {
    const h = harness();
    send(h, channel(h), 'workspace one secret', 'c1');
    return serializeMessagingState(h.state);
  }

  it('keeps each scope in its own primary slot so switching cannot overwrite another scope', () => {
    const storage = memoryStorage();
    const first = repo(storage);
    first.dispatch({ type: 'createChannel', name: 'general' });
    const second = new LocalMessagingRepository({ storage, scope: other, getWork: () => makeWork() });
    expect(second.getSnapshot().state.conversations).toHaveLength(0);
    second.dispatch({ type: 'createChannel', name: 'other-room' });
    expect(storage.values.has(messagingStorageKey(scope))).toBe(true);
    expect(storage.values.has(messagingStorageKey(other))).toBe(true);
    const reloaded = loadMessagingState(storage, scope, makeWork());
    expect(reloaded.state.conversations.map((c) => c.name)).toEqual(['general']);
    expect(storage.values.has(MESSAGING_STORAGE_KEY)).toBe(false);
  });

  it('keeps a quarantined copy per scope instead of one shared recovery slot', () => {
    const raw = populated();
    const storage = memoryStorage({ [messagingStorageKey(other)]: raw, [messagingStorageKey({ ...other, workspaceId: '10000000-0000-4000-8000-0000000000dd' })]: raw });
    loadMessagingState(storage, other);
    loadMessagingState(storage, { ...other, workspaceId: '10000000-0000-4000-8000-0000000000dd' });
    expect(storage.values.get(messagingRecoveryKey(other))).toBe(raw);
    expect(storage.values.get(messagingRecoveryKey({ ...other, workspaceId: '10000000-0000-4000-8000-0000000000dd' }))).toBe(raw);
    expect(storage.values.has(MESSAGING_RECOVERY_KEY)).toBe(false);
  });

  it('migrates a matching legacy unscoped payload and never hydrates a mismatching one', () => {
    const raw = populated();
    const storage = memoryStorage({ [MESSAGING_STORAGE_KEY]: raw });
    const mismatched = loadMessagingState(storage, other, makeWork());
    expect(mismatched.state.conversations).toHaveLength(0);
    expect(mismatched.status).toBe('scope_mismatch');
    expect(storage.values.get(messagingRecoveryKey(scope))).toBe(raw);
    expect(storage.values.has(messagingRecoveryKey(other))).toBe(false);
    expect(storage.values.get(MESSAGING_STORAGE_KEY)).toBe(raw);
    const matching = loadMessagingState(storage, scope, makeWork());
    expect(matching.status).toBe('ok');
    expect(matching.state.messages).toHaveLength(1);
  });
});

describe('messaging persistence: untrusted data', () => {
  it('drops malformed, forged and duplicate records and repairs counters', () => {
    const h = harness();
    const conv = channel(h);
    const root = send(h, conv, 'root', 'c1');
    const good = h.state.messages[0];
    const forged = [
      { ...good, id: 'msg_dup_seq', clientId: 'd1', body: 'duplicate seq' },
      { ...good, id: 'msg_orphan', clientId: 'o1', seq: 7, conversationId: 'conv_missing' },
      { ...good, id: 'msg_delivered', clientId: 'x1', seq: 8, sendState: 'delivered' },
      { ...good, id: 'msg_doat', clientId: 'x2', seq: 9, author: { kind: 'doat', id: DOAT } },
      { ...good, id: 'msg_stranger', clientId: 'x3', seq: 10, author: human(OUTSIDER) },
      { ...good, id: 'msg_wrong_ws', clientId: 'x4', seq: 11, workspaceId: otherWorkspace },
      { ...good, id: 'msg_bad_root', clientId: 'x5', seq: 12, threadRootId: 'msg_missing' },
      { ...good, id: 'msg_system_unbacked', clientId: 'x6', seq: 13, type: 'approval_event', author: { kind: 'system', id: 'gwira.system' }, refs: [] },
      { ...good, id: 'msg_long', clientId: 'x7', seq: 14, body: 'x'.repeat(MAX_BODY + 1) },
      { ...good, id: 'msg_html', clientId: 'x8', seq: 15, body: '<img src=x onerror=alert(1)>', __proto__: { polluted: true }, extra: 'dropped' },
      'string', null, 42
    ];
    const payload = { ...h.state, messages: [...h.state.messages, ...forged], reactions: [{ messageId: 'gone', emoji: '👍', actorPersonId: A, at: t0 }, { messageId: root, emoji: ':)', actorPersonId: A, at: t0 }], readCursors: [{ conversationId: conv, actorPersonId: A, lastReadSeq: 999, updatedAt: t0 }, { conversationId: 'gone', actorPersonId: A, lastReadSeq: 1, updatedAt: t0 }], drafts: [{ conversationId: 'gone', actorPersonId: A, body: 'x', updatedAt: t0 }, { conversationId: conv, actorPersonId: A, body: '', updatedAt: t0 }] };
    const raw = JSON.stringify(payload);
    const storage = memoryStorage({ [messagingStorageKey(scope)]: raw });
    const loaded = loadMessagingState(storage, scope, h.work);
    expect(loaded.status).toBe('repaired');
    expect(storage.values.get(messagingRecoveryKey(scope))).toBe(raw);
    expect(loaded.state.messages.map((m) => m.id).sort()).toEqual([root, 'msg_dup_seq', 'msg_html'].sort());
    expect(loaded.state.messages.find((m) => m.id === 'msg_html')?.body).toBe('<img src=x onerror=alert(1)>');
    expect(Object.keys(loaded.state.messages[0])).not.toContain('extra');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(loaded.state.reactions).toEqual([]);
    expect(loaded.state.readCursors).toEqual([{ conversationId: conv, actorPersonId: A, lastReadSeq: loaded.state.conversations[0].lastMessageSeq, updatedAt: t0 }]);
    expect(loaded.state.drafts).toEqual([]);
    expect(validateMessagingState(loaded.state, scope, h.work).ok).toBe(true);
  });

  it('renumbers duplicate sequences and drops DMs without exactly two members', () => {
    const h = harness();
    const conv = channel(h);
    send(h, conv, 'one', 'c1');
    const dm = h.ok({ type: 'createDm', participant: human(B) }).conversationId as string;
    const dup = { ...h.state.messages[0], id: 'msg_dup', clientId: 'c2', body: 'two', createdAt: '2026-10-14T11:00:00.000Z' };
    const broken = { ...h.state, messages: [...h.state.messages, dup], memberships: h.state.memberships.filter((m) => !(m.conversationId === dm && m.participant.id === B)) };
    const parsed = parseMessagingState(JSON.stringify(broken), scope, h.work);
    expect(parsed.state.conversations.map((c) => c.id)).toEqual([conv]);
    expect(parsed.state.messages.map((m) => m.seq).sort()).toEqual([1, 2]);
    expect(parsed.state.conversations[0].lastMessageSeq).toBe(2);
  });

  it('rejects a persisted self actor that is not a current-workspace person', () => {
    const state = { ...createEmptyMessagingState(scope), selfPersonId: OUTSIDER };
    expect(parseMessagingState(JSON.stringify(state), scope, makeWork()).state.selfPersonId).toBeNull();
    expect(validateMessagingState(state, scope, makeWork()).ok).toBe(false);
  });
});

describe('messaging persistence: repository, drafts and reload', () => {
  it('starts with no seeded conversations or messages and defaults self to the first current person', () => {
    const repository = repo(memoryStorage());
    const snapshot = repository.getSnapshot();
    expect(snapshot.state.conversations).toEqual([]);
    expect(snapshot.state.messages).toEqual([]);
    expect(snapshot.state.selfPersonId).toBe(A);
    expect(snapshot.durable).toBe(true);
  });

  it('recovers messages, cursors and per-actor drafts after reload and clears only the sender draft', () => {
    const storage = memoryStorage();
    const first = repo(storage);
    const conv = first.dispatch({ type: 'createChannel', name: 'team', visibility: 'private', members: [human(B)] });
    if (!conv.ok) throw new Error('create failed');
    const id = conv.value.conversationId as string;
    first.dispatch({ type: 'setDraft', conversationId: id, body: 'A unsent', refs: [{ kind: 'task', taskId: TASK }, { kind: 'approval', approvalId: APPROVAL }] }, { deferPersist: true });
    expect(storage.values.get(messagingStorageKey(scope))).toContain('"drafts":[]');
    expect(first.flush()).toBe(true);
    first.dispatch({ type: 'setSelf', personId: B });
    first.dispatch({ type: 'setDraft', conversationId: id, body: 'B unsent' });
    const sent = first.dispatch({ type: 'sendMessage', conversationId: id, clientId: 'c1', body: 'hello from B' });
    expect(sent.ok && sent.durable).toBe(true);
    first.dispatch({ type: 'setSelf', personId: A });
    first.dispatch({ type: 'markRead', conversationId: id });

    const work = makeWork();
    const reloaded = repo(storage, work);
    const { state } = reloaded.getSnapshot();
    expect(state.selfPersonId).toBe(A);
    expect(state.messages.map((m) => m.body)).toEqual(['hello from B']);
    expect(selectDraft(state, scope, work, id)).toMatchObject({ body: 'A unsent', refs: [{ kind: 'task', taskId: TASK }, { kind: 'approval', approvalId: APPROVAL }] });
    expect(state.drafts).toHaveLength(1);
    expect(state.readCursors).toEqual([expect.objectContaining({ actorPersonId: A, lastReadSeq: 1 })]);
    reloaded.dispatch({ type: 'setSelf', personId: B });
    expect(selectDraft(reloaded.getSnapshot().state, scope, work, id)).toBeUndefined();
  });

  it('exposes the Promise-shaped contract with scope and actor checks', async () => {
    const repository = repo(memoryStorage());
    const ctx = { ...scope, actorPersonId: A };
    const created = repository.dispatch({ type: 'createChannel', name: 'c', visibility: 'private', members: [human(B)] });
    const id = created.ok ? created.value.conversationId as string : '';
    const appended = await repository.appendMessage(ctx, { conversationId: id, clientId: 'k', body: 'hi' });
    const again = await repository.appendMessage(ctx, { conversationId: id, clientId: 'k', body: 'hi' });
    expect(appended.ok && again.ok && appended.value.id === again.value.id).toBe(true);
    expect((await repository.listMessages(ctx, id, { limit: 10 })).ok).toBe(true);
    expect((await repository.listConversations({ ...ctx, workspaceId: otherWorkspace })).ok).toBe(false);
    expect((await repository.listConversations({ ...ctx, actorPersonId: B })).ok).toBe(false);
    const read = await repository.markRead(ctx, id, 1);
    expect(read.ok && read.value.lastReadSeq).toBe(1);
  });
});

describe('messaging persistence: byte budget', () => {
  it('trims oldest-first to the exact 2 MiB ceiling, independent of array order', () => {
    const { state } = oversizedState();
    expect(measureBytes(serializeMessagingState(state))).toBeGreaterThan(MAX_SERIALIZED_BYTES);
    const result = boundForPersistence(state);
    expect(result.fits).toBe(true);
    expect(result.bytes).toBe(measureBytes(result.serialized));
    expect(result.bytes).toBeLessThanOrEqual(MAX_SERIALIZED_BYTES);
    expect(result.removed).toBeGreaterThan(0);
    // Minimal trimming: one more message would have fit back in.
    expect(result.bytes + 4_000).toBeGreaterThan(MAX_SERIALIZED_BYTES - 1_000);
    const kept = result.state.messages;
    const keptTimes = kept.map((m) => m.createdAt).sort();
    const removedTimes = state.messages.filter((m) => !kept.some((k) => k.id === m.id)).map((m) => m.createdAt).sort();
    expect(removedTimes[removedTimes.length - 1] <= keptTimes[0]).toBe(true);
    const reversed = boundForPersistence({ ...state, messages: [...state.messages].reverse(), conversations: [...state.conversations].reverse() });
    expect(reversed.serialized).toBe(result.serialized);
  });

  it('fits exactly when already within budget and writes nothing extra', () => {
    const h = harness();
    const conv = channel(h);
    send(h, conv, 'small', 'c1');
    const result = boundForPersistence(h.state);
    expect(result.removed).toBe(0);
    expect(result.serialized).toBe(serializeMessagingState(h.state));
  });

  it('never trims saved messages or thread roots/parents with replies', () => {
    const { state, conv } = oversizedState((base) => {
      const oldest = base.messages.find((m) => m.seq === 1 && m.conversationId === conv0(base))!;
      const second = base.messages.find((m) => m.seq === 2 && m.conversationId === conv0(base))!;
      return {
        saved: [{ messageId: oldest.id, conversationId: oldest.conversationId, actorPersonId: B, savedAt: t0 }],
        messages: base.messages.map((m) => (m.id === 'msg_raw3' && m.conversationId === second.conversationId ? { ...m, threadRootId: second.id } : m))
      };
    });
    const result = boundForPersistence(state);
    const ids = new Set(result.state.messages.map((m) => `${m.conversationId}:${m.seq}`));
    expect(ids.has(`${conv}:1`)).toBe(true);
    expect(ids.has(`${conv}:2`)).toBe(true);
    expect(result.state.saved).toHaveLength(1);
    expect(validateMessagingState(result.state, scope).ok).toBe(true);
  });

  it('does not write when no safe trim can fit and keeps the message failed in memory', () => {
    const h = harness();
    const conv = channel(h);
    const big = Array.from({ length: 600 }, (_, i) => rawMessage(h.state, conv, i + 1, 'z'.repeat(MAX_BODY), new Date(Date.parse(t0) + i * 1000).toISOString()));
    // Everything is saved by someone, so nothing is eligible for trimming.
    const saved = big.map((m) => ({ messageId: m.id, conversationId: conv, actorPersonId: B, savedAt: t0 }));
    const state = { ...h.state, messages: big, saved, conversations: h.state.conversations.map((c) => ({ ...c, lastMessageSeq: 600 })) };
    const storage = memoryStorage();
    const result = saveMessagingState(storage, state);
    expect(result).toMatchObject({ ok: false, reason: 'too_large' });
    expect(storage.values.has(messagingStorageKey(scope))).toBe(false);
    expect(storage.behaviour.writes).toBe(0);
  });

  it('reports older history trimmed after a successful save, and survives reload', () => {
    const { state } = oversizedState();
    const storage = memoryStorage();
    const saved = saveMessagingState(storage, state);
    expect(saved.ok && saved.removed).toBeGreaterThan(0);
    const loaded = loadMessagingState(storage, scope, makeWork());
    expect(loaded.status).toBe('ok');
    expect(loaded.state.messages.length).toBe(saved.ok ? saved.state.messages.length : -1);
    expect(measureBytes(storage.values.get(messagingStorageKey(scope)) ?? '')).toBeLessThanOrEqual(MAX_SERIALIZED_BYTES);
  });
});

function conv0(state: MessagingState): string { return state.conversations[0].id; }

describe('messaging persistence: quota failure', () => {
  it('keeps the message in memory as failed, retains the draft, and recovers on retry', () => {
    const storage = memoryStorage();
    const work = makeWork();
    const repository = repo(storage, work);
    const created = repository.dispatch({ type: 'createChannel', name: 'q', visibility: 'private', members: [human(B)] });
    const id = created.ok ? created.value.conversationId as string : '';
    repository.dispatch({ type: 'setDraft', conversationId: id, body: 'my message' });
    storage.behaviour.failWrites = 'quota';
    const sent = repository.dispatch({ type: 'sendMessage', conversationId: id, clientId: 'c1', body: 'my message' });
    expect(sent.ok && sent.durable).toBe(false);
    const snapshot = repository.getSnapshot();
    expect(snapshot.durable).toBe(false);
    expect(snapshot.lastError).toBe('storage_full');
    const failed = snapshot.state.messages[0];
    expect(failed).toMatchObject({ body: 'my message', sendState: 'failed', failureReason: 'storage_full' });
    expect(selectFailedMessages(snapshot.state, scope, work).map((m) => m.id)).toEqual([failed.id]);
    expect(JSON.parse(storage.values.get(messagingStorageKey(scope)) ?? '{}').messages ?? []).toEqual([]);
    expect(selectFeed(snapshot.state, scope, work, id)?.messages[0].failed).toBe(true);

    storage.behaviour.failWrites = undefined;
    const retried = repository.dispatch({ type: 'retryMessage', messageId: failed.id });
    expect(retried.ok && retried.durable).toBe(true);
    const after = repository.getSnapshot();
    expect(after.durable).toBe(true);
    expect(after.state.messages).toHaveLength(1);
    expect(after.state.messages[0]).toMatchObject({ id: failed.id, sendState: 'local_saved', clientId: 'c1' });
    expect(repo(storage, work).getSnapshot().state.messages.map((m) => m.body)).toEqual(['my message']);
  });

  it('retries once after trimming when the first write hits quota, then succeeds', () => {
    const { state } = oversizedState();
    const storage = memoryStorage();
    const original = storage.setItem;
    let calls = 0;
    storage.setItem = (key: string, value: string) => {
      calls += 1;
      if (calls === 1) { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error; }
      original(key, value);
    };
    const result = saveMessagingState(storage, state);
    expect(calls).toBe(2);
    expect(result.ok).toBe(true);
    const first = boundForPersistence(state);
    expect(result.ok && result.removed).toBeGreaterThan(first.removed);
  });

  it('reports storage_unavailable without retrying and never throws', () => {
    const storage = memoryStorage();
    storage.behaviour.failWrites = 'unavailable';
    const h = harness();
    channel(h);
    expect(saveMessagingState(storage, h.state)).toMatchObject({ ok: false, reason: 'storage_unavailable' });
  });
});

describe('messaging persistence: draft actor and unsaved cap', () => {
  it('rejects a draft write composed by an actor who is no longer the local self', () => {
    const work = makeWork();
    const repository = repo(memoryStorage(), work);
    const created = repository.dispatch({ type: 'createChannel', name: 'd', visibility: 'private', members: [human(B)] });
    const id = created.ok ? created.value.conversationId as string : '';
    const first = repository.getSnapshot().state.selfPersonId as string;
    const other = first === A ? B : A;
    expect(repository.dispatch({ type: 'setDraft', conversationId: id, body: 'mine', actorPersonId: first }).ok).toBe(true);
    expect(repository.dispatch({ type: 'setSelf', personId: other }).ok).toBe(true);
    const stale = repository.dispatch({ type: 'setDraft', conversationId: id, body: 'stale', actorPersonId: first });
    expect(stale.ok).toBe(false);
    expect(repository.getSnapshot().state.drafts.some((d) => d.actorPersonId === other)).toBe(false);
    expect(repository.getSnapshot().state.drafts.find((d) => d.actorPersonId === first)?.body).toBe('mine');
  });

  it('caps retained unsaved messages while storage keeps failing and recovers after retry', () => {
    const storage = memoryStorage();
    const repository = repo(storage);
    const created = repository.dispatch({ type: 'createChannel', name: 'cap', visibility: 'private', members: [human(B)] });
    const id = created.ok ? created.value.conversationId as string : '';
    storage.behaviour.failWrites = 'unavailable';
    for (let i = 0; i < MAX_UNSAVED_MESSAGES; i += 1) expect(repository.dispatch({ type: 'sendMessage', conversationId: id, clientId: `c${i}`, body: `m${i}` }).ok).toBe(true);
    const blocked = repository.dispatch({ type: 'sendMessage', conversationId: id, clientId: 'over', body: 'one more' });
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.error.code).toBe('limit');
    for (let i = 0; i < 20; i += 1) repository.dispatch({ type: 'sendMessage', conversationId: id, clientId: `x${i}`, body: 'x' });
    const failed = repository.getSnapshot().state.messages.filter((m) => m.sendState === 'failed');
    expect(failed).toHaveLength(MAX_UNSAVED_MESSAGES);
    storage.behaviour.failWrites = undefined;
    const retried = repository.dispatch({ type: 'retryMessage', messageId: failed[0].id });
    expect(retried.ok).toBe(true);
    expect(repository.dispatch({ type: 'sendMessage', conversationId: id, clientId: 'after', body: 'ok' }).ok).toBe(true);
  });
});
