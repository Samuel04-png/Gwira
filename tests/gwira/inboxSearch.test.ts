import { describe, expect, it } from 'vitest';
import { runMessageSearch } from '../../src/renderer/gwira/inbox/inboxSearch.js';
import { selectConversationList, selectEligibleParticipants } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import { B, channel, harness, human, rawMessage, scope, send, TASK } from './messagingFixtures.js';

describe('Inbox message search', () => {
  it('allows supported filter-only searches while preserving access-aware domain filtering', () => {
    const h = harness();
    const conversationId = channel(h, 'ops');
    const attachmentId = send(h, conversationId, 'with file', 'file', {
      attachments: [{ id: 'att_1', name: 'plan.txt', mimeType: 'text/plain', sizeBytes: 12 }]
    });
    const taskId = send(h, conversationId, 'with task', 'task', { refs: [{ kind: 'task', taskId: TASK }] });
    const remoteUnread = rawMessage(h.state, conversationId, 3, 'a remote update', '2026-10-24T10:05:00.000Z', { author: human(B) });
    h.state = { ...h.state, messages: [...h.state.messages, remoteUnread] };
    h.ok({ type: 'markRead', conversationId, seq: 1 });
    const conversations = selectConversationList(h.state, scope, h.work);
    const participants = selectEligibleParticipants(h.work, scope);
    const search = (query: string) => runMessageSearch(h.state, scope, h.work, query, conversations, participants);

    expect(search('has:file').results.map((result) => result.message.id)).toEqual([attachmentId]);
    expect(search('has:task').results.map((result) => result.message.id)).toEqual([taskId]);
    expect(search('is:unread').results.map((result) => result.message.id)).toEqual([remoteUnread.id]);
    expect(search('is:doat').results).toEqual([]);
    expect(search('has:file').active).toBe(true);
    expect(search('has:file').results[0]).toMatchObject({ snippet: 'with file', ranges: [] });
  });

  it('applies calendar-day date filters in UTC and reports invalid date syntax', () => {
    const h = harness();
    const conversationId = channel(h, 'dates');
    h.state = {
      ...h.state,
      messages: [
        rawMessage(h.state, conversationId, 1, 'october', '2026-10-24T23:59:59.000Z'),
        rawMessage(h.state, conversationId, 2, 'november', '2026-11-01T00:00:00.000Z')
      ]
    };
    const conversations = selectConversationList(h.state, scope, h.work);
    const participants = selectEligibleParticipants(h.work, scope);
    const search = (query: string) => runMessageSearch(h.state, scope, h.work, query, conversations, participants);

    expect(search('on:2026-10-24').results.map((result) => result.message.body)).toEqual(['october']);
    expect(search('before:2026-11-01').results.map((result) => result.message.body)).toEqual(['october']);
    expect(search('after:2026-10-24').results.map((result) => result.message.body)).toEqual(['november']);
    expect(search('on:not-a-date').notes).toContain('"on:not-a-date" needs a YYYY-MM-DD date.');
    expect(search('on:not-a-date october').results).toEqual([]);
    expect(search('on:2026-10-24').notes).toContain('Date filters use UTC calendar days.');
  });

  it('combines literal words and filters without turning user input into a pattern', () => {
    const h = harness();
    const conversationId = channel(h, 'literal');
    send(h, conversationId, 'report [draft] is ready', 'literal', { refs: [{ kind: 'task', taskId: TASK }] });
    const outcome = runMessageSearch(h.state, scope, h.work, '[draft] has:task', selectConversationList(h.state, scope, h.work), selectEligibleParticipants(h.work, scope));
    expect(outcome.results.map((result) => result.message.body)).toEqual(['report [draft] is ready']);
  });

  it('scopes header search by readable identity even when display names collide', () => {
    const h = harness();
    const first = channel(h, 'first');
    const second = channel(h, 'second');
    send(h, first, 'first record', 'first-record');
    send(h, second, 'second record', 'second-record');
    const list = selectConversationList(h.state, scope, h.work).map((item) => ({ ...item, title: 'Same name' }));
    const people = selectEligibleParticipants(h.work, scope);
    expect(runMessageSearch(h.state, scope, h.work, `in:"${second}"`, list, people).results.map((hit) => hit.message.body)).toEqual(['second record']);
    expect(runMessageSearch(h.state, scope, h.work, `in:"${second}"`, list.filter((item) => item.conversation.id !== second), people).results).toEqual([]);
  });
});
