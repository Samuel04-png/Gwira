import { describe, expect, it } from 'vitest';
import type { MessagingScope } from '../../src/renderer/gwira/messaging/domain/types.js';
import { createInboxSampleState, createInboxSampleWork } from '../../src/renderer/gwira/inbox/inboxDevSample.js';
import { filterMentions, groupMentions, mentionBucket, mentionPlace, mentionTimeLabel, mentionUnreadCount } from '../../src/renderer/gwira/inbox/mentionsModel.js';
import { relativeTimeLabel } from '../../src/renderer/gwira/inbox/unreadModel.js';
import { selectConversationList, selectMentions } from '../../src/renderer/gwira/messaging/domain/selectors.js';

const scope: MessagingScope = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002'
};

describe('Mentions model', () => {
  const now = new Date(2026, 9, 25, 12, 0, 0);

  it('buckets by local calendar day', () => {
    expect(mentionBucket(new Date(2026, 9, 25, 0, 5).toISOString(), now)).toBe('today');
    expect(mentionBucket(new Date(2026, 9, 24, 23, 55).toISOString(), now)).toBe('yesterday');
    expect(mentionBucket(new Date(2026, 9, 23, 12).toISOString(), now)).toBe('earlier');
    expect(mentionBucket('not a date', now)).toBe('earlier');
  });

  it('shows the sample mentions as 5 rows in 3 groups with 2 unread', () => {
    const work = createInboxSampleWork(scope);
    const state = createInboxSampleState(scope);
    const views = selectMentions(state, scope, work);
    expect(views).toHaveLength(5);
    const groups = groupMentions(views, new Date());
    expect(groups.map((group) => [group.label, group.views.length])).toEqual([['Today', 2], ['Yesterday', 2], ['Earlier', 1]]);
    expect(mentionUnreadCount(views)).toBe(2);
    expect(filterMentions(views, 'unread')).toHaveLength(2);
    expect(filterMentions(views, 'all')).toHaveLength(5);
    expect(views.every((view) => view.author.ref.kind === 'human')).toBe(true);
  });

  it('names the place and formats time', () => {
    const work = createInboxSampleWork(scope);
    const state = createInboxSampleState(scope);
    const list = selectConversationList(state, scope, work);
    const byId = new Map(list.map((item) => [item.conversation.id, item]));
    expect(mentionPlace(byId.get('inbox-sample-channel-launch'))).toBe('#launch-planning');
    expect(mentionPlace(byId.get('inbox-sample-dm-mina'))).toBe('a direct message');
    expect(mentionPlace(byId.get('inbox-sample-group-launch'))).toBe('Launch crew');
    expect(mentionPlace(undefined)).toBe('a conversation');
    expect(mentionTimeLabel(new Date(2026, 9, 25, 11, 40).toISOString(), now, relativeTimeLabel)).toBe('20m');
    expect(mentionTimeLabel(new Date(2026, 9, 24, 15, 5).toISOString(), now, relativeTimeLabel)).toMatch(/3:05\s?PM/);
  });
});
