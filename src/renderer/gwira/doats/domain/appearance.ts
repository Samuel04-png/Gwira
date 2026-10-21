import type { DoatAppearance, DoatVisualRevision } from './types.js';

export const MAX_DOAT_VISUAL_HISTORY = 12;

/**
 * Explicit acceptance is deliberately the only operation that changes active.
 * A rejected candidate leaves the active revision and history untouched.
 */
export function acceptAppearanceCandidate(appearance: DoatAppearance): DoatAppearance {
  if (!appearance.candidate) return appearance;
  const prior = appearance.active;
  return {
    active: appearance.candidate,
    history: [prior, ...appearance.history].slice(0, MAX_DOAT_VISUAL_HISTORY)
  };
}

export function rejectAppearanceCandidate(appearance: DoatAppearance): DoatAppearance {
  if (!appearance.candidate) return appearance;
  return { ...appearance, candidate: undefined };
}

export function withAppearanceCandidate(
  appearance: DoatAppearance,
  candidate: DoatVisualRevision
): DoatAppearance {
  return { ...appearance, candidate };
}
