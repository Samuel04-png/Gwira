import { describe, expect, it } from 'vitest';
import { MESSAGING_STORAGE_KEY, messagingStorageKey, parseMessagingState } from '../../src/renderer/gwira/messaging/data/messagingStore.js';
import type { MessagingScope } from '../../src/renderer/gwira/messaging/domain/types.js';
import { createInboxSampleState, createInboxSampleWork, seedInboxSampleStorage } from '../../src/renderer/gwira/inbox/inboxDevSample.js';
import { selectConversationList, selectDrafts, selectFailedSends, selectMentions, selectSaved } from '../../src/renderer/gwira/messaging/domain/selectors.js';

const scope: MessagingScope = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002'
};

describe('Inbox dev sample', () => {
  it('contains the requested conversation mix and feed features', () => {
    const work = createInboxSampleWork(scope);
    const sample = createInboxSampleState(scope);
    expect(work.people).toHaveLength(4);
    expect(work.doats).toHaveLength(1);
    expect(sample.conversations.filter((conversation) => conversation.kind === 'channel')).toHaveLength(3);
    expect(sample.conversations.filter((conversation) => conversation.kind === 'group')).toHaveLength(1);
    expect(sample.conversations.filter((conversation) => conversation.kind === 'dm')).toHaveLength(2);
    expect(sample.messages).toHaveLength(40);
    expect(sample.messages.filter((message) => message.threadRootId)).toHaveLength(11);
    expect(sample.messages.filter((message) => message.replyCount === 2)).toHaveLength(2);
    expect(sample.messages.flatMap((message) => message.refs)).toHaveLength(3);
    expect(sample.messages.filter((message) => message.sendState === 'failed')).toHaveLength(1);
    expect(sample.reactions.length).toBeGreaterThanOrEqual(3);
    const unread = selectConversationList(sample, scope, work).filter((item) => item.unread > 0);
    expect(unread.map((item) => item.conversation.id).sort()).toEqual(['inbox-sample-channel-customer', 'inbox-sample-channel-design', 'inbox-sample-channel-launch', 'inbox-sample-dm-mina', 'inbox-sample-group-launch']);
  });

  it('writes sample messages only under the isolated storage prefix', () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value); }
    };
    const work = createInboxSampleWork(scope);
    seedInboxSampleStorage(storage, scope);
    const sampleKey = `gwira.inbox.dev-sample.v1:${messagingStorageKey(scope)}`;
    expect(records.has(messagingStorageKey(scope))).toBe(false);
    expect(records.has(`${MESSAGING_STORAGE_KEY}:${scope.organizationId}:${scope.workspaceId}`)).toBe(false);
    const parsed = parseMessagingState(records.get(sampleKey) ?? null, scope, work);
    expect(parsed.status === 'ok' ? [] : parsed.issues).toEqual([]);
    expect(parsed.status).toBe('ok');
  });

  it('includes drafts, mentions, saved messages and review items', () => {
    const work = createInboxSampleWork(scope);
    const sample = createInboxSampleState(scope);
    const drafts = selectDrafts(sample, scope, work);
    expect(drafts).toHaveLength(3);
    expect(selectFailedSends(sample, scope, work)).toHaveLength(1);
    expect(drafts.filter((draft) => draft.threadRootId)).toHaveLength(1);
    const mentions = selectMentions(sample, scope, work);
    expect(mentions).toHaveLength(5);
    expect(mentions.filter((view) => view.unread)).toHaveLength(2);
    const saved = selectSaved(sample, scope, work);
    expect(saved).toHaveLength(6);
    expect(new Set(saved.map((view) => view.message.conversationId)).size).toBe(3);
    expect(work.approvals.filter((approval) => approval.status === 'pending')).toHaveLength(2);
    expect(work.activity.filter((event) => event.kind === 'task_updated' || event.kind === 'task_status_changed')).toHaveLength(2);
    expect(work.approvals.every((approval) => work.tasks.some((task) => task.id === approval.taskId))).toBe(true);
  });
});
