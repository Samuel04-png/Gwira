import type {
  DoatExpressionStyle,
  DoatMood,
  DoatShape,
  DoatVisualGenerationInput,
  DoatVisualRevision,
  DoatVisualSpec
} from '../domain/types.js';

export interface DoatPalette {
  id: string;
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
}

/** Restrained, locally-defined palette choices; no asset or network dependency. */
export const DOAT_PALETTES: readonly DoatPalette[] = [
  { id: 'cyan-slate', primary: '#65d7e7', secondary: '#244a64', accent: '#d9fbff', ink: '#102335' },
  { id: 'violet-ink', primary: '#a99af7', secondary: '#40396e', accent: '#f0edff', ink: '#211c43' },
  { id: 'jade-graphite', primary: '#74d5b2', secondary: '#26564c', accent: '#e2fff4', ink: '#11342d' },
  { id: 'amber-slate', primary: '#e8b76c', secondary: '#664b2b', accent: '#fff3d8', ink: '#352313' }
] as const;

const SHAPES: readonly DoatShape[] = ['orb', 'prism', 'capsule', 'halo', 'facet'];
const EXPRESSIONS: readonly DoatExpressionStyle[] = ['precise', 'warm', 'curious', 'composed'];
const TONES = ['calm', 'bright', 'muted'] as const;
const ACCESSORIES = ['none', 'visor', 'antenna', 'orbit', 'badge'] as const;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pick<T>(items: readonly T[], source: string): T {
  return items[hash(source) % items.length];
}

function paletteExists(id: string | undefined): id is string {
  return Boolean(id && DOAT_PALETTES.some((palette) => palette.id === id));
}

/**
 * Generation is deterministic for an input and generationKey. A caller creates
 * a new candidate by supplying a distinct key, never through render-time state.
 */
export function generateProceduralVisualSpec(input: DoatVisualGenerationInput): DoatVisualSpec {
  const seed = [input.doatId, input.name, input.role, input.personality ?? '', ...(input.capabilityIds ?? []), input.generationKey].join('|');
  return {
    seed,
    shape: input.shapePreference ?? pick(SHAPES, `${seed}:shape`),
    paletteId: paletteExists(input.paletteId) ? input.paletteId : pick(DOAT_PALETTES, `${seed}:palette`).id,
    expressionStyle: input.expressionStyle ?? pick(EXPRESSIONS, `${seed}:expression`),
    tone: input.tone ?? pick(TONES, `${seed}:tone`),
    accessory: input.accessory ?? pick(ACCESSORIES, `${seed}:accessory`)
  };
}

export function createProceduralVisualRevision(
  input: DoatVisualGenerationInput,
  revision: number,
  createdAt: string
): DoatVisualRevision {
  return {
    id: `procedural:${input.doatId}:${input.generationKey}:${revision}`,
    revision,
    createdAt,
    source: 'procedural',
    spec: generateProceduralVisualSpec(input)
  };
}

function shapeMarkup(shape: DoatShape, palette: DoatPalette): string {
  switch (shape) {
    case 'prism': return `<path d="M32 8 57 22v28L32 64 7 50V22Z" fill="${palette.primary}"/><path d="m32 8 25 14-25 14L7 22Z" fill="${palette.accent}" opacity=".85"/>`;
    case 'capsule': return `<rect x="10" y="18" width="44" height="36" rx="18" fill="${palette.primary}"/><path d="M19 21h26" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
    case 'halo': return `<circle cx="32" cy="36" r="20" fill="${palette.primary}"/><ellipse cx="32" cy="13" rx="16" ry="5" fill="none" stroke="${palette.accent}" stroke-width="3"/>`;
    case 'facet': return `<path d="M32 7 54 23 46 55H18L10 23Z" fill="${palette.primary}"/><path d="m32 7 22 16-22 12-22-12Z" fill="${palette.accent}" opacity=".8"/>`;
    default: return `<circle cx="32" cy="35" r="22" fill="${palette.primary}"/><circle cx="24" cy="25" r="7" fill="${palette.accent}" opacity=".6"/>`;
  }
}

function eyeMarkup(mood: DoatMood, style: DoatExpressionStyle, palette: DoatPalette): string {
  const eyeY = mood === 'resting' ? 35 : 32;
  const eye = mood === 'resting'
    ? `<path d="M20 ${eyeY}h7M37 ${eyeY}h7" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round"/>`
    : `<circle cx="23" cy="${eyeY}" r="3" fill="${palette.ink}"/><circle cx="41" cy="${eyeY}" r="3" fill="${palette.ink}"/>`;
  const mouth = mood === 'bright'
    ? `<path d="M24 43q8 8 16 0" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round"/>`
    : mood === 'concerned'
      ? `<path d="M25 47q7-7 14 0" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round"/>`
      : mood === 'focused' || style === 'precise'
        ? `<path d="M26 44h12" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round"/>`
        : `<path d="M27 44q5 3 10 0" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round"/>`;
  return `${eye}${mouth}`;
}

function accessoryMarkup(accessory: DoatVisualSpec['accessory'], palette: DoatPalette): string {
  switch (accessory) {
    case 'visor': return `<path d="M15 29h34" stroke="${palette.secondary}" stroke-width="6" stroke-linecap="round" opacity=".82"/>`;
    case 'antenna': return `<path d="M32 14V6" stroke="${palette.secondary}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="5" r="3" fill="${palette.accent}"/>`;
    case 'orbit': return `<ellipse cx="32" cy="36" rx="28" ry="12" fill="none" stroke="${palette.secondary}" stroke-width="2" opacity=".65"/>`;
    case 'badge': return `<rect x="42" y="42" width="11" height="11" rx="3" fill="${palette.accent}" stroke="${palette.secondary}" stroke-width="2"/>`;
    default: return '';
  }
}

/** A compact, self-contained SVG with accessible operational text in its title. */
export function renderDoatAvatarSvg(spec: DoatVisualSpec, mood: DoatMood, label: string): string {
  const palette = DOAT_PALETTES.find((candidate) => candidate.id === spec.paletteId) ?? DOAT_PALETTES[0];
  const safeLabel = label.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[character] ?? '');
  const opacity = mood === 'dimmed' ? '.48' : '1';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72" role="img" aria-labelledby="doat-avatar-title" fill="none"><title id="doat-avatar-title">${safeLabel}</title><g opacity="${opacity}">${shapeMarkup(spec.shape, palette)}${eyeMarkup(mood, spec.expressionStyle, palette)}${accessoryMarkup(spec.accessory, palette)}</g></svg>`;
}
