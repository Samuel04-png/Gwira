export type LayoutPosition = { x: number; y: number };
export type LayoutOverrides = Record<string, Record<string, LayoutPosition>>;

export const layoutOverridesStorageKey = 'gwira.workflow-layout-overrides.v1';
export const GRID_SIZE = 8;

export function layoutScopeKey(objectiveId: string, parentStepId?: string): string {
  return parentStepId ? `${objectiveId}/${parentStepId}` : objectiveId;
}

export function readLayoutOverrides(storage: Storage = localStorage): LayoutOverrides {
  try {
    const value: unknown = JSON.parse(storage.getItem(layoutOverridesStorageKey) ?? '{}');
    return value && typeof value === 'object' ? value as LayoutOverrides : {};
  } catch { return {}; }
}

export function writeLayoutOverrides(overrides: LayoutOverrides, storage: Storage = localStorage): void {
  storage.setItem(layoutOverridesStorageKey, JSON.stringify(overrides));
}

export function snapPosition(position: LayoutPosition): LayoutPosition {
  return { x: Math.round(position.x / GRID_SIZE) * GRID_SIZE, y: Math.round(position.y / GRID_SIZE) * GRID_SIZE };
}

export function isEditedLayout(overrides: LayoutOverrides, scope: string): boolean {
  return Object.keys(overrides[scope] ?? {}).length > 0;
}

/** Places a newly added Step beside its upstream Step, then finds a free row. */
export function placeNewEditedStep(upstream: LayoutPosition | undefined, occupied: readonly LayoutPosition[], width: number, ranksep: number): LayoutPosition {
  const base = upstream ? { x: upstream.x + width + ranksep, y: upstream.y } : { x: 0, y: 0 };
  const overlaps = (candidate: LayoutPosition) => occupied.some((position) => Math.abs(position.x - candidate.x) < width && Math.abs(position.y - candidate.y) < GRID_SIZE);
  let candidate = snapPosition(base);
  while (overlaps(candidate)) candidate = { ...candidate, y: candidate.y + GRID_SIZE * 10 };
  return candidate;
}
