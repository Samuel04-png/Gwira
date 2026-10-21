import { describe, expect, it } from 'vitest';
import { clearLastActiveHomeSession, homeSessionStorageKey, readLastActiveHomeSession, writeLastActiveHomeSession } from '../src/renderer/homeSessionStorage.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); }
  };
}

describe('Home last active session storage', () => {
  it('round-trips a small thread pointer without storing conversation content', () => {
    const storage = memoryStorage();
    writeLastActiveHomeSession(storage, { projectId: 'project', projectPath: '/work/project', conversationId: 'thread', updatedAt: '2026-10-15T06:00:00.000Z' });
    expect(readLastActiveHomeSession(storage)).toEqual({ projectId: 'project', projectPath: '/work/project', conversationId: 'thread', updatedAt: '2026-10-15T06:00:00.000Z' });
    expect(storage.getItem(homeSessionStorageKey)).not.toContain('messages');
  });

  it('safely rejects invalid pointers and clears deleted session pointers', () => {
    const storage = memoryStorage();
    storage.setItem(homeSessionStorageKey, '{bad json');
    expect(readLastActiveHomeSession(storage)).toBeUndefined();
    writeLastActiveHomeSession(storage, { projectId: 'p', projectPath: '/p', conversationId: 'c', updatedAt: 'now' });
    clearLastActiveHomeSession(storage);
    expect(readLastActiveHomeSession(storage)).toBeUndefined();
  });
});
