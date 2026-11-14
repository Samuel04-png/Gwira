import { describe, expect, it } from 'vitest';
import {
  buildCalendar, calendarDayNumber, calendarRange, parseCalendarDay, startOfCalendarWeek
} from '../../src/renderer/gwira/calendar/calendarModel.js';
import { NO_FILTERS } from '../../src/renderer/gwira/workfilters/workFilters.js';

const day = (value: string): number => {
  const result = parseCalendarDay(value);
  if (result === undefined) throw new Error(`Invalid calendar fixture date: ${value}`);
  return result;
};

describe('calendar model', () => {
  it('strictly parses valid date-only and zoned values while rejecting malformed dates', () => {
    expect(day('2024-02-29')).toBe(calendarDayNumber(2024, 1, 29));
    expect(parseCalendarDay('2023-02-29')).toBeUndefined();
    expect(parseCalendarDay('2026-04-31')).toBeUndefined();
    expect(parseCalendarDay('2026-01-01T10:00:00')).toBeUndefined();
    expect(parseCalendarDay('2026-01-01T25:00:00Z')).toBeUndefined();
    const timestamp = '2026-01-01T00:30:00+02:00';
    expect(parseCalendarDay(timestamp)).toBe(new Date(timestamp).getFullYear() === 2025
      ? calendarDayNumber(2025, 11, 31)
      : calendarDayNumber(2026, 0, 1));
  });

  it('uses Monday-first seven-day weeks and six-week month grids', () => {
    const anchor = day('2026-10-18');
    expect(startOfCalendarWeek(anchor)).toBe(day('2026-10-12'));
    expect(calendarRange('week', anchor).days).toHaveLength(7);
    expect(calendarRange('month', anchor).days).toHaveLength(42);
  });

  it('preserves planned, due and actual facts independently with unique task totals', () => {
    const model = buildCalendar({
      tasks: [{
        id: 'planned',
        title: 'Plan release',
        status: 'working',
        plannedStart: '2026-10-12',
        plannedEnd: '2026-10-14',
        dueDate: '2026-10-20',
        startedAt: '2026-10-10T12:00:00Z'
      }]
    }, { view: 'month', anchorDay: day('2026-10-18'), filters: NO_FILTERS });
    expect(model.total).toBe(1);
    expect(model.shown).toBe(1);
    expect(model.events.map(({ kind, start, end }) => ({ kind, start, end }))).toEqual([
      { kind: 'planned', start: day('2026-10-12'), end: day('2026-10-14') },
      { kind: 'due', start: day('2026-10-20'), end: day('2026-10-20') },
      { kind:'actual',start:day('2026-10-10'),end:day('2026-10-10') }
    ]);
  });

  it('keeps due and actual work unique and labels actual-only placement distinctly', () => {
    const model = buildCalendar({
      tasks: [
        { id: 'due-actual', title: 'Due task', status: 'completed', dueDate: '2026-10-18', startedAt: '2026-10-18T10:00:00Z' },
        { id: 'actual-only', title: 'Recorded run', status: 'completed', completedAt: '2026-10-17T10:00:00Z' },
        { id: 'undated', title: 'No date', status: 'default' }
      ]
    }, { view: 'week', anchorDay: day('2026-10-18'), filters: NO_FILTERS });
    expect(model.total).toBe(3);
    expect(model.events.map(({ task, kind }) => [task.id, kind])).toEqual([
      ['due-actual', 'due'],
      ['due-actual','actual'],
      ['actual-only', 'actual']
    ]);
    expect(model.unscheduled.map(({ id }) => id)).toEqual(['undated']);
  });

  it('warns on partial and reversed ranges without inferring or swapping a span', () => {
    const model = buildCalendar({
      tasks: [
        { id: 'partial', title: 'Partial', status: 'working', plannedStart: '2026-10-16' },
        { id: 'reversed', title: 'Reversed', status: 'working', plannedStart: '2026-10-18', plannedEnd: '2026-10-16' }
      ]
    }, { view: 'week', anchorDay: day('2026-10-18'), filters: NO_FILTERS });
    expect(model.events).toHaveLength(1);
    expect(model.events[0]).toMatchObject({ task: { id: 'partial' }, start: day('2026-10-16'), end: day('2026-10-16'), warning: expect.any(String) });
    expect(model.warnings).toEqual([expect.objectContaining({ taskId: 'partial' }), expect.objectContaining({ taskId: 'reversed', message: expect.stringContaining('before') })]);
    expect(model.unscheduled.map(({ id }) => id)).toEqual(['reversed']);
  });

  it('projects 1,600 records without losing task identity or unique totals', () => {
    const tasks = Array.from({ length: 1600 }, (_, index) => ({
      id: `calendar-${index}`,
      title: `Scheduled task ${index}`,
      status: 'working' as const,
      dueDate: '2026-10-18'
    }));
    const model = buildCalendar({ tasks }, { view: 'month', anchorDay: day('2026-10-18'), filters: NO_FILTERS });
    expect(model.total).toBe(1600);
    expect(model.shown).toBe(1600);
    expect(new Set(model.events.map(({ task }) => task.id)).size).toBe(1600);
  });
});
