import { describe, expect, it } from 'vitest';
import { sharedRepository } from '../../src/renderer/gwira/messaging/data/sharedRepository.js';
import { makeWork, scope, otherWorkspace } from './messagingFixtures.js';
function storage() { const entries = new Map<string, string>(); return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } }; }
describe('shared messaging surfaces', () => {
  it('shares accepted channel changes immediately across Inbox and sidebar', () => {
    const saved = storage(), work = makeWork();
    const inbox = sharedRepository(saved, scope, work), sidebar = sharedRepository(saved, scope, work);
    expect(sidebar).toBe(inbox);
    let updates = 0; const unsubscribe = sidebar.subscribe(() => updates++);
    expect(inbox.dispatch({ type: 'createChannel', name: 'Operations' }).ok).toBe(true);
    expect(sidebar.getSnapshot().state.conversations[0]?.name).toBe('Operations');
    expect(updates).toBeGreaterThan(0); unsubscribe();
  });
  it('isolates workspaces and development storage', () => {
    const saved = storage(), work = makeWork();
    expect(sharedRepository(saved, scope, work)).not.toBe(sharedRepository(saved, { ...scope, workspaceId: otherWorkspace }, work));
    expect(sharedRepository(saved, scope, work)).not.toBe(sharedRepository(storage(), scope, work));
  });
  it('uses current people to validate a later mutation', () => {
    const saved = storage(), work = makeWork();
    const repository = sharedRepository(saved, scope, work);
    sharedRepository(saved, scope, { ...work, people: [] });
    expect(repository.dispatch({ type: 'createChannel', name: 'Must fail' }).ok).toBe(false);
  });
});
