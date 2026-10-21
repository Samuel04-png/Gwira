import type { DoatAvatarSpec, DoatExpression, DoatOperationalStatus } from './types.js';

const shapes: readonly DoatAvatarSpec['shape'][] = ['orb', 'prism', 'leaf', 'satellite', 'arch'];
const accessories: readonly NonNullable<DoatAvatarSpec['accessory']>[] = ['none', 'halo', 'visor', 'antenna', 'orbit'];
const palettes = [
  ['#61c7d7', '#b0eff4'], ['#8874d7', '#d4cafc'], ['#5ea989', '#caefd5'],
  ['#cd9071', '#f5d5aa'], ['#4f91d4', '#b9dfff']
] as const;

export function hashDoatSeed(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Creates a deterministic fallback spec; it never calls an image provider. */
export function createProceduralAvatarSpec(seed: string, overrides: Partial<Omit<DoatAvatarSpec, 'seed'>> = {}): DoatAvatarSpec {
  const hash = hashDoatSeed(seed || 'gwira-doat');
  const palette = palettes[hash % palettes.length];
  return {
    seed: seed || 'gwira-doat',
    shape: shapes[Math.floor(hash / 7) % shapes.length],
    primaryColor: palette[0], secondaryColor: palette[1],
    expression: 'calm', accessory: accessories[Math.floor(hash / 31) % accessories.length], version: 1,
    ...overrides
  };
}

export function expressionForOperationalStatus(status: DoatOperationalStatus): DoatExpression {
  switch (status) {
    case 'working': return 'focused';
    case 'planning': return 'curious';
    case 'waiting_approval': return 'alert';
    case 'blocked': case 'failed': return 'concerned';
    case 'completed': return 'celebrating';
    case 'paused': return 'resting';
    case 'unavailable': return 'quiet';
    default: return 'calm';
  }
}

export function readableDoatStatus(status: DoatOperationalStatus): string {
  return status === 'waiting_approval' ? 'Waiting for approval' : status[0].toUpperCase() + status.slice(1);
}
