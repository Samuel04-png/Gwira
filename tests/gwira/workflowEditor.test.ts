import { describe, expect, it } from 'vitest';
import { reduceGwira } from '../../src/renderer/gwira/domain/reducer.js';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import type { Person, Task } from '../../src/renderer/gwira/domain/types.js';

const now = '2026-10-19T10:00:00.000Z';

describe('workflow work editor reducer contract', () => {
  it('clears optional task fields when the editor explicitly submits null', () => {
    const person: Person = { id: 'person-1', workspaceId: 'workspace-1', name: 'A. User', role: 'Operations', createdAt: now };
    const task: Task = {
      id: 'task-1',
      workspaceId: 'workspace-1',
      title: 'Review launch',
      description: 'Old description',
      status: 'todo',
      priority: 'high',
      dueDate: '2026-10-30',
      assignee: { kind: 'person', id: person.id },
      createdAt: now,
      updatedAt: now
    };
    const state = { ...createEmptyLocalState({ organizationId: 'org-1', workspaceId: 'workspace-1' }, now), people: [person], tasks: [task] };

    const updated = reduceGwira(state, {
      type: 'UPDATE_TASK',
      taskId: task.id,
      description: null,
      dueDate: null,
      at: now,
      activityId: 'activity-1'
    });

    expect(updated.tasks[0]).toMatchObject({ title: task.title, priority: task.priority, status: task.status });
    expect(updated.tasks[0]?.description).toBeUndefined();
    expect(updated.tasks[0]?.dueDate).toBeUndefined();
    expect(updated.activity.at(-1)).toMatchObject({ kind: 'task_updated', taskId: task.id });
  });

  it('rejects creation with an assignee outside the current workspace', () => {
    const state = createEmptyLocalState({ organizationId: 'org-1', workspaceId: 'workspace-1' }, now);
    const next = reduceGwira(state, {
      type: 'CREATE_TASK',
      task: {
        id: 'forged-task',
        workspaceId: 'workspace-1',
        title: 'Forged assignment',
        status: 'todo',
        priority: 'medium',
        assignee: { kind: 'person', id: 'other-workspace-person' },
        createdAt: now,
        updatedAt: now
      },
      activityId: 'activity-1'
    });
    expect(next).toBe(state);
  });
});
