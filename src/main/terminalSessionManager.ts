import os from 'node:os';
import path from 'node:path';
import type { IPty, IPtyForkOptions } from 'node-pty';
import type { TerminalDataEvent, TerminalExitEvent, TerminalSessionSnapshot } from '../shared/terminal.js';

const MAX_SESSIONS_PER_WINDOW = 8;
const MAX_OUTPUT_CHARS = 1_000_000;
const MAX_INPUT_CHARS = 64 * 1024;
const MIN_DIMENSION = 2;
const MAX_DIMENSION = 500;

type SpawnPty = (file: string, args: string[], options: IPtyForkOptions) => IPty;
type LoadPty = () => Promise<SpawnPty>;
type SessionStatus = 'running' | 'exited';

interface TerminalSession {
  sessionId: string;
  ownerId: number;
  shell: string;
  cwd: string;
  pty?: IPty;
  status: SessionStatus;
  exitCode?: number;
  output: string;
  sequence: number;
  outputTruncated: boolean;
  notice?: string;
  generation: number;
  listeners: Array<{ dispose(): void }>;
}

type ManagerListener<T> = (event: T & { ownerId: number }) => void;

export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly dataListeners = new Set<ManagerListener<TerminalDataEvent>>();
  private readonly exitListeners = new Set<ManagerListener<TerminalExitEvent>>();
  private readonly spawnPty?: SpawnPty;
  private readonly loadPty: LoadPty;
  private readonly acquireProcessLease?: () => () => void;

  constructor(options: { spawnPty?: SpawnPty; loadPty?: LoadPty; acquireProcessLease?: () => () => void } = {}) {
    this.spawnPty = options.spawnPty;
    this.loadPty = options.loadPty ?? (async () => (await import('node-pty')).spawn);
    this.acquireProcessLease = options.acquireProcessLease;
  }

  onData(listener: ManagerListener<TerminalDataEvent>): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onExit(listener: ManagerListener<TerminalExitEvent>): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  async start(ownerId: number, sessionId: string, cols: number, rows: number, cwd = os.homedir(), notice?: string): Promise<TerminalSessionSnapshot> {
    this.validateSessionId(sessionId);
    this.validateDimensions(cols, rows);
    if (!path.isAbsolute(cwd)) throw new Error('Terminal working directory must be an absolute path.');
    if (this.sessions.has(sessionId)) throw new Error('This terminal session already exists.');
    const activeCount = [...this.sessions.values()].filter(session => session.ownerId === ownerId && session.status === 'running').length;
    if (activeCount >= MAX_SESSIONS_PER_WINDOW) throw new Error(`Gwira supports up to ${MAX_SESSIONS_PER_WINDOW} active terminal sessions at a time.`);

    const { shell, args } = shellInvocation();
    const session: TerminalSession = {
      sessionId, ownerId, shell, cwd, status: 'running', notice,
      output: '', sequence: 0, outputTruncated: false, generation: 0, listeners: []
    };
    this.sessions.set(sessionId, session);
    try {
      await this.spawn(session, args, cols, rows);
      return this.snapshot(session);
    } catch (error) {
      if (this.sessions.get(sessionId) === session) this.sessions.delete(sessionId);
      throw error;
    }
  }

  get(ownerId: number, sessionId: string): TerminalSessionSnapshot | undefined {
    this.validateSessionId(sessionId);
    const session = this.sessions.get(sessionId);
    if (session && session.ownerId !== ownerId) throw new Error('Terminal session is not available in this window.');
    return session ? this.snapshot(session) : undefined;
  }

  write(ownerId: number, sessionId: string, data: string): void {
    const session = this.getOwned(ownerId, sessionId);
    if (typeof data !== 'string' || data.length === 0 || data.length > MAX_INPUT_CHARS) throw new Error('Terminal input is invalid or too large.');
    if (!session.pty) throw new Error('The terminal process is not available.');
    session.pty.write(data);
  }

  resize(ownerId: number, sessionId: string, cols: number, rows: number): void {
    const session = this.getOwned(ownerId, sessionId);
    this.validateDimensions(cols, rows);
    if (session.status === 'running') session.pty?.resize(cols, rows);
  }

  clear(ownerId: number, sessionId: string): void {
    const session = this.getOwned(ownerId, sessionId, false);
    if (!session) return;
    session.output = '';
    session.outputTruncated = false;
    session.pty?.clear();
  }

  async restart(ownerId: number, sessionId: string, cols: number, rows: number): Promise<TerminalSessionSnapshot> {
    const session = this.getOwned(ownerId, sessionId, false);
    if (!session) throw new Error('This terminal session is no longer available. Start a new terminal.');
    this.validateDimensions(cols, rows);
    this.detach(session);
    if (session.status === 'running') session.pty?.kill();
    session.pty = undefined;
    session.exitCode = undefined;
    session.output = '';
    session.outputTruncated = false;
    session.sequence += 1;
    session.status = 'exited';
    await this.spawn(session, shellInvocation().args, cols, rows);
    return this.snapshot(session);
  }

  close(ownerId: number, sessionId: string): boolean {
    this.validateSessionId(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session) return true;
    if (session.ownerId !== ownerId) throw new Error('Terminal session is not available in this window.');
    this.detach(session);
    if (session.status === 'running') session.pty?.kill();
    this.sessions.delete(sessionId);
    return true;
  }

  disposeOwner(ownerId: number): void {
    for (const session of this.sessions.values()) {
      if (session.ownerId !== ownerId) continue;
      this.detach(session);
      if (session.status === 'running') session.pty?.kill();
      this.sessions.delete(session.sessionId);
    }
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) {
      this.detach(session);
      if (session.status === 'running') session.pty?.kill();
    }
    this.sessions.clear();
  }

  private async spawn(session: TerminalSession, args: string[], cols: number, rows: number): Promise<void> {
    const pendingGeneration = session.generation;
    const file = session.shell;
    const options: IPtyForkOptions = {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: session.cwd,
      env: terminalEnvironment()
    };
    const spawnPty = this.spawnPty ?? await this.loadPty();
    if (this.sessions.get(session.sessionId) !== session || session.generation !== pendingGeneration) {
      throw new Error('Terminal access was revoked before the process started.');
    }
    const release = this.acquireProcessLease?.();
    let pty: IPty;
    try { pty = spawnPty(file, args, options); }
    catch (error) { release?.(); throw error; }
    if (release) {
      try { pty.onExit(release); }
      catch (error) { pty.kill(); release(); throw error; }
    }
    session.pty = pty;
    session.status = 'running';
    const generation = ++session.generation;
    session.listeners = [
      pty.onData(data => {
        if (session.generation !== generation || session.status !== 'running') return;
        session.sequence += 1;
        session.output += data;
        if (session.output.length > MAX_OUTPUT_CHARS) {
          session.output = session.output.slice(-MAX_OUTPUT_CHARS);
          session.outputTruncated = true;
        }
        for (const listener of this.dataListeners) listener({ ownerId: session.ownerId, sessionId: session.sessionId, sequence: session.sequence, data });
      }),
      pty.onExit(({ exitCode, signal }) => {
        if (session.generation !== generation || session.status !== 'running') return;
        session.status = 'exited';
        session.exitCode = exitCode;
        for (const listener of this.exitListeners) listener({ ownerId: session.ownerId, sessionId: session.sessionId, exitCode, signal });
      })
    ];
  }

  private detach(session: TerminalSession): void {
    for (const listener of session.listeners) listener.dispose();
    session.listeners = [];
    session.generation += 1;
  }

  private getOwned(ownerId: number, sessionId: string, requireRunning = true): TerminalSession {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('Terminal session ID is invalid.');
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) throw new Error('Terminal session is not available in this window.');
    if (requireRunning && session.status !== 'running') throw new Error('This terminal has exited. Restart it to run commands.');
    if (requireRunning && !session.pty) throw new Error('The terminal process is not available.');
    return session;
  }

  private validateSessionId(sessionId: string): void {
    if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new Error('Terminal session ID is invalid.');
    }
  }

  private validateDimensions(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < MIN_DIMENSION || rows < MIN_DIMENSION || cols > MAX_DIMENSION || rows > MAX_DIMENSION) {
      throw new Error('Terminal dimensions are invalid.');
    }
  }

  private snapshot(session: TerminalSession): TerminalSessionSnapshot {
    return {
      sessionId: session.sessionId,
      shell: path.basename(session.shell),
      cwd: session.cwd,
      status: session.status,
      exitCode: session.exitCode,
      output: session.output,
      sequence: session.sequence,
      outputTruncated: session.outputTruncated,
      notice: session.notice
    };
  }
}

function shellInvocation(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    const shell = process.env.COMSPEC || 'cmd.exe';
    return { shell, args: [] };
  }
  const shell = process.env.SHELL && path.isAbsolute(process.env.SHELL) ? process.env.SHELL : '/bin/zsh';
  return { shell, args: ['-l'] };
}

function terminalEnvironment(): Record<string, string> {
  const inherited = process.env;
  const allowed = process.platform === 'win32'
    ? /^(PATH|COMSPEC|SYSTEMROOT|WINDIR|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TEMP|TMP|PATHEXT|LANG|LC_[A-Z0-9_]+)$/i
    : /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|LANG|LC_[A-Z0-9_]+)$/;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (value !== undefined && allowed.test(key)) env[key] = value;
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'Gwira';
  if (!env.HOME) env.HOME = os.homedir();
  return env;
}
