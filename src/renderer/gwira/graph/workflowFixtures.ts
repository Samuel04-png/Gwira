import type { WorkGraphRecords } from './graphModel.js';

export type WorkflowFixtureName = 'empty' | 'one' | 'five' | 'branch' | 'completed-chain' | 'failed-execution' | 'blocked-approval' | 'disconnected' | 'two-way' | 'fifty' | 'two-hundred' | 'states';

const fixtureNames: WorkflowFixtureName[] = ['empty', 'one', 'five', 'branch', 'completed-chain', 'failed-execution', 'blocked-approval', 'disconnected', 'two-way', 'fifty', 'two-hundred', 'states'];

export function readDevWorkflowFixture(): WorkflowFixtureName | undefined {
  // Electron production loads local files; fixtures are only accepted from the
  // Vite development server and remain unreachable in packaged builds.
  if (window.location.protocol !== 'http:') return undefined;
  const value = new URLSearchParams(window.location.search).get('canvasFixture');
  return fixtureNames.includes(value as WorkflowFixtureName) ? value as WorkflowFixtureName : undefined;
}

export function workflowFixture(name: WorkflowFixtureName): WorkGraphRecords {
  if (name === 'empty') return {};
  if (name === 'one') return { tasks: [{ id: 'one', title: 'Review the local operating plan', subtitle: 'One local task', status: 'default' }] };
  if (name === 'fifty' || name === 'two-hundred') return generated(name === 'fifty' ? 50 : 200);
  if (name === 'completed-chain') return { tasks: [{ id: 'brief', title: 'Completed brief', subtitle: 'Task', status: 'completed', resultId: 'result' }], results: [{ id: 'result', title: 'Published result', subtitle: 'Result', status: 'completed' }] };
  if (name === 'failed-execution') return { tasks: [{ id: 'task', title: 'Local task', subtitle: 'Task', doatRunId: 'run' }], doatRuns: [{ id: 'run', title: 'Failed execution', subtitle: 'Doat execution', status: 'failed' }] };
  if (name === 'blocked-approval') return { tasks: [{ id: 'task', title: 'Blocked local task', subtitle: 'Task', status: 'blocked', approvalId: 'approval' }], approvals: [{ id: 'approval', title: 'Waiting approval', subtitle: 'Approval', status: 'waiting', taskId: 'task' }] };
  if (name === 'disconnected') return { tasks: [{ id: 'connected', title: 'Connected local task', subtitle: 'Task', resultId: 'result' }, { id: 'unlinked', title: 'Disconnected local task', subtitle: 'Task', status: 'default' }], results: [{ id: 'result', title: 'Task result', subtitle: 'Result', status: 'completed' }] };
  if (name === 'two-way') return { tasks: [{ id: 'first', title: 'First explicit task', subtitle: 'Task', dependsOnTaskIds: ['second'] }, { id: 'second', title: 'Second explicit task', subtitle: 'Task', dependsOnTaskIds: ['first'] }] };
  if (name === 'branch') return {
    objectives: [{ id: 'launch', title: 'Launch readiness', subtitle: 'Objective', taskIds: ['brief', 'review', 'publish'] }],
    tasks: [{ id: 'brief', title: 'Draft briefing', subtitle: 'Task', status: 'completed' }, { id: 'review', title: 'Legal review', subtitle: 'Task', dependsOnTaskIds: ['brief'], status: 'blocked' }, { id: 'publish', title: 'Publish brief', subtitle: 'Task', dependsOnTaskIds: ['brief'], status: 'waiting' }, { id: 'isolated', title: 'Unlinked local record', subtitle: 'Task', status: 'default' }]
  };
  if (name === 'states') return {
    objectives: [{ id: 'objective', title: 'Objective with a deliberately long local-only fixture title', subtitle: 'Objective', taskIds: ['task'] }],
    tasks: [{ id: 'task', title: 'Blocked task', subtitle: 'Task', status: 'blocked', doatRunId: 'run', approvalId: 'approval' }],
    doatRuns: [{ id: 'run', title: 'Failed execution', subtitle: 'Doat execution', status: 'failed', resultId: 'result' }],
    approvals: [{ id: 'approval', title: 'Waiting approval', subtitle: 'Approval', status: 'waiting', taskId: 'task' }],
    results: [{ id: 'result', title: 'Completed result', subtitle: 'Result', status: 'completed' }],
    humanWork: [{ id: 'human', title: 'Working human task', subtitle: 'Human work', status: 'working' }]
  };
  return {
    objectives: [{ id: 'objective', title: 'Quarterly operating plan', subtitle: 'Objective', taskIds: ['task'] }],
    tasks: [{ id: 'task', title: 'Prepare operating plan', subtitle: 'Task', doatRunId: 'run', approvalId: 'approval' }],
    doatRuns: [{ id: 'run', title: 'Operations execution', subtitle: 'Doat execution', status: 'working', resultId: 'result' }],
    approvals: [{ id: 'approval', title: 'Founder review', subtitle: 'Approval', status: 'waiting', taskId: 'task' }],
    results: [{ id: 'result', title: 'Operating plan', subtitle: 'Result', status: 'completed' }]
  };
}

function generated(count: number): WorkGraphRecords {
  return { tasks: Array.from({ length: count }, (_, index) => ({ id: `task-${index + 1}`, title: index === count - 1 ? 'A long fixture task name that verifies truncation at scale' : `Fixture task ${index + 1}`, subtitle: 'Development fixture', status: index % 11 === 0 ? 'failed' : index % 7 === 0 ? 'blocked' : index % 5 === 0 ? 'completed' : 'working', dependsOnTaskIds: index > 0 ? [`task-${index}`] : undefined })) };
}
