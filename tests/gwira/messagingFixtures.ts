import { applyMessagingAction } from '../../src/renderer/gwira/messaging/domain/reducer.js';
import type { MessagingAction, MessagingContext } from '../../src/renderer/gwira/messaging/domain/reducer.js';
import { createEmptyMessagingState } from '../../src/renderer/gwira/messaging/domain/types.js';
import type { Message, MessagingScope, MessagingState, MessagingWork } from '../../src/renderer/gwira/messaging/domain/types.js';

export const scope: MessagingScope = { organizationId: '10000000-0000-4000-8000-000000000001', workspaceId: '10000000-0000-4000-8000-000000000002' };
export const otherWorkspace = '10000000-0000-4000-8000-0000000000ff';
export const A = '10000000-0000-4000-8000-00000000000a';
export const B = '10000000-0000-4000-8000-00000000000b';
export const C = '10000000-0000-4000-8000-00000000000c';
export const OUTSIDER = '10000000-0000-4000-8000-00000000000d';
export const DOAT = '10000000-0000-4000-8000-0000000000d0';
export const TASK = '10000000-0000-4000-8000-0000000000a1';
export const FOREIGN_TASK = '10000000-0000-4000-8000-0000000000a2';
export const APPROVAL = '10000000-0000-4000-8000-0000000000b1';
export const t0 = '2026-10-14T10:00:00.000Z';

export const human = (id: string) => ({ kind: 'human' as const, id });
export const doat = (id: string) => ({ kind: 'doat' as const, id });

export function makeWork(): MessagingWork {
  const person = (id: string, name: string, workspaceId = scope.workspaceId) => ({ id, workspaceId, name, role: 'Member', createdAt: t0 });
  const task = (id: string, workspaceId: string, extra = {}) => ({ id, workspaceId, title: `Task ${id.slice(-2)}`, status: 'todo' as const, priority: 'medium' as const, createdAt: t0, updatedAt: t0, ...extra });
  return {
    people: [person(A, 'Amina'), person(B, 'Bõb'), person(C, 'Chidi'), person(OUTSIDER, 'Elsewhere', otherWorkspace)],
    doats: [{ id: DOAT, workspaceId: scope.workspaceId, createdAt: t0, updatedAt: t0, identity: { name: 'Scout', role: 'Research' } }] as unknown as MessagingWork['doats'],
    projects: [],
    tasks: [task(TASK, scope.workspaceId, { assignee: { kind: 'agent', id: DOAT }, agentRun: { sessionId: 'run-1', status: 'completed', startedAt: t0 } }), task(FOREIGN_TASK, otherWorkspace)],
    approvals: [{ id: APPROVAL, taskId: TASK, resultId: 'r1', requestedBy: { kind: 'agent', id: DOAT }, status: 'pending', createdAt: t0 }],
    activity: []
  };
}

/** Deterministic harness: each call advances the injected clock by `stepMs` and rand is a counter. */
export function harness(initial?: MessagingState, work: MessagingWork = makeWork()) {
  let state = initial ?? createEmptyMessagingState(scope, A);
  let tick = 0;
  let r = 0;
  const ctx = (now?: string): MessagingContext => ({ scope, work, now: now ?? new Date(Date.parse(t0) + tick++ * 1000).toISOString(), rand: () => { r += 0.000001; return r; } });
  const run = (action: MessagingAction, now?: string) => {
    const result = applyMessagingAction(state, action, ctx(now));
    if (result.ok) state = result.state;
    return result;
  };
  const ok = (action: MessagingAction, now?: string) => {
    const result = run(action, now);
    if (!result.ok) throw new Error(`${action.type} failed: ${result.error.message}`);
    return result.value;
  };
  return { get state() { return state; }, set state(next: MessagingState) { state = next; }, work, run, ok, ctx };
}

export function send(h: ReturnType<typeof harness>, conversationId: string, body: string, clientId: string, extra: object = {}): string {
  return h.ok({ type: 'sendMessage', conversationId, clientId, body, ...extra }).messageId as string;
}

export function channel(h: ReturnType<typeof harness>, name = 'general', members: Array<{ kind: 'human' | 'doat'; id: string }> = [human(B)]): string {
  return h.ok({ type: 'createChannel', name, visibility: 'private', members }).conversationId as string;
}

export function rawMessage(state: MessagingState, conversationId: string, seq: number, body: string, createdAt: string, extra: Partial<Message> = {}): Message {
  return {
    id: `msg_raw${seq}`, clientId: `raw-${conversationId}-${seq}`, conversationId, organizationId: state.organizationId, workspaceId: state.workspaceId,
    seq, author: human(A), type: 'text', body, createdAt, mentions: [], attachments: [], refs: [], sendState: 'local_saved', ...extra
  };
}

export function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const behaviour = { failWrites: undefined as undefined | 'quota' | 'unavailable', failKey: undefined as string | undefined, failRead: false, writes: 0 };
  return {
    values, behaviour,
    getItem: (key: string) => { if (behaviour.failRead) throw new Error('storage unavailable'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => {
      if (behaviour.failWrites && (!behaviour.failKey || behaviour.failKey === key)) {
        if (behaviour.failWrites === 'quota') { const error = new Error('The quota has been exceeded.'); error.name = 'QuotaExceededError'; throw error; }
        throw new Error('storage unavailable');
      }
      behaviour.writes += 1;
      values.set(key, value);
    }
  };
}
