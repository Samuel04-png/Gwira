import type { WorkspaceView } from '../navigationState.js';
/** Filled geometry is reviewed per silhouette, never inferred from selection. */
const filledNavigation = new Set(['home','dashboard','clock','review']);
export function navigationIconWeight(name: string, selected: boolean): 'regular' | 'fill' {
  return selected && filledNavigation.has(name) ? 'fill' : 'regular';
}
/** Context chooses sidebar content; only the route chooses the selected rail item. */
export function primaryNavigationSelection(view: WorkspaceView, context: 'home' | 'business'): 'home' | 'dashboard' | 'schedule' | 'more' {
  if (view === 'schedule') return 'schedule';
  if (view === 'home' || view === 'chat' || view === 'library') return 'home';
  if (['dashboard','inbox','my-work','organization'].includes(view)) return 'dashboard';
  return 'more';
}
export type IndicatorStatus = 'idle' | 'queued' | 'pending' | 'working' | 'loading' | 'waiting' | 'paused' | 'completed' | 'failed' | 'warning' | 'cancelled' | 'offline';
export function normalizeIndicatorStatus(status: string): IndicatorStatus {
  const aliases: Record<string,IndicatorStatus> = {default:'idle',todo:'pending',in_progress:'working',running:'working',planning:'pending',waiting_approval:'waiting',awaiting_review:'waiting',blocked:'warning',error:'failed',stopped:'cancelled',unavailable:'warning',done:'completed'};
  return aliases[status] ?? (['idle','queued','pending','working','loading','waiting','paused','completed','failed','warning','cancelled','offline'].includes(status) ? status as IndicatorStatus : 'warning');
}
