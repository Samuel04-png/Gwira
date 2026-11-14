import { describe, expect, it } from 'vitest';
import type { MessagingScope } from '../../src/renderer/gwira/messaging/domain/types.js';
import { createInboxSampleState, createInboxSampleWork } from '../../src/renderer/gwira/inbox/inboxDevSample.js';
import { buildDraftEntries, draftDestination, editedLabel, failureLabel, groupDraftEntries } from '../../src/renderer/gwira/inbox/draftsModel.js';
import { applyMessagingAction } from '../../src/renderer/gwira/messaging/domain/reducer.js';
import { selectConversationList, selectDrafts, selectFailedSends } from '../../src/renderer/gwira/messaging/domain/selectors.js';

const scope: MessagingScope = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002'
};

describe('Drafts model', () => {
  const work = createInboxSampleWork(scope);
  const state = createInboxSampleState(scope);
  const ctx = () => ({ scope, work, now: new Date().toISOString() });

  it('lists the failed send first, then three drafts, four items in all', () => {
    const entries = buildDraftEntries(selectDrafts(state, scope, work), selectFailedSends(state, scope, work));
    expect(entries).toHaveLength(4);
    const groups = groupDraftEntries(entries);
    expect(groups.map((group) => group.label)).toEqual(['Failed to send', 'Drafts']);
    expect(groups[0]!.entries).toHaveLength(1);
    const times = groups[1]!.entries.map((entry) => entry.at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(groupDraftEntries(buildDraftEntries(selectDrafts(state, scope, work), [])).map((group) => group.label)).toEqual(['Drafts']);
    expect(groupDraftEntries([])).toEqual([]);
  });

  it('names destinations and formats edit times', () => {
    const items = new Map(selectConversationList(state, scope, work).map((item) => [item.conversation.id, item] as const));
    expect(draftDestination(items.get('inbox-sample-channel-design'), false)).toBe('design-crit');
    expect(draftDestination(items.get('inbox-sample-channel-design'), true)).toBe('Thread in #design-crit');
    expect(draftDestination(items.get('inbox-sample-dm-mina'), false)).toBe(items.get('inbox-sample-dm-mina')!.title);
    const now = new Date(2026, 9, 25, 15, 0);
    expect(editedLabel(new Date(2026, 9, 25, 13, 0).toISOString(), now)).toBe('Edited 2h ago');
    expect(editedLabel(new Date(2026, 9, 25, 14, 55).toISOString(), now)).toBe('Edited 5m ago');
    expect(editedLabel(new Date(2026, 9, 24, 9, 0).toISOString(), now)).toBe('Edited yesterday');
    expect(editedLabel(new Date(2026, 9, 3).toISOString(), now)).toBe('Edited 3 Oct');
    expect(failureLabel('storage_full')).toContain('storage');
  });

  it('retrying a failed send never creates a second message', () => {
    const failed = selectFailedSends(state, scope, work)[0]!;
    const before = state.messages.length;
    const once = applyMessagingAction(state, { type: 'retryMessage', messageId: failed.id }, ctx());
    if (!once.ok) throw new Error('retry failed');
    const twice = applyMessagingAction(once.state, { type: 'retryMessage', messageId: failed.id }, ctx());
    if (!twice.ok) throw new Error('second retry failed');
    expect(twice.state.messages).toHaveLength(before);
    expect(selectFailedSends(twice.state, scope, work)).toHaveLength(0);
    expect(twice.state.messages.find((message) => message.id === failed.id)?.sendState).toBe('local_saved');
  });

  it('discard removes a draft and Undo restores its text and edit time', () => {
    const draft = selectDrafts(state, scope, work)[0]!;
    const gone = applyMessagingAction(state, { type: 'setDraft', conversationId: draft.conversationId, threadRootId: draft.threadRootId, body: '', actorPersonId: draft.actorPersonId }, ctx());
    if (!gone.ok) throw new Error('discard failed');
    expect(selectDrafts(gone.state, scope, work)).toHaveLength(2);
    const back = applyMessagingAction(gone.state, { type: 'setDraft', conversationId: draft.conversationId, threadRootId: draft.threadRootId, body: draft.body, actorPersonId: draft.actorPersonId, refs: draft.refs, updatedAt: draft.updatedAt }, ctx());
    if (!back.ok) throw new Error('undo failed');
    expect(selectDrafts(back.state, scope, work).find((item) => item.conversationId === draft.conversationId && item.threadRootId === draft.threadRootId)).toMatchObject({ body: draft.body, updatedAt: draft.updatedAt });
  });

  it('does not leak drafts or failed sends to another actor', () => {
    const other = state.memberships.find((m) => m.participant.kind === 'human' && m.participant.id !== state.selfPersonId)!.participant.id;
    const switched = applyMessagingAction(state, { type: 'setSelf', personId: other }, ctx());
    if (!switched.ok) throw new Error('switch failed');
    expect(selectDrafts(switched.state, scope, work)).toHaveLength(0);
    expect(selectFailedSends(switched.state, scope, work)).toHaveLength(0);
    const stale = applyMessagingAction(switched.state, { type: 'setDraft', conversationId: 'inbox-sample-dm-mina', body: 'x', actorPersonId: state.selfPersonId! }, ctx());
    expect(stale.ok).toBe(false);
  });
});
