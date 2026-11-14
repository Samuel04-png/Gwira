import type { WorkOwnerKind } from '../graph/graphModel.js';

/** Shared status/owner/project filter model used by Dashboard work views. Pure and view-agnostic. */
export type WorkFilterKey = 'status' | 'owner' | 'project';
export interface WorkFilters { status: string; owner: string; project: string }
export const ALL = 'all';
export const NO_FILTERS: WorkFilters = { status: ALL, owner: ALL, project: ALL };
export const WORK_FILTER_KEYS: readonly WorkFilterKey[] = ['status', 'owner', 'project'];

export interface FilterableWork {
  status: string;
  ownerId?: string;
  ownerKind: WorkOwnerKind;
  ownerName: string;
  projectId?: string;
}

export interface FilterOption { id: string; label: string }
export interface FilterOptions { statuses: FilterOption[]; owners: FilterOption[]; projects: FilterOption[] }

export function ownerFilterKey(work: Pick<FilterableWork, 'ownerId' | 'ownerKind' | 'ownerName'>): string {
  return work.ownerId ?? `${work.ownerKind}:${work.ownerName}`;
}

export function matchesWorkFilters(work: FilterableWork, filters: WorkFilters): boolean {
  return (filters.status === ALL || work.status === filters.status)
    && (filters.owner === ALL || ownerFilterKey(work) === filters.owner)
    && (filters.project === ALL || work.projectId === filters.project);
}

export function activeFilterCount(filters: WorkFilters): number {
  return WORK_FILTER_KEYS.filter((key) => filters[key] !== ALL).length;
}

/** Repairs untrusted persisted filters: anything that is not a string falls back to "all". */
export function parseWorkFilters(value: unknown): WorkFilters {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<WorkFilterKey, unknown>>;
  const read = (entry: unknown): string => typeof entry === 'string' ? entry : ALL;
  return { status: read(source.status), owner: read(source.owner), project: read(source.project) };
}

/** Label for an active filter value, or undefined when the value no longer exists (stale or hidden reference). */
export function filterValueLabel(key: WorkFilterKey, value: string, options: FilterOptions): string | undefined {
  const list = key === 'status' ? options.statuses : key === 'owner' ? options.owners : options.projects;
  return list.find((entry) => entry.id === value)?.label;
}
