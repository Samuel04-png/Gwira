import { describe, expect, it } from 'vitest';
import { ALL, NO_FILTERS } from '../../src/renderer/gwira/workfilters/workFilters.js';
import { buildList, resetListOptions, type ListOptions } from '../../src/renderer/gwira/list/listModel.js';
import type { WorkGraphRecords } from '../../src/renderer/gwira/graph/graphModel.js';

const today = new Date(2026, 9, 22, 12);
const base: WorkGraphRecords = {
  tasks: [
    { id: 'human', title: 'Human task', status: 'working', ownerKind: 'person', ownerId: 'p-1', ownerName: 'Ada', priority: 'high', projectId: 'project-1', projectName: 'Launch', dueDate: '2026-10-30', plannedStart: '2026-10-24', plannedEnd: '2026-10-29' },
    { id: 'doat', title: 'Doat task', status: 'working', ownerKind: 'doat', ownerId: 'd-1', ownerName: 'Scout', priority: 'low', projectId: 'project-1', projectName: 'Launch', runStatus: 'running', doatRunId: 'run-real-1', startedAt: '2026-10-20T09:00:00.000Z' },
    { id: 'blocked', title: 'Blocked task', status: 'blocked', ownerKind: 'person', ownerId: 'p-2', ownerName: 'Bea', priority: 'medium', dueDate: '2026-10-19' },
    { id: 'failed', title: 'Failed task', status: 'failed', ownerKind: 'doat', ownerId: 'd-1', ownerName: 'Scout', runStatus: 'error', doatRunId: 'run-real-2' },
    { id: 'stopped', title: 'Stopped run', status: 'blocked', ownerKind: 'doat', ownerId: 'd-1', ownerName: 'Scout', runStatus: 'stopped' },
    { id: 'approval', title: 'Approval task', status: 'waiting', ownerKind: 'person', ownerId: 'p-1', ownerName: 'Ada' },
    { id: 'waiting', title: 'Dependent task', status: 'working', ownerKind: 'person', ownerId: 'p-1', ownerName: 'Ada', dependsOnTaskIds: ['blocked', 'removed-task'] },
    { id: 'done-overdue', title: 'Completed overdue', status: 'completed', ownerKind: 'person', ownerName: 'Bea', dueDate: '2026-10-19' },
    { id: 'invalid', title: 'Invalid references', status: 'nonsense' as never, ownerKind: 'person', ownerId: 'deleted-person', ownerName: 'Unknown person', projectId: 'deleted-project' }
  ],
  approvals: [
    { id: 'approval-1', title: 'Approve', taskId: 'approval', status: 'waiting' },
    { id: 'approval-old', title: 'Done', taskId: 'human', status: 'completed' }
  ]
};

const options = (patch: Partial<ListOptions> = {}): ListOptions => ({ ...resetListOptions(), today, ...patch });
const model = (records: WorkGraphRecords = base, patch: Partial<ListOptions> = {}) => buildList(records, options(patch));

describe('List projection', () => {
  it('defaults to ungrouped tasks and sorts by title without changing the source', () => {
    const before = structuredClone(base);
    const result = model();
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.id).toBe('all');
    expect(result.tasks.map((task) => task.title)).toEqual([...result.tasks.map((task) => task.title)].sort((a, b) => a.localeCompare(b)));
    expect(base).toEqual(before);
  });

  it('groups by status, owner (keeping person and Doat distinct), or project', () => {
    const byStatus = model(base, { groupBy: 'status' });
    expect(byStatus.groups.map((group) => group.label)).toContain('Not started');
    expect(byStatus.groups.map((group) => group.label)).toContain('Failed');
    const byOwner = model(base, { groupBy: 'owner' });
    expect(byOwner.groups.find((group) => group.label === 'Ada')?.tasks.map((task) => task.id)).toEqual(expect.arrayContaining(['human', 'approval', 'waiting']));
    expect(byOwner.groups.find((group) => group.label === 'Scout')?.tasks.map((task) => task.id)).toEqual(expect.arrayContaining(['doat', 'failed', 'stopped']));
    const byProject = model(base, { groupBy: 'project' });
    expect(byProject.groups.map((group) => group.label)).toEqual(expect.arrayContaining(['Launch', 'No project', 'Unavailable project']));
  });

  it('sorts dates with missing values last and ranks priority by urgency', () => {
    const due = model(base, { sortBy: 'dueDate' });
    expect(due.tasks[0]?.id).toBe('blocked');
    expect(due.tasks.slice(-6).every((task) => !task.dueDate)).toBe(true);
    expect(due.tasks.at(-1)?.title).toBe('Stopped run');
    const priorities = model(base, { sortBy: 'priority' });
    expect(priorities.tasks.filter((task) => task.priority).map((task) => task.priority)).toEqual(['high', 'medium', 'low']);
    expect(priorities.tasks.find((task) => task.id === 'doat')?.priority).toBe('low');
  });

  it('combines search and shared filters, and counts only hidden actionable attention', () => {
    const result = model(base, { search: 'task', filters: { ...NO_FILTERS, owner: 'p-1' } });
    expect(result.tasks.map((task) => task.id)).toEqual(expect.arrayContaining(['human', 'approval', 'waiting']));
    expect(result.tasks.some((task) => task.id === 'doat')).toBe(false);
    expect(result.hiddenAttention).toBeGreaterThan(0);
    expect(model(base, { search: 'no matching words' }).shown).toBe(0);
    expect(model(base, { filters: { ...NO_FILTERS, status: 'missing' } }).shown).toBe(0);
    expect(ALL).toBe('all');
  });
});

describe('Needs Attention and references', () => {
  const byId = (id: string) => model().tasks.find((task) => task.id === id)!;

  it('preserves project, planned dates and recorded execution dates without manufacturing values', () => {
    expect(byId('human')).toMatchObject({ projectName: 'Launch', plannedStart: '2026-10-24', plannedEnd: '2026-10-29' });
    expect(byId('doat')).toMatchObject({ projectName: 'Launch', startedAt: '2026-10-20T09:00:00.000Z', runStatus: 'running' });
    expect(byId('approval').plannedStart).toBeUndefined();
    expect(byId('approval').startedAt).toBeUndefined();
  });

  it('distinguishes blocked, failed, stopped run, pending approval and overdue reasons', () => {
    expect(byId('blocked').attention.map((reason) => reason.kind)).toEqual(['blocked', 'overdue']);
    expect(byId('failed').attention.map((reason) => reason.kind)).toEqual(['failed']);
    expect(byId('stopped').attention.map((reason) => reason.kind)).toEqual(['run-stopped']);
    expect(byId('approval').attention.map((reason) => reason.kind)).toEqual(['approval']);
    expect(byId('approval').attention[0]?.explanation).toMatch(/waiting for a decision/i);
  });

  it('keeps normal dependency waiting neutral and never turns an unresolved id into a dependency link', () => {
    expect(byId('waiting').dependenciesWaiting).toBe(1);
    expect(byId('waiting').unavailableDependencies).toBe(1);
    expect(byId('waiting').attention).toEqual([]);
    expect(JSON.stringify(byId('waiting'))).not.toContain('removed-task');
  });

  it('does not flag completed overdue work and does not invent a Doat run for a person', () => {
    expect(byId('done-overdue').attention).toEqual([]);
    const personWithUntrustedRun = model({ tasks: [{ id: 'p', title: 'Human', ownerKind: 'person', ownerName: 'Ada', status: 'working', runStatus: 'error' }] });
    expect(personWithUntrustedRun.tasks[0]?.runStatus).toBeUndefined();
    expect(personWithUntrustedRun.tasks[0]?.attention).toEqual([]);
  });

  it('repairs invalid status and hides missing owner/project identifiers', () => {
    const task = byId('invalid');
    expect(task.status).toBe('default');
    expect(task.ownerName).toBe('Unavailable owner');
    expect(task.projectName).toBe('Unavailable project');
    expect(task.ownerId).toBeUndefined();
    expect(task.projectId).toBeUndefined();
    expect(JSON.stringify(task)).not.toContain('deleted-');
  });

  it('returns useful attention explanations for inspection', () => {
    const result = model().tasks.find((task) => task.id === 'blocked')!;
    expect(result.attention.map(({ label, explanation }) => `${label}: ${explanation}`).join(' ')).toContain('The recorded due date was 2026-10-19');
  });
});

function largeWorkspace(): WorkGraphRecords {
  return {
    tasks: Array.from({ length: 1600 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${String(index).padStart(4, '0')}`,
      status: index % 4 === 0 ? 'blocked' as const : index % 2 ? 'working' as const : 'default' as const,
      ownerKind: index % 3 === 0 ? 'doat' as const : 'person' as const,
      ownerId: `owner-${index % 12}`,
      ownerName: `Owner ${index % 12}`,
      projectId: `project-${index % 7}`,
      projectName: `Project ${index % 7}`,
      priority: ['low', 'medium', 'high', 'urgent'][index % 4],
      dueDate: index % 5 ? `2026-11-${String(index % 28 + 1).padStart(2, '0')}` : undefined
    }))
  };
}

describe('List performance', () => {
  const options: ListOptions = { ...resetListOptions(), groupBy: 'owner', sortBy: 'dueDate', filters: NO_FILTERS, search: 'task', today };

  it('projects, filters, sorts, groups and counts a 1,600-task workspace correctly', () => {
    const result = buildList(largeWorkspace(), options);
    expect(result.total).toBe(1600);
    expect(result.shown).toBe(1600);
    expect(result.groups).toHaveLength(12);
  });

  it('keeps cold and warm 1,600-task projections under one second', () => {
    const records = largeWorkspace();
    const samples: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const start = performance.now();
      buildList(records, options);
      samples.push(performance.now() - start);
    }
    const cold = samples[0]!;
    const warm = samples.slice(1).sort((a, b) => a - b);
    const median = (warm[2]! + warm[3]!) / 2;
    const worst = Math.max(...samples);
    console.log(`List 1,600-task model: cold ${cold.toFixed(1)} ms, warm median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
    expect(worst).toBeLessThan(1000);
  }, 15000);
});

describe('Professional list criteria',()=>{
 it('filters worker type, priority, attention and dates without manufacturing values',()=>{
  const criteria={priority:'all',due:'all',attention:'all',kind:'doat'} as const;
  expect(model(base,{criteria}).tasks.every(t=>t.ownerKind==='doat')).toBe(true);
  expect(model(base,{criteria:{...criteria,kind:'all',priority:'high'}}).tasks.map(t=>t.id)).toEqual(['human']);
  expect(model(base,{criteria:{...criteria,kind:'all',due:'overdue'}}).tasks.map(t=>t.id)).toEqual(['blocked']);
  expect(model(base,{criteria:{...criteria,kind:'all',attention:'needs-attention'}}).tasks.every(t=>t.attention.length)).toBe(true);
 });
 it('searches explicit recorded execution references',()=>{
  expect(model(base,{search:'run-real-1'}).tasks.map(t=>t.id)).toEqual(['doat']);
 });
 it('groups missing priority quietly and counts attention per group',()=>{
  const result=model(base,{groupBy:'priority'});
  expect(result.groups.some(g=>g.label==='No priority')).toBe(true);
  expect(result.groups.every(g=>g.attentionCount===g.tasks.filter(t=>t.attention.length).length)).toBe(true);
 });
});
