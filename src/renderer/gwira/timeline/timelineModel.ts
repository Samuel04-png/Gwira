import type { DoatAvatarSpec } from '../doats/ui/types.js';
import type { TaskRecord, WorkGraphRecords, WorkGraphStatus, WorkOwnerKind } from '../graph/graphModel.js';

export type TimelineZoom = 'day' | 'week' | 'month';
export type TimelineGroupBy = 'none' | 'objective' | 'owner' | 'project';
export interface TimelineFilters { status: string; owner: string; project: string }
export const ALL = 'all';
export const NO_FILTERS: TimelineFilters = { status: ALL, owner: ALL, project: ALL };

const DAY_MS = 86_400_000;

/** Whole days since the epoch for a calendar date, independent of time zone and DST. */
export function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month, day) / DAY_MS);
}

export function dayOfDate(date: Date): number {
  return dayNumber(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Date-only values are calendar days; full timestamps are placed on the viewer's local day. */
export function parseDay(value?: string): number | undefined {
  if (!value) return undefined;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return dayNumber(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : dayOfDate(parsed);
}

export function dayDate(day: number): Date { return new Date(day * DAY_MS); }

export function formatDay(day: number, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(dayDate(day));
}

/** Monday on or before the day. */
export function startOfWeek(day: number): number {
  const weekday = dayDate(day).getUTCDay();
  return day - ((weekday + 6) % 7);
}

export function startOfMonth(day: number): number {
  const date = dayDate(day);
  return dayNumber(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export interface TimelineMilestone {
  kind: 'approval-pending' | 'approval-approved' | 'approval-changes';
  day: number;
  label: string;
}

export interface TimelineTask {
  id: string;
  title: string;
  ownerKind: WorkOwnerKind;
  ownerId?: string;
  ownerName: string;
  avatar?: DoatAvatarSpec;
  status: WorkGraphStatus;
  statusLabel: string;
  projectId?: string;
  projectName?: string;
  /** Recorded run span. Absent when the task has no recorded start. */
  start?: number;
  end?: number;
  running: boolean;
  deadline?: number;
  overdue: boolean;
  /** Optional plan window, separate from the due date and from the recorded run. */
  plannedStart?: number;
  plannedEnd?: number;
  /** How a finished run compared with the due date. Absent while work is open or undated. */
  delivery?: { kind: 'early' | 'on-time' | 'late'; days: number };
  milestones: TimelineMilestone[];
  dependsOn: Array<{ id: string; title: string }>;
  scheduled: boolean;
  sortDay?: number;
}

export interface OccupancySegment { start: number; end: number; count: number }
export interface TimelineGroup {
  id: string;
  label: string;
  tasks: TimelineTask[];
  /** Days when recorded runs overlap. Present only for owner groups. */
  occupancy?: { segments: OccupancySegment[]; peak: number };
}

export interface TimelineModel {
  groups: TimelineGroup[];
  unscheduled: TimelineTask[];
  total: number;
  shown: number;
  /** Tasks hidden by the active filters that still need attention: overdue, waiting, blocked or failed. */
  hiddenAttention: number;
  firstDay?: number;
  lastDay?: number;
  owners: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; label: string }>;
  statuses: Array<{ id: WorkGraphStatus; label: string }>;
  canGroupByObjective: boolean;
  canGroupByProject: boolean;
}

export const STATUS_LABELS: Record<WorkGraphStatus, string> = {
  default: 'Not started', working: 'In progress', waiting: 'Waiting for review', blocked: 'Blocked', completed: 'Done', failed: 'Failed', paused: 'Paused'
};

export function ownerKey(task: TimelineTask): string { return task.ownerId ?? `${task.ownerKind}:${task.ownerName}`; }

function toTimelineTask(task: TaskRecord, records: WorkGraphRecords, today: number, titles: Map<string, string>): TimelineTask {
  const status = task.status ?? 'default';
  const start = parseDay(task.startedAt);
  const completed = parseDay(task.completedAt);
  const running = start !== undefined && completed === undefined && status === 'working';
  const end = start === undefined ? undefined : Math.max(start, completed ?? (running ? today : start));
  const deadline = parseDay(task.dueDate);
  const plannedFrom = parseDay(task.plannedStart);
  const plannedTo = parseDay(task.plannedEnd);
  const plan = plannedFrom !== undefined && plannedTo !== undefined && plannedTo >= plannedFrom ? { plannedStart: plannedFrom, plannedEnd: plannedTo } : {};
  const finished = status === 'completed' && end !== undefined && completed !== undefined;
  const delivery = finished && deadline !== undefined ? { kind: end > deadline ? 'late' as const : end < deadline ? 'early' as const : 'on-time' as const, days: Math.abs(end - deadline) } : undefined;
  const milestones: TimelineMilestone[] = (records.approvals ?? []).filter((approval) => approval.taskId === task.id).flatMap((approval): TimelineMilestone[] => {
    const requested = parseDay(approval.createdAt);
    const decided = parseDay(approval.decidedAt);
    if (approval.status === 'waiting') return requested === undefined ? [] : [{ kind: 'approval-pending', day: requested, label: 'Approval requested' }];
    const day = decided ?? requested;
    if (day === undefined) return [];
    return [approval.status === 'completed' ? { kind: 'approval-approved', day, label: 'Approved' } : { kind: 'approval-changes', day, label: 'Changes requested' }];
  });
  const scheduled = start !== undefined || deadline !== undefined || milestones.length > 0 || plan.plannedStart !== undefined;
  const days = [start, end, deadline, plan.plannedStart, plan.plannedEnd, ...milestones.map((milestone) => milestone.day)].filter((day): day is number => day !== undefined);
  return {
    id: task.id,
    title: task.title,
    ownerKind: task.ownerKind ?? 'unassigned',
    ownerId: task.ownerId,
    ownerName: task.ownerName ?? 'Unassigned',
    avatar: task.avatar,
    status,
    statusLabel: STATUS_LABELS[status],
    projectId: task.projectId,
    projectName: task.projectName,
    start, end, running, deadline, delivery, ...plan,
    overdue: deadline !== undefined && deadline < today && status !== 'completed',
    milestones,
    dependsOn: (task.dependsOnTaskIds ?? []).filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id) ?? id })),
    scheduled,
    sortDay: days.length ? Math.min(...days) : undefined
  };
}

function bySchedule(left: TimelineTask, right: TimelineTask): number {
  return (left.sortDay ?? Infinity) - (right.sortDay ?? Infinity) || left.title.localeCompare(right.title);
}

export function matchesFilters(task: TimelineTask, filters: TimelineFilters): boolean {
  return (filters.status === ALL || task.status === filters.status)
    && (filters.owner === ALL || ownerKey(task) === filters.owner)
    && (filters.project === ALL || task.projectId === filters.project);
}

/** Projects recorded work onto a calendar without inventing dates, durations or links. */
export function buildTimeline(records: WorkGraphRecords, options: { today: number; groupBy: TimelineGroupBy; filters: TimelineFilters }): TimelineModel {
  const titles = new Map((records.tasks ?? []).map((task) => [task.id, task.title]));
  const all = (records.tasks ?? []).map((task) => toTimelineTask(task, records, options.today, titles));
  const shownTasks = all.filter((task) => matchesFilters(task, options.filters));
  const scheduled = shownTasks.filter((task) => task.scheduled).sort(bySchedule);
  const unscheduled = shownTasks.filter((task) => !task.scheduled).sort(bySchedule);

  const owners = new Map<string, string>();
  const projects = new Map<string, string>();
  const statuses = new Map<WorkGraphStatus, string>();
  for (const task of all) {
    owners.set(ownerKey(task), task.ownerName);
    if (task.projectId) projects.set(task.projectId, task.projectName ?? 'Unknown project');
    statuses.set(task.status, task.statusLabel);
  }

  const objectives = records.objectives ?? [];
  const canGroupByObjective = objectives.some((objective) => (objective.taskIds ?? []).length > 0);
  const canGroupByProject = projects.size > 0;
  const groupBy = options.groupBy === 'objective' && !canGroupByObjective ? 'none' : options.groupBy === 'project' && !canGroupByProject ? 'none' : options.groupBy;

  const groups: TimelineGroup[] = [];
  const addTo = (id: string, label: string, task: TimelineTask): void => {
    const group = groups.find((entry) => entry.id === id);
    if (group) group.tasks.push(task); else groups.push({ id, label, tasks: [task] });
  };
  for (const task of scheduled) {
    if (groupBy === 'objective') {
      const objective = objectives.find((entry) => entry.taskIds?.includes(task.id));
      addTo(objective ? `objective:${objective.id}` : 'objective:none', objective?.title ?? 'No objective', task);
    } else if (groupBy === 'owner') addTo(`owner:${ownerKey(task)}`, `${task.ownerName}${task.ownerKind === 'doat' ? ' · Doat' : ''}`, task);
    else if (groupBy === 'project') addTo(task.projectId ? `project:${task.projectId}` : 'project:none', task.projectName ?? 'No project', task);
    else addTo('all', 'Scheduled', task);
  }
  if (groupBy === 'owner') for (const group of groups) group.occupancy = occupancy(group.tasks);
  if (groupBy !== 'none') groups.sort((left, right) => (left.id.endsWith(':none') ? 1 : 0) - (right.id.endsWith(':none') ? 1 : 0));

  const days = scheduled.flatMap((task) => [task.start, task.end, task.deadline, task.plannedStart, task.plannedEnd, ...task.milestones.map((milestone) => milestone.day)]).filter((day): day is number => day !== undefined);
  return {
    groups, unscheduled, total: all.length, shown: shownTasks.length,
    hiddenAttention: all.filter((task) => !matchesFilters(task, options.filters) && (task.overdue || task.status === 'waiting' || task.status === 'blocked' || task.status === 'failed')).length,
    firstDay: days.length ? Math.min(...days) : undefined,
    lastDay: days.length ? Math.max(...days) : undefined,
    owners: [...owners].map(([id, label]) => ({ id, label })).sort((left, right) => left.label.localeCompare(right.label)),
    projects: [...projects].map(([id, label]) => ({ id, label })).sort((left, right) => left.label.localeCompare(right.label)),
    statuses: [...statuses].map(([id, label]) => ({ id, label })),
    canGroupByObjective, canGroupByProject
  };
}

export const ZOOM_PX_PER_DAY: Record<TimelineZoom, number> = { day: 40, week: 14, month: 4.5 };
const ZOOM_PADDING_DAYS: Record<TimelineZoom, number> = { day: 21, week: 84, month: 240 };
const MAX_RANGE_DAYS = 1500;

export interface TimelineRange { start: number; end: number; days: number; pxPerDay: number }

export function timelineRange(zoom: TimelineZoom, today: number, firstDay?: number, lastDay?: number): TimelineRange {
  const pad = ZOOM_PADDING_DAYS[zoom];
  let start = Math.min(today - pad, (firstDay ?? today) - 7);
  let end = Math.max(today + pad, (lastDay ?? today) + 7);
  if (zoom === 'month') start = startOfMonth(start); else if (zoom === 'week') start = startOfWeek(start);
  if (end - start > MAX_RANGE_DAYS) end = start + MAX_RANGE_DAYS;
  return { start, end, days: end - start + 1, pxPerDay: ZOOM_PX_PER_DAY[zoom] };
}

export interface TimelineTick { label: string; sub?: string; start: number; span: number; weekend?: boolean; today?: boolean }

export function timelineTicks(range: TimelineRange, zoom: TimelineZoom, today: number): { upper: TimelineTick[]; lower: TimelineTick[] } {
  const upper: TimelineTick[] = [];
  const lower: TimelineTick[] = [];
  const upperKey = (day: number): string => zoom === 'month' ? formatDay(day, { year: 'numeric' }) : formatDay(day, { month: 'long', year: 'numeric' });
  for (let day = range.start; day <= range.end; day += 1) {
    const key = upperKey(day);
    const last = upper[upper.length - 1];
    if (last && last.label === key) last.span += 1; else upper.push({ label: key, start: day, span: 1 });
  }
  if (zoom === 'day') {
    for (let day = range.start; day <= range.end; day += 1) lower.push({ label: formatDay(day, { day: 'numeric' }), sub: formatDay(day, { weekday: 'narrow' }), start: day, span: 1, weekend: [0, 6].includes(dayDate(day).getUTCDay()), today: day === today });
  } else if (zoom === 'week') {
    for (let day = range.start; day <= range.end; day += 7) lower.push({ label: formatDay(day, { month: 'short', day: 'numeric' }), start: day, span: Math.min(7, range.end - day + 1), today: today >= day && today < day + 7 });
  } else {
    for (let day = range.start; day <= range.end;) {
      const next = startOfMonth(day + 32);
      lower.push({ label: formatDay(day, { month: 'short' }), start: day, span: Math.min(next, range.end + 1) - day, today: today >= day && today < next });
      day = next;
    }
  }
  return { upper, lower };
}

export function describeTask(task: TimelineTask): string {
  const range = (from: number, to: number): string => from === to ? formatDay(from, { month: 'short', day: 'numeric' }) : `${formatDay(from, { month: 'short', day: 'numeric' })} – ${formatDay(to, { month: 'short', day: 'numeric' })}`;
  const lines = [task.title, `${task.ownerName}${task.ownerKind === 'doat' ? ' (Doat)' : task.ownerKind === 'person' ? ' (Person)' : ''} · ${task.statusLabel}`];
  if (task.start !== undefined && task.end !== undefined) lines.push(`Run: ${range(task.start, task.end)}${task.running ? ' (in progress)' : ''}`);
  if (task.plannedStart !== undefined && task.plannedEnd !== undefined) lines.push(`Planned: ${range(task.plannedStart, task.plannedEnd)}`);
  if (task.deadline !== undefined) lines.push(`Due ${formatDay(task.deadline, { month: 'short', day: 'numeric', year: 'numeric' })}${task.overdue ? ' · Overdue' : ''}`);
  if (task.delivery) lines.push(task.delivery.kind === 'on-time' ? 'Finished on the due date' : `Finished ${task.delivery.days} day${task.delivery.days === 1 ? '' : 's'} ${task.delivery.kind === 'late' ? 'after' : 'before'} the due date`);
  for (const milestone of task.milestones) lines.push(`${milestone.label} ${formatDay(milestone.day, { month: 'short', day: 'numeric' })}`);
  if (task.dependsOn.length) lines.push(`Waits for: ${task.dependsOn.map((dependency) => dependency.title).join(', ')}`);
  if (!task.scheduled) lines.push('No dates recorded');
  return lines.join('\n');
}

export const ROW_HEIGHT = 32;
export const NAME_WIDTH = { min: 160, max: 560, initial: 280 };

export function clampNameWidth(value: number): number {
  if (!Number.isFinite(value)) return NAME_WIDTH.initial;
  return Math.min(NAME_WIDTH.max, Math.max(NAME_WIDTH.min, Math.round(value)));
}

/**
 * The day to scroll to when none of the recorded work is inside the visible window.
 * Returns undefined when work is visible or there is no dated work.
 */
export function returnTarget(visible: { first: number; last: number }, data: { first?: number; last?: number }): number | undefined {
  if (data.first === undefined || data.last === undefined) return undefined;
  if (visible.last < data.first) return data.first;
  if (visible.first > data.last) return data.last;
  return undefined;
}

export type TimelineRow =
  | { kind: 'group'; key: string; group: TimelineGroup; collapsed: boolean }
  | { kind: 'task'; key: string; task: TimelineTask }
  | { kind: 'unscheduled'; key: string; count: number; collapsed: boolean }
  | { kind: 'notice'; key: string; text: string };

/** Flattens the model into the visible, ordered rows so layout, keyboard focus and links share one source. */
export function buildRows(model: TimelineModel, grouped: boolean, collapsed: readonly string[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const scheduledCount = model.groups.reduce((total, group) => total + group.tasks.length, 0);
  if (scheduledCount === 0 && model.unscheduled.length > 0) {
    rows.push({ kind: 'notice', key: 'notice', text: 'No task has a recorded date yet. Work appears on the timeline once it has a due date, a recorded run or an approval.' });
  }
  for (const group of model.groups) {
    const isCollapsed = grouped && collapsed.includes(group.id);
    if (grouped) rows.push({ kind: 'group', key: group.id, group, collapsed: isCollapsed });
    if (!isCollapsed) for (const task of group.tasks) rows.push({ kind: 'task', key: task.id, task });
  }
  if (model.unscheduled.length) {
    const isCollapsed = collapsed.includes('unscheduled');
    rows.push({ kind: 'unscheduled', key: 'unscheduled', count: model.unscheduled.length, collapsed: isCollapsed });
    if (!isCollapsed) for (const task of model.unscheduled) rows.push({ kind: 'task', key: task.id, task });
  }
  return rows;
}

/** The day at the middle of the visible date area for a horizontal scroll offset. */
export function centerDay(scrollLeft: number, visiblePx: number, range: Pick<TimelineRange, 'start' | 'pxPerDay'>): number {
  return range.start + (scrollLeft + visiblePx / 2) / range.pxPerDay;
}

/** Scroll offset that puts a day at the middle of the visible date area. */
export function scrollForCenter(day: number, visiblePx: number, range: Pick<TimelineRange, 'start' | 'pxPerDay'>): number {
  return Math.max(0, (day - range.start) * range.pxPerDay - visiblePx / 2);
}

/** Overlap of recorded runs. Planned windows and due dates are not counted as work in progress. */
export function occupancy(tasks: readonly TimelineTask[]): { segments: OccupancySegment[]; peak: number } {
  const changes = new Map<number, number>();
  for (const task of tasks) {
    if (task.start === undefined || task.end === undefined) continue;
    changes.set(task.start, (changes.get(task.start) ?? 0) + 1);
    changes.set(task.end + 1, (changes.get(task.end + 1) ?? 0) - 1);
  }
  const days = [...changes.keys()].sort((left, right) => left - right);
  const segments: OccupancySegment[] = [];
  let count = 0;
  let peak = 0;
  days.forEach((day, index) => {
    count += changes.get(day) ?? 0;
    peak = Math.max(peak, count);
    const next = days[index + 1];
    if (count <= 0 || next === undefined) return;
    const last = segments[segments.length - 1];
    if (last && last.count === count && last.end + 1 === day) last.end = next - 1; else segments.push({ start: day, end: next - 1, count });
  });
  return { segments, peak };
}

interface Anchor { /** True only for a recorded or planned date; due dates and open runs are never firm. */ firm: boolean; /** Horizontal position in days, fractional: bars use their edges, points use the day centre. */ pos: number; day: number; point: boolean }

function finishAnchor(task: TimelineTask): Anchor | undefined {
  if (task.end !== undefined) return { pos: task.end + 1, day: task.end, point: false, firm: !task.running };
  if (task.plannedEnd !== undefined) return { pos: task.plannedEnd + 1, day: task.plannedEnd, point: false, firm: true };
  if (task.deadline !== undefined) return { pos: task.deadline + 0.5, day: task.deadline, point: true, firm: false };
  const last = task.milestones.reduce<number | undefined>((latest, milestone) => latest === undefined ? milestone.day : Math.max(latest, milestone.day), undefined);
  return last === undefined ? undefined : { pos: last + 0.5, day: last, point: true, firm: false };
}

function startAnchor(task: TimelineTask): Anchor | undefined {
  if (task.start !== undefined) return { pos: task.start, day: task.start, point: false, firm: true };
  if (task.plannedStart !== undefined) return { pos: task.plannedStart, day: task.plannedStart, point: false, firm: true };
  const first = [task.deadline, ...task.milestones.map((milestone) => milestone.day)].filter((day): day is number => day !== undefined);
  return first.length ? { pos: Math.min(...first) + 0.5, day: Math.min(...first), point: true, firm: false } : undefined;
}

export interface TimelineLink {
  id: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  /** Anchors are the recorded dates the arrow connects; nothing is estimated. */
  from: Anchor;
  to: Anchor;
  state: 'ordered' | 'conflict';
}
export interface UndrawnLink { fromId: string; toId: string; reason: 'hidden' | 'undated' }

/**
 * Turns recorded dependsOn references into drawable links. A link is drawn only when both
 * tasks are present and have a recorded date. Nothing is inferred from dates.
 */
export function buildLinks(tasks: readonly TimelineTask[]): { links: TimelineLink[]; undrawn: UndrawnLink[] } {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const links: TimelineLink[] = [];
  const undrawn: UndrawnLink[] = [];
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (dependency.id === task.id) continue;
      const predecessor = byId.get(dependency.id);
      if (!predecessor) { undrawn.push({ fromId: dependency.id, toId: task.id, reason: 'hidden' }); continue; }
      const from = finishAnchor(predecessor);
      const to = startAnchor(task);
      if (!from || !to) { undrawn.push({ fromId: predecessor.id, toId: task.id, reason: 'undated' }); continue; }
      links.push({ id: `${predecessor.id}->${task.id}`, fromId: predecessor.id, fromTitle: predecessor.title, toId: task.id, toTitle: task.title, from, to, state: from.firm && to.firm && to.day < from.day ? 'conflict' : 'ordered' });
    }
  }
  return { links, undrawn };
}

/** Elbow connector between two points. Routes through the gap between rows when the target is not to the right. */
export function linkPath(x1: number, y1: number, x2: number, y2: number, gap = 8): string {
  if (x2 >= x1 + gap * 2) return `M${x1} ${y1}H${x1 + gap}V${y2}H${x2}`;
  const midY = y1 + (y2 >= y1 ? 1 : -1) * (ROW_HEIGHT / 2);
  return `M${x1} ${y1}H${x1 + gap}V${midY}H${x2 - gap}V${y2}H${x2}`;
}
