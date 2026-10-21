import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../../src/renderer/gwira/domain/types.js';
import { activityDayLabel, dashboardProgressText, dashboardTitle, dashboardViews, formatActivityTimestamp, matchesActivityFilter, summarizeDashboard } from '../../src/renderer/gwira/dashboard/dashboardModel.js';

describe('dashboard model', () => {
  it('exposes the five planned dashboard views', () => {
    expect(dashboardViews.map((view) => view.id)).toEqual(['workflow', 'timeline', 'list', 'calendar', 'board']);
    expect(dashboardViews.filter((view) => view.available).map((view) => view.id)).toEqual(['workflow', 'timeline']);
  });

  it('summarizes objective records without counting approvals as work', () => {
    expect(summarizeDashboard({
      objectives: [{ id: 'campaign', title: 'Launch the campaign' }],
      tasks: [{ id: 'complete', title: 'Research', status: 'completed' }, { id: 'active', title: 'Draft content', status: 'working' }],
      approvals: [{ id: 'approval', title: 'Approve content', status: 'waiting', taskId: 'active' }]
    })).toEqual({
      objectiveTitle: 'Launch the campaign',
      completedCount: 1,
      workCount: 2,
      waitingApprovalCount: 1
    });
  });

  it('keeps missing objectives and empty work explicit', () => {
    const summary = summarizeDashboard({});
    expect(summary).toEqual({
      objectiveTitle: undefined,
      completedCount: 0,
      workCount: 0,
      waitingApprovalCount: 0
    });
    expect(dashboardTitle(summary, 'My workspace')).toBe('Workflows for My workspace');
    expect(dashboardProgressText(summary)).toBe('No work items recorded');
  });

  it('uses an objective title and names progress units and pending approvals', () => {
    const summary = summarizeDashboard({
      objectives: [{ id: 'campaign', title: 'Launch the campaign' }],
      tasks: [{ id: 'complete', title: 'Research', status: 'completed' }, { id: 'active', title: 'Draft content', status: 'working' }],
      approvals: [{ id: 'approval', title: 'Approve content', status: 'waiting', taskId: 'active' }]
    });
    expect(dashboardTitle(summary, 'My workspace')).toBe('Launch the campaign');
    expect(dashboardProgressText(summary)).toBe('1 of 2 work items complete · 1 approval pending');
  });

  it('filters activity only when the recorded actor or approval supports the filter', () => {
    const event = (patch: Partial<ActivityEvent>): ActivityEvent => ({
      id: 'event',
      workspaceId: 'workspace',
      kind: 'task_updated',
      occurredAt: '2026-10-18T10:00:00.000Z',
      summary: 'Work updated',
      ...patch
    });
    expect(matchesActivityFilter(event({ actor: { kind: 'person', id: 'person' } }), 'humans')).toBe(true);
    expect(matchesActivityFilter(event({ actor: { kind: 'agent', id: 'doat' } }), 'doats')).toBe(true);
    expect(matchesActivityFilter(event({ approvalId: 'approval' }), 'approvals')).toBe(true);
    expect(matchesActivityFilter(event({}), 'humans')).toBe(false);
    expect(matchesActivityFilter(event({}), 'all')).toBe(true);
  });

  it('formats real timestamps and handles invalid values honestly', () => {
    expect(formatActivityTimestamp('not-a-timestamp')).toBe('Recorded time unavailable');
    expect(formatActivityTimestamp('2026-10-18T10:00:00.000Z')).not.toBe('Just now');
  });

  it('groups activity by the local day without inventing dates', () => {
    const now = new Date(2026, 9, 18, 14);
    expect(activityDayLabel(new Date(2026, 9, 18, 10).toISOString(), now)).toBe('Today');
    expect(activityDayLabel(new Date(2026, 9, 17, 10).toISOString(), now)).toBe('Yesterday');
    expect(activityDayLabel('not-a-timestamp', now)).toBe('Date unavailable');
  });
});
