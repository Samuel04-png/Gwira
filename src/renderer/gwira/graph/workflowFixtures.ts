import { createProceduralAvatarSpec } from '../doats/ui/avatarModel.js';
import type { WorkGraphRecords } from './graphModel.js';

export type WorkflowFixtureName =
  | 'empty' | 'one' | 'five' | 'connected' | 'branch' | 'completed-chain'
  | 'failed-execution' | 'blocked-approval' | 'approval-waiting' | 'disconnected'
  | 'two-way' | 'fifty' | 'two-hundred' | 'states' | 'timeline' | 'timeline-large';

const fixtureNames: WorkflowFixtureName[] = [
  'empty', 'one', 'five', 'connected', 'branch', 'completed-chain',
  'failed-execution', 'blocked-approval', 'approval-waiting', 'disconnected',
  'two-way', 'fifty', 'two-hundred', 'states', 'timeline', 'timeline-large'
];

export function readDevWorkflowFixture(): WorkflowFixtureName | undefined {
  if (window.location.protocol !== 'http:') return undefined;
  const value = new URLSearchParams(window.location.search).get('canvasFixture');
  return fixtureNames.includes(value as WorkflowFixtureName) ? value as WorkflowFixtureName : undefined;
}

export function workflowFixture(name: WorkflowFixtureName): WorkGraphRecords {
  if (name === 'empty') return {};
  if (name === 'one') return {
    objectives: [{ id: 'one-objective', title: 'Prepare the weekly operating review' }],
    tasks: [work('one', 'Prepare the weekly operating review', 'humanWork', 'Maya Chen', 'working')]
  };
  if (name === 'timeline') return timelineFixture(new Date());
  if (name === 'timeline-large') return largeTimelineFixture(new Date());
  if (name === 'fifty' || name === 'two-hundred') return generated(name === 'fifty' ? 50 : 200);
  if (name === 'connected' || name === 'five' || name === 'branch' || name === 'approval-waiting') return campaign(false);
  if (name === 'completed-chain') return {
    objectives: [{ id: 'publish', title: 'Publish the approved customer update' }],
    tasks: [
      work('draft', 'Draft customer update', 'doatWork', 'Customer Support Doat', 'completed'),
      work('review', 'Review customer update', 'humanWork', 'Amara Banda', 'completed', ['draft']),
      work('publish', 'Publish customer update', 'doatWork', 'Customer Support Doat', 'working', ['review'])
    ]
  };
  if (name === 'failed-execution') return {
    objectives: [{ id: 'recover', title: 'Recover the failed data import' }],
    tasks: [work('failed', 'Retry the customer data import', 'doatWork', 'Operations Doat', 'failed')]
  };
  if (name === 'blocked-approval') return {
    objectives: [{ id: 'budget', title: 'Approve the quarterly campaign budget' }],
    tasks: [work('purchase', 'Authorize campaign spend', 'humanWork', 'Maya Chen', 'blocked')],
    approvals: [approval('budget-approval', 'purchase', 'Waiting for finance approval', 'waiting', 'Finance reviewer')]
  };
  if (name === 'disconnected') return {
    objectives: [{ id: 'independent', title: 'Independent work with no recorded handoff' }],
    tasks: [
      work('brief', 'Prepare the product brief', 'humanWork', 'Maya Chen', 'working'),
      work('research', 'Review customer research', 'doatWork', 'Research Doat', 'working'),
      work('follow-up', 'Schedule customer interviews', 'humanWork', 'Amara Banda', 'default')
    ]
  };
  if (name === 'two-way') return {
    objectives: [{ id: 'two-way', title: 'Check circular dependency handling' }],
    tasks: [
      work('first', 'First explicit task', 'doatWork', 'Research Doat', 'working', ['second']),
      work('second', 'Second explicit task', 'humanWork', 'Maya Chen', 'blocked', ['first'])
    ]
  };
  if (name === 'states') return {
    objectives: [{ id: 'states', title: 'Resolve the launch readiness issues' }],
    tasks: [
      work('done', 'Complete launch brief', 'humanWork', 'Maya Chen', 'completed'),
      work('active', 'Prepare launch assets', 'doatWork', 'Marketing Doat', 'working', ['done']),
      work('blocked', 'Confirm legal language', 'humanWork', 'Amara Banda', 'blocked', ['active']),
      work('failed', 'Import campaign list', 'doatWork', 'Marketing Doat', 'failed'),
      work('waiting', 'Approve campaign launch', 'humanWork', 'Maya Chen', 'waiting', ['blocked'])
    ],
    approvals: [approval('launch-approval', 'waiting', 'Approve campaign launch', 'waiting', 'Maya Chen')]
  };
  return campaign(true);
}

function campaign(includeDisconnected: boolean): WorkGraphRecords {
  return {
    objectives: [{ id: 'campaign', title: 'Launch the weekend smoothie promotion', taskIds: ['research', 'review', 'content', 'approval', 'messages', 'publish'] }],
    tasks: [
      work('research', 'Research weekend promotion ideas', 'doatWork', 'Marketing Doat', 'completed'),
      work('review', 'Review campaign direction', 'humanWork', 'Chipo Zulu', 'completed', ['research']),
      work('content', 'Draft promotion content', 'doatWork', 'Marketing Doat', 'working', ['review']),
      work('approval', 'Approve final campaign', 'humanWork', 'Sarah Mwila', 'waiting', ['content']),
      work('messages', 'Prepare customer promotion messages', 'doatWork', 'Customer Support Doat', 'default', ['content']),
      work('publish', 'Publish weekend promotion', 'doatWork', 'Marketing Doat', 'default', ['approval', 'messages']),
      ...(includeDisconnected ? [work('isolated', 'Review regional stock availability', 'humanWork', 'David Tembo', 'working')] : [])
    ],
    approvals: [approval('campaign-approval', 'approval', 'Approve final campaign', 'waiting', 'Sarah Mwila')]
  };
}

function work(id: string, title: string, ownerKind: 'humanWork' | 'doatWork', ownerName: string, status: 'default' | 'blocked' | 'waiting' | 'working' | 'completed' | 'failed' | 'paused', dependsOnTaskIds?: string[]) {
  const isDoat = ownerKind === 'doatWork';
  return {
    id,
    title,
    ownerKind: isDoat ? 'doat' as const : 'person' as const,
    ownerId: `${ownerKind}:${ownerName.toLowerCase().replaceAll(' ', '-')}`,
    ownerName,
    avatar: isDoat ? createProceduralAvatarSpec(ownerName) : undefined,
    subtitle: ownerName,
    status,
    updatedAt: '2026-10-18T08:45:00.000Z',
    dependsOnTaskIds
  };
}

function approval(id: string, taskId: string, title: string, status: 'waiting' | 'completed' | 'blocked', reviewerName: string) {
  return { id, taskId, title, subtitle: title, status, reviewerName, resultId: `result:${id}`, createdAt: '2026-10-18T08:20:00.000Z' };
}

function generated(count: number): WorkGraphRecords {
  return {
    objectives: [{ id: `scale-${count}`, title: `Review ${count} items in the operations plan` }],
    tasks: Array.from({ length: count }, (_, index) => {
      const status = index % 17 === 0 ? 'failed' : index % 11 === 0 ? 'blocked' : index % 7 === 0 ? 'completed' : index % 5 === 0 ? 'working' : 'default';
      const kind = index % 2 === 0 ? 'doatWork' : 'humanWork';
      return work(`task-${index + 1}`, index === count - 1 ? 'A long work item title that remains readable at scale' : `Work item ${index + 1}`, kind, kind === 'doatWork' ? 'Operations Doat' : 'Maya Chen', status, index ? [`task-${index}`] : undefined);
    })
  };
}

/**
 * Development-only Timeline data, dated relative to today so every state stays visible.
 * Reachable only through ?canvasFixture=timeline in a dev build; never written to a workspace.
 */
export function timelineFixture(now: Date): WorkGraphRecords {
  const at = (offset: number, hour = 9): string => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`;
  };
  const due = (offset: number): string => at(offset).slice(0, 10);
  const task = (id: string, title: string, ownerKind: 'humanWork' | 'doatWork', ownerName: string, status: 'default' | 'blocked' | 'waiting' | 'working' | 'completed' | 'failed', project: string, schedule: { start?: number; end?: number; due?: number }, dependsOn?: string[]) => ({
    ...work(id, title, ownerKind, ownerName, status, dependsOn),
    projectId: `project:${project.toLowerCase()}`,
    projectName: project,
    startedAt: schedule.start === undefined ? undefined : at(schedule.start),
    completedAt: schedule.end === undefined ? undefined : at(schedule.end, 17),
    dueDate: schedule.due === undefined ? undefined : due(schedule.due)
  });
  return {
    objectives: [
      { id: 'tl-promotion', title: 'Launch the weekend smoothie promotion', taskIds: ['tl-research', 'tl-review', 'tl-content', 'tl-visuals', 'tl-messages', 'tl-approve', 'tl-publish', 'tl-stock', 'tl-brief'] },
      { id: 'tl-close', title: 'Close the month', taskIds: ['tl-invoices', 'tl-signoff', 'tl-staffing', 'tl-loyalty'] }
    ],
    tasks: [
      task('tl-research', 'Research promotion ideas', 'doatWork', 'Marketing Doat', 'completed', 'Marketing', { start: -12, end: -9, due: -10 }),
      task('tl-review', 'Review campaign direction', 'humanWork', 'Chipo Zulu', 'completed', 'Marketing', { due: -7 }, ['tl-research']),
      { ...task('tl-content', 'Draft promotion content', 'doatWork', 'Marketing Doat', 'working', 'Marketing', { start: -6, due: 2 }, ['tl-review']), plannedStart: at(-7).slice(0, 10), plannedEnd: at(1).slice(0, 10) },
      { ...task('tl-visuals', 'Produce promotion visuals', 'doatWork', 'Marketing Doat', 'working', 'Marketing', { start: -5, due: 5 }, ['tl-review']), plannedStart: at(-5).slice(0, 10), plannedEnd: at(3).slice(0, 10) },
      task('tl-messages', 'Prepare customer messages', 'doatWork', 'Customer Support Doat', 'working', 'Marketing', { start: -4, due: 3 }, ['tl-review']),
      task('tl-approve', 'Approve final campaign', 'humanWork', 'Sarah Mwila', 'waiting', 'Marketing', { due: 4 }, ['tl-content']),
      task('tl-publish', 'Publish weekend promotion', 'doatWork', 'Marketing Doat', 'default', 'Marketing', { due: 8 }, ['tl-approve', 'tl-messages']),
      { ...task('tl-brief', 'Brief regional managers', 'humanWork', 'Chipo Zulu', 'working', 'Marketing', { start: -3, due: 2 }, ['tl-review']), plannedStart: at(-4).slice(0, 10), plannedEnd: at(1).slice(0, 10) },
      { ...task('tl-stock', 'Confirm regional stock levels', 'humanWork', 'David Tembo', 'working', 'Operations', { due: -3 }), plannedStart: at(-8).slice(0, 10), plannedEnd: at(-4).slice(0, 10) },
      task('tl-invoices', 'Reconcile supplier invoices', 'doatWork', 'Finance Doat', 'completed', 'Finance', { start: -10, end: -5, due: -5 }),
      { ...task('tl-signoff', 'Sign off month-end close', 'humanWork', 'Amara Banda', 'default', 'Finance', { due: 12 }, ['tl-invoices']), plannedStart: at(9).slice(0, 10), plannedEnd: at(11).slice(0, 10) },
      task('tl-staffing', 'Draft staffing plan', 'humanWork', 'Maya Chen', 'default', 'Operations', {}),
      task('tl-loyalty', 'Evaluate loyalty program options', 'doatWork', 'Research Doat', 'default', 'Operations', {})
    ],
    approvals: [{ id: 'tl-approval', taskId: 'tl-approve', title: 'Approve final campaign', subtitle: 'Waiting for approval', status: 'waiting', reviewerName: 'Sarah Mwila', resultId: 'result:tl-approval', createdAt: at(-1) }]
  };
}

/** Development-only stress fixture for measuring Timeline rendering. Never loaded outside a dev server. */
function largeTimelineFixture(now: Date): WorkGraphRecords {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 9).toISOString();
  const owners = Array.from({ length: 40 }, (_, index) => index % 3 === 0 ? `Doat ${index}` : `Person ${index}`);
  const count = 1600;
  const tasks = Array.from({ length: count }, (_, index) => {
    const owner = owners[index % owners.length];
    const start = (index * 7) % 120 - 60;
    const length = 2 + (index % 9);
    const base = work(`tl-large-${index}`, `Large dataset task ${index + 1}`, owner.startsWith('Doat') ? 'doatWork' : 'humanWork', owner, index % 5 === 0 ? 'completed' : 'working', index > 0 && index % 4 === 0 ? [`tl-large-${index - 1}`] : undefined);
    return { ...base, projectId: `project:${index % 12}`, projectName: `Project ${index % 12}`, startedAt: day(start), completedAt: index % 5 === 0 ? day(start + length) : undefined, dueDate: day(start + length + 1) };
  });
  return { objectives: Array.from({ length: 20 }, (_, index) => ({ id: `tl-large-objective-${index}`, title: `Dataset objective ${index + 1}`, taskIds: tasks.filter((_, taskIndex) => taskIndex % 20 === index).map((item) => item.id) })), tasks };
}
