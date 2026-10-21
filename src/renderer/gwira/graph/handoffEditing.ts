export type HandoffStep = { id: string; title: string; status: 'pending' | 'blocked' | 'paused' | 'working' | 'done'; objectiveId: string; parentStepId?: string };
export type HandoffLink = { source: string; target: string };
export type CanConnectResult = { ok: true } | { ok: false; reason: string };

function reaches(from: string, target: string, edges: readonly HandoffLink[], seen = new Set<string>()): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return edges.filter((edge) => edge.source === from).some((edge) => reaches(edge.target, target, edges, seen));
}

/** Validates a prospective handoff without mutating plan or execution data. */
export function canConnect(from: HandoffStep, to: HandoffStep, edges: readonly HandoffLink[]): CanConnectResult {
  if (from.id === to.id) return { ok: false, reason: "A step can't wait for itself" };
  if (edges.some((edge) => (edge.source === from.id && edge.target === to.id) || (edge.source === to.id && edge.target === from.id))) return { ok: false, reason: 'Already connected' };
  if (reaches(to.id, from.id, edges)) return { ok: false, reason: 'That would create a loop' };
  if (!['pending', 'blocked', 'paused'].includes(to.status)) return { ok: false, reason: `${to.title} has already started` };
  if (from.objectiveId !== to.objectiveId || from.parentStepId !== to.parentStepId) return { ok: false, reason: 'Steps must be at the same level' };
  return { ok: true };
}
