import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localStateToGraphRecords } from '../../src/renderer/gwira/graph/localGraphAdapter.js';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import { timelineFixture } from '../../src/renderer/gwira/graph/workflowFixtures.js';
import { ALL, NAME_WIDTH, NO_FILTERS, matchesFilters, buildLinks, buildRows, buildTimeline, centerDay, clampNameWidth, dayOfDate, linkPath, occupancy, parseDay, returnTarget, scrollForCenter, timelineRange, timelineTicks } from '../../src/renderer/gwira/timeline/timelineModel.js';

const now = new Date(2026, 9, 16, 10, 0, 0);
const today = dayOfDate(now);
const build = (groupBy: 'none' | 'objective' | 'owner' | 'project' = 'objective', filters = NO_FILTERS) => buildTimeline(timelineFixture(now), { today, groupBy, filters });
const all = () => { const model = build('none'); return [...model.groups.flatMap((group) => group.tasks), ...model.unscheduled]; };

describe('timeline dates', () => {
  it('treats date-only values as calendar days regardless of timezone', () => {
    expect(parseDay('2026-10-20')! - parseDay('2026-10-19')!).toBe(1);
    expect(parseDay('not a date')).toBeUndefined();
    expect(parseDay(undefined)).toBeUndefined();
  });
});

describe('buildTimeline', () => {
  it('classifies deadline-only, run and unscheduled work without inventing durations', () => {
    const tasks = all();
    const byId = (id: string) => tasks.find((task) => task.id === id)!;
    expect(byId('tl-review').start).toBeUndefined();
    expect(byId('tl-review').deadline).toBeDefined();
    expect(byId('tl-review').scheduled).toBe(true);
    expect(byId('tl-content').start).toBeDefined();
    expect(byId('tl-content').running).toBe(true);
    expect(byId('tl-content').end).toBe(today);
    expect(byId('tl-staffing').scheduled).toBe(false);
    expect(build().unscheduled.map((task) => task.id).sort()).toEqual(['tl-loyalty', 'tl-staffing']);
  });

  it('flags overdue work, pending approvals and dependencies from recorded data', () => {
    const tasks = all();
    expect(tasks.find((task) => task.id === 'tl-stock')!.overdue).toBe(true);
    expect(tasks.find((task) => task.id === 'tl-review')!.overdue).toBe(false);
    expect(tasks.find((task) => task.id === 'tl-approve')!.milestones.map((milestone) => milestone.kind)).toEqual(['approval-pending']);
    expect(tasks.find((task) => task.id === 'tl-publish')!.dependsOn.map((dependency) => dependency.id).sort()).toEqual(['tl-approve', 'tl-messages']);
  });

  it('fixture covers human, Doat, parallel, dependent, approval, completed, overdue and unscheduled work', () => {
    const tasks = all();
    expect(new Set(tasks.map((task) => task.ownerKind))).toContain('person');
    expect(new Set(tasks.map((task) => task.ownerKind))).toContain('doat');
    expect(tasks.filter((task) => task.running).length).toBeGreaterThanOrEqual(2);
    expect(tasks.some((task) => task.status === 'completed')).toBe(true);
  });

  it('groups by objective, owner and project and filters', () => {
    expect(build('objective').groups.length).toBeGreaterThan(1);
    expect(build('project').groups.map((group) => group.label)).toEqual(expect.arrayContaining(['Marketing', 'Operations', 'Finance']));
    expect(build('owner').groups.length).toBeGreaterThan(1);
    const doatOnly = build('none', { status: ALL, owner: build('none').owners.find((owner) => owner.label.length)!.id, project: ALL });
    expect(doatOnly.shown).toBeLessThan(doatOnly.total);
    expect(build('none', { status: 'completed', owner: ALL, project: ALL }).shown).toBeGreaterThan(0);
  });

  it('is empty for a workspace with no work and disables unavailable grouping', () => {
    const state = createEmptyLocalState({ organizationId: 'org', workspaceId: 'space' }, now.toISOString());
    const model = buildTimeline(localStateToGraphRecords(state), { today, groupBy: 'objective', filters: NO_FILTERS });
    expect(model.total).toBe(0);
    expect(model.canGroupByObjective).toBe(false);
  });
});

describe('timeline range', () => {
  it('covers today and stays within the cap', () => {
    for (const zoom of ['day', 'week', 'month'] as const) {
      const range = timelineRange(zoom, today);
      expect(range.start).toBeLessThanOrEqual(today);
      expect(range.end).toBeGreaterThanOrEqual(today);
      expect(range.days).toBeLessThanOrEqual(1500);
      const { upper, lower } = timelineTicks(range, zoom, today);
      expect(upper.length).toBeGreaterThan(0);
      expect(lower.length).toBeGreaterThan(0);
    }
  });
});

describe('timeline navigation helpers', () => {
  it('clamps the task column width', () => {
    expect(clampNameWidth(10)).toBe(NAME_WIDTH.min);
    expect(clampNameWidth(9000)).toBe(NAME_WIDTH.max);
    expect(clampNameWidth(301.4)).toBe(301);
    expect(clampNameWidth(Number.NaN)).toBe(NAME_WIDTH.initial);
  });

  it('only offers a way back when no dated work is visible', () => {
    const data = { first: 100, last: 120 };
    expect(returnTarget({ first: 50, last: 80 }, data)).toBe(100);
    expect(returnTarget({ first: 200, last: 230 }, data)).toBe(120);
    expect(returnTarget({ first: 90, last: 105 }, data)).toBeUndefined();
    expect(returnTarget({ first: 115, last: 140 }, data)).toBeUndefined();
    expect(returnTarget({ first: 0, last: 10 }, {})).toBeUndefined();
  });

  it('keeps the same centre day when zoom changes', () => {
    const visible = 600;
    const before = timelineRange('week', today, today - 30, today + 30);
    const centre = centerDay(1234, visible, before);
    for (const zoom of ['day', 'month'] as const) {
      const range = timelineRange(zoom, today, today - 30, today + 30);
      const offset = scrollForCenter(centre, visible, range);
      expect(Math.abs(centerDay(offset, visible, range) - centre)).toBeLessThan(0.01);
    }
  });
});

describe('timeline rows', () => {
  const model = () => build('objective');
  const rowKinds = (collapsed: string[]) => buildRows(model(), true, collapsed).map((row) => row.kind);

  it('lists group, task and unscheduled rows in one order', () => {
    const rows = buildRows(model(), true, []);
    expect(rows.filter((row) => row.kind === 'group')).toHaveLength(2);
    expect(rows.filter((row) => row.kind === 'task')).toHaveLength(all().length);
    expect(rows.at(-3)?.kind).toBe('unscheduled');
  });

  it('hides the tasks of collapsed groups but keeps the group row', () => {
    const first = model().groups[0];
    const rows = buildRows(model(), true, [first.id]);
    expect(rows.filter((row) => row.kind === 'task')).toHaveLength(all().length - first.tasks.length);
    expect(rows.some((row) => row.kind === 'group' && row.group.id === first.id && row.collapsed)).toBe(true);
    expect(rowKinds(['unscheduled']).filter((kind) => kind === 'task')).toHaveLength(all().length - build().unscheduled.length);
  });

  it('explains a workspace where nothing has a date instead of showing an empty grid', () => {
    const undated = { tasks: [{ id: 'u1', title: 'Undated' }] };
    const rows = buildRows(buildTimeline(undated, { today, groupBy: 'none', filters: NO_FILTERS }), false, []);
    expect(rows[0].kind).toBe('notice');
    expect(rows.filter((row) => row.kind === 'task')).toHaveLength(1);
  });
});

describe('timeline integration boundaries', () => {
  it('is a Dashboard tab, not a route, and keeps date drag disabled', () => {
    const routes = readFileSync('src/renderer/navigationTypes.ts', 'utf8');
    expect(routes.toLowerCase()).not.toContain('timeline');
    const view = readFileSync('src/renderer/gwira/timeline/TimelineView.tsx', 'utf8');
    expect(view).not.toMatch(/draggable|onDrag|onPointerMove/);
    const page = readFileSync('src/renderer/gwira/dashboard/DashboardPage.tsx', 'utf8');
    expect(page).toContain('<TimelineView');
  });

  it('adapter exposes only recorded run times', () => {
    const iso = now.toISOString();
    const state = { ...createEmptyLocalState({ organizationId: 'org', workspaceId: 'space' }, iso), tasks: [{ id: 't', workspaceId: 'space', title: 'T', status: 'todo' as const, priority: 'medium' as const, assignee: { kind: 'agent' as const, id: 'a' }, createdAt: iso, updatedAt: iso }] };
    const task = localStateToGraphRecords(state).tasks?.[0];
    expect(task).toBeDefined();
    expect(task?.startedAt).toBeUndefined();
    expect(task?.completedAt).toBeUndefined();
  });
});

describe('planned work and delivery', () => {
  const task = (id: string) => all().find((entry) => entry.id === id)!;

  it('keeps the plan separate from the due date and the recorded run', () => {
    const visuals = task('tl-visuals');
    expect(visuals.plannedStart).toBeDefined();
    expect(visuals.plannedEnd).toBeGreaterThanOrEqual(visuals.plannedStart!);
    expect(visuals.deadline).not.toBe(visuals.plannedEnd);
    expect(visuals.start).not.toBe(visuals.plannedStart! - 100);
    expect(task('tl-review').plannedStart).toBeUndefined();
  });

  it('ignores a plan that has only one end or runs backwards', () => {
    const records = { tasks: [
      { id: 'a', title: 'A', plannedStart: '2026-10-20' },
      { id: 'b', title: 'B', plannedStart: '2026-10-22', plannedEnd: '2026-10-20' }
    ] };
    const model = buildTimeline(records, { today, groupBy: 'none', filters: NO_FILTERS });
    expect(model.unscheduled.map((entry) => entry.id).sort()).toEqual(['a', 'b']);
    expect(model.unscheduled.every((entry) => entry.plannedStart === undefined)).toBe(true);
  });

  it('compares finished work with its due date and nothing else', () => {
    expect(task('tl-research').delivery).toEqual({ kind: 'late', days: 1 });
    expect(task('tl-invoices').delivery).toEqual({ kind: 'on-time', days: 0 });
    expect(task('tl-content').delivery).toBeUndefined();
    expect(task('tl-review').delivery).toBeUndefined();
  });
});

describe('owner load', () => {
  it('counts only recorded runs that overlap', () => {
    const run = (start: number, end: number) => ({ start, end }) as never;
    const result = occupancy([run(0, 3), run(2, 5), run(10, 11)]);
    expect(result.peak).toBe(2);
    expect(result.segments).toEqual([{ start: 0, end: 1, count: 1 }, { start: 2, end: 3, count: 2 }, { start: 4, end: 5, count: 1 }, { start: 10, end: 11, count: 1 }]);
  });

  it('ignores deadlines, plans and open work with no end', () => {
    expect(occupancy([{ deadline: 3 }, { plannedStart: 1, plannedEnd: 4 }, { start: 2 }] as never).peak).toBe(0);
  });

  it('is present only for owner groups and shows the Marketing Doat running in parallel', () => {
    expect(build('objective').groups.every((group) => group.occupancy === undefined)).toBe(true);
    const marketing = build('owner').groups.find((group) => group.label.startsWith('Marketing Doat'))!;
    expect(marketing.occupancy!.peak).toBeGreaterThanOrEqual(2);
  });
});

describe('dependency links', () => {
  const links = () => buildLinks(all());

  it('draws only recorded dependencies between dated tasks', () => {
    const { links: drawn, undrawn } = links();
    expect(drawn.find((link) => link.id === 'tl-research->tl-review')).toBeDefined();
    expect(drawn.every((link) => link.fromId !== link.toId)).toBe(true);
    expect(undrawn.every((entry) => entry.reason === 'hidden' || entry.reason === 'undated')).toBe(true);
  });

  it('attaches to bar edges for runs and to the day centre for date markers', () => {
    const link = links().links.find((entry) => entry.id === 'tl-research->tl-review')!;
    expect(link.from.point).toBe(false);
    expect(link.from.pos).toBe(link.from.day + 1);
    expect(link.to.point).toBe(true);
  });

  it('flags a dependent whose recorded start is before its predecessor finishes', () => {
    const records = { tasks: [
      { id: 'p', title: 'P', startedAt: '2026-10-10T09:00:00', completedAt: '2026-10-14T17:00:00', status: 'completed' as const },
      { id: 'q', title: 'Q', startedAt: '2026-10-12T09:00:00', dependsOnTaskIds: ['p'] },
      { id: 'r', title: 'R', startedAt: '2026-10-15T09:00:00', dependsOnTaskIds: ['p'] }
    ] };
    const model = buildTimeline(records, { today, groupBy: 'none', filters: NO_FILTERS });
    const result = buildLinks(model.groups.flatMap((group) => group.tasks));
    expect(result.links.find((entry) => entry.toId === 'q')?.state).toBe('conflict');
    expect(result.links.find((entry) => entry.toId === 'r')?.state).toBe('ordered');
  });

  it('does not call parallel work a conflict unless both dates are recorded or planned', () => {
    const state = (tasks: unknown[], to: string) => buildLinks(buildTimeline({ tasks } as never, { today, groupBy: 'none', filters: NO_FILTERS }).groups.flatMap((group) => group.tasks)).links.find((link) => link.toId === to)?.state;
    // Predecessor still running: its end is today only because the run is open.
    expect(state([
      { id: 'p', title: 'P', startedAt: '2026-10-10T09:00:00', status: 'working' },
      { id: 'q', title: 'Q', startedAt: '2026-10-12T09:00:00', dependsOnTaskIds: ['p'] }
    ], 'q')).toBe('ordered');
    // Dependent has only a due date, which is not a start.
    expect(state([
      { id: 'p', title: 'P', startedAt: '2026-10-10T09:00:00', completedAt: '2026-10-14T17:00:00', status: 'completed' },
      { id: 'q', title: 'Q', dueDate: '2026-10-12', dependsOnTaskIds: ['p'] }
    ], 'q')).toBe('ordered');
    // Predecessor has only a due date, so no finish is recorded.
    expect(state([
      { id: 'p', title: 'P', dueDate: '2026-10-20' },
      { id: 'q', title: 'Q', startedAt: '2026-10-12T09:00:00', dependsOnTaskIds: ['p'] }
    ], 'q')).toBe('ordered');
    // Planned windows count.
    expect(state([
      { id: 'p', title: 'P', plannedStart: '2026-10-10', plannedEnd: '2026-10-14' },
      { id: 'q', title: 'Q', plannedStart: '2026-10-12', plannedEnd: '2026-10-16', dependsOnTaskIds: ['p'] }
    ], 'q')).toBe('conflict');
  });

  it('reports links it cannot draw instead of guessing positions', () => {
    const hidden = buildTimeline(timelineFixture(now), { today, groupBy: 'none', filters: { ...NO_FILTERS, owner: 'person:Chipo Zulu' } });
    const filtered = buildLinks([...hidden.groups.flatMap((group) => group.tasks), ...hidden.unscheduled]);
    expect(filtered.links).toHaveLength(0);
    const undated = buildLinks([{ id: 'x', title: 'X', dependsOn: [{ id: 'y', title: 'Y' }], milestones: [] }, { id: 'y', title: 'Y', dependsOn: [], milestones: [] }] as never);
    expect(undated.undrawn).toEqual([{ fromId: 'y', toId: 'x', reason: 'undated' }]);
  });

  it('survives self-references and cycles without drawing a self-link', () => {
    const records = { tasks: [
      { id: 'a', title: 'A', dueDate: '2026-10-20', dependsOnTaskIds: ['a', 'b'] },
      { id: 'b', title: 'B', dueDate: '2026-10-22', dependsOnTaskIds: ['a'] }
    ] };
    const model = buildTimeline(records, { today, groupBy: 'none', filters: NO_FILTERS });
    const ids = buildLinks(model.groups.flatMap((group) => group.tasks)).links.map((link) => link.id).sort();
    expect(ids).toEqual(['a->b', 'b->a']);
  });

  it('routes forward links as a short elbow and backward links through the row gap', () => {
    expect(linkPath(10, 16, 60, 48)).toBe('M10 16H18V48H60');
    const back = linkPath(100, 16, 40, 48);
    expect(back).toContain('V32');
    expect(back.startsWith('M100 16')).toBe(true);
    expect(back.endsWith('H40')).toBe(true);
  });
});

describe('dependency wording and legend', () => {
  const view = readFileSync('src/renderer/gwira/timeline/TimelineView.tsx', 'utf8');

  it('calls an ambiguous overlap a possible scheduling overlap, never a conflict', () => {
    expect(view).toContain('Possible scheduling overlap');
    expect(view).not.toMatch(/Recorded dates overlap|schedul\w* conflict/i);
  });

  it('reports undrawn dependencies even when no link is visible', () => {
    expect(view).toMatch(/links\.length \|\| undrawnCount/);
    expect(view).toMatch(/if \(hasNotice\) return \{ links: \[\] as TimelineLink\[\], undrawnCount: all\.undrawn\.length/);
  });
});

describe('manual-testing fixes', () => {
  it('reports accurate shown and total counts under filters', () => {
    const total = build('none').total;
    const filtered = build('none', { ...NO_FILTERS, owner: 'person:Chipo Zulu' });
    expect(filtered.total).toBe(total);
    expect(filtered.shown).toBe([...filtered.groups.flatMap((group) => group.tasks), ...filtered.unscheduled].length);
    expect(filtered.shown).toBeLessThan(total);
  });

  it('flags hidden work that needs attention and nothing when unfiltered', () => {
    expect(build('none').hiddenAttention).toBe(0);
    const filtered = build('none', { ...NO_FILTERS, owner: 'person:Chipo Zulu' });
    expect(filtered.hiddenAttention).toBeGreaterThan(0);
    const hiddenIds = all().filter((task) => !matchesFilters(task, { ...NO_FILTERS, owner: 'person:Chipo Zulu' }) && (task.overdue || ['waiting', 'blocked', 'failed'].includes(task.status))).length;
    expect(filtered.hiddenAttention).toBe(hiddenIds);
  });

  it('the dated Timeline fixture covers every required state', () => {
    const tasks = all();
    const doat = tasks.filter((task) => task.ownerKind === 'doat');
    const human = tasks.filter((task) => task.ownerKind !== 'doat');
    expect(human.some((task) => task.scheduled && task.start !== undefined)).toBe(true);
    expect(doat.some((task) => task.scheduled && task.start !== undefined)).toBe(true);
    expect(tasks.some((task) => task.plannedStart !== undefined && task.plannedEnd !== undefined)).toBe(true);
    expect(tasks.some((task) => task.milestones.length > 0)).toBe(true);
    expect(tasks.some((task) => task.overdue)).toBe(true);
    expect(tasks.some((task) => !task.scheduled)).toBe(true);
    expect(timelineFixture(now).tasks!.some((task) => (task.dependsOnTaskIds ?? []).length > 0)).toBe(true);
    expect(build('owner').groups.some((group) => group.occupancy && group.occupancy.peak >= 2)).toBe(true);
  });

  it('keeps the undated demos honest and exposes fixtures only in the dev selector', () => {
    const demo = readFileSync('src/renderer/gwira/graph/freshBlendDemo.ts', 'utf8');
    expect(demo).not.toMatch(/dueDate|startedAt|completedAt/);
    const page = readFileSync('src/renderer/gwira/dashboard/DashboardPage.tsx', 'utf8');
    expect(page).toContain('data-fixture="timeline"');
    expect(page).toContain('import.meta.env.DEV ? <DemoMenu');
  });

  it('wires the existing inspector toggle, clamps the popover and recovers from unavailable models', () => {
    const view = readFileSync('src/renderer/gwira/timeline/TimelineView.tsx', 'utf8');
    expect(view).toContain('timeline-hide-inspector');
    expect(view).toContain('popoverRef');
    const main = readFileSync('src/renderer/main.tsx', 'utf8');
    expect(main).toContain('data-model-recovery');
    expect(main).toContain('Continue with');
    expect(main).not.toMatch(/setModel\(unavailableModel/);
  });
});
