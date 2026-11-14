import { describe, expect, it } from 'vitest';
import { BOARD_STATUS_ORDER, buildBoard } from '../../src/renderer/gwira/board/boardModel.js';
import { NO_FILTERS } from '../../src/renderer/gwira/workfilters/workFilters.js';

describe('board model', () => {
  it('shows all canonical status columns, including empty ones, and groups existing tasks', () => {
    const model = buildBoard({
      tasks: [
        { id: 'working', title: 'B item', status: 'working' },
        { id: 'done', title: 'A item', status: 'completed' }
      ]
    }, { filters: NO_FILTERS });
    expect(model.columns.map(({ id }) => id)).toEqual(BOARD_STATUS_ORDER);
    expect(model.columns.find(({ id }) => id === 'default')?.tasks).toEqual([]);
    expect(model.columns.find(({ id }) => id === 'working')?.tasks.map(({ id }) => id)).toEqual(['working']);
    expect(model.columns.find(({ id }) => id === 'completed')?.tasks.map(({ id }) => id)).toEqual(['done']);
    expect(model).toMatchObject({ total: 2, shown: 2, hiddenAttention: 0 });
  });

  it('applies shared filters and search without mutating source task status', () => {
    const task = { id: 'blocked', title: 'Release gate', status: 'blocked' as const };
    const records = { tasks: [task] };
    const model = buildBoard(records, {
      filters: { status: 'working', owner: 'all', project: 'all' },
      search: 'release'
    });
    expect(model.shown).toBe(0);
    expect(task.status).toBe('blocked');
    expect(model.columns).toHaveLength(7);
  });

  it('projects 1,600 records into all stable columns', () => {
    const tasks = Array.from({ length: 1600 }, (_, index) => ({
      id: `board-${index}`,
      title: `Task ${index}`,
      status: BOARD_STATUS_ORDER[index % BOARD_STATUS_ORDER.length]
    }));
    const model = buildBoard({ tasks }, { filters: NO_FILTERS });
    expect(model.total).toBe(1600);
    expect(model.shown).toBe(1600);
    expect(model.columns.reduce((sum, column) => sum + column.tasks.length, 0)).toBe(1600);
    expect(model.columns.every((column) => column.tasks.length > 0)).toBe(true);
  });
});
