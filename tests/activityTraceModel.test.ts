import { describe, expect, it } from 'vitest';
import type { SessionMessage } from '../src/shared/types.js';
import { buildTraceEntries, errorLabel, formatTraceDuration, groupTraceSteps, parseTraceSteps } from '../src/renderer/activityTraceModel.js';

const message = (text: string, id = 'system', role: SessionMessage['role'] = 'system', minute = 1): SessionMessage => ({ id, text, role, createdAt: new Date(Date.parse('2026-10-24T14:00:00Z') + minute * 60_000).toISOString() });
const call = (command: string) => `Ran /bin/zsh -lc "${command}"\nOutput\nWall time: 0.2 seconds\nProcess exited with code 0\nOutput:\nOK\n`;
const error = (second: string) => `Error\n2026-10-24T14:03:${second}.000Z ERROR codex_core::models_manager: /workspace/codex/src/models.rs:218: Could not refresh the model list: request timed out\n`;

describe('activity trace presentation model', () => {
  it('collapses 28 mixed calls into one group with type counts in encounter order', () => {
    const raw = [call('sed -n 1,10p file.ts'), call('rg something src'), call('npm test'), 'Applied patch\n*** Begin Patch\n*** End Patch\n'];
    const steps = parseTraceSteps([message(Array.from({ length: 28 }, (_, index) => raw[index % 4]).join(''))]);
    const groups = groupTraceSteps(steps);
    expect(steps).toHaveLength(28);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Read 7 files · Searched the code 7 times · Ran 7 commands · Applied 7 changes');
    expect(groups[0].steps.map((step) => step.raw).join('\n')).toBe(Array.from({ length: 28 }, (_, index) => raw[index % 4]).join(''));
  });

  it('attaches a separate output message without adding a tool step', () => {
    const steps = parseTraceSteps([message('Ran npm test', 'call'), message('Output\nWall time: 2.4 seconds\nExit code: 0\npassed', 'output')]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ count: 1, durationMs: 2400, status: 'done' });
    expect(steps[0].raw).toContain('passed');
  });

  it('does not count an error diagnostic following a failed command as a second call', () => {
    const steps = parseTraceSteps([message('Ran npm run build\nOutput\nExit code: 1\nError\nBuild failed: a required module could not be resolved.')]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ status: 'failed', label: 'Build failed: a required module could not be resolved.', count: 1 });
  });

  it('retains completed, failed and following steps in their recorded order', () => {
    const steps = parseTraceSteps([message(`${call('cat file.ts')}Ran npm test\nOutput\nExit code: 1\nError: Tests failed.\n${call('npm run typecheck')}`)]);
    const groups = groupTraceSteps(steps);
    expect(groups.map((group) => group.status)).toEqual(['done', 'failed', 'done']);
    expect(groups[1].label).toBe('Tests failed.');
  });

  it('folds identical consecutive errors despite different timestamps and preserves both details', () => {
    const groups = groupTraceSteps(parseTraceSteps([message(error('00') + error('05'))]));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ repeats: 2, background: true, label: 'Could not refresh the model list: request timed out' });
    expect(groups[0].steps).toHaveLength(2);
    expect(groups[0].steps[1].raw).toContain('14:03:05');
  });

  it('folds raw stderr lines as well as explicitly prefixed Error records', () => {
    const groups = groupTraceSteps(parseTraceSteps([message((error('00') + error('05')).replaceAll('Error\n', ''))]));
    expect(groups).toHaveLength(1);
    expect(groups[0].repeats).toBe(2);
  });

  it('keeps different or interrupted errors separate', () => {
    const groups = groupTraceSteps(parseTraceSteps([message(error('00') + call('npm test') + error('05') + 'Error\nPermission denied.')]));
    expect(groups.map((group) => group.status)).toEqual(['failed', 'done', 'failed', 'failed']);
    expect(groups.every((group) => group.repeats === 1)).toBe(true);
  });

  it('only marks the current incomplete call running', () => {
    const steps = parseTraceSteps([message(call('cat file.ts') + 'Ran npm run build\n')], true);
    expect(steps.map((step) => step.status)).toEqual(['done', 'running']);
    expect(groupTraceSteps(steps).map((group) => group.label)).toEqual(['Read 1 file', 'Running a command']);
  });

  it('retains explicit waiting and queued states without running them', () => {
    const steps = parseTraceSteps([message('Waiting for a person\nQueued command\n')], true);
    expect(steps.map((step) => step.status)).toEqual(['waiting', 'queued']);
  });

  it('does not split logged command prefixes inside a fenced block or patch', () => {
    const raw = 'Applied patch\n```diff\nRan this is patch content\nError\n```\n*** Begin Patch\nRan also patch content\n*** End Patch\n';
    expect(parseTraceSteps([message(raw)])).toHaveLength(1);
    expect(parseTraceSteps([message(raw)])[0].raw).toBe(raw);
  });

  it('preserves carriage returns and complete long output for copying', () => {
    const raw = `Ran npm test\r\nOutput\r\n${Array.from({ length: 600 }, (_, index) => `line ${index}`).join('\r\n')}`;
    expect(parseTraceSteps([message(raw)])[0].raw).toBe(raw);
  });

  it('never exposes commands, paths or timestamps in intent labels', () => {
    const group = groupTraceSteps(parseTraceSteps([message(call('sed -n 1,100p /Users/person/private/file.ts'))]))[0];
    expect(group.label).toBe('Read 1 file');
  });

  it('cleans error labels while retaining the error sentence', () => {
    expect(errorLabel(error('00'))).toBe('Could not refresh the model list: request timed out');
    expect(errorLabel('Error\n/Users/person/app/src/worker.ts:12:9: Request failed: connection closed.')).toBe('Request failed: connection closed.');
  });

  it('preserves assistant text and separates groups across commentary', () => {
    const messages = [message('Please inspect', 'user', 'user', 0), message(call('cat file.ts'), 'one'), message('I found the renderer.', 'commentary', 'codex', 3), message(call('npm test'), 'two'), message('Finished.', 'final', 'codex', 35)];
    const entries = buildTraceEntries(messages, false);
    expect(entries.filter((entry) => entry.kind === 'message').map((entry) => entry.message.text)).toEqual(['Please inspect', 'I found the renderer.', 'Finished.']);
    const trace = entries.find((entry) => entry.kind === 'trace');
    expect(trace?.run).toMatchObject({ stepCount: 2, durationMs: 35 * 60_000, live: false });
    expect(trace?.run.groups).toHaveLength(2);
  });

  it('creates separate summaries for user turns and marks only the last turn live', () => {
    const entries = buildTraceEntries([message('One', 'u1', 'user', 0), message(call('npm test'), 's1'), message('Done', 'a1', 'codex', 2), message('Two', 'u2', 'user', 3), message('Ran npm run build', 's2', 'system', 4)], true);
    expect(entries.filter((entry) => entry.kind === 'trace').map((entry) => entry.run.live)).toEqual([false, true]);
  });

  it('does not manufacture elapsed time for missing or invalid timestamps', () => {
    const entries = buildTraceEntries([{ ...message('One', 'u1', 'user'), createdAt: new Date(0).toISOString() }, message(call('npm test'), 's1')], false);
    expect(entries.find((entry) => entry.kind === 'trace')?.run.durationMs).toBeUndefined();
  });

  it('leaves source messages untouched and renders empty/no-system turns normally', () => {
    const messages = [message('Hello', 'u', 'user'), message('Ready', 'a', 'codex')];
    const snapshot = structuredClone(messages);
    expect(buildTraceEntries(messages, false).map((entry) => entry.kind)).toEqual(['message', 'message']);
    expect(buildTraceEntries([], false)).toEqual([]);
    expect(messages).toEqual(snapshot);
  });

  it('formats only recorded elapsed time at readable precision', () => {
    expect([0, 2400, 35 * 60_000, 65 * 60_000].map(formatTraceDuration)).toEqual(['<1s', '2s', '35m', '1h 5m']);
  });
});
