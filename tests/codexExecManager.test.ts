import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexExecManager, MAX_LIVE_OUTPUT_CHARS, MAX_STDERR_CHARS } from '../src/main/codexExecManager.js';
import { SessionStore } from '../src/main/sessionStore.js';

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly signals: string[] = [];

  kill(signal?: NodeJS.Signals): boolean {
    if (signal) this.signals.push(signal);
    return true;
  }
}

async function runningManager(): Promise<{ manager: CodexExecManager; child: FakeChild; sessionId: string }> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-exec-manager-'));
  const child = new FakeChild();
  const store = new SessionStore();
  const manager = new CodexExecManager(store, {
    spawnProcess: (() => child) as unknown as typeof import('node:child_process').spawn,
    resolveCommand: async () => 'codex',
    stopTimeoutMs: 5
  });
  const session = manager.start({ cwd });
  await manager.sendInput({ sessionId: session.id, input: 'test' });
  return { manager, child, sessionId: session.id };
}

describe('CodexExecManager stop lifecycle', () => {
  it('emits exactly one idle exit when a stopped child closes non-zero', async () => {
    const { manager, child, sessionId } = await runningManager();
    const exits: Array<{ status: string; error?: string }> = [];
    manager.on('exit', (event) => exits.push(event));

    manager.stop({ sessionId });
    expect(child.signals).toEqual(['SIGTERM']);
    expect(exits).toEqual([]);
    child.emit('close', 143, 'SIGTERM');
    child.emit('close', 143, 'SIGTERM');

    expect(exits).toHaveLength(1);
    expect(exits[0]).toMatchObject({ status: 'idle' });
  });

  it('escalates a stopped child that does not close', async () => {
    const { manager, child, sessionId } = await runningManager();
    manager.stop({ sessionId });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    child.emit('close', null, 'SIGKILL');
  });
});

describe('CodexExecManager output limits', () => {
  it('caps live output and reports truncation once', async () => {
    const { manager, child, sessionId } = await runningManager();
    const output: string[] = [];
    manager.on('output', (event) => output.push(event.chunk));
    child.stderr.emit('data', Buffer.from('x'.repeat(MAX_LIVE_OUTPUT_CHARS + 1)));

    expect(output.join('').length).toBeLessThan(MAX_LIVE_OUTPUT_CHARS + 1 + 200);
    expect(output.filter((chunk) => chunk.includes('Live Codex output was truncated'))).toHaveLength(1);
  });

  it('caps stderr retained for a non-zero exit error', async () => {
    const { manager, child, sessionId } = await runningManager();
    const exits: Array<{ error?: string }> = [];
    manager.on('exit', (event) => exits.push(event));
    child.stderr.emit('data', Buffer.from('e'.repeat(MAX_STDERR_CHARS + 100)));
    child.emit('close', 1, null);

    expect(exits[0].error?.length).toBe(MAX_STDERR_CHARS);
  });
});

describe('CodexExecManager startup failures', () => {
  it('finishes a session as error when command resolution rejects', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-exec-manager-'));
    const store = new SessionStore();
    const manager = new CodexExecManager(store, { resolveCommand: async () => { throw new Error('Codex unavailable'); } });
    const session = manager.start({ cwd });
    const exits: Array<{ status: string; error?: string }> = [];
    manager.on('exit', (event) => exits.push(event));
    await expect(manager.sendInput({ sessionId: session.id, input: 'test' })).rejects.toThrow('Codex unavailable');
    expect(store.get(session.id)).toMatchObject({ status: 'error', error: 'Codex unavailable' });
    expect(exits).toHaveLength(1);
  });

  it('finishes a session as error when spawning throws synchronously', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-exec-manager-'));
    const store = new SessionStore();
    const manager = new CodexExecManager(store, {
      resolveCommand: async () => 'codex',
      spawnProcess: (() => { throw new Error('spawn denied'); }) as unknown as typeof import('node:child_process').spawn
    });
    const session = manager.start({ cwd });
    await expect(manager.sendInput({ sessionId: session.id, input: 'test' })).rejects.toThrow('spawn denied');
    expect(store.get(session.id)).toMatchObject({ status: 'error', error: 'spawn denied' });
  });
});
