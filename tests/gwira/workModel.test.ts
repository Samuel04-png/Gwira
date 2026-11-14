import { describe, expect, it } from 'vitest';
import { buildWorkItems, filterWorkItems } from '../../src/renderer/gwira/workfilters/workModel.js';

describe('shared work projection', () => {
  it('sanitizes missing references and never exposes their opaque identifiers as options', () => {
    const projection = buildWorkItems({
      tasks: [{
        id: 'task-a',
        title: 'Review release',
        status: 'unknown' as never,
        ownerKind: 'person',
        ownerId: 'secret-person-id',
        ownerName: 'Unknown person',
        projectId: 'secret-project-id',
        dependsOnTaskIds: ['secret-task-id']
      }]
    });
    expect(projection.items[0]).toMatchObject({
      status: 'default',
      statusLabel: 'Not started',
      ownerName: 'Unavailable owner',
      ownerId: undefined,
      projectName: 'Unavailable project',
      projectId: undefined,
      unavailableDependencies: 1
    });
    expect(JSON.stringify(projection)).not.toContain('secret-');
    expect(projection.options.owners.map(({ label }) => label)).toEqual(['Unavailable owner']);
    expect(projection.options.projects).toEqual([]);
  });

  it('distinguishes recorded run state and approval attention from ordinary dependency waiting', () => {
    const projection = buildWorkItems({
      tasks: [
        { id: 'predecessor', title: 'Prepare', status: 'working' },
        { id: 'waiting', title: 'Wait normally', status: 'waiting', dependsOnTaskIds: ['predecessor'] },
        { id: 'run-error', title: 'Failed run', status: 'working', ownerKind: 'doat', runStatus: 'error' }
      ],
      approvals: [{ id: 'approval', title: 'Approve', taskId: 'waiting', status: 'waiting' }]
    }, { today: new Date(2026, 0, 2) });
    expect(projection.items.find(({ id }) => id === 'waiting')).toMatchObject({
      dependenciesWaiting: 1,
      attention: [{ kind: 'approval', label: 'Approval pending' }]
    });
    expect(projection.items.find(({ id }) => id === 'run-error')?.attention[0]?.kind).toBe('failed');
  });

  it('combines search and filters and counts hidden attention once per task', () => {
    const projection = buildWorkItems({
      tasks: [
        { id: 'a', title: 'Blocked release', status: 'blocked' },
        { id: 'b', title: 'Ordinary work', status: 'working' }
      ]
    }, { today: new Date(2026, 0, 2) });
    const filtered = filterWorkItems(projection.items, {
      filters: { status: 'working', owner: 'all', project: 'all' },
      search: 'blocked'
    });
    expect(filtered).toMatchObject({ total: 2, shown: 0, hiddenAttention: 1, tasks: [] });
  });
});
