import { describe, expect, it } from 'vitest';
import { canDeleteMessage, canEditMessage, canPostInConversation, canReadConversation, createLocalContext } from '../../src/renderer/gwira/messaging/domain/authorize.js';
import { applyMessagingAction } from '../../src/renderer/gwira/messaging/domain/reducer.js';
import { dmKeyFor, newUniqueId } from '../../src/renderer/gwira/messaging/domain/ids.js';
import { searchConversations, searchMessages } from '../../src/renderer/gwira/messaging/domain/search.js';
import { selectConversationList, selectDraft, selectFeed, selectMentionCandidates, selectMentions, selectSaved, selectThread, selectUnread, selectUnreadMessages } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import { MAX_BODY, MAX_SEARCH_RESULTS, createEmptyMessagingState } from '../../src/renderer/gwira/messaging/domain/types.js';
import { validateMessagingState } from '../../src/renderer/gwira/messaging/domain/validate.js';
import { A, APPROVAL, B, C, DOAT, FOREIGN_TASK, OUTSIDER, TASK, channel, doat, harness, human, makeWork, otherWorkspace, scope, send, t0 } from './messagingFixtures.js';

describe('messaging domain: no seed data', () => {
  it('starts empty with no conversations, messages or other-human content', () => {
    const state = createEmptyMessagingState(scope, A);
    expect(state.conversations).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(selectConversationList(state, scope, makeWork())).toEqual([]);
  });
});

describe('messaging domain: ordering, sender, idempotency', () => {
  it('assigns strictly increasing seq even with identical or out-of-order timestamps', () => {
    const h = harness();
    const conv = channel(h);
    send(h, conv, 'one', 'c1', {});
    h.ok({ type: 'sendMessage', conversationId: conv, clientId: 'c2', body: 'two' }, t0);
    h.ok({ type: 'sendMessage', conversationId: conv, clientId: 'c3', body: 'three' }, '2020-01-01T00:00:00.000Z');
    const bodies = h.state.messages.filter((m) => m.conversationId === conv).sort((a, b) => a.seq - b.seq);
    expect(bodies.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(bodies.map((m) => m.body)).toEqual(['one', 'two', 'three']);
    expect(selectFeed(h.state, scope, h.work, conv)?.messages.map((v) => v.message.body)).toEqual(['one', 'two', 'three']);
  });

  it('authors locally created messages only as the selected self person', () => {
    const h = harness();
    const conv = channel(h);
    const first = send(h, conv, 'from A', 'c1');
    h.ok({ type: 'setSelf', personId: B });
    const second = send(h, conv, 'from B', 'c2');
    const byId = new Map(h.state.messages.map((m) => [m.id, m]));
    expect(byId.get(first)?.author).toEqual(human(A));
    expect(byId.get(second)?.author).toEqual(human(B));
    expect(h.run({ type: 'setSelf', personId: OUTSIDER }).ok).toBe(false);
    expect(h.state.selfPersonId).toBe(B);
    expect(h.state.messages.every((m) => m.author.kind === 'human')).toBe(true);
  });

  it('never produces delivered/seen state and never authors as a Doat', () => {
    const h = harness();
    const dm = h.ok({ type: 'createDm', participant: doat(DOAT) }).conversationId as string;
    send(h, dm, 'hello scout', 'c1');
    expect(h.state.messages).toHaveLength(1);
    expect(h.state.messages.every((m) => m.sendState === 'local_saved' && m.author.kind === 'human')).toBe(true);
    expect(selectFeed(h.state, scope, h.work, dm)?.doatNotConnected).toBe(true);
    expect(JSON.stringify(h.state)).not.toMatch(/delivered|seen/);
  });

  it('is idempotent on (conversationId, clientId)', () => {
    const h = harness();
    const conv = channel(h);
    const first = h.ok({ type: 'sendMessage', conversationId: conv, clientId: 'same', body: 'x' });
    const before = h.state;
    const second = h.ok({ type: 'sendMessage', conversationId: conv, clientId: 'same', body: 'x again' });
    expect(second.messageId).toBe(first.messageId);
    expect(second.duplicate).toBe(true);
    expect(h.state).toBe(before);
    expect(h.state.messages).toHaveLength(1);
    expect(h.state.conversations[0].lastMessageSeq).toBe(1);
    const other = channel(h, 'other');
    expect(send(h, other, 'x', 'same')).not.toBe(first.messageId);
  });

  it('retries a failed message with the same id, clientId and seq', () => {
    const h = harness();
    const conv = channel(h);
    const id = send(h, conv, 'hello', 'c1');
    h.ok({ type: 'markSendFailed', messageId: id, reason: 'storage_full' });
    expect(h.state.messages[0]).toMatchObject({ sendState: 'failed', failureReason: 'storage_full' });
    h.ok({ type: 'retryMessage', messageId: id });
    expect(h.state.messages).toHaveLength(1);
    expect(h.state.messages[0]).toMatchObject({ id, clientId: 'c1', seq: 1, sendState: 'local_saved' });
    expect(h.state.messages[0].failureReason).toBeUndefined();
    h.ok({ type: 'setSelf', personId: B });
    const failed = send(h, conv, 'b', 'c2');
    h.ok({ type: 'markSendFailed', messageId: failed, reason: 'validation' });
    h.ok({ type: 'setSelf', personId: A });
    expect(h.run({ type: 'retryMessage', messageId: failed }).ok).toBe(false);
  });

  it('validates content: empty, oversized, control characters, mentions', () => {
    const h = harness();
    const conv = channel(h);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'e', body: '   ' }).ok).toBe(false);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'big', body: 'x'.repeat(MAX_BODY + 1) }).ok).toBe(false);
    const id = send(h, conv, 'a\u0000b\r\nc <img src=x onerror=alert(1)>', 'c1');
    expect(h.state.messages.find((m) => m.id === id)?.body).toBe('ab\nc <img src=x onerror=alert(1)>');
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'm1', body: '@Chidi hi', mentions: [{ participant: human(C), start: 0, end: 6 }] }).ok).toBe(false);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'm2', body: '@Bõb hi', mentions: [{ participant: human(B), start: 0, end: 99 }] }).ok).toBe(false);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'm3', body: '@Bõb hi', mentions: [{ participant: human(B), start: 0, end: 4 }] }).ok).toBe(true);
  });
});

describe('messaging domain: conversations', () => {
  it('creates DMs idempotently regardless of participant order with exactly two members', () => {
    const h = harness();
    const first = h.ok({ type: 'createDm', participant: human(B) }).conversationId as string;
    h.ok({ type: 'setSelf', personId: B });
    const again = h.ok({ type: 'createDm', participant: human(A) });
    expect(again.conversationId).toBe(first);
    expect(h.state.conversations).toHaveLength(1);
    expect(h.state.memberships.filter((m) => m.conversationId === first)).toHaveLength(2);
    expect(h.state.conversations[0].dmKey).toBe(dmKeyFor(human(A), human(B)));
    expect(h.run({ type: 'createDm', participant: human(B) }).ok).toBe(false);
    expect(h.run({ type: 'createDm', participant: human(OUTSIDER) }).ok).toBe(false);
  });

  it('requires names for groups/channels and rejects duplicate channel names', () => {
    const h = harness();
    expect(h.run({ type: 'createGroup', name: '  ', members: [human(B)] }).ok).toBe(false);
    expect(h.run({ type: 'createGroup', name: 'Solo', members: [] }).ok).toBe(false);
    expect(h.run({ type: 'createChannel', name: '' }).ok).toBe(false);
    expect(h.run({ type: 'createGroup', name: 'Team', members: [human(B), human(OUTSIDER)] }).ok).toBe(false);
    h.ok({ type: 'createChannel', name: '#General' });
    expect(h.run({ type: 'createChannel', name: 'general' }).ok).toBe(false);
    expect(h.run({ type: 'createChannel', name: 'linked', linkedTaskId: FOREIGN_TASK }).ok).toBe(false);
    expect(h.run({ type: 'createChannel', name: 'linked', linkedTaskId: TASK }).ok).toBe(true);
  });

  it('keeps conversations isolated from each other', () => {
    const h = harness();
    const one = channel(h, 'one');
    const two = channel(h, 'two');
    send(h, one, 'in one', 'c1');
    send(h, two, 'in two', 'c1');
    expect(selectFeed(h.state, scope, h.work, one)?.messages.map((m) => m.message.body)).toEqual(['in one']);
    expect(selectFeed(h.state, scope, h.work, two)?.messages.map((m) => m.message.body)).toEqual(['in two']);
    h.ok({ type: 'setDraft', conversationId: one, body: 'draft one' });
    expect(selectDraft(h.state, scope, h.work, two)).toBeUndefined();
    expect(selectDraft(h.state, scope, h.work, one)?.body).toBe('draft one');
  });

  it('retains real task and approval links in links-only drafts and rejects unavailable links', () => {
    const h = harness();
    const conv = channel(h);
    h.ok({ type: 'setDraft', conversationId: conv, body: '', refs: [{ kind: 'task', taskId: TASK }, { kind: 'approval', approvalId: APPROVAL }] });
    expect(selectDraft(h.state, scope, h.work, conv)).toMatchObject({ body: '', refs: [{ kind: 'task', taskId: TASK }, { kind: 'approval', approvalId: APPROVAL }] });
    expect(h.run({ type: 'setDraft', conversationId: conv, body: '', refs: [{ kind: 'task', taskId: FOREIGN_TASK }] }).ok).toBe(false);
  });

  it('lets people join org channels but not private conversations', () => {
    const h = harness();
    const open = h.ok({ type: 'createChannel', name: 'open', visibility: 'org' }).conversationId as string;
    const closed = channel(h, 'closed');
    h.ok({ type: 'setSelf', personId: C });
    expect(selectFeed(h.state, scope, h.work, open)?.canPost).toBe(false);
    expect(h.run({ type: 'sendMessage', conversationId: open, clientId: 'x', body: 'hi' }).ok).toBe(false);
    expect(h.run({ type: 'joinChannel', conversationId: closed }).ok).toBe(false);
    h.ok({ type: 'joinChannel', conversationId: open });
    expect(h.run({ type: 'sendMessage', conversationId: open, clientId: 'x', body: 'hi' }).ok).toBe(true);
    expect(selectConversationList(h.state, scope, h.work).map((i) => i.conversation.id)).toEqual([open]);
  });
});

describe('messaging domain: threads, edit, delete', () => {
  it('requires a valid root, rejects reply-of-reply, and keeps counts in sync', () => {
    const h = harness();
    const conv = channel(h);
    const other = channel(h, 'other');
    const root = send(h, conv, 'root', 'c1');
    const reply = send(h, conv, 'reply', 'c2', { threadRootId: root });
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'c3', body: 'nested', threadRootId: reply }).ok).toBe(false);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'c4', body: 'ghost', threadRootId: 'msg_nope' }).ok).toBe(false);
    expect(h.run({ type: 'sendMessage', conversationId: other, clientId: 'c5', body: 'cross', threadRootId: root }).ok).toBe(false);
    const rootMessage = h.state.messages.find((m) => m.id === root);
    expect(rootMessage).toMatchObject({ replyCount: 1 });
    expect(selectFeed(h.state, scope, h.work, conv)?.messages.map((m) => m.message.id)).toEqual([root]);
    expect(selectThread(h.state, scope, h.work, conv, root)?.replies.map((m) => m.message.id)).toEqual([reply]);
    expect(h.state.messages.find((m) => m.id === reply)?.seq).toBe(2);
    expect(validateMessagingState(h.state, scope, h.work)).toEqual({ ok: true, issues: [] });
  });

  it('tombstones deleted roots while keeping replies; only the author edits/deletes', () => {
    const h = harness();
    const conv = channel(h);
    const root = send(h, conv, 'root', 'c1');
    const reply = send(h, conv, 'reply', 'c2', { threadRootId: root });
    h.ok({ type: 'toggleSaved', messageId: root });
    h.ok({ type: 'toggleReaction', messageId: root, emoji: '👍' });
    h.ok({ type: 'editMessage', messageId: root, body: 'root edited' });
    expect(h.state.messages.find((m) => m.id === root)?.editedAt).toBeDefined();
    h.ok({ type: 'setSelf', personId: B });
    expect(h.run({ type: 'editMessage', messageId: root, body: 'hijack' }).ok).toBe(false);
    expect(h.run({ type: 'deleteMessage', messageId: root }).ok).toBe(false);
    h.ok({ type: 'setSelf', personId: A });
    h.ok({ type: 'deleteMessage', messageId: root });
    const tomb = h.state.messages.find((m) => m.id === root);
    expect(tomb).toMatchObject({ body: '', seq: 1 });
    expect(tomb?.deletedAt).toBeDefined();
    expect(h.state.messages.find((m) => m.id === reply)?.threadRootId).toBe(root);
    expect(h.state.reactions).toEqual([]);
    expect(h.state.saved).toEqual([]);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'c9', body: 'late', threadRootId: root }).ok).toBe(false);
    expect(validateMessagingState(h.state, scope, h.work).ok).toBe(true);
  });
});

describe('messaging domain: actor isolation, reactions, saved', () => {
  it('keeps drafts, saved, cursors and reactions separate per actor across self switches', () => {
    const h = harness();
    const conv = channel(h);
    const msg = send(h, conv, 'hello', 'c1');
    h.ok({ type: 'toggleReaction', messageId: msg, emoji: '👍' });
    h.ok({ type: 'toggleSaved', messageId: msg });
    h.ok({ type: 'setDraft', conversationId: conv, body: 'A draft' });
    h.ok({ type: 'markRead', conversationId: conv });

    h.ok({ type: 'setSelf', personId: B });
    expect(selectDraft(h.state, scope, h.work, conv)).toBeUndefined();
    expect(selectSaved(h.state, scope, h.work)).toEqual([]);
    const asB = selectFeed(h.state, scope, h.work, conv)?.messages[0];
    expect(asB?.reactions).toEqual([{ emoji: '👍', count: 1, reactedByActor: false }]);
    expect(asB?.savedByActor).toBe(false);
    expect(selectUnread(h.state, scope, h.work, conv).unread).toBe(1);
    h.ok({ type: 'toggleReaction', messageId: msg, emoji: '👍' });
    h.ok({ type: 'setDraft', conversationId: conv, body: 'B draft' });
    expect(h.state.reactions).toHaveLength(2);
    // B sending clears only B's draft.
    send(h, conv, 'from B', 'c2');
    expect(selectDraft(h.state, scope, h.work, conv)).toBeUndefined();
    expect(h.state.drafts.map((d) => d.actorPersonId)).toEqual([A]);

    h.ok({ type: 'setSelf', personId: A });
    expect(selectDraft(h.state, scope, h.work, conv)?.body).toBe('A draft');
    expect(selectSaved(h.state, scope, h.work)).toHaveLength(1);
    expect(selectFeed(h.state, scope, h.work, conv)?.messages[0].reactions[0]).toMatchObject({ count: 2, reactedByActor: true });
    expect(selectUnread(h.state, scope, h.work, conv).unread).toBe(1);
  });

  it('toggles reactions idempotently and rejects emoji outside the allow-list', () => {
    const h = harness();
    const conv = channel(h);
    const msg = send(h, conv, 'hello', 'c1');
    h.ok({ type: 'toggleReaction', messageId: msg, emoji: '🎉', present: true });
    h.ok({ type: 'toggleReaction', messageId: msg, emoji: '🎉', present: true });
    expect(h.state.reactions).toHaveLength(1);
    h.ok({ type: 'toggleReaction', messageId: msg, emoji: '🎉' });
    expect(h.state.reactions).toHaveLength(0);
    expect(h.run({ type: 'toggleReaction', messageId: msg, emoji: '<b>' }).ok).toBe(false);
  });
});

describe('messaging domain: unread and read cursors', () => {
  it('lists unread roots and replies without advancing the read cursor', () => {
    const h = harness();
    const conv = channel(h);
    h.ok({ type: 'setSelf', personId: B });
    const root = send(h, conv, 'root', 'b1');
    const reply = send(h, conv, 'reply', 'b2', { threadRootId: root });
    h.ok({ type: 'setSelf', personId: A });
    const cursors = [...h.state.readCursors];
    expect(selectUnreadMessages(h.state, scope, h.work).map((view) => view.message.id)).toEqual([reply, root]);
    expect(h.state.readCursors).toEqual(cursors);
    expect(selectUnread(h.state, scope, h.work, conv).unread).toBe(2);
  });

  it('excludes own and deleted messages, tracks mentions, and supports mark-unread', () => {
    const h = harness();
    const conv = channel(h);
    h.ok({ type: 'setSelf', personId: B });
    send(h, conv, 'hey @Amina', 'b1', { mentions: [{ participant: human(A), start: 4, end: 10 }] });
    const second = send(h, conv, 'second', 'b2');
    send(h, conv, 'third', 'b3');
    h.ok({ type: 'setSelf', personId: A });
    expect(selectUnread(h.state, scope, h.work, conv)).toMatchObject({ unread: 3, mentionUnread: 1, firstUnreadSeq: 1 });
    expect(selectMentions(h.state, scope, h.work)).toHaveLength(1);
    send(h, conv, 'mine', 'a1');
    expect(selectUnread(h.state, scope, h.work, conv).unread).toBe(3);
    h.ok({ type: 'setSelf', personId: B });
    h.ok({ type: 'deleteMessage', messageId: second });
    h.ok({ type: 'setSelf', personId: A });
    expect(selectUnread(h.state, scope, h.work, conv).unread).toBe(2);
    h.ok({ type: 'markRead', conversationId: conv });
    expect(selectUnread(h.state, scope, h.work, conv)).toEqual({ unread: 0, mentionUnread: 0 });
    h.ok({ type: 'markRead', conversationId: conv, seq: 1 });
    expect(h.state.readCursors[0].lastReadSeq).toBe(4);
    const third = h.state.messages.find((m) => m.body === 'third')!;
    h.ok({ type: 'markUnread', conversationId: conv, messageId: third.id });
    expect(selectUnread(h.state, scope, h.work, conv)).toMatchObject({ unread: 1, firstUnreadSeq: third.seq });
    expect(selectFeed(h.state, scope, h.work, conv)?.newMessagesFromSeq).toBe(third.seq);
    expect(selectConversationList(h.state, scope, h.work)[0].unread).toBe(1);
  });
});

describe('messaging domain: authorization (local integrity only)', () => {
  it('hides private conversations, unread and search from non-members', () => {
    const h = harness();
    const conv = channel(h, 'private', [human(B)]);
    send(h, conv, 'secret roadmap', 'c1');
    h.ok({ type: 'setSelf', personId: C });
    expect(selectConversationList(h.state, scope, h.work)).toEqual([]);
    expect(selectFeed(h.state, scope, h.work, conv)).toBeUndefined();
    expect(selectUnread(h.state, scope, h.work, conv)).toEqual({ unread: 0, mentionUnread: 0 });
    expect(searchMessages(h.state, scope, h.work, 'roadmap')).toEqual([]);
    expect(searchConversations(h.state, scope, h.work, 'private')).toEqual([]);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'x', body: 'hi' }).ok).toBe(false);
    expect(h.run({ type: 'markRead', conversationId: conv }).ok).toBe(false);
    const msg = h.state.messages[0];
    expect(h.run({ type: 'toggleReaction', messageId: msg.id, emoji: '👍' }).ok).toBe(false);
    expect(h.run({ type: 'toggleSaved', messageId: msg.id }).ok).toBe(false);
    expect(h.run({ type: 'setDraft', conversationId: conv, body: 'x' }).ok).toBe(false);
  });

  it('rejects stale organization/workspace scope on actions and selectors', () => {
    const h = harness();
    const conv = channel(h);
    send(h, conv, 'hello', 'c1');
    const wrongWorkspace = { ...scope, workspaceId: otherWorkspace };
    const wrongOrg = { ...scope, organizationId: '10000000-0000-4000-8000-0000000000ee' };
    for (const bad of [wrongWorkspace, wrongOrg]) {
      expect(selectConversationList(h.state, bad, h.work)).toEqual([]);
      expect(selectFeed(h.state, bad, h.work, conv)).toBeUndefined();
      expect(searchMessages(h.state, bad, h.work, 'hello')).toEqual([]);
      const result = applyMessagingAction(h.state, { type: 'sendMessage', conversationId: conv, clientId: 'z', body: 'x' }, { ...h.ctx(), scope: bad });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('scope_mismatch');
    }
    expect(h.state.messages).toHaveLength(1);
  });

  it('applies pure authorization functions to role, archive and authorship', () => {
    const h = harness();
    const conv = h.ok({ type: 'createChannel', name: 'ch', members: [human(B)] }).conversationId as string;
    const message = send(h, conv, 'm', 'c1');
    const convRecord = h.state.conversations[0];
    const ctxA = createLocalContext(scope, A, h.work);
    const ctxC = createLocalContext(scope, C, h.work);
    const ctxNone = createLocalContext(scope, null, h.work);
    const ctxOutsider = createLocalContext(scope, OUTSIDER, h.work);
    const msg = h.state.messages.find((m) => m.id === message)!;
    expect(canReadConversation(ctxA, convRecord, h.state.memberships)).toBe(true);
    expect(canReadConversation(ctxNone, convRecord, h.state.memberships)).toBe(false);
    expect(canReadConversation(ctxOutsider, convRecord, h.state.memberships)).toBe(false);
    expect(canPostInConversation(ctxC, convRecord, h.state.memberships)).toBe(false);
    expect(canEditMessage(ctxA, msg)).toBe(true);
    expect(canEditMessage(createLocalContext(scope, B, h.work), msg)).toBe(false);
    expect(canDeleteMessage(ctxA, { ...msg, workspaceId: otherWorkspace })).toBe(false);
    const guest = { ...h.state.memberships.find((m) => m.participant.id === B)!, role: 'guest' as const };
    expect(canPostInConversation(createLocalContext(scope, B, h.work), convRecord, [guest])).toBe(false);
    h.ok({ type: 'archiveConversation', conversationId: conv });
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'late', body: 'x' }).ok).toBe(false);
    expect(canPostInConversation(ctxA, h.state.conversations[0], h.state.memberships)).toBe(false);
  });

  it('validates entity refs by id inside the current workspace only', () => {
    const h = harness();
    const conv = channel(h);
    const good = [{ kind: 'task' as const, taskId: TASK }, { kind: 'approval' as const, approvalId: APPROVAL }, { kind: 'doat_run' as const, doatId: DOAT, runId: 'run-1' }];
    const id = send(h, conv, 'see these', 'c1', { refs: good });
    const view = selectFeed(h.state, scope, h.work, conv)?.messages.find((m) => m.message.id === id);
    expect(view?.refs.every((ref) => ref.status === 'available')).toBe(true);
    const bad = [{ kind: 'task' as const, taskId: FOREIGN_TASK }, { kind: 'approval' as const, approvalId: 'nope' }, { kind: 'doat_run' as const, doatId: DOAT, runId: 'other-run' }, { kind: 'activity' as const, activityId: 'nope' }];
    bad.forEach((ref, index) => expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: `bad${index}`, body: 'x', refs: [ref] }).ok).toBe(false));
    // A ref that later disappears renders as unavailable instead of being hidden.
    const later = selectFeed(h.state, scope, { ...h.work, tasks: [] }, conv)?.messages.find((m) => m.message.id === id);
    expect(later?.refs.map((ref) => ref.status)).toEqual(['unavailable', 'unavailable', 'unavailable']);
  });

  it('stores attachment metadata only and sanitises names', () => {
    const h = harness();
    const conv = channel(h);
    send(h, conv, '', 'c1', { attachments: [{ id: 'att_1', name: '../../etc/pass\u0000wd', mimeType: 'text/plain', sizeBytes: 12 }] });
    expect(h.state.messages[0].attachments).toEqual([{ id: 'att_1', name: '.. .. etc pass wd', mimeType: 'text/plain', sizeBytes: 12, status: 'metadata_only' }]);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'c2', body: 'x', attachments: [{ id: 'a', name: 'f', mimeType: 'bad mime', sizeBytes: 1 }] }).ok).toBe(false);
    expect(h.run({ type: 'sendMessage', conversationId: conv, clientId: 'c3', body: 'x', attachments: [{ id: 'a', name: 'f', mimeType: 'text/plain', sizeBytes: 1e12 }] }).ok).toBe(false);
  });
});

describe('messaging domain: search', () => {
  it('is case/diacritic-insensitive, AND-tokenised, filtered, ordered and HTML-free', () => {
    const h = harness();
    const conv = channel(h);
    const second = channel(h, 'second');
    send(h, conv, 'Café plans for <b>Lisbon</b>', 'c1');
    const savedId = send(h, second, 'cafe budget', 'c2');
    const root = send(h, conv, 'plans root', 'c3');
    send(h, conv, 'a reply', 'c4', { threadRootId: root });
    const deleted = send(h, conv, 'cafe deleted', 'c5');
    h.ok({ type: 'deleteMessage', messageId: deleted });
    h.ok({ type: 'toggleSaved', messageId: savedId });
    const all = searchMessages(h.state, scope, h.work, 'CAFE');
    expect(all.map((r) => r.message.body)).toEqual(['cafe budget', 'Café plans for <b>Lisbon</b>']);
    expect(all[1].snippet.slice(all[1].ranges[0].start, all[1].ranges[0].end)).toBe('Café');
    expect(searchMessages(h.state, scope, h.work, 'cafe lisbon').map((r) => r.message.body)).toEqual(['Café plans for <b>Lisbon</b>']);
    expect(searchMessages(h.state, scope, h.work, 'cafe', { inConversationId: second })).toHaveLength(1);
    expect(searchMessages(h.state, scope, h.work, 'cafe', { saved: true })).toHaveLength(1);
    expect(searchMessages(h.state, scope, h.work, 'plans', { hasThread: true })).toHaveLength(1);
    expect(searchMessages(h.state, scope, h.work, 'cafe', { from: human(B) })).toEqual([]);
    expect(searchMessages(h.state, scope, h.work, '  ')).toEqual([]);
    expect(searchMessages(h.state, scope, h.work, 'cafe', {}, B)).toEqual([]);
    expect(searchConversations(h.state, scope, h.work, 'bob').map((r) => r.title).sort()).toEqual(['#general', '#second']);
  });

  it('caps results at 100 deterministically', () => {
    const h = harness();
    const conv = channel(h);
    for (let i = 0; i < MAX_SEARCH_RESULTS + 20; i += 1) h.ok({ type: 'sendMessage', conversationId: conv, clientId: `c${i}`, body: `needle ${i}` }, t0);
    const results = searchMessages(h.state, scope, h.work, 'needle');
    expect(results).toHaveLength(MAX_SEARCH_RESULTS);
    expect(results[0].message.seq).toBe(MAX_SEARCH_RESULTS + 20);
    expect(searchMessages(h.state, scope, h.work, 'needle').map((r) => r.message.id)).toEqual(results.map((r) => r.message.id));
  });
});

describe('messaging domain: system events and mention candidates', () => {
  it('derives idempotent approval events only in a task-linked channel', () => {
    const h = harness();
    channel(h, 'unlinked');
    const linked = h.ok({ type: 'createChannel', name: 'task-room', visibility: 'private', linkedTaskId: TASK }).conversationId as string;
    h.ok({ type: 'deriveSystemEvents' });
    h.ok({ type: 'deriveSystemEvents' });
    const events = h.state.messages;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ conversationId: linked, type: 'approval_event', author: { kind: 'system', id: 'gwira.system' }, clientId: `sys:${APPROVAL}:pending`, refs: [{ kind: 'approval', approvalId: APPROVAL }] });
    expect(validateMessagingState(h.state, scope, h.work).ok).toBe(true);
    const decided = { ...h.work, approvals: [{ ...h.work.approvals[0], status: 'approved' as const, decidedAt: t0 }] };
    h.state = harness(h.state, decided).state;
    const h2 = harness(h.state, decided);
    h2.ok({ type: 'deriveSystemEvents' });
    expect(h2.state.messages).toHaveLength(2);
  });

  it('lists mention candidates from conversation members of the current workspace', () => {
    const h = harness();
    const conv = channel(h, 'c', [human(B), doat(DOAT)]);
    expect(selectMentionCandidates(h.state, scope, h.work, conv).map((p) => p.name).sort()).toEqual(['Amina', 'Bõb', 'Scout']);
  });

  it('allocates collision-free ids even if rand repeats', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 5; i += 1) taken.add(newUniqueId('msg', 1, () => 0.5, (id) => taken.has(id)));
    expect(taken.size).toBe(5);
  });
});
