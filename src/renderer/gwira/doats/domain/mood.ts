import type { DoatMood, DoatOperationalFacts } from './types.js';

/** Maps verified operational facts to presentation only; it does not infer emotion. */
export function deriveDoatMood(facts: DoatOperationalFacts): DoatMood {
  if (!facts.providerAvailable) return 'dimmed';
  if (facts.paused) return 'resting';
  if (facts.failed || facts.blocked) return 'concerned';
  if (facts.activeRun || facts.activeTask) return 'focused';
  if (facts.pendingApproval) return 'alert';
  if (facts.completed) return 'bright';
  return 'calm';
}

export function doatMoodLabel(mood: DoatMood): string {
  return {
    calm: 'Idle', focused: 'Working', alert: 'Waiting for approval', concerned: 'Blocked or failed',
    bright: 'Completed', resting: 'Paused', dimmed: 'Provider unavailable'
  }[mood];
}
