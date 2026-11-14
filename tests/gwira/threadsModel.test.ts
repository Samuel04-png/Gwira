import { describe, expect, it } from 'vitest';
import type { MessageView } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import { actionFailureMessage, copyableText, messageActionFlags, orderReactions, REACTION_EMOJIS, reactionLabel, reactionPickerLabel, replyCountLabel, threadHeading } from '../../src/renderer/gwira/inbox/threadsModel.js';

function view(over: Partial<MessageView> = {}, msg: Record<string, unknown> = {}): MessageView {
  return {
    message: { id: 'm1', body: '<img onerror=x>', sendState: 'local_saved', ...msg },
    isOwn: false, isDeleted: false, reactions: [], savedByActor: false, canEdit: false, canDelete: false, replyCount: 0, failed: false,
    ...over
  } as unknown as MessageView;
}

describe('threadsModel', () => {
  it('labels reactions accessibly', () => {
    expect(reactionLabel({ emoji: '👍', count: 1, reactedByActor: false })).toBe('👍 reaction from 1 person. Add your reaction');
    expect(reactionLabel({ emoji: '👍', count: 3, reactedByActor: true })).toBe('👍 reaction from 3 people, including you. Remove your reaction');
    expect(reactionPickerLabel('🎉', true)).toBe('Remove 🎉 reaction');
  });

  it('orders fixed emoji first and keeps others stable', () => {
    const out = orderReactions([{ emoji: 'X', count: 1, reactedByActor: false }, { emoji: REACTION_EMOJIS[2]!, count: 1, reactedByActor: false }, { emoji: REACTION_EMOJIS[0]!, count: 1, reactedByActor: false }]);
    expect(out.map((r) => r.emoji)).toEqual([REACTION_EMOJIS[0], REACTION_EMOJIS[2], 'X']);
  });

  it('gates edit/delete on domain authorization flags', () => {
    expect(messageActionFlags(view(), { inThread: false })).toMatchObject({ edit: false, remove: false, reply: true, markUnread: true });
    expect(messageActionFlags(view({ canEdit: true, canDelete: true, isOwn: true }), { inThread: false })).toMatchObject({ edit: true, remove: true, markUnread: false });
  });

  it('hides reply and mark-unread inside threads, and reply when posting is not allowed', () => {
    expect(messageActionFlags(view(), { inThread: true })).toMatchObject({ reply: false, markUnread: false, react: true });
    expect(messageActionFlags(view(), { inThread: false, canPost: false }).reply).toBe(false);
  });

  it('disables everything but nothing for deleted and withholds react/reply for failed sends', () => {
    const deleted = messageActionFlags(view({ isDeleted: true, canEdit: true, canDelete: true }), { inThread: false });
    expect(Object.values(deleted).every((v) => v === false)).toBe(true);
    const failed = messageActionFlags(view({}, { sendState: 'failed' }), { inThread: false });
    expect(failed).toMatchObject({ react: false, reply: false, save: false, copy: true });
  });

  it('copies raw text, never markup-transformed', () => {
    expect(copyableText(view())).toBe('<img onerror=x>');
    expect(copyableText(view({ isDeleted: true }))).toBe('');
  });

  it('formats counts and dispatch failures honestly', () => {
    expect(replyCountLabel(1)).toBe('1 reply');
    expect(threadHeading(0)).toBe('No replies yet');
    expect(threadHeading(4)).toBe('4 replies');
    expect(actionFailureMessage({ ok: false, error: { code: 'forbidden', message: 'Not allowed' } }, 'delete message')).toBe('Could not delete message: Not allowed');
    expect(actionFailureMessage({ ok: true, value: {}, durable: false }, 'update saved')).toContain('not saved to this device');
    expect(actionFailureMessage({ ok: true, value: {}, durable: true }, 'update saved')).toBeUndefined();
  });
});
