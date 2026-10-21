import { describe, expect, it } from 'vitest';
import { createProceduralAvatarSpec, expressionForOperationalStatus, hashDoatSeed } from '../src/renderer/gwira/doats/ui/avatarModel.js';
import { filterDoats } from '../src/renderer/gwira/doats/ui/directoryModel.js';
import type { DoatUiRecord } from '../src/renderer/gwira/doats/ui/types.js';

const sample: DoatUiRecord = { id: 'd1', name: 'Ada', role: 'Software engineer', department: 'Engineering', status: 'idle', avatar: createProceduralAvatarSpec('d1'), providerAvailable: false };

describe('Doat UI deterministic presentation helpers', () => {
  it('keeps a procedural avatar stable for a saved seed', () => {
    expect(hashDoatSeed('ada')).toBe(hashDoatSeed('ada'));
    expect(createProceduralAvatarSpec('ada')).toEqual(createProceduralAvatarSpec('ada'));
  });

  it('maps only operational state to expressions', () => {
    expect(expressionForOperationalStatus('working')).toBe('focused');
    expect(expressionForOperationalStatus('waiting_approval')).toBe('alert');
    expect(expressionForOperationalStatus('failed')).toBe('concerned');
  });

  it('filters supplied records without manufacturing results', () => {
    expect(filterDoats([sample], 'engineer', 'all')).toEqual([sample]);
    expect(filterDoats([sample], 'no match', 'all')).toEqual([]);
    expect(filterDoats([sample], '', 'working')).toEqual([]);
  });
});
