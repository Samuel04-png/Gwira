import { describe, expect, it } from 'vitest';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import type { Person, Task } from '../../src/renderer/gwira/domain/types.js';
import { recentActivity, workerGroup, workflowWorkers } from '../../src/renderer/gwira/dashboard/workflowPanelModel.js';

const now = '2026-10-18T10:00:00.000Z';
const task = (id: string, status: Task['status'], updatedAt: string): Task => ({
  id,
  workspaceId: 'workspace',
  title: id,
  status,
  priority: 'medium',
  assignee: { kind: 'person', id: 'person' },
  createdAt: now,
  updatedAt
});
const person: Person = { id: 'person', workspaceId: 'workspace', name: 'Ada Banda', role: 'Operations', createdAt: now };

describe('workflow panel model', () => {
  it('chooses a current attention task before a newer completed task', () => {
    const state = {
      ...createEmptyLocalState({ organizationId: 'org', workspaceId: 'workspace' }, now),
      people: [person],
      tasks: [task('blocked', 'blocked', '2026-10-17T10:00:00.000Z'), task('done', 'done', now)]
    };
    const [worker] = workflowWorkers(state);
    expect(worker).toMatchObject({ task: { id: 'blocked' }, status: 'Blocked', flowNodeId: 'humanWork:blocked' });
    expect(workerGroup(worker)).toBe('attention');
  });

  it('reports completed or unassigned people as idle rather than working', () => {
    const state = {
      ...createEmptyLocalState({ organizationId: 'org', workspaceId: 'workspace' }, now),
      people: [person, { ...person, id: 'unassigned', name: 'Una Assigned' }],
      tasks: [task('done', 'done', now)]
    };
    const workers = workflowWorkers(state);
    expect(workers.find((worker) => worker.id === 'person')).toMatchObject({ status: 'Completed', task: { id: 'done' } });
    expect(workers.find((worker) => worker.id === 'unassigned')).toMatchObject({ status: 'Idle', task: undefined });
    expect(workers.every((worker) => workerGroup(worker) === 'others')).toBe(true);
    expect(workerGroup({ id: 'doat', kind: 'doat', name: 'Planning Doat', role: 'Planning', status: 'Planning', updatedAt: now })).toBe('working');
  });

  it('marks work with a recorded pending approval as needing attention', () => {
    const state = {
      ...createEmptyLocalState({ organizationId: 'org', workspaceId: 'workspace' }, now),
      people: [person],
      tasks: [task('review', 'in_progress', now)],
      approvals: [{ id: 'approval', taskId: 'review', resultId: 'result', requestedBy: { kind: 'person' as const, id: 'person' }, status: 'pending' as const, createdAt: now }]
    };
    const [worker] = workflowWorkers(state);
    expect(worker.status).toBe('Needs approval');
    expect(workerGroup(worker)).toBe('attention');
  });

  it('excludes people and activity from other workspace scopes', () => {
    const state = {
      ...createEmptyLocalState({ organizationId: 'org', workspaceId: 'workspace' }, now),
      people: [person, { ...person, id: 'other', workspaceId: 'other-workspace', name: 'Other person' }],
      activity: [
        { id: 'created', workspaceId: 'workspace', kind: 'workspace_created' as const, occurredAt: now, summary: 'Workspace created' },
        { id: 'current', workspaceId: 'workspace', kind: 'task_updated' as const, occurredAt: now, summary: 'Task updated' },
        { id: 'other', workspaceId: 'other-workspace', kind: 'task_updated' as const, occurredAt: now, summary: 'Other task updated' }
      ]
    };
    expect(workflowWorkers(state).map((worker) => worker.id)).toEqual(['person']);
    expect(recentActivity(state).map((event) => event.id)).toEqual(['current']);
  });
});
