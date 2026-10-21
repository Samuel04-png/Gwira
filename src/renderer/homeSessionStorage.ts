/** A small renderer-side pointer; conversation content remains in Codex history. */
export const homeSessionStorageKey = 'gwira.home.last-active-session.v1';

export interface LastActiveHomeSession {
  projectId: string;
  projectPath: string;
  conversationId: string;
  updatedAt: string;
}

export function readLastActiveHomeSession(storage: Storage): LastActiveHomeSession | undefined {
  try {
    const value = JSON.parse(storage.getItem(homeSessionStorageKey) ?? '') as Partial<LastActiveHomeSession>;
    if (typeof value.projectId !== 'string' || typeof value.projectPath !== 'string' || typeof value.conversationId !== 'string' || typeof value.updatedAt !== 'string') return undefined;
    return value as LastActiveHomeSession;
  } catch {
    return undefined;
  }
}

export function writeLastActiveHomeSession(storage: Storage, value: LastActiveHomeSession): void {
  storage.setItem(homeSessionStorageKey, JSON.stringify(value));
}

export function clearLastActiveHomeSession(storage: Storage): void {
  storage.removeItem(homeSessionStorageKey);
}
