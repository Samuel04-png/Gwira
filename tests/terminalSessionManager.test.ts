import { describe, expect, it, vi } from 'vitest';
import type { IPty } from 'node-pty';
import { TerminalSessionManager } from '../src/main/terminalSessionManager.js';

const firstSessionId = '00000000-0000-4000-8000-000000000001';
const secondSessionId = '00000000-0000-4000-8000-000000000002';

class FakePty implements IPty {
  readonly pid = 123;
  readonly process = 'fake-shell';
  handleFlowControl = false;
  private width: number;
  private height: number;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();
  readonly writes: string[] = [];
  killed = false;

  constructor(cols: number, rows: number) {
    this.width = cols;
    this.height = rows;
  }

  get cols(): number { return this.width; }
  get rows(): number { return this.height; }

  readonly onData = (listener: (data: string) => void) => {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  };

  readonly onExit = (listener: (event: { exitCode: number; signal?: number }) => void) => {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  };

  resize(cols: number, rows: number): void {
    this.width = cols;
    this.height = rows;
  }

  clear(): void {}

  write(data: string | Buffer): void {
    this.writes.push(data.toString());
  }

  kill(): void {
    this.killed = true;
  }

  pause(): void {}
  resume(): void {}

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}

describe('TerminalSessionManager', () => {
  it('holds a process lease until a revoked terminal reports exit', async () => {
    const pty = new FakePty(80, 24), release = vi.fn();
    const manager = new TerminalSessionManager({spawnPty: () => pty, acquireProcessLease: () => release});
    await manager.start(1, firstSessionId, 80, 24, '/tmp');
    manager.disposeAll();
    expect(pty.killed).toBe(true);
    expect(release).not.toHaveBeenCalled();
    pty.emitExit(143);
    expect(release).toHaveBeenCalledOnce();
  });
  it('releases the process lease if terminal spawning fails', async () => {
    const release = vi.fn();
    const manager = new TerminalSessionManager({spawnPty: () => { throw Error('spawn failed'); }, acquireProcessLease: () => release});
    await expect(manager.start(1, firstSessionId, 80, 24, '/tmp')).rejects.toThrow('spawn failed');
    expect(release).toHaveBeenCalledOnce();
  });
  it('does not spawn a pending terminal after its owner is revoked', async () => {
    let resolveLoader!: (spawn: (_file: string, _args: string[], options: {cols?: number; rows?: number}) => IPty) => void;
    let spawned = 0;
    const manager = new TerminalSessionManager({
      loadPty: () => new Promise(resolve => { resolveLoader = resolve; })
    });
    const pending = manager.start(1, firstSessionId, 80, 24, '/tmp');
    manager.disposeAll();
    resolveLoader((_file, _args, options) => { spawned++; return new FakePty(options.cols ?? 80, options.rows ?? 24); });
    await expect(pending).rejects.toThrow('revoked');
    expect(spawned).toBe(0);
    expect(manager.get(1, firstSessionId)).toBeUndefined();
  });
  it('keeps sessions isolated to their owning window and validates input and dimensions', async () => {
    const ptys: FakePty[] = [];
    const manager = new TerminalSessionManager({
      spawnPty: (_file, _args, options) => {
        const pty = new FakePty(options.cols ?? 80, options.rows ?? 24);
        ptys.push(pty);
        return pty;
      }
    });

    await manager.start(1, firstSessionId, 80, 24, '/tmp');
    expect(() => manager.write(2, firstSessionId, 'whoami')).toThrow('not available in this window');
    expect(() => manager.write(1, firstSessionId, 'x'.repeat(65 * 1024))).toThrow('invalid or too large');
    expect(() => manager.resize(1, firstSessionId, 501, 24)).toThrow('dimensions are invalid');

    manager.write(1, firstSessionId, 'pwd');
    manager.resize(1, firstSessionId, 100, 30);
    expect(ptys[0]?.writes).toEqual(['pwd']);
    expect(ptys[0]?.cols).toBe(100);
    expect(ptys[0]?.rows).toBe(30);
    manager.disposeAll();
  });

  it('bounds buffered output and reports sequenced events', async () => {
    const ptys: FakePty[] = [];
    const manager = new TerminalSessionManager({
      spawnPty: (_file, _args, options) => {
        const pty = new FakePty(options.cols ?? 80, options.rows ?? 24);
        ptys.push(pty);
        return pty;
      }
    });
    const events: Array<{ sequence: number; data: string; ownerId: number }> = [];
    manager.onData(event => events.push(event));
    await manager.start(1, firstSessionId, 80, 24, '/tmp');

    ptys[0]!.emitData('x'.repeat(1_000_100));

    const snapshot = manager.get(1, firstSessionId);
    expect(snapshot?.output).toHaveLength(1_000_000);
    expect(snapshot?.outputTruncated).toBe(true);
    expect(snapshot?.sequence).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.ownerId).toBe(1);
    manager.disposeAll();
  });

  it('restarts in the same directory and leaves a failed restart exited', async () => {
    const ptys: FakePty[] = [];
    let spawnCount = 0;
    const manager = new TerminalSessionManager({
      spawnPty: (_file, _args, options) => {
        spawnCount += 1;
        if (spawnCount === 2) throw new Error('spawn failed');
        const pty = new FakePty(options.cols ?? 80, options.rows ?? 24);
        ptys.push(pty);
        return pty;
      }
    });

    await manager.start(1, firstSessionId, 80, 24, '/tmp');
    await expect(manager.restart(1, firstSessionId, 90, 28)).rejects.toThrow('spawn failed');
    expect(manager.get(1, firstSessionId)).toMatchObject({ status: 'exited', cwd: '/tmp' });
    expect(ptys[0]?.killed).toBe(true);
    expect(() => manager.write(1, firstSessionId, 'pwd')).toThrow('terminal has exited');
    manager.disposeAll();
  });

  it('records process exit and forwards the exit status', async () => {
    const ptys: FakePty[] = [];
    const manager = new TerminalSessionManager({
      spawnPty: (_file, _args, options) => {
        const pty = new FakePty(options.cols ?? 80, options.rows ?? 24);
        ptys.push(pty);
        return pty;
      }
    });
    const exits: Array<{ sessionId: string; exitCode: number }> = [];
    manager.onExit(event => exits.push(event));
    await manager.start(1, firstSessionId, 80, 24, '/tmp');

    ptys[0]!.emitExit(9);

    expect(manager.get(1, firstSessionId)).toMatchObject({ status: 'exited', exitCode: 9 });
    expect(exits).toEqual([{ ownerId: 1, sessionId: firstSessionId, exitCode: 9 }]);
    manager.close(1, firstSessionId);
  });

  it('cleans up sessions and stops forwarding their output', async () => {
    const ptys: FakePty[] = [];
    const manager = new TerminalSessionManager({
      spawnPty: (_file, _args, options) => {
        const pty = new FakePty(options.cols ?? 80, options.rows ?? 24);
        ptys.push(pty);
        return pty;
      }
    });
    const events: string[] = [];
    manager.onData(event => events.push(event.data));
    await manager.start(1, secondSessionId, 80, 24, '/tmp');
    ptys[0]!.emitData('before');
    expect(manager.close(1, secondSessionId)).toBe(true);
    ptys[0]!.emitData('after');

    expect(ptys[0]?.killed).toBe(true);
    expect(events).toEqual(['before']);
    expect(manager.get(1, secondSessionId)).toBeUndefined();
    expect(manager.close(1, secondSessionId)).toBe(true);
  });
});
