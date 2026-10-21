import { describe, expect, it } from 'vitest';
import { countActiveDoatRuns, getDoatProviderAvailability, mapTaskToDoatOperationalStatus, planDoatExecution } from '../../src/renderer/gwira/doats/execution/executionPlanner.js';
import type { DoatExecutionDescriptor } from '../../src/renderer/gwira/doats/execution/executionPlanner.js';

const doat: DoatExecutionDescriptor = {
  id: 'doat-coding',
  active: true,
  providerId: 'codex-local',
  paused: false,
  concurrentExecutionLimit: 1,
  activeExecutionCount: 0
};

const task = {
  status: 'todo' as const,
  assignee: { kind: 'agent' as const, id: doat.id }
};

describe('Doat execution planner', () => {
  it('allows only the existing local Codex bridge with workspace-write defaults', () => {
    expect(planDoatExecution({ doat, task, codingProjectApproved: true, codingBridgeAccepted: true })).toEqual({
      ok: true,
      providerId: 'codex-local',
      executor: 'existing-coding-task-bridge',
      permissionMode: 'default',
      webSearch: false
    });
  });

  it('makes every non-Codex provider explicitly unavailable', () => {
    expect(getDoatProviderAvailability('openai-cloud')).toMatchObject({
      available: false,
      reason: 'provider-not-configured'
    });
    expect(planDoatExecution({
      doat: { ...doat, providerId: 'openai-cloud' }, task, codingProjectApproved: true, codingBridgeAccepted: true
    })).toMatchObject({ ok: false, reason: 'provider-unavailable' });
  });

  it('refuses paused, unassigned, non-ready, concurrent, and unapproved work', () => {
    expect(planDoatExecution({ doat: { ...doat, paused: true }, task, codingProjectApproved: true, codingBridgeAccepted: true })).toMatchObject({ ok: false, reason: 'doat-paused' });
    expect(planDoatExecution({ doat, task: { ...task, assignee: { kind: 'agent', id: 'other' } }, codingProjectApproved: true, codingBridgeAccepted: true })).toMatchObject({ ok: false, reason: 'task-not-assigned-to-doat' });
    expect(planDoatExecution({ doat, task: { ...task, status: 'in_progress' }, codingProjectApproved: true, codingBridgeAccepted: true })).toMatchObject({ ok: false, reason: 'task-not-ready' });
    expect(planDoatExecution({ doat: { ...doat, activeExecutionCount: 1 }, task, codingProjectApproved: true, codingBridgeAccepted: true })).toMatchObject({ ok: false, reason: 'concurrency-limit-reached' });
    expect(planDoatExecution({ doat, task, codingProjectApproved: false, codingBridgeAccepted: true })).toMatchObject({ ok: false, reason: 'coding-project-not-approved' });
    expect(planDoatExecution({ doat, task, codingProjectApproved: true, codingBridgeAccepted: false })).toMatchObject({ ok: false, reason: 'codex-bridge-rejected' });
  });

  it('maps only persisted operational facts into Doat status', () => {
    expect(mapTaskToDoatOperationalStatus(doat, undefined)).toBe('idle');
    expect(mapTaskToDoatOperationalStatus(doat, { ...task, agentRun: { sessionId: 's', status: 'running', startedAt: 'now' } })).toBe('working');
    expect(mapTaskToDoatOperationalStatus(doat, { ...task, status: 'in_review' })).toBe('waiting_for_approval');
    expect(mapTaskToDoatOperationalStatus(doat, { ...task, status: 'done' })).toBe('completed');
    expect(mapTaskToDoatOperationalStatus(doat, { ...task, agentRun: { sessionId: 's', status: 'error', startedAt: 'now' } })).toBe('failed');
    expect(mapTaskToDoatOperationalStatus({ ...doat, paused: true }, { ...task, agentRun: { sessionId: 's', status: 'running', startedAt: 'now' } })).toBe('paused');
    expect(mapTaskToDoatOperationalStatus({ ...doat, providerId: 'future-provider' }, { ...task, status: 'done' })).toBe('unavailable');
  });

  it('counts only active run metadata, never output', () => {
    expect(countActiveDoatRuns([
      { agentRun: { sessionId: 'a', status: 'running', startedAt: 'now' } },
      { agentRun: { sessionId: 'b', status: 'completed', startedAt: 'now', completedAt: 'later' } },
      {}
    ])).toBe(1);
  });
});
