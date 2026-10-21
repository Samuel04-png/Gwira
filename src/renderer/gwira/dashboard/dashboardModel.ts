import type { ActivityEvent } from '../domain/types.js';
import { buildGraph, type WorkGraphRecords } from '../graph/graphModel.js';

export type DashboardView = 'workflow' | 'timeline' | 'list' | 'calendar' | 'board';
export type ActivityFilter = 'all' | 'humans' | 'doats' | 'approvals';

export const dashboardViews: Array<{ id: DashboardView; label: string; description: string; available: boolean }> = [
  { id: 'workflow', label: 'Workflow', description: 'Relationships and execution dependencies between humans and Doats.', available: true },
  { id: 'timeline', label: 'Timeline', description: 'Task duration, milestones, dates, and scheduling.', available: true },
  { id: 'list', label: 'List', description: 'Structured work-item records with status, assignee, and priority.', available: false },
  { id: 'calendar', label: 'Calendar', description: 'Date-oriented work items and deadlines.', available: false },
  { id: 'board', label: 'Board', description: 'Kanban-style work organization.', available: false }
];

export interface DashboardSummary {
  objectiveTitle?: string;
  completedCount: number;
  workCount: number;
  waitingApprovalCount: number;
}

export function dashboardTitle(summary: DashboardSummary, workspaceName: string): string {
  return summary.objectiveTitle?.trim() || `Workflows for ${workspaceName.trim() || 'this workspace'}`;
}

export function dashboardProgressText(summary: DashboardSummary): string {
  if (summary.workCount === 0) {
    return summary.waitingApprovalCount
      ? `No work items recorded · ${summary.waitingApprovalCount} approval${summary.waitingApprovalCount === 1 ? '' : 's'} pending`
      : 'No work items recorded';
  }
  const workItems = ` ${summary.workCount === 1 ? 'work item' : 'work items'}`;
  const completed = `${summary.completedCount} of ${summary.workCount}${workItems} complete`;
  return summary.waitingApprovalCount
    ? `${completed} · ${summary.waitingApprovalCount} approval${summary.waitingApprovalCount === 1 ? '' : 's'} pending`
    : completed;
}

export function summarizeDashboard(records: WorkGraphRecords): DashboardSummary {
  const graph = buildGraph(records);
  const work = graph.nodes.filter((node) => node.type !== 'approval');
  return {
    objectiveTitle: records.objectives?.[0]?.title,
    completedCount: work.filter((node) => node.data.status === 'completed').length,
    workCount: work.length,
    waitingApprovalCount: graph.nodes.filter((node) => node.type === 'approval' && node.data.status === 'waiting').length
  };
}

export function matchesActivityFilter(event: ActivityEvent, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'approvals') return Boolean(event.approvalId) || event.kind.startsWith('approval_');
  return filter === 'humans'
    ? event.actor?.kind === 'person'
    : event.actor?.kind === 'agent';
}

export function formatActivityTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Recorded time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

export function activityDayLabel(value: string, now = new Date()): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Date unavailable';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
  const daysAgo = Math.round((today.getTime() - eventDay.getTime()) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(timestamp);
}
