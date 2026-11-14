import { describe, expect, it } from 'vitest';
import type { MessagingScope } from '../../src/renderer/gwira/messaging/domain/types.js';
import { createInboxSampleState, createInboxSampleWork } from '../../src/renderer/gwira/inbox/inboxDevSample.js';
import { groupSaved, savedBucket, savedPlace, savedTimeLabel, type SavedView } from '../../src/renderer/gwira/inbox/savedModel.js';
import { applyMessagingAction } from '../../src/renderer/gwira/messaging/domain/reducer.js';
import { selectConversationList, selectSaved } from '../../src/renderer/gwira/messaging/domain/selectors.js';

const scope: MessagingScope = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002'
};

describe('Saved model', () => {
  const work = createInboxSampleWork(scope);
  const state = createInboxSampleState(scope);
  const places = (s = state) => new Map(selectConversationList(s, scope, work).map((item) => [item.conversation.id, item] as const));

  it('buckets by age and calendar month', () => {
    const now = new Date(2026, 9, 25, 12);
    expect(savedBucket(new Date(2026, 9, 20).toISOString(), now)).toBe('week');
    expect(savedBucket(new Date(2026, 9, 3).toISOString(), now)).toBe('month');
    expect(savedBucket(new Date(2026, 8, 30).toISOString(), now)).toBe('earlier');
    expect(savedBucket('nope', now)).toBe('earlier');
    expect(savedTimeLabel(new Date(2026, 9, 3).toISOString(), now)).toBe('Saved 3 Oct');
    expect(savedTimeLabel(new Date(2026, 9, 25, 8).toISOString(), now)).toBe('Saved today');
  });

  it('shows 6 sample saves in both groupings, with record links on two of them', () => {
    const views = selectSaved(state, scope, work);
    const now = new Date();
    expect(views).toHaveLength(6);
    expect(groupSaved(views, 'date', now, places()).flatMap((group) => group.views)).toHaveLength(6);
    const byConversation = groupSaved(views, 'conversation', now, places());
    expect(byConversation).toHaveLength(3);
    expect(byConversation.flatMap((group) => group.views)).toHaveLength(6);
    expect(views.filter((view) => view.refs.length > 0)).toHaveLength(2);
  });

  it('keeps an unreadable conversation listed as unavailable and lets it be unsaved and restored', () => {
    const room = 'inbox-sample-channel-customer';
    const target = selectSaved(state, scope, work).find((view) => view.message.conversationId === room)!;
    // The channel becomes private and the person has left it.
    const left = {
      ...state,
      conversations: state.conversations.map((c) => c.id === room ? { ...c, visibility: 'private' as const } : c),
      memberships: state.memberships.map((m) => m.conversationId === room && m.participant.kind === 'human' && m.participant.id === state.selfPersonId ? { ...m, leftAt: new Date().toISOString() } : m)
    };
    const views = selectSaved(left, scope, work);
    const gone = views.filter((view) => view.conversationUnavailable);
    expect(gone.length).toBeGreaterThan(0);
    expect(gone[0]!.message.body).not.toBe('');
    expect(savedPlace(gone[0]!, places(left).get(gone[0]!.message.conversationId))).toBe('Conversation unavailable');
    expect(groupSaved(views, 'conversation', new Date(), places(left)).at(-1)!.label).toBe('Conversation unavailable');

    const ctx = { scope, work, now: new Date().toISOString() };
    const removed = applyMessagingAction(left, { type: 'toggleSaved', messageId: target.message.id, saved: false }, ctx);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(selectSaved(removed.state, scope, work)).toHaveLength(views.length - 1);
    // Re-saving an unreadable message is refused, but Undo on a readable one restores the original time.
    expect(applyMessagingAction(removed.state, { type: 'toggleSaved', messageId: target.message.id, saved: true }, ctx).ok).toBe(false);
    const readable = applyMessagingAction(state, { type: 'toggleSaved', messageId: target.message.id, saved: false }, ctx);
    if (!readable.ok) throw new Error('unsave failed');
    const restored = applyMessagingAction(readable.state, { type: 'toggleSaved', messageId: target.message.id, saved: true, savedAt: target.savedAt }, ctx);
    expect(restored.ok && selectSaved(restored.state, scope, work).find((v: SavedView) => v.message.id === target.message.id)?.savedAt).toBe(target.savedAt);
  });
});
