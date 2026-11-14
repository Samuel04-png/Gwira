import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CodexExitEvent, SessionMessage } from '../src/shared/types.js';
import { currentGeneration, requestConversationStop, thinkingFrame, thinkingPhrases } from '../src/renderer/conversationModel.js';
import { MockConversationQueue } from '../src/renderer/conversationQueueMock.js';

afterEach(() => vi.useRealTimers());
describe('conversation generation status', () => {
  it('uses initial thinking, slow nonrepeating decoration, then a factual wait label', () => {
    expect(thinkingFrame(3999).primary).toBe('Thinking…');
    expect(thinkingPhrases).toHaveLength(24);
    const frames = Array.from({ length: 24 }, (_, index) => thinkingFrame(4000 + index * 3600));
    expect(new Set(frames.map((frame) => frame.index)).size).toBe(24);
    expect(thinkingFrame(11999).decorative).toBeUndefined();
    expect(thinkingFrame(12000).primary).toBe('Waiting for response…');
    expect(thinkingFrame(12000).decorative).toBeTruthy();
    expect(thinkingFrame(60000, true)).toEqual({ primary: 'Thinking…', index: -1 });
  });
  it('recognizes the current turn instead of an earlier response', () => {
    const message = (role: SessionMessage['role'], text: string, id: string): SessionMessage => ({ id, role, text, createdAt: '2026-10-28T00:00:00Z' });
    const history = [message('user', 'First', '1'), message('codex', 'Answer', '2'), message('user', 'Next', '3')];
    expect(currentGeneration(history).hasResponse).toBe(false);
    expect(currentGeneration([...history, message('system', 'Ran command', '4')]).hasResponse).toBe(false);
    expect(currentGeneration([...history, message('codex', 'A', '5')]).hasResponse).toBe(true);
  });
});
describe('acknowledged cancellation', () => {
  function api() {
    const listeners = new Set<(event: CodexExitEvent) => void>();
    return { listeners, onExit: (listener: (event: CodexExitEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); }, stopSession: vi.fn(async () => {}), emit: (event: CodexExitEvent) => listeners.forEach((listener) => listener(event)) };
  }
  it('does not claim a stop from the request alone or another conversation exit', async () => {
    vi.useFakeTimers(); const bridge = api(); let acknowledged = false;
    const pending = requestConversationStop(bridge, 'a').then(() => { acknowledged = true; });
    await Promise.resolve(); bridge.emit({ sessionId: 'b', status: 'idle' }); await Promise.resolve();
    expect(acknowledged).toBe(false); bridge.emit({ sessionId: 'a', status: 'idle' }); await pending;
    expect(acknowledged).toBe(true); expect(bridge.listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans up on cancellation failure and timeout without starting another run', async () => {
    vi.useFakeTimers(); const bridge = api(); bridge.stopSession.mockRejectedValueOnce(new Error('offline'));
    await expect(requestConversationStop(bridge, 'a')).rejects.toThrow('draft is saved'); expect(bridge.listeners.size).toBe(0);
    const pending = requestConversationStop(bridge, 'a', 100); const assertion = expect(pending).rejects.toThrow('not confirmed'); await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(bridge.listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
});
describe('explicit development queue adapter', () => {
  const entry = (id: string, conversationId = 'a') => ({ id, workspaceId: 'w', conversationId, submittedAt: '2026-10-28T00:00:00Z', text: id, status: 'pending' as const });
  it('rejects use outside development', () => { expect(() => new MockConversationQueue(false)).toThrow('only in development'); });
  it('isolates scope, rejects duplicate ids and claims one item at a time in FIFO order', () => {
    const queue = new MockConversationQueue(true); queue.enqueue(entry('1')); queue.enqueue(entry('1')); queue.enqueue(entry('other', 'b')); queue.enqueue(entry('2'));
    expect(queue.snapshot()).toHaveLength(3); expect(queue.claim('other-workspace', 'a')).toBeUndefined();
    expect(queue.claim('w', 'a')?.id).toBe('1'); expect(queue.claim('w', 'a')).toBeUndefined(); queue.complete('1');
    expect(queue.claim('w', 'a')?.id).toBe('2'); expect(queue.claim('w', 'b')?.id).toBe('other');
    queue.enqueue(entry('1')); expect(queue.snapshot()).toHaveLength(3);
  });
  it('allows editing, removing and reordering only pending work in the same scope', () => {
    const queue = new MockConversationQueue(true); queue.enqueue(entry('1')); queue.enqueue(entry('other', 'b')); queue.enqueue(entry('2'));
    queue.edit('2', 'Edited'); queue.moveEarlier('2'); expect(queue.claim('w', 'a')?.text).toBe('Edited');
    queue.remove('2'); queue.edit('2', 'Cannot alter execution'); expect(queue.snapshot().find((item) => item.id === '2')?.text).toBe('Edited');
    queue.remove('1'); expect(queue.snapshot().some((item) => item.id === '1')).toBe(false);
  });
});
