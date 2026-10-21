import { describe, expect, it } from 'vitest';
import { createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import { doatToUiRecord } from '../../src/renderer/gwira/doats/doatViewModel.js';
import { createProceduralVisualRevision } from '../../src/renderer/gwira/doats/visual/avatar.js';
import type { Doat } from '../../src/renderer/gwira/doats/domain/types.js';

const now = '2026-10-14T10:00:00.000Z';
const ids = { organizationId: '10000000-0000-4000-8000-000000000001', workspaceId: '10000000-0000-4000-8000-000000000002' };

describe('Doat renderer adapter', () => {
  it('shows only actual local provider status and task metadata', () => {
    const state = createEmptyLocalState(ids, now);
    const visual = createProceduralVisualRevision({ doatId: '10000000-0000-4000-8000-000000000003', name: 'Byte', role: 'Engineer', generationKey: 'initial' }, 1, now);
    const doat: Doat = { id: visual.spec.seed.split('|')[0], workspaceId: ids.workspaceId, createdAt: now, updatedAt: now, identity: { name: 'Byte', role: 'Engineer' }, intelligence: { providerId: 'codex-local', providerAvailability: 'configured', businessContextRefs: [] }, capabilities: [{ id: 'codex', name: 'Local Codex CLI', kind: 'tool', providerId: 'codex-local', available: true }], governance: { autonomy: 'approval-required', approvalRequired: true, allowedProjectPaths: [], maxConcurrentRuns: 1 }, appearance: { active: visual, history: [visual] }, operations: { status: 'idle', updatedAt: now } };
    const record = doatToUiRecord(doat, { ...state, agents: [{ id: doat.id, workspaceId: ids.workspaceId, name: 'Byte', type: 'coding', createdAt: now }], tasks: [{ id: '10000000-0000-4000-8000-000000000004', workspaceId: ids.workspaceId, title: 'Check build', status: 'todo', priority: 'medium', assignee: { kind: 'agent', id: doat.id }, createdAt: now, updatedAt: now }] });
    expect(record.providerAvailable).toBe(true);
    expect(record.providerLabel).toBe('Local Codex CLI');
    expect(record.activeTask?.title).toBe('Check build');
    expect(record.avatar.seed).toBe(visual.spec.seed);
  });
});
