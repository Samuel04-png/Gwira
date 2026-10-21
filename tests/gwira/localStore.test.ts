import { describe, expect, it } from 'vitest';
import { GWIRA_LOCAL_STORAGE_KEY, GWIRA_LOCAL_STORAGE_RECOVERY_KEY, loadGwiraLocalState, parseGwiraLocalState, saveGwiraLocalState, serializeGwiraLocalState } from '../../src/renderer/gwira/data/localStore.js';
import { MAX_COMMENTS_PER_TASK, MAX_PERSISTED_ACTIVITY, createEmptyLocalState } from '../../src/renderer/gwira/domain/types.js';
import type { GwiraLocalState } from '../../src/renderer/gwira/domain/types.js';

const ids = { organizationId: '10000000-0000-4000-8000-000000000001', workspaceId: '10000000-0000-4000-8000-000000000002' };
const now = '2026-10-14T10:00:00.000Z';
const empty = () => createEmptyLocalState(ids, now);

describe('Gwira local prototype storage', () => {
  it('uses a separate key and never reads a Codex project preference', () => {
    const values = new Map<string, string>([['codex-desktop.projects.v1', '{"projects":["private"]}']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(loadGwiraLocalState(storage, empty)).toEqual(empty());
    saveGwiraLocalState(storage, empty());
    expect(values.get('codex-desktop.projects.v1')).toBe('{"projects":["private"]}');
    expect(values.has(GWIRA_LOCAL_STORAGE_KEY)).toBe(true);
  });

  it('fails closed to an empty state for corrupt or unsupported values', () => {
    expect(parseGwiraLocalState('{not json', empty)).toEqual(empty());
    expect(parseGwiraLocalState(JSON.stringify({ schemaVersion: 99 }), empty)).toEqual(empty());
    const malformed = { ...empty(), workspace: { ...empty().workspace, organizationId: '10000000-0000-4000-8000-000000000099' } };
    expect(parseGwiraLocalState(JSON.stringify(malformed), empty)).toEqual(empty());
  });

  it('migrates the additive v1 workspace shape without touching its business records', () => {
    const current = empty();
    const legacy = { ...current, schemaVersion: 1, doats: undefined };
    delete (legacy as { doats?: unknown }).doats;
    const migrated = parseGwiraLocalState(JSON.stringify(legacy), empty);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.doats).toEqual([]);
    expect(migrated.organizationStructure.model).toBe('flat');
    expect(migrated.onboarding.currentStep).toBe('complete');
    expect(migrated.workspace).toEqual(current.workspace);
  });

  it('preserves malformed raw data in a separate recovery key before returning an empty state', () => {
    const values = new Map<string, string>([[GWIRA_LOCAL_STORAGE_KEY, '{not json']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(loadGwiraLocalState(storage, empty)).toEqual(empty());
    expect(values.get(GWIRA_LOCAL_STORAGE_RECOVERY_KEY)).toBe('{not json');
  });

  it('returns an empty state instead of throwing when local storage is unavailable', () => {
    const unavailable = { getItem: () => { throw new Error('storage unavailable'); }, setItem: () => { throw new Error('storage unavailable'); } };
    expect(loadGwiraLocalState(unavailable, empty)).toEqual(empty());
  });

  it('bounds activity and comments during serialization', () => {
    const taskId = '10000000-0000-4000-8000-000000000003';
    const personId = '10000000-0000-4000-8000-000000000004';
    const base = empty();
    const state: GwiraLocalState = {
      ...base,
      people: [{ id: personId, workspaceId: ids.workspaceId, name: 'Amina', role: 'Owner', createdAt: now }],
      tasks: [{ id: taskId, workspaceId: ids.workspaceId, title: 'Task', status: 'todo', priority: 'medium', createdAt: now, updatedAt: now }],
      comments: Array.from({ length: MAX_COMMENTS_PER_TASK + 2 }, (_, index) => ({ id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, taskId, author: { kind: 'person' as const, id: personId }, body: `comment ${index}`, createdAt: now })),
      activity: Array.from({ length: MAX_PERSISTED_ACTIVITY + 2 }, (_, index) => ({ id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`, workspaceId: ids.workspaceId, kind: 'task_created' as const, occurredAt: now, summary: `event ${index}`, taskId }))
    };
    const restored = parseGwiraLocalState(serializeGwiraLocalState(state), empty);
    expect(restored.comments).toHaveLength(MAX_COMMENTS_PER_TASK);
    expect(restored.comments[0].body).toBe('comment 2');
    expect(restored.activity).toHaveLength(MAX_PERSISTED_ACTIVITY);
    expect(restored.activity[0].summary).toBe('event 2');
  });
});
