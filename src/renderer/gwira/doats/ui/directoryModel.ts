import type { DoatOperationalStatus, DoatUiRecord } from './types.js';

export function filterDoats(doats: readonly DoatUiRecord[], query: string, status: DoatOperationalStatus | 'all'): DoatUiRecord[] {
  const normalized = query.trim().toLocaleLowerCase();
  return doats.filter((doat) => (status === 'all' || doat.status === status)
    && (!normalized || [doat.name, doat.role, doat.department ?? ''].some((value) => value.toLocaleLowerCase().includes(normalized))));
}
