import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALL, NO_FILTERS, activeFilterCount, filterValueLabel, matchesWorkFilters, ownerFilterKey, parseWorkFilters, type FilterableWork
} from '../../src/renderer/gwira/workfilters/workFilters.js';
import { NO_FILTERS as TIMELINE_NO_FILTERS, ALL as TIMELINE_ALL, matchesFilters, ownerKey } from '../../src/renderer/gwira/timeline/timelineModel.js';

const work = (patch: Partial<FilterableWork> = {}): FilterableWork => ({ status: 'working', ownerId: 'person:ada', ownerKind: 'person', ownerName: 'Ada', projectId: 'p1', ...patch });
const read = (path: string): string => readFileSync(new URL(`../../src/renderer/gwira/${path}`, import.meta.url), 'utf8');

describe('shared work filters', () => {
  it('matches everything with no filters', () => {
    expect(matchesWorkFilters(work(), NO_FILTERS)).toBe(true);
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
  });

  it('combines status, owner and project with AND', () => {
    expect(matchesWorkFilters(work(), { status: 'working', owner: 'person:ada', project: 'p1' })).toBe(true);
    expect(matchesWorkFilters(work(), { status: 'blocked', owner: 'person:ada', project: 'p1' })).toBe(false);
    expect(matchesWorkFilters(work(), { status: ALL, owner: 'person:bob', project: ALL })).toBe(false);
    expect(matchesWorkFilters(work(), { status: ALL, owner: ALL, project: 'p2' })).toBe(false);
  });

  it('excludes work without a project when a project filter is active and never invents one', () => {
    expect(matchesWorkFilters(work({ projectId: undefined }), { ...NO_FILTERS, project: 'p1' })).toBe(false);
    expect(matchesWorkFilters(work({ projectId: undefined }), NO_FILTERS)).toBe(true);
  });

  it('falls back to kind and name when there is no owner id, and keeps humans and Doats distinct', () => {
    expect(ownerFilterKey(work({ ownerId: undefined, ownerKind: 'doat', ownerName: 'Scout' }))).toBe('doat:Scout');
    expect(ownerFilterKey(work({ ownerId: undefined, ownerKind: 'person', ownerName: 'Scout' }))).toBe('person:Scout');
  });

  it('counts only active filters', () => {
    expect(activeFilterCount({ status: 'done', owner: ALL, project: 'p1' })).toBe(2);
  });

  it('repairs untrusted persisted filters', () => {
    expect(parseWorkFilters(undefined)).toEqual(NO_FILTERS);
    expect(parseWorkFilters(null)).toEqual(NO_FILTERS);
    expect(parseWorkFilters('garbage')).toEqual(NO_FILTERS);
    expect(parseWorkFilters({ status: 3, owner: { a: 1 }, project: 'p1' })).toEqual({ status: ALL, owner: ALL, project: 'p1' });
  });

  it('reports a stale filter value as unavailable instead of echoing it', () => {
    const options = { statuses: [{ id: 'working', label: 'Working' }], owners: [], projects: [] };
    expect(filterValueLabel('status', 'working', options)).toBe('Working');
    expect(filterValueLabel('owner', 'person:deleted', options)).toBeUndefined();
  });
});

describe('Timeline uses the shared model without behaviour change', () => {
  it('re-exports the same constants', () => {
    expect(TIMELINE_NO_FILTERS).toBe(NO_FILTERS);
    expect(TIMELINE_ALL).toBe(ALL);
  });

  it('agrees with the shared matcher and owner key', () => {
    const task = { ...work(), id: 't' } as never;
    expect(ownerKey(task)).toBe(ownerFilterKey(work()));
    for (const filters of [NO_FILTERS, { ...NO_FILTERS, status: 'blocked' }, { ...NO_FILTERS, owner: 'person:ada' }, { ...NO_FILTERS, project: 'p9' }]) {
      expect(matchesFilters(task, filters)).toBe(matchesWorkFilters(work(), filters));
    }
  });

  it('renders the shared strip and no longer carries its own copy', () => {
    const view = read('timeline/TimelineView.tsx');
    expect(view).toContain('<WorkFilterStrip');
    expect(view).not.toContain('gwira-timeline__filters');
    expect(view).not.toContain('gwira-timeline__chip');
    expect(read('timeline/timeline.css')).not.toContain('.gwira-timeline__chip');
  });

  it('keeps the strip view-agnostic and scoped', () => {
    const strip = read('workfilters/WorkFilterStrip.tsx');
    const css = read('workfilters/workFilters.css');
    expect(strip).not.toMatch(/timeline/i);
    expect(css).not.toMatch(/timeline/i);
    expect(css.match(/^\.[\w-]+/gm)?.every((selector) => selector.startsWith('.gwira-work-filters'))).toBe(true);
  });

  it('enables the implemented Dashboard List, Calendar, and Board tabs', () => {
    expect(read('dashboard/dashboardModel.ts')).toMatch(/id: 'list'[^}]*available: true/);
    expect(read('dashboard/dashboardModel.ts')).toMatch(/id: 'calendar'[^}]*available: true/);
    expect(read('dashboard/dashboardModel.ts')).toMatch(/id: 'board'[^}]*available: true/);
  });
});
