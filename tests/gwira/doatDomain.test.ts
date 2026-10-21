import { describe, expect, it } from 'vitest';
import { acceptAppearanceCandidate, rejectAppearanceCandidate, withAppearanceCandidate } from '../../src/renderer/gwira/doats/domain/appearance.js';
import { deriveDoatMood, doatMoodLabel } from '../../src/renderer/gwira/doats/domain/mood.js';
import { createProceduralVisualRevision, generateProceduralVisualSpec, renderDoatAvatarSvg } from '../../src/renderer/gwira/doats/visual/avatar.js';

const input = {
  doatId: 'doat-1', name: 'Nia', role: 'Software development', capabilityIds: ['coding'], personality: 'careful', generationKey: 'initial'
};
const now = '2026-10-14T10:00:00.000Z';

describe('Doat local domain and procedural visual system', () => {
  it('generates a stable local visual specification without a provider call', () => {
    expect(generateProceduralVisualSpec(input)).toEqual(generateProceduralVisualSpec(input));
    expect(generateProceduralVisualSpec({ ...input, generationKey: 'candidate-2' })).not.toEqual(generateProceduralVisualSpec(input));
  });

  it('keeps a candidate separate until explicit acceptance and bounds history', () => {
    const active = createProceduralVisualRevision(input, 1, now);
    const candidate = createProceduralVisualRevision({ ...input, generationKey: 'candidate-2' }, 2, now);
    const appearance = withAppearanceCandidate({ active, history: [] }, candidate);
    expect(rejectAppearanceCandidate(appearance)).toEqual({ active, history: [] });
    expect(acceptAppearanceCandidate(appearance)).toEqual({ active: candidate, history: [active] });
  });

  it('derives mood only from supplied operational facts with safe precedence', () => {
    expect(deriveDoatMood({ providerAvailable: true, activeRun: true })).toBe('focused');
    expect(deriveDoatMood({ providerAvailable: true, activeRun: true, failed: true })).toBe('concerned');
    expect(deriveDoatMood({ providerAvailable: false, completed: true })).toBe('dimmed');
    expect(doatMoodLabel('alert')).toBe('Waiting for approval');
  });

  it('renders a deterministic accessible SVG and escapes the status label', () => {
    const spec = generateProceduralVisualSpec(input);
    const first = renderDoatAvatarSvg(spec, 'calm', 'Idle <verified>');
    expect(first).toBe(renderDoatAvatarSvg(spec, 'calm', 'Idle <verified>'));
    expect(first).toContain('role="img"');
    expect(first).toContain('Idle &lt;verified&gt;');
    expect(first).not.toContain('<verified>');
  });
});
