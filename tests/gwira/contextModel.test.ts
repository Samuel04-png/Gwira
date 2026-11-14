import { describe, expect, it } from 'vitest';
import { buildContextModel } from '../../src/renderer/gwira/inbox/contextModel.js';
import { selectFeed } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import type { Message } from '../../src/renderer/gwira/messaging/domain/types.js';
import { APPROVAL, A, B, DOAT, FOREIGN_TASK, TASK, channel, doat, harness, human, makeWork, rawMessage, scope, send, t0 } from './messagingFixtures.js';

describe('inbox context model', () => {
  it('resolves real task, approval, activity, and Doat run records and separates member kinds', () => {
    const h = harness();
    const conversationId = channel(h);
    const messageId = send(h, conversationId, 'references', 'refs');
    const message = h.state.messages.find((item) => item.id === messageId)!;
    h.state = {
      ...h.state,
      memberships: [...h.state.memberships, { conversationId, participant: doat(DOAT), role: 'member', joinedAt: t0 }],
      messages: [{ ...message, refs: [
        { kind: 'approval', approvalId: APPROVAL },
        { kind: 'activity', activityId: 'activity-1' },
        { kind: 'doat_run', doatId: DOAT, runId: 'run-1' }
      ] }]
    };
    const work = { ...makeWork(), activity: [{ id: 'activity-1', workspaceId: scope.workspaceId, kind: 'task_updated' as const, occurredAt: t0, summary: 'Task status changed', taskId: TASK }] };
    const feed = selectFeed(h.state, scope, work, conversationId)!;
    const model = buildContextModel(feed, work, scope)!;

    expect(model.members.map(({ kind, name }) => [kind, name])).toEqual([['human', 'Amina'], ['human', 'Bõb'], ['doat', 'Scout']]);
    expect(model.entities.map(({ kind, available }) => [kind, available])).toEqual([
      ['approval', true], ['activity', true], ['doat_run', true]
    ]);
    expect(model.entities[0]).toMatchObject({ kind: 'approval', status: 'pending', resultId: 'r1', taskTitle: 'Task a1' });
    expect(model.entities[1]).toMatchObject({ kind: 'activity', title: 'Task status changed', occurredAt: t0, taskId: TASK });
    expect(model.entities[2]).toMatchObject({ kind: 'doat_run', status: 'completed', doatName: 'Scout', taskId: TASK });
  });

  it('shows missing and cross-workspace refs generically without returning stale titles or ids', () => {
    const h = harness();
    const conversationId = channel(h);
    const messageId = send(h, conversationId, 'refs', 'refs');
    const message = h.state.messages.find((item) => item.id === messageId)!;
    h.state = {
      ...h.state,
      messages: [{ ...message, refs: [
        { kind: 'task', taskId: FOREIGN_TASK },
        { kind: 'approval', approvalId: 'missing-approval' },
        { kind: 'doat_run', doatId: DOAT, runId: 'missing-run' }
      ] }]
    };
    const feed = selectFeed(h.state, scope, makeWork(), conversationId)!;
    const model = buildContextModel(feed, makeWork(), scope)!;
    expect(model.entities).toHaveLength(3);
    for (const entity of model.entities) {
      expect(entity).toMatchObject({ available: false, title: 'No longer available' });
      expect(JSON.stringify(entity)).not.toContain(FOREIGN_TASK);
      expect(JSON.stringify(entity)).not.toContain('missing-approval');
    }
  });

  it('includes a conversation task link, counts only this actor’s saved visible messages, and rejects stale scope', () => {
    const h = harness();
    const conversationId = h.ok({ type: 'createChannel', name: 'linked', linkedTaskId: TASK }).conversationId as string;
    const ownId = send(h, conversationId, 'saved', 'one');
    const other = rawMessage(h.state, conversationId, 2, 'other', t0, { id: 'other-message', author: human(B) });
    h.state = {
      ...h.state,
      messages: [...h.state.messages, other],
      saved: [
        { messageId: ownId, conversationId, actorPersonId: A, savedAt: t0 },
        { messageId: 'other-message', conversationId, actorPersonId: B, savedAt: t0 },
        { messageId: 'missing-message', conversationId, actorPersonId: A, savedAt: t0 }
      ]
    };
    const work = makeWork();
    const feed = selectFeed(h.state, scope, work, conversationId)!;
    const model = buildContextModel(feed, work, scope, h.state)!;
    expect(model.entities[0]).toMatchObject({ kind: 'task', title: 'Task a1', taskId: TASK });
    expect(model.savedCount).toBe(1);
    expect(buildContextModel(feed, work, scope, { ...h.state, workspaceId: 'stale-workspace' })?.savedCount).toBeUndefined();
    expect(buildContextModel(feed, work, { ...scope, workspaceId: 'another-workspace' })).toBeUndefined();
  });

  it('does not expose message refs from tombstoned messages', () => {
    const h = harness();
    const conversationId = channel(h);
    const raw = rawMessage(h.state, conversationId, 1, '', t0, {
      id: 'deleted', deletedAt: t0, refs: [{ kind: 'task', taskId: TASK }]
    } satisfies Partial<Message>);
    h.state = { ...h.state, messages: [raw] };
    const feed = selectFeed(h.state, scope, makeWork(), conversationId)!;
    expect(buildContextModel(feed, makeWork(), scope)?.entities).toEqual([]);
  });
});
