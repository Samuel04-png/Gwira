import type { TaskRecord, WorkGraphRecords, WorkGraphStatus } from '../graph/graphModel.js';
import { ALL, matchesWorkFilters, ownerFilterKey, type FilterableWork, type FilterOptions, type WorkFilters } from './workFilters.js';

export type WorkAttentionKind = 'failed' | 'blocked' | 'run-stopped' | 'approval' | 'overdue';

export interface WorkItem extends FilterableWork {
  id: string;
  title: string;
  status: WorkGraphStatus;
  description?: string;
  statusLabel: string;
  projectName?: string;
  priority?: string;
  dueDate?: string;
  plannedStart?: string;
  plannedEnd?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  runStatus?: string;
  runId?: string;
  avatar?: TaskRecord['avatar'];
  dependenciesWaiting: number;
  unavailableDependencies: number;
  attention: Array<{ kind: WorkAttentionKind; label: string; explanation: string }>;
}

export interface WorkProjection {
  items: WorkItem[];
  options: FilterOptions;
}

export interface FilteredWork {
  tasks: WorkItem[];
  total: number;
  shown: number;
  hiddenAttention: number;
}

export const WORK_STATUS_LABELS: Record<WorkGraphStatus, string> = {
  default: 'Not started',
  working: 'Working',
  waiting: 'Waiting for review',
  blocked: 'Blocked',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused'
};

const STATUS_ORDER: WorkGraphStatus[] = ['default', 'working', 'waiting', 'blocked', 'failed', 'paused', 'completed'];
const ATTENTION_ORDER: WorkAttentionKind[] = ['failed', 'blocked', 'run-stopped', 'approval', 'overdue'];
const TEXT_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validStatus(value: unknown): WorkGraphStatus {
  return typeof value === 'string' && Object.hasOwn(WORK_STATUS_LABELS, value) ? value as WorkGraphStatus : 'default';
}

function validOwnerKind(value: unknown): FilterableWork['ownerKind'] {
  return value === 'person' || value === 'doat' ? value : 'unassigned';
}

function taskAttention(task: TaskRecord, hasPendingApproval: boolean, today: string): WorkItem['attention'] {
  const status = validStatus(task.status);
  const runStatus = task.ownerKind === 'doat' ? task.runStatus?.toLowerCase() : undefined;
  const reasons: WorkItem['attention'] = [];
  if (status === 'failed' || runStatus === 'error') {
    reasons.push({ kind: 'failed', label: 'Failed', explanation: runStatus === 'error' ? 'The recorded Doat run failed.' : 'This task is recorded as failed.' });
  }
  if (status === 'blocked' && runStatus !== 'stopped') {
    reasons.push({ kind: 'blocked', label: 'Blocked', explanation: 'This task is recorded as blocked.' });
  }
  if (runStatus === 'stopped') {
    reasons.push({ kind: 'run-stopped', label: 'Run stopped', explanation: 'The recorded Doat run was stopped.' });
  }
  if (hasPendingApproval) reasons.push({ kind: 'approval', label: 'Approval pending', explanation: 'A recorded approval request is waiting for a decision.' });
  if (task.dueDate && task.dueDate.slice(0, 10) < today && status !== 'completed') {
    reasons.push({ kind: 'overdue', label: 'Overdue', explanation: `The recorded due date was ${task.dueDate.slice(0, 10)}.` });
  }
  return reasons.sort((left, right) => ATTENTION_ORDER.indexOf(left.kind) - ATTENTION_ORDER.indexOf(right.kind));
}

function compareText(left: string, right: string): number {
  return TEXT_COLLATOR.compare(left, right);
}

function searchText(item: WorkItem): string {
  return [item.title, item.description, item.statusLabel, item.ownerName, item.projectName, item.priority, item.dueDate, item.runStatus]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

/** Creates a view-neutral, reference-sanitized projection without mutating source records. */
export function buildWorkItems(records: WorkGraphRecords, options: { today?: Date } = {}): WorkProjection {
  const sourceTasks = records.tasks ?? [];
  const today = localDay(options.today ?? new Date());
  const ids = new Set(sourceTasks.map((task) => task.id));
  const tasksById = new Map(sourceTasks.map((task) => [task.id, task]));
  const pendingApprovalTaskIds = new Set((records.approvals ?? []).flatMap((approval) => approval.status === 'waiting' && approval.taskId ? [approval.taskId] : []));
  const statuses = new Map<WorkGraphStatus, string>();
  const owners = new Map<string, string>();
  const projects = new Map<string, string>();

  const items: WorkItem[] = sourceTasks.map((task) => {
    const status = validStatus(task.status);
    const ownerKind = validOwnerKind(task.ownerKind);
    const hasOwnerName = Boolean(task.ownerName && !/^Unknown (person|Doat)$/i.test(task.ownerName));
    const ownerName = hasOwnerName ? task.ownerName! : task.ownerId ? 'Unavailable owner' : 'Unassigned';
    const ownerId = hasOwnerName ? task.ownerId : undefined;
    const projectId = task.projectId && task.projectName ? task.projectId : undefined;
    const projectName = task.projectId ? task.projectName ?? 'Unavailable project' : undefined;
    statuses.set(status, WORK_STATUS_LABELS[status]);
    owners.set(ownerFilterKey({ ownerId, ownerKind, ownerName }), ownerName);
    if (projectId) projects.set(projectId, task.projectName!);
    const dependencies = task.dependsOnTaskIds ?? [];

    return {
      id: task.id,
      title: task.title,
      description: task.description ?? task.subtitle,
      status,
      statusLabel: WORK_STATUS_LABELS[status],
      ownerId,
      ownerKind,
      ownerName,
      projectId,
      projectName,
      priority: task.priority,
      dueDate: task.dueDate,
      plannedStart: task.plannedStart,
      plannedEnd: task.plannedEnd,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      updatedAt: task.updatedAt,
      runStatus: ownerKind === 'doat' ? task.runStatus : undefined,
      runId: ownerKind === 'doat' ? task.doatRunId : undefined,
      avatar: task.avatar,
      dependenciesWaiting: dependencies.filter((id) => {
        const predecessor = tasksById.get(id);
        return predecessor && validStatus(predecessor.status) !== 'completed';
      }).length,
      unavailableDependencies: dependencies.filter((id) => !ids.has(id)).length,
      attention: taskAttention(task, pendingApprovalTaskIds.has(task.id), today)
    };
  });

  return {
    items,
    options: {
      statuses: [...statuses].map(([id, label]) => ({ id, label })).sort((a, b) => STATUS_ORDER.indexOf(a.id) - STATUS_ORDER.indexOf(b.id)),
      owners: [...owners].map(([id, label]) => ({ id, label })).sort((a, b) => compareText(a.label, b.label)),
      projects: [...projects].map(([id, label]) => ({ id, label })).sort((a, b) => compareText(a.label, b.label))
    }
  };
}

/** Applies shared filters and search, while counting attention still hidden by either. */
export function filterWorkItems(items: readonly WorkItem[], options: { filters: WorkFilters; search?: string }): FilteredWork {
  const query = (options.search ?? '').trim().toLocaleLowerCase();
  const matched = items.filter((item) => matchesWorkFilters(item, options.filters) && (!query || searchText(item).includes(query)));
  const matchedIds = new Set(matched.map((item) => item.id));
  return {
    tasks: matched,
    total: items.length,
    shown: matched.length,
    hiddenAttention: items.filter((item) => item.attention.length > 0 && !matchedIds.has(item.id)).length
  };
}

export function allWorkFilters(): WorkFilters {
  return { status: ALL, owner: ALL, project: ALL };
}
