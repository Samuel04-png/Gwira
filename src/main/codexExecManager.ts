import { listCodexModels } from './codexModels.js';
import { AUTO_MODEL, MODEL_FAILURE_MESSAGE, classifyRoutingFailure, compatibleFallback, type RoutingPolicy, type RoutingDiagnostic } from './modelRouting.js';
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
  settled: [string];
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
  /** Host-owned, verified policy. Omit when capability/cost/approval metadata is unavailable. */
  listModels?: typeof listCodexModels;
  routingPolicy?: (session: CodexSession, prompt: string) => RoutingPolicy | undefined;
  diagnostic?: (event: RoutingDiagnostic) => void;
}

export class CodexExecManager {
  private readonly activeTurns = new Map<string, symbol>();
  private readonly processes = new Map<string, ChildProcess>();
  private readonly emitter = new EventEmitter() as TypedEventEmitter;
  private readonly stoppingSessions = new Set<string>();
  private readonly revokedSessions = new Set<string>();
  private readonly terminalSessions = new Set<string>();
  private readonly outputCharsBySession = new Map<string, number>();
  private readonly truncatedOutputSessions = new Set<string>();
  private readonly stopTimers = new Map<string, NodeJS.Timeout>();
  private readonly routingOptions: CodexExecManagerOptions;
  private readonly spawnProcess: typeof spawn;
  private readonly resolveCommand: typeof resolveCodexCommand;
  private readonly stopTimeoutMs: number;

  constructor(private readonly sessions: SessionStore, options: CodexExecManagerOptions = {}) {
    this.routingOptions = options;
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

  async resume(request: ResumeSessionRequest, assertCurrent: () => void = () => {}): Promise<CodexSession> {
    this.assertProjectDirectory(request.cwd);
    const historyMessages = request.filePath ? await loadCodexHistoryMessages(request.filePath).catch(() => []) : [];
    assertCurrent();
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
      throw new Error('Gwira is already running for this session');
    }

    const prompt = request.input.trim();
    if (!prompt) {
      throw new Error('Prompt cannot be empty');
    }

    if (!request.skipUserAppend) {
      this.sessions.appendMessage(session.id, 'user', prompt);
    }
    this.sessions.updateStatus(session.id, 'running');

    const turn = Symbol('turn');
    this.activeTurns.set(session.id, turn);
    let routedReasoningEffort = request.reasoningEffort || session.reasoningEffort;
    const requestedModel = request.model || session.model;
    const policy = requestedModel === AUTO_MODEL ? this.routingOptions.routingPolicy?.(session, prompt) : undefined;
    const attempted = new Set<string>();
    this.terminalSessions.delete(session.id);
    this.stoppingSessions.delete(session.id);
    this.outputCharsBySession.set(session.id, 0);
    this.truncatedOutputSessions.delete(session.id);
    const command = await this.resolveCommand().catch(error => {
      if (this.activeTurns.get(session.id) === turn) this.finish(session.id, { status: 'error', error: MODEL_FAILURE_MESSAGE, systemMessage: MODEL_FAILURE_MESSAGE });
      throw error;
    }) || 'codex';
    const attempt = (model: string, retryCount: number): void => {
      if (this.activeTurns.get(session.id) !== turn) return;
      const started = performance.now();
      attempted.add(model);
      let progressed = false, closed = false, stdoutBuffer = '', stderrBuffer = '', providerError = '';
      let usage: unknown = null;
      const diagnostic = (outcome: RoutingDiagnostic['outcome'], fallbackModel?: string): void => {
        const record: RoutingDiagnostic = { sessionId: session.id, requestedModel, attemptedProvider: policy?.preferred.provider ?? 'configured-cli',
          attemptedModel: model, fallbackModel, failureReason: providerError || stderrBuffer ? classifyRoutingFailure(providerError || stderrBuffer) : undefined,
          retryCount, latencyMs: Math.round(performance.now() - started), outcome, usage, costMicros: null };
        // Local main-process logs are developer diagnostics; prompts and raw errors are excluded.
        if (this.routingOptions.diagnostic) this.routingOptions.diagnostic(record);
        else console.info('GWIRA_MODEL_ROUTING', JSON.stringify(record));
      };
      const consume = (buffer: string): string => {
        const lines = buffer.split(/\r?\n/); const remainder = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = parseJsonLine(line);
          if (event?.type !== 'thread.started' && event?.type !== 'error') progressed = true;
          const error = event && extractCodexErrorText(event);
          if (error) { providerError = error; continue; }
          // Any turn/item/tool/unknown event may represent a completed side effect.
          // Only a thread id is safe before a rejected request. Never replay after work starts.
          if (event?.type === 'turn.completed') usage = event.usage ?? null;
          this.consumeStdout(session.id, line + '\n');
        }
        return remainder;
      };
      try {
        const spawnOptions = buildCodexExecSpawnOptions({ cwd: session.cwd, prompt, command, model,
          reasoningEffort: routedReasoningEffort,
          permissionMode: request.permissionMode || session.permissionMode,
          webSearch: request.webSearch ?? session.webSearch, codexConversationId: this.sessions.get(session.id)?.codexConversationId,
          context: session.context });
        const child = this.spawnProcess(spawnOptions.file, spawnOptions.args, { cwd: spawnOptions.cwd, env: spawnOptions.env, stdio: ['ignore', 'pipe', 'pipe'] });
        this.processes.set(session.id, child);
        child.stdout?.on('data', (chunk: Buffer) => { if (!this.revokedSessions.has(session.id)) stdoutBuffer = consume(stdoutBuffer + chunk.toString('utf8')); });
        child.stderr?.on('data', (chunk: Buffer) => {
          if (!isIgnorableStderr(chunk.toString('utf8'))) stderrBuffer = appendBoundedText(stderrBuffer, chunk.toString('utf8'), MAX_STDERR_CHARS);
        });
        child.on('error', error => {
          if (closed) return; closed = true; providerError = error.message; diagnostic('failed');
          this.finish(session.id, { status: 'error', error: MODEL_FAILURE_MESSAGE, systemMessage: MODEL_FAILURE_MESSAGE });
        });
        child.on('close', (exitCode, signal) => {
          if (closed) return; closed = true;
          if (this.revokedSessions.has(session.id)) { this.finish(session.id, { status: 'idle' }); return; }
          stdoutBuffer = consume(stdoutBuffer + '\n');
          if (this.stoppingSessions.has(session.id)) {
            diagnostic('cancelled'); this.finish(session.id, { status: 'idle', exitCode: exitCode ?? undefined, signal: signal ?? undefined }); return;
          }
          if (exitCode === 0 && !providerError) {
            diagnostic('completed'); this.finish(session.id, { status: 'idle', exitCode: 0 }); return;
          }
          const failure = classifyRoutingFailure(providerError || stderrBuffer);
          if (!progressed && retryCount < 1 && ['unavailable', 'rate-limit', 'temporary'].includes(failure) && Boolean(providerError)) {
            const fallback = policy && compatibleFallback(policy, attempted);
            // Only an explicit rejection before execution may retry. A timeout is
            // ambiguous: the upstream request might already have run. Never replay it.
            if (fallback || failure !== 'unavailable') {
              const next = fallback?.model ?? model; diagnostic('retrying', fallback?.model);
              attempt(next, retryCount + 1); return;
            }
          }
          diagnostic('failed'); this.finish(session.id, { status: 'error', exitCode: exitCode ?? undefined, error: MODEL_FAILURE_MESSAGE, systemMessage: MODEL_FAILURE_MESSAGE });
        });
      } catch (error) {
        providerError = error instanceof Error ? error.message : String(error); diagnostic('failed');
        this.finish(session.id, { status: 'error', error: MODEL_FAILURE_MESSAGE, systemMessage: MODEL_FAILURE_MESSAGE });
        if (retryCount === 0) throw error;
      }
    };
    const preferred = policy?.preferred;
    if (policy && (!preferred?.approved || !Number.isFinite(preferred.maxCostMicros) || preferred.maxCostMicros < 0
      || !Number.isFinite(policy.budgetMicros) || policy.budgetMicros < 0 || preferred.maxCostMicros > policy.budgetMicros
      || preferred.contextWindow < policy.requiredContext || !policy.requiredCapabilities.every(c => preferred.capabilities.includes(c)))) {
      this.finish(session.id, { status: 'error', error: MODEL_FAILURE_MESSAGE, systemMessage: MODEL_FAILURE_MESSAGE }); return;
    }
    // Resolve Auto from the live configured CLI catalog, including on resume,
    // where omitting -m would retain the unavailable historical model.
    const autoModel = requestedModel === AUTO_MODEL && !policy ? (await (this.routingOptions.listModels ?? listCodexModels)().catch(() => []))[0] : undefined;
    if (autoModel) routedReasoningEffort = autoModel.defaultReasoningLevel ?? autoModel.supportedReasoningLevels[0] ?? routedReasoningEffort;
    if (this.activeTurns.get(session.id) !== turn) return;
    if (requestedModel === AUTO_MODEL && !policy && !autoModel && session.codexConversationId) {
      this.finish(session.id, { status: 'error', error: MODEL_FAILURE_MESSAGE, systemMessage: MODEL_FAILURE_MESSAGE }); return;
    }
    attempt(preferred?.model ?? autoModel?.slug ?? requestedModel, 0);
  }

  stop(request: StopSessionRequest): void {
    const child = this.processes.get(request.sessionId);
    if (!child) {
      if (this.sessions.get(request.sessionId)?.status === 'running') this.finish(request.sessionId, { status: 'idle' });
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

  stopAll(): void {
    for (const sessionId of this.activeTurns.keys()) this.stop({sessionId});
  }

  revokeAll(): void {
    for (const sessionId of [...this.activeTurns.keys()]) this.revokeSession(sessionId);
    this.sessions.clear();
  }

  revokeSession(sessionId: string): void {
    if (this.activeTurns.has(sessionId)) {
      this.revokedSessions.add(sessionId);
      this.stop({sessionId});
    }
    this.sessions.remove(sessionId);
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
    const notice = 'Live Gwira output was truncated after 4 MiB to keep the application responsive. The full CLI session history remains on disk.\n';
    this.sessions.appendMessage(sessionId, 'system', notice);
    this.emitter.emit('output', { sessionId, chunk: notice, role: 'system' });
  }

  private finish(sessionId: string, result: { status: 'idle' | 'error'; exitCode?: number; signal?: NodeJS.Signals; error?: string; systemMessage?: string }): void {
    if (this.terminalSessions.has(sessionId)) return;
    this.terminalSessions.add(sessionId);
    this.processes.delete(sessionId);
    this.activeTurns.delete(sessionId);
    this.stoppingSessions.delete(sessionId);
    const timer = this.stopTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.stopTimers.delete(sessionId);
    this.emitter.emit('settled', sessionId);
    if (this.revokedSessions.delete(sessionId)) return;

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
