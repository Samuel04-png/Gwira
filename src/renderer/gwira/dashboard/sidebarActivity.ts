import type { GwiraLocalState } from '../domain/types.js';
import type { Doat } from '../doats/domain/types.js';
import type { NavigationStatusKind } from '../../navigationStatusModel.js';
export function recordedSidebarActivity(doat: Pick<Doat, 'workspaceId' | 'operations'>, state: Pick<GwiraLocalState, 'workspace' | 'tasks'>, acknowledged?: string): { status?: NavigationStatusKind; version?: string } {
  if (doat.workspaceId !== state.workspace.id) return {};
  const task = state.tasks.find(item => item.workspaceId === state.workspace.id && item.id === doat.operations.activeTaskId) ?? state.tasks.find(item => item.workspaceId === state.workspace.id && item.id === doat.operations.lastCompletedTaskId);
  const run = task?.agentRun;
  if (run?.status === 'running') return { status: 'working' };
  if (run?.status === 'error') return { status: 'failed' };
  // Reviewer assignment is unavailable in the local prototype: avoid claiming
  // a pending approval belongs to the current user.
  if (run?.status === 'completed' && run.completedAt) {
    const version = `${run.sessionId}:${run.completedAt}`;
    return { status: acknowledged === version ? undefined : 'completed', version };
  }
  return {};
}
