import type { Approval, GwiraLocalState, Task, TaskStatus } from '../domain/types.js';
import { doatToUiRecord } from '../doats/doatViewModel.js';
import type { TaskRecord, WorkGraphRecords, WorkGraphStatus } from './graphModel.js';

const taskStatus: Record<TaskStatus, WorkGraphStatus> = {
  backlog: 'default',
  todo: 'default',
  in_progress: 'working',
  in_review: 'waiting',
  done: 'completed',
  blocked: 'blocked'
};

function graphTaskStatus(task: Task): WorkGraphStatus {
  if (task.agentRun?.status === 'error') return 'failed';
  if (task.agentRun?.status === 'stopped') return 'blocked';
  return taskStatus[task.status];
}

function assigneeName(assignee: Approval['requestedBy'], state: GwiraLocalState): string | undefined {
  return assignee.kind === 'person'
    ? state.people.find((person) => person.id === assignee.id)?.name
    : state.doats.find((doat) => doat.id === assignee.id)?.identity.name;
}

function scheduleFields(task: Task, state: GwiraLocalState): Pick<TaskRecord, 'createdAt' | 'startedAt' | 'completedAt' | 'projectId' | 'projectName'> {
  const project = task.projectId ? state.projects.find((entry) => entry.id === task.projectId) : undefined;
  return { createdAt: task.createdAt, startedAt: task.agentRun?.startedAt, completedAt: task.agentRun?.completedAt, projectId: task.projectId, projectName: project?.name };
}

/** Adapts persisted task ownership, dependencies, runs, and approvals without inferring links. */
export function localStateToGraphRecords(state: GwiraLocalState): WorkGraphRecords {
  return {
    tasks: state.tasks.map((task) => {
      if (task.assignee?.kind === 'person') {
        const person = state.people.find((entry) => entry.id === task.assignee?.id);
        return {
          id: task.id,
          title: task.title,
          subtitle: task.description ?? '',
          description: task.description,
          status: graphTaskStatus(task),
          ownerKind: 'person',
          ownerId: person?.id ?? task.assignee.id,
          ownerName: person?.name ?? 'Unknown person',
          priority: task.priority,
          dueDate: task.dueDate,
          updatedAt: task.updatedAt,
          dependsOnTaskIds: task.dependsOnTaskIds,
          doatRunId: task.agentRun?.sessionId,
          runStatus: task.agentRun?.status,
          ...scheduleFields(task, state)
        };
      }
      if (task.assignee?.kind === 'agent') {
        const doat = state.doats.find((entry) => entry.id === task.assignee?.id);
        const agent = state.agents.find((entry) => entry.id === task.assignee?.id);
        const avatar = doat ? doatToUiRecord(doat, state).avatar : undefined;
        return {
          id: task.id,
          title: task.title,
          subtitle: task.description ?? '',
          description: task.description,
          status: graphTaskStatus(task),
          ownerKind: 'doat',
          ownerId: task.assignee.id,
          ownerName: doat?.identity.name ?? agent?.name ?? 'Unknown Doat',
          avatar,
          priority: task.priority,
          dueDate: task.dueDate,
          updatedAt: task.updatedAt,
          dependsOnTaskIds: task.dependsOnTaskIds,
          doatRunId: task.agentRun?.sessionId,
          runStatus: task.agentRun?.status,
          ...scheduleFields(task, state)
        };
      }
      return {
        id: task.id,
        title: task.title,
        subtitle: task.description ?? '',
        description: task.description,
        status: graphTaskStatus(task),
        ownerKind: 'unassigned',
        ownerName: 'Unassigned',
        priority: task.priority,
        dueDate: task.dueDate,
        updatedAt: task.updatedAt,
        dependsOnTaskIds: task.dependsOnTaskIds,
        doatRunId: task.agentRun?.sessionId,
        runStatus: task.agentRun?.status,
        ...scheduleFields(task, state)
      };
    }),
    approvals: state.approvals.map((approval) => ({
      id: approval.id,
      taskId: approval.taskId,
      title: state.tasks.find((task) => task.id === approval.taskId)?.title ?? 'Approval request',
      subtitle: approval.status === 'pending' ? 'Waiting for approval' : approval.status === 'approved' ? 'Approved' : 'Changes requested',
      status: approval.status === 'pending' ? 'waiting' : approval.status === 'approved' ? 'completed' : 'blocked',
      reviewerName: approval.decidedBy ? assigneeName(approval.decidedBy, state) : undefined,
      requestedByName: assigneeName(approval.requestedBy, state),
      decidedAt: approval.decidedAt,
      resultId: approval.resultId,
      createdAt: approval.createdAt
    }))
  };
}
