import { describe, expect, it } from 'vitest';
import { canConnect, type HandoffStep } from '../../src/renderer/gwira/graph/handoffEditing.js';

const source: HandoffStep = { id: 'a', title: 'Source', status: 'done', objectiveId: 'objective' };
const target: HandoffStep = { id: 'b', title: 'Target', status: 'pending', objectiveId: 'objective' };
function reason(...args: Parameters<typeof canConnect>): string { const result = canConnect(...args); if (result.ok) throw new Error('Expected rejection'); return result.reason; }
describe('canConnect', () => {
  it('allows a valid pending peer', () => expect(canConnect(source, target, [])).toEqual({ ok: true }));
  it('rejects itself', () => expect(reason(source, source, [])).toBe("A step can't wait for itself"));
  it('rejects an existing handoff in either direction', () => expect(reason(source, target, [{ source: 'b', target: 'a' }])).toBe('Already connected'));
  it('rejects loops', () => expect(reason(source, target, [{ source: 'b', target: 'c' }, { source: 'c', target: 'a' }])).toBe('That would create a loop'));
  it('rejects a started target', () => expect(reason(source, { ...target, status: 'working' }, [])).toBe('Target has already started'));
  it('rejects another objective or parent level', () => {
    expect(reason(source, { ...target, objectiveId: 'other' }, [])).toBe('Steps must be at the same level');
    expect(reason(source, { ...target, parentStepId: 'parent' }, [])).toBe('Steps must be at the same level');
  });
});
