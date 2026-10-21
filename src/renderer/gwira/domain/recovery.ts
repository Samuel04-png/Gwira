import { MAX_PERSISTED_ACTIVITY } from './types.js';
import type { GwiraLocalState } from './types.js';

/**
 * Electron cannot reconnect to a renderer-local process after restart. A run
 * persisted as running is therefore explicitly recovered as stopped rather
 * than being misrepresented as still executing or completed.
 */
export function recoverInterruptedAgentRuns(state: GwiraLocalState, at: string, nextId: () => string): GwiraLocalState {
  const interrupted = state.tasks.filter((task) => task.agentRun?.status === 'running');
  if (interrupted.length === 0) return state;
  const interruptedIds = new Set(interrupted.map((task) => task.id));
  const tasks = state.tasks.map((task) => {
    if (!interruptedIds.has(task.id) || !task.agentRun) return task;
    return {
      ...task,
      status: task.status === 'in_progress' ? 'todo' as const : task.status,
      agentRun: { ...task.agentRun, status: 'stopped' as const, completedAt: at, error: 'Interrupted when the local application restarted.' },
      updatedAt: at
    };
  });
  const activity = [...state.activity, ...interrupted.map((task) => ({
    id: nextId(), workspaceId: state.workspace.id, kind: 'agent_run_updated' as const, occurredAt: at,
    taskId: task.id, actor: task.assignee, summary: `Recovered interrupted coding-agent run for ${task.title}`
  }))].slice(-MAX_PERSISTED_ACTIVITY);
  return { ...state, tasks, activity };
}
