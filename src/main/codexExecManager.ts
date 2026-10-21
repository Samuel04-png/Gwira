import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { buildCodexExecSpawnOptions } from './codexCommand.js';
import { extractCodexErrorText, extractCodexEventText, extractCodexProcessText, extractConversationId, parseJsonLine } from './codexEvents.js';
import { loadCodexHistoryMessages } from './codexHistory.js';
import { resolveCodexCommand } from './codexLocator.js';
import { SessionStore } from './sessionStore.js';
import type { CodexExitEvent, CodexOutputEvent, CodexSession, ResumeSessionRequest, SendInputRequest, StartSessionRequest, StopSessionRequest } from '../shared/types.js';

interface ExecManagerEvents {
  output: [CodexOutputEvent];
  exit: [CodexExitEvent];
}

type TypedEventEmitter = EventEmitter & {
  on<K extends keyof ExecManagerEvents>(eventName: K, listener: (...args: ExecManagerEvents[K]) => void): TypedEventEmitter;
  off<K extends keyof ExecManagerEvents>(eventName: K, listener: (...args: ExecManagerEvents[K]) => void): TypedEventEmitter;
  emit<K extends keyof ExecManagerEvents>(eventName: K, ...args: ExecManagerEvents[K]): boolean;
};

export const MAX_LIVE_OUTPUT_CHARS = 4 * 1024 * 1024;
const MAX_OUTPUT_CHUNK_CHARS = 64 * 1024;
export const MAX_STDERR_CHARS = 64 * 1024;

export interface CodexExecManagerOptions {
  spawnProcess?: typeof spawn;
  resolveCommand?: typeof resolveCodexCommand;
  stopTimeoutMs?: number;
}

export class CodexExecManager {
  private readonly processes = new Map<string, ChildProcess>();
  private readonly emitter = new EventEmitter() as TypedEventEmitter;
  private readonly stoppingSessions = new Set<string>();
  private readonly terminalSessions = new Set<string>();
  private readonly outputCharsBySession = new Map<string, number>();
  private readonly truncatedOutputSessions = new Set<string>();
  private readonly stopTimers = new Map<string, NodeJS.Timeout>();
  private readonly spawnProcess: typeof spawn;
  private readonly resolveCommand: typeof resolveCodexCommand;
  private readonly stopTimeoutMs: number;

  constructor(private readonly sessions: SessionStore, options: CodexExecManagerOptions = {}) {
    this.spawnProcess = options.spawnProcess || spawn;
    this.resolveCommand = options.resolveCommand || resolveCodexCommand;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
  }

  on<K extends keyof ExecManagerEvents>(eventName: K, listener: (...args: ExecManagerEvents[K]) => void): () => void {
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  start(request: StartSessionRequest): CodexSession {
    this.assertProjectDirectory(request.cwd);
    return this.sessions.create(request.cwd, request.model, request.reasoningEffort, request.permissionMode, request.webSearch, request.context);
  }

  async resume(request: ResumeSessionRequest): Promise<CodexSession> {
    this.assertProjectDirectory(request.cwd);
    const historyMessages = request.filePath ? await loadCodexHistoryMessages(request.filePath).catch(() => []) : [];
    if (historyMessages.length > 0) {
      return this.sessions.createFromHistoryMessages(request.cwd, request.codexConversationId, historyMessages, request.model, request.reasoningEffort, request.permissionMode);
    }
    return this.sessions.createFromHistory(request.cwd, request.codexConversationId, request.title, request.model, request.reasoningEffort, request.permissionMode);
  }

  async sendInput(request: SendInputRequest): Promise<void> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${request.sessionId}`);
    }
    if (session.status === 'running') {
      throw new Error('Codex is already running for this session');
    }

    const prompt = request.input.trim();
    if (!prompt) {
      throw new Error('Prompt cannot be empty');
    }

    if (!request.skipUserAppend) {
      this.sessions.appendMessage(session.id, 'user', prompt);
    }
    this.sessions.updateStatus(session.id, 'running');

    try {
      const spawnOptions = buildCodexExecSpawnOptions({
      cwd: session.cwd,
      prompt,
      command: await this.resolveCommand() || 'codex',
      model: request.model || session.model,
      reasoningEffort: request.reasoningEffort || session.reasoningEffort,
      permissionMode: request.permissionMode || session.permissionMode,
      webSearch: request.webSearch ?? session.webSearch,
      codexConversationId: session.codexConversationId,
      context: session.context
      });

      this.terminalSessions.delete(session.id);
      this.stoppingSessions.delete(session.id);
      this.outputCharsBySession.set(session.id, 0);
      this.truncatedOutputSessions.delete(session.id);
      const child = this.spawnProcess(spawnOptions.file, spawnOptions.args, {
      cwd: spawnOptions.cwd,
      env: spawnOptions.env,
      stdio: ['ignore', 'pipe', 'pipe']
      });
      this.processes.set(session.id, child);

      let stdoutBuffer = '';
      let stderrBuffer = '';

      child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer = this.consumeStdout(session.id, stdoutBuffer + chunk.toString('utf8'));
      });

      child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderrBuffer = appendBoundedText(stderrBuffer, text, MAX_STDERR_CHARS);
      if (!isIgnorableStderr(text)) {
        this.emitOutput(session.id, text, true);
      }
      });

      child.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.finish(session.id, { status: 'error', error: message, systemMessage: `Codex failed to start: ${message}` });
      });

      child.on('close', (exitCode, signal) => {
      stdoutBuffer = this.consumeStdout(session.id, `${stdoutBuffer}\n`);
      if (this.stoppingSessions.has(session.id)) {
        this.finish(session.id, { status: 'idle', exitCode: exitCode ?? undefined, signal: signal ?? undefined });
        return;
      }
      if (exitCode === 0) {
        this.finish(session.id, { status: 'idle', exitCode: exitCode ?? undefined, signal: signal ?? undefined });
      } else {
        const error = stderrBuffer.trim() || `Codex exited with code ${exitCode ?? 'unknown'}`;
        this.finish(session.id, { status: 'error', exitCode: exitCode ?? undefined, signal: signal ?? undefined, error, systemMessage: error });
      }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finish(session.id, { status: 'error', error: message, systemMessage: `Codex failed to start: ${message}` });
      throw error;
    }
  }

  stop(request: StopSessionRequest): void {
    const child = this.processes.get(request.sessionId);
    if (!child) {
      return;
    }

    if (this.stoppingSessions.has(request.sessionId)) return;
    this.stoppingSessions.add(request.sessionId);
    child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (!this.processes.has(request.sessionId)) return;
      child.kill('SIGKILL');
    }, this.stopTimeoutMs);
    this.stopTimers.set(request.sessionId, timer);
  }

  private consumeStdout(sessionId: string, buffer: string): string {
    const lines = buffer.split(/\r?\n/);
    const remainder = lines.pop() ?? '';

    for (const line of lines) {
      const event = parseJsonLine(line);
      if (!event) {
        if (line.trim()) {
          this.emitOutput(sessionId, `${line}\n`);
        }
        continue;
      }

      const codexConversationId = extractConversationId(event);
      if (codexConversationId) {
        this.sessions.setCodexConversationId(sessionId, codexConversationId);
      }

      const errorText = extractCodexErrorText(event);
      if (errorText) {
        this.emitOutput(sessionId, errorText, true);
        continue;
      }

      const processText = extractCodexProcessText(event);
      if (processText) {
        this.emitOutput(sessionId, processText, true);
      }

      const text = extractCodexEventText(event);
      if (text) {
        this.emitOutput(sessionId, text);
      }
    }

    return remainder;
  }

  private emitOutput(sessionId: string, chunk: string, system = false): void {
    if (!chunk) {
      return;
    }

    const used = this.outputCharsBySession.get(sessionId) || 0;
    const remaining = MAX_LIVE_OUTPUT_CHARS - used;
    if (remaining <= 0) {
      this.emitTruncationNotice(sessionId);
      return;
    }
    const boundedChunk = chunk.slice(0, Math.min(remaining, MAX_OUTPUT_CHUNK_CHARS));
    this.outputCharsBySession.set(sessionId, used + boundedChunk.length);

    if (system) {
      this.sessions.appendMessage(sessionId, 'system', boundedChunk);
    } else {
      this.sessions.appendToLastCodexMessage(sessionId, boundedChunk);
    }
    this.emitter.emit('output', { sessionId, chunk: boundedChunk, role: system ? 'system' : 'codex' });
    if (boundedChunk.length < chunk.length) this.emitTruncationNotice(sessionId);
  }

  private emitTruncationNotice(sessionId: string): void {
    if (this.truncatedOutputSessions.has(sessionId)) return;
    this.truncatedOutputSessions.add(sessionId);
    const notice = 'Live Codex output was truncated after 4 MiB to keep the application responsive. The full CLI session history remains on disk.\n';
    this.sessions.appendMessage(sessionId, 'system', notice);
    this.emitter.emit('output', { sessionId, chunk: notice, role: 'system' });
  }

  private finish(sessionId: string, result: { status: 'idle' | 'error'; exitCode?: number; signal?: NodeJS.Signals; error?: string; systemMessage?: string }): void {
    if (this.terminalSessions.has(sessionId)) return;
    this.terminalSessions.add(sessionId);
    this.processes.delete(sessionId);
    this.stoppingSessions.delete(sessionId);
    const timer = this.stopTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.stopTimers.delete(sessionId);

    if (result.status === 'idle') {
      const session = this.sessions.markTurnComplete(sessionId, result.exitCode);
      this.emitter.emit('exit', { sessionId, exitCode: result.exitCode, signal: result.signal, status: 'idle', session });
      return;
    }

    this.sessions.updateStatus(sessionId, 'error', result.error);
    if (result.systemMessage) this.sessions.appendMessage(sessionId, 'system', result.systemMessage);
    this.emitter.emit('exit', { sessionId, exitCode: result.exitCode, signal: result.signal, status: 'error', error: result.error, session: this.sessions.get(sessionId) });
  }

  private assertProjectDirectory(cwd: string): void {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`Project directory does not exist: ${cwd}`);
    }
  }
}

function isIgnorableStderr(text: string): boolean {
  return text.trim() === 'Reading additional input from stdin...';
}

function appendBoundedText(current: string, next: string, limit: number): string {
  if (current.length >= limit) return current;
  return `${current}${next}`.slice(0, limit);
}
