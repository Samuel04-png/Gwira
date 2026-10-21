import { homedir } from 'node:os';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { readdir, realpath, rm, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { extractCodexErrorText, extractCodexProcessText } from './codexEvents.js';
import type { CodexProjectCandidate, SessionMessage } from '../shared/types.js';

interface JsonObject { [key: string]: unknown }

export interface CodexThreadHistory {
  id: string;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  filePath: string;
  model?: string;
}

const DEFAULT_MAX_HISTORY_FILES = 1_000;
const DEFAULT_METADATA_BYTES = 512 * 1024;
const DEFAULT_METADATA_CONCURRENCY = 8;

export interface CodexHistoryIndexOptions {
  sessionsRoot?: string;
  maxFiles?: number;
  readMetadata?: (filePath: string, updatedAt: string) => Promise<CodexThreadHistory | undefined>;
}

interface CachedHistory {
  mtimeMs: number;
  size: number;
  history?: CodexThreadHistory;
}

/**
 * A bounded, incremental metadata index for Codex session files.
 *
 * The Codex CLI stores sessions in date-named directories.  We visit the
 * newest entries first, inspect at most `maxFiles` files, and cache parsed
 * metadata by mtime and size.  Message bodies are deliberately not loaded
 * here; they are read only when a user opens one thread.
 */
export class CodexHistoryIndex {
  private readonly sessionsRoot: string;
  private readonly maxFiles: number;
  private readonly readMetadata: (filePath: string, updatedAt: string) => Promise<CodexThreadHistory | undefined>;
  private readonly cache = new Map<string, CachedHistory>();
  private listInFlight: Promise<CodexThreadHistory[]> | undefined;

  constructor(options: CodexHistoryIndexOptions = {}) {
    this.sessionsRoot = options.sessionsRoot || path.join(homedir(), '.codex', 'sessions');
    this.maxFiles = options.maxFiles || DEFAULT_MAX_HISTORY_FILES;
    this.readMetadata = options.readMetadata || readSessionMetadata;
  }

  async list(): Promise<CodexThreadHistory[]> {
    if (this.listInFlight) return this.listInFlight;
    const list = this.listUncached();
    this.listInFlight = list;
    try {
      return await list;
    } finally {
      if (this.listInFlight === list) this.listInFlight = undefined;
    }
  }

  private async listUncached(): Promise<CodexThreadHistory[]> {
    const files = await findRecentJsonlFiles(this.sessionsRoot, this.maxFiles).catch(() => []);
    const knownFiles = new Set(files);
    for (const filePath of this.cache.keys()) {
      if (!knownFiles.has(filePath)) this.cache.delete(filePath);
    }

    const histories = await mapWithConcurrency(files, DEFAULT_METADATA_CONCURRENCY, async (filePath) => {
      const info = await stat(filePath).catch(() => undefined);
      if (!info?.isFile()) return undefined;
      const cached = this.cache.get(filePath);
      if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.history;

      const history = await this.readMetadata(filePath, info.mtime.toISOString()).catch(() => undefined);
      this.cache.set(filePath, { mtimeMs: info.mtimeMs, size: info.size, history });
      return history;
    });

    return histories
      .filter((history): history is CodexThreadHistory => Boolean(history))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
}

const historyIndex = new CodexHistoryIndex({ sessionsRoot: process.env.CODEX_DESKTOP_SESSIONS_ROOT });

export async function listCodexHistories(): Promise<CodexThreadHistory[]> {
  return historyIndex.list();
}

export async function listCodexProjectCandidates(): Promise<CodexProjectCandidate[]> {
  const histories = await listCodexHistories();
  const candidates = projectCandidatesFromHistories(histories);
  const existing = await Promise.all(candidates.map(async (candidate) => {
    const info = await stat(candidate.path).catch(() => undefined);
    return info?.isDirectory() ? candidate : undefined;
  }));
  return existing.filter((candidate): candidate is CodexProjectCandidate => Boolean(candidate));
}

export function projectCandidatesFromHistories(histories: CodexThreadHistory[]): CodexProjectCandidate[] {
  const byPath = new Map<string, CodexProjectCandidate>();
  for (const history of histories) {
    const resolvedPath = normalizePath(history.cwd);
    const current = byPath.get(resolvedPath);
    if (!current) {
      byPath.set(resolvedPath, {
        id: resolvedPath,
        name: titleForProjectPath(resolvedPath),
        path: resolvedPath,
        lastUsedAt: history.updatedAt,
        threadCount: 1
      });
      continue;
    }
    current.threadCount += 1;
    if (Date.parse(history.updatedAt) > Date.parse(current.lastUsedAt)) {
      current.lastUsedAt = history.updatedAt;
    }
  }
  return [...byPath.values()].sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
}

export async function listCodexHistoriesByCwd(cwd: string): Promise<CodexThreadHistory[]> {
  const histories = await listCodexHistories();
  const matching = await Promise.all(histories.map(async (history) => ({ history, matches: await pathsReferToSameDirectory(history.cwd, cwd) })));
  return matching.filter((item) => item.matches).map((item) => item.history);
}

export async function pathsReferToSameDirectory(left: string, right: string): Promise<boolean> {
  const [resolvedLeft, resolvedRight] = await Promise.all([canonicalPath(left), canonicalPath(right)]);
  return resolvedLeft === resolvedRight;
}

export async function deleteCodexHistoryFile(filePath: string, codexHome = path.join(homedir(), '.codex')): Promise<void> {
  const sessionsRoot = path.resolve(codexHome, 'sessions');
  const targetPath = path.resolve(filePath);
  const relativeTarget = path.relative(sessionsRoot, targetPath);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error('Cannot delete history outside Codex sessions');
  }
  if (path.extname(targetPath) !== '.jsonl') {
    throw new Error('Can only delete Codex jsonl history files');
  }
  await rm(targetPath, { force: true });
}

export async function loadCodexHistoryMessages(filePath: string): Promise<SessionMessage[]> {
  const messages: SessionMessage[] = [];
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    for (const message of parseSessionMessagesLines([line])) {
      appendHistoryMessage(messages, message.role, message.text, message.createdAt);
    }
  }
  return messages;
}

export function parseSessionHistoryLines(filePath: string, lines: string[]): CodexThreadHistory | undefined {
  let id: string | undefined;
  let cwd: string | undefined;
  let createdAt: string | undefined;
  let model: string | undefined;
  let updatedAt: string | undefined;
  let title: string | undefined;

  for (const line of lines) {
    const event = parseJson(line);
    if (!event) continue;
    const timestamp = stringValue(event.timestamp);
    if (timestamp) updatedAt = timestamp;
    const payload = objectValue(event.payload);

    if (event.type === 'session_meta') {
      id = stringValue(payload?.id) || id;
      cwd = stringValue(payload?.cwd) || cwd;
      createdAt = stringValue(payload?.timestamp) || timestamp || createdAt;
      model = stringValue(payload?.model) || model;
    }

    if (event.type === 'turn_context') model = stringValue(payload?.model) || model;

    if (!title && payload?.type === 'user_message') {
      title = cleanTitle(stringValue(payload.message));
    }

    if (!title && event.type === 'response_item') {
      const payloadType = stringValue(payload?.type);
      const role = stringValue(payload?.role);
      if (payloadType === 'message' && role === 'user') {
        title = cleanTitle(extractContentText(payload?.content));
      }
    }
  }

  if (!id || !cwd) return undefined;
  return {
    id,
    cwd,
    title: title || 'New thread',
    createdAt: createdAt || updatedAt || new Date(0).toISOString(),
    updatedAt: updatedAt || createdAt || new Date(0).toISOString(),
    filePath,
    ...(model ? { model } : {})
  };
}

export function parseSessionMessagesLines(lines: string[]): SessionMessage[] {
  const messages: SessionMessage[] = [];

  for (const line of lines) {
    const event = parseJson(line);
    if (!event) continue;
    const createdAt = stringValue(event.timestamp) || new Date(0).toISOString();
    const payload = objectValue(event.payload);
    if (!payload) continue;

    if (event.type === 'event_msg') {
      const payloadType = stringValue(payload.type);
      if (payloadType === 'user_message') {
        appendHistoryMessage(messages, 'user', stringValue(payload.message), createdAt);
      } else if (payloadType === 'agent_message') {
        appendHistoryMessage(messages, 'codex', stringValue(payload.message), createdAt);
      }
      continue;
    }

    if (event.type !== 'response_item') continue;

    const errorText = extractCodexErrorText(payload);
    if (errorText) {
      appendHistoryMessage(messages, 'system', errorText, createdAt);
      continue;
    }

    const processText = extractCodexProcessText(payload);
    if (processText) appendHistoryMessage(messages, 'system', processText, createdAt);

    const payloadType = stringValue(payload.type);
    const role = stringValue(payload.role);
    if (payloadType !== 'message') continue;

    const text = extractContentText(payload.content);
    if (role === 'user') {
      appendHistoryMessage(messages, 'user', text, createdAt);
    } else if (role === 'assistant') {
      appendHistoryMessage(messages, 'codex', text, createdAt);
    }
  }

  return messages;
}

export function relativeTimeLabel(iso: string, now = new Date()): string {
  const deltaMs = Math.max(0, now.getTime() - Date.parse(iso));
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function appendHistoryMessage(messages: SessionMessage[], role: SessionMessage['role'], text: string | undefined, createdAt: string): void {
  const cleaned = role === 'system' ? text?.trim() : cleanMessageText(text);
  if (!cleaned) return;
  const last = messages.at(-1);
  if (last?.role === role) {
    if (isDuplicateAdjacentText(last.text, cleaned)) return;
    last.text = joinMessageText(last.text, cleaned);
    return;
  }
  messages.push({
    id: `history-${messages.length + 1}`,
    role,
    text: cleaned,
    createdAt
  });
}

function cleanMessageText(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw || isContextNoise(raw)) return undefined;
  return raw;
}

function joinMessageText(current: string, next: string): string {
  if (current.endsWith('\n') || next.startsWith('\n')) return `${current}${next}`;
  return `${current}\n\n${next}`;
}

function isDuplicateAdjacentText(current: string, next: string): boolean {
  if (current.trim() === next.trim()) return true;
  if (current.includes('<image ') && normalizeDuplicateText(current).endsWith(normalizeDuplicateText(next))) return true;
  const currentParts = current.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return currentParts.at(-1) === next.trim();
}

function normalizeDuplicateText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function readSessionMetadata(filePath: string, fileUpdatedAt: string): Promise<CodexThreadHistory | undefined> {
  const lines: string[] = [];
  const input = createReadStream(filePath, { encoding: 'utf8', end: DEFAULT_METADATA_BYTES - 1 });
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    lines.push(line);
    const parsed = parseSessionHistoryLines(filePath, lines);
    if (parsed?.id && parsed.cwd && parsed.title !== 'New thread') {
      return { ...parsed, updatedAt: fileUpdatedAt };
    }
  }
  const parsed = parseSessionHistoryLines(filePath, lines);
  return parsed ? { ...parsed, updatedAt: fileUpdatedAt } : undefined;
}

async function findRecentJsonlFiles(root: string, limit: number): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    if (files.length >= limit) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (files.length >= limit) return;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
    }
  }
  await visit(root);
  return files;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await map(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function normalizePath(value: string): string {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return path.win32.normalize(value);
  }
  return path.resolve(value);
}

async function canonicalPath(value: string): Promise<string> {
  const normalized = normalizePath(value);
  return realpath(normalized).catch(() => normalized);
}

function cleanTitle(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw || isContextNoise(raw)) return undefined;
  const title = raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!title || isContextNoise(title)) return undefined;
  return title.slice(0, 42);
}

function isContextNoise(value: string): boolean {
  return (
    value.includes('<environment_context>') ||
    value.startsWith('# AGENTS.md instructions') ||
    value.startsWith('<permissions instructions>') ||
    value.startsWith('<collaboration_mode>') ||
    value.startsWith('<skills_instructions>')
  );
}

function parseJson(line: string): JsonObject | undefined {
  if (!line.trim()) return undefined;
  try {
    const parsed = JSON.parse(line) as unknown;
    return objectValue(parsed);
  } catch {
    return undefined;
  }
}

function objectValue(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function extractContentText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  return content.map((item) => stringValue(objectValue(item)?.text)).filter(Boolean).join('\n') || undefined;
}

function titleForProjectPath(value: string): string {
  return value.split(/[\\/]+/).filter(Boolean).at(-1) || value;
}
