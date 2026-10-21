import type { Approval, GwiraLocalState, Task, TaskStatus } from '../domain/types.js';
import type { WorkGraphRecords, WorkGraphStatus } from './graphModel.js';

const taskStatus: Record<TaskStatus, WorkGraphStatus> = { backlog: 'default', todo: 'default', in_progress: 'working', in_review: 'waiting', done: 'completed', blocked: 'blocked' };
const runStatus = { running: 'working', completed: 'completed', error: 'failed', stopped: 'blocked' } as const;

/** Adapts only persisted local records. It intentionally has no inferred task links. */
export function localStateToGraphRecords(state: GwiraLocalState): WorkGraphRecords {
  const approvalsByTask = new Map<string, Approval[]>();
  for (const approval of state.approvals) approvalsByTask.set(approval.taskId, [...(approvalsByTask.get(approval.taskId) ?? []), approval]);
  return {
    tasks: state.tasks.map((task) => ({
      id: task.id, title: task.title, subtitle: task.description ?? task.status, status: taskStatus[task.status], parentStepId: task.parentStepId, dependsOnTaskIds: task.dependsOnTaskIds,
      doatRunId: task.agentRun ? task.agentRun.sessionId : undefined,
      humanWorkId: task.assignee?.kind === 'person' ? task.id : undefined,
      approvalId: approvalsByTask.get(task.id)?.[0]?.id
    })),
    doatRuns: state.tasks.flatMap((task) => task.agentRun ? [{
      id: task.agentRun.sessionId, taskId: task.id, title: `${task.title} execution`, subtitle: 'Recorded Doat execution', status: runStatus[task.agentRun.status]
    }] : []),
    humanWork: state.tasks.flatMap((task) => task.assignee?.kind === 'person' ? [{
      id: task.id, taskId: task.id, title: task.title, subtitle: `Reported by ${state.people.find((person) => person.id === task.assignee?.id)?.name ?? 'employee'}`, status: taskStatus[task.status]
    }] : []),
    approvals: state.approvals.map((approval) => ({
      id: approval.id, taskId: approval.taskId, title: 'Approval', subtitle: approval.status === 'pending' ? 'Awaiting review' : approval.status === 'approved' ? 'Approved' : 'Changes requested', status: approval.status === 'pending' ? 'waiting' : approval.status === 'approved' ? 'completed' : 'blocked'
    }))
  };
}
