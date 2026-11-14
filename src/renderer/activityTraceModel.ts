import type { SessionMessage } from '../shared/types.js';
import { normalizeTerminalText } from './activitySegments.js';

export type TraceStatus = 'running' | 'done' | 'failed' | 'waiting' | 'queued';
type Intent = 'read' | 'search' | 'command' | 'edit' | 'web' | 'tool' | 'output' | 'error' | 'waiting' | 'queued';
export interface TraceStep {
  id: string;
  raw: string;
  intent: Intent;
  status: TraceStatus;
  label: string;
  durationMs?: number;
  count: number;
  background: boolean;
}
export interface TraceGroup {
  id: string;
  steps: TraceStep[];
  label: string;
  status: TraceStatus;
  durationMs?: number;
  background: boolean;
  repeats: number;
}
export interface TraceRun {
  id: string;
  groups: TraceGroup[];
  stepCount: number;
  durationMs?: number;
  live: boolean;
}
export type TraceEntry = { kind: 'message'; message: SessionMessage } | { kind: 'trace'; run: TraceRun };

const startPattern = /^(?:Ran .+|Used .+|Searched web for .+|Applied patch|Edited .+|Error|\d{4}-\d\d-\d\dT\S+\s+(?:ERROR|WARN)\b.*|Codex (?:failed to start|exited with code).*|Waiting for (?:user|a person|approval).*|Queued .+)$/;

/** The existing event contract is plain text. Parse only its recorded prefixes;
 * output stays attached to its call, and no executable or persistence data changes. */
export function parseTraceSteps(messages: readonly SessionMessage[], live = false): TraceStep[] {
  const steps: TraceStep[] = [];
  for (const message of messages) {
    const lines = message.text.split('\n');
    let cursor = 0;
    let fenced = false;
    let patch = false;
    const append = (end: number): void => {
      const raw = lines.slice(cursor, end).join('\n');
      if (!raw.trim()) return;
      const intent = classifyIntent(raw);
      const durationMatches = [...raw.matchAll(/(?:Wall time:\s*([\d.]+)\s*(?:seconds?|s)\b|"wall_time_seconds"\s*:\s*([\d.]+))/gi)];
      const durationMs = durationMatches.length ? durationMatches.reduce((sum, match) => sum + Number(match[1] ?? match[2]) * 1000, 0) : undefined;
      const exit = raw.match(/(?:Process exited with code|Exit code:)\s*(-?\d+)/i);
      const failed = intent === 'error' || (exit !== null && Number(exit[1]) !== 0);
      const status: TraceStatus = failed ? 'failed' : intent === 'waiting' ? 'waiting' : intent === 'queued' ? 'queued' : 'done';
      const background = failed && /(?:refresh|fetch|load).*model(?:s| list)|models?_?(?:manager|list|refresh)/i.test(raw);
      steps.push({ id: `${message.id}:${cursor}`, raw, intent, status, label: failed ? errorLabel(raw) : intentLabel(intent, 1), durationMs, count: intent === 'output' ? 0 : 1, background });
    };
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.startsWith('```')) fenced = !fenced;
      if (line.trimEnd() === '*** Begin Patch') patch = true;
      if (line.trimEnd() === '*** End Patch') patch = false;
      const errorDiagnostic = /^\d{4}-\d\d-\d\dT\S+\s+(?:ERROR|WARN)\b/.test(line) && lines.slice(cursor, index).join('\n').trim() === 'Error';
      if (index > cursor && !fenced && !patch && !errorDiagnostic && startPattern.test(line.trimEnd())) {
        append(index);
        cursor = index;
      }
    }
    append(lines.length);
  }
  // Output can arrive as a new system message. It is evidence for the previous
  // call rather than another step. Preserve every character in the detail.
  const attached: TraceStep[] = [];
  for (const step of steps) {
    const previous = attached.at(-1);
    if (previous && (step.intent === 'output' || (step.intent === 'error' && previous.status === 'failed' && previous.intent !== 'error'))) {
      previous.raw += `\n${step.raw}`;
      if (step.durationMs !== undefined) previous.durationMs = (previous.durationMs ?? 0) + step.durationMs;
      if (/(?:Process exited with code|Exit code:)\s*(?:-[1-9]\d*|[1-9]\d*)\b/i.test(step.raw)) { previous.status = 'failed'; previous.label = errorLabel(previous.raw); }
      if (step.intent === 'error') previous.label = errorLabel(previous.raw);
    } else attached.push({ ...step });
  }
  const last = attached.at(-1);
  if (live && last?.status === 'done' && !/(?:Process exited|Exit code:|Wall time:|^Output\b|^Edited |^Applied patch)/m.test(last.raw)) {
    last.status = 'running';
    last.label = liveLabel(last.intent);
  }
  return attached;
}

function classifyIntent(raw: string): Intent {
  const first = raw.trimStart().split('\n')[0];
  if (/^Error\b|^\d{4}-\d\d-\d\dT\S+\s+(?:ERROR|WARN)\b|^Codex (?:failed to start|exited with code)/.test(first)) return 'error';
  if (/^Waiting for /.test(first)) return 'waiting';
  if (/^Queued /.test(first)) return 'queued';
  if (/^(?:Applied patch|Edited )/.test(first)) return 'edit';
  if (/^Searched web for /.test(first)) return 'web';
  if (/^(?:Output\b|Chunk ID:|Wall time:|Exit code:|Process exited)/.test(first)) return 'output';
  if (/^(?:Ran|Used) /.test(first)) {
    if (/\b(?:apply_patch|write_file|edit_file)\b/.test(first)) return 'edit';
    if (/\b(?:rg|grep|find|search_query|web_search)\b/.test(first)) return /\b(?:search_query|web_search)\b/.test(first) ? 'web' : 'search';
    if (/\b(?:sed|cat|head|tail|read_file|view_image)\b/.test(first)) return 'read';
    return first.startsWith('Ran ') ? 'command' : 'tool';
  }
  return 'tool';
}

function intentLabel(intent: Intent, count: number): string {
  switch (intent) {
    case 'read': return `Read ${count} ${count === 1 ? 'file' : 'files'}`;
    case 'search': return count === 1 ? 'Searched the code' : `Searched the code ${count} times`;
    case 'command': return `Ran ${count} ${count === 1 ? 'command' : 'commands'}`;
    case 'edit': return count === 1 ? 'Applied changes' : `Applied ${count} changes`;
    case 'web': return count === 1 ? 'Searched the web' : `Searched the web ${count} times`;
    case 'output': return 'Recorded output';
    case 'waiting': return 'Waiting for a person';
    case 'queued': return 'Queued';
    default: return count === 1 ? 'Used a tool' : `Used ${count} tools`;
  }
}

function liveLabel(intent: Intent): string {
  return ({ read: 'Reading files', search: 'Searching the code', edit: 'Applying changes', web: 'Searching the web', command: 'Running a command', tool: 'Using a tool', output: 'Receiving output', error: 'Working', waiting: 'Waiting for a person', queued: 'Queued' })[intent];
}

/** Clean labels only. The unmodified diagnostics remain in TraceStep.raw. */
export function errorLabel(raw: string): string {
  const lines = normalizeTerminalText(raw).split('\n');
  const candidate = lines.find((line) => /(?:\bERROR\b|\bError:|\bCould not\b|\bFailed to\b|\bfailed:)/i.test(line) && line.trim() !== 'Error' && !/^(?:Ran |Used |cwd )/.test(line))
    ?? lines.find((line) => line.trim() && !/^(?:Error$|Ran |Output|cwd |Chunk ID:|Wall time:|Process exited|Exit code:)/.test(line))
    ?? 'The step could not finish.';
  const cleaned = candidate
    .replace(/^\s*(?:\[?\d{4}-\d{2}-\d{2}[T ][\d:.+-]+Z?\]?\s*)?\b(?:ERROR|WARN|Error)\b\s*:?\s*/i, '')
    .replace(/^(?:[\w-]+::)+[\w-]+\s*:\s*/, '')
    .replace(/(?:[A-Za-z]:)?\/(?:[^\s/:]+\/)*[^\s:]+(?::\d+){0,2}:?\s*/g, '')
    .replace(/\b[\w-]+(?:::[\w-]+)+(?::\d+)?\s*:?\s*/g, '')
    .replace(/\b\d{4}-\d{2}-\d{2}T\S+\s*/g, '')
    .replace(/\s+/g, ' ').trim();
  return cleaned || 'The step could not finish.';
}

export function groupTraceSteps(steps: readonly TraceStep[]): TraceGroup[] {
  const groups: TraceGroup[] = [];
  for (const step of steps) {
    const previous = groups.at(-1);
    const repeatError = step.status === 'failed' && previous?.status === 'failed' && previous.label === step.label;
    const consecutiveTools = step.status === 'done' && previous?.status === 'done';
    if (previous && (repeatError || consecutiveTools)) {
      previous.steps.push(step);
      previous.repeats += repeatError ? 1 : 0;
      if (step.durationMs !== undefined) previous.durationMs = (previous.durationMs ?? 0) + step.durationMs;
      if (consecutiveTools) previous.label = summarizeSteps(previous.steps);
    } else groups.push({ id: step.id, steps: [step], label: step.label, status: step.status, durationMs: step.durationMs, background: step.background, repeats: 1 });
  }
  return groups;
}

export function summarizeSteps(steps: readonly TraceStep[]): string {
  const counts = new Map<Intent, number>();
  for (const step of steps) counts.set(step.intent, (counts.get(step.intent) ?? 0) + (step.count || 1));
  return [...counts].map(([intent, count]) => intentLabel(intent, count)).join(' · ');
}

export function formatTraceDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** A user turn defines a run. Assistant text keeps its original ordering; only
 * system messages move into the disclosure at their first occurrence. */
export function buildTraceEntries(messages: readonly SessionMessage[], isRunning: boolean): TraceEntry[] {
  const entries: TraceEntry[] = [];
  let start = 0;
  while (start < messages.length) {
    if (messages[start].role === 'user') { entries.push({ kind: 'message', message: messages[start] }); start++; }
    let end = start;
    while (end < messages.length && messages[end].role !== 'user') end++;
    const turn = messages.slice(start, end);
    const live = isRunning && end === messages.length;
    const firstSystem = turn.findIndex((message) => message.role === 'system');
    if (firstSystem >= 0) {
      const system = turn.filter((message) => message.role === 'system');
      // Commentary is a boundary for grouping intent; don't merge across it.
      const groups: TraceGroup[] = [];
      let streak: SessionMessage[] = [];
      const flush = (): void => {
        if (!streak.length) return;
        groups.push(...groupTraceSteps(parseTraceSteps(streak, live && streak.at(-1) === turn.at(-1))));
        streak = [];
      };
      for (const message of turn) { if (message.role === 'system') streak.push(message); else flush(); }
      flush();
      const before = messages[start - 1]?.role === 'user' ? messages[start - 1] : system[0];
      const firstTime = Date.parse(before.createdAt);
      const lastTime = Date.parse(turn.at(-1)!.createdAt);
      const durationMs = Number.isFinite(firstTime) && firstTime > 0 && Number.isFinite(lastTime) && lastTime > firstTime ? lastTime - firstTime : undefined;
      const run: TraceRun = { id: system[0].id, groups, stepCount: groups.reduce((sum, group) => sum + group.steps.reduce((count, step) => count + step.count, 0), 0), durationMs, live };
      turn.forEach((message, index) => { if (index === firstSystem) entries.push({ kind: 'trace', run }); if (message.role !== 'system') entries.push({ kind: 'message', message }); });
    } else turn.forEach((message) => entries.push({ kind: 'message', message }));
    start = end;
  }
  return entries;
}
