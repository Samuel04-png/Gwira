import type { Person, Task } from '../domain/types.js';
import type { StorageLike } from '../messaging/data/messagingStore.js';
import { MESSAGING_RECOVERY_KEY, MESSAGING_STORAGE_KEY, messagingRecoveryKey, messagingStorageKey, serializeMessagingState } from '../messaging/data/messagingStore.js';
import type { Conversation, EntityRef, Message, MessagingScope, MessagingState, MessagingWork, ParticipantRef, Reaction, Draft, SavedMessage } from '../messaging/domain/types.js';

const SAMPLE_STORAGE_PREFIX = 'gwira.inbox.dev-sample.v1:';
export const INBOX_SAMPLE_FIRST_CONVERSATION_ID = 'inbox-sample-channel-launch';
export const INBOX_SAMPLE_TASK_ID = '00000000-0000-4000-8000-000000000199';

const PEOPLE = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'Avery Chen', role: 'Operations' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Mina Torres', role: 'Design' },
  { id: '00000000-0000-4000-8000-000000000103', name: 'Jordan Lee', role: 'Marketing' },
  { id: '00000000-0000-4000-8000-000000000104', name: 'Sam Rivera', role: 'Customer success' }
] as const;
const DOAT_ID = '00000000-0000-4000-8000-000000000105';

// Thread layout per room: root sequence, reply sequences, and replies authored by the current person.
const THREAD_PLANS = new Map<number, { root: number; replies: number[]; selfReplies?: number[] }>([
  [0, { root: 2, replies: [6, 7] }],
  [1, { root: 2, replies: [4, 5, 6, 7], selfReplies: [4] }],
  [2, { root: 1, replies: [3, 4, 6], selfReplies: [3] }],
  [3, { root: 3, replies: [6, 7] }]
]);

// Messages that mention the current person: two are past the read cursor (unread), three are already read.
const MENTION_SLOTS = new Set(['1-5', '2-6', '1-3', '2-2', '3-2']);
// Older history per room (days back by sequence) so mentions fall into Today, Yesterday and Earlier.
const HISTORY_DAYS_BACK = new Map<number, (seq: number) => number>([
  [1, (seq) => (seq <= 3 ? 1 : 0)],
  [2, (seq) => (seq <= 2 ? 1 : 0)],
  [3, (seq) => (seq <= 2 ? 4 : 0)]
]);
const SAVED_SLOTS: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, 3], [2, 2], [2, 4], [0, 3], [0, 5]];

const ROOM_PLANS: Array<{ id: string; kind: Conversation['kind']; name: string; members: ParticipantRef[]; count: number }> = [
  { id: INBOX_SAMPLE_FIRST_CONVERSATION_ID, kind: 'channel', name: 'launch-planning', members: [...PEOPLE.map((person) => ({ kind: 'human' as const, id: person.id })), { kind: 'doat', id: DOAT_ID }], count: 9 },
  { id: 'inbox-sample-channel-design', kind: 'channel', name: 'design-crit', members: [...PEOPLE.map((person) => ({ kind: 'human' as const, id: person.id })), { kind: 'doat', id: DOAT_ID }], count: 7 },
  { id: 'inbox-sample-channel-customer', kind: 'channel', name: 'customer-notes', members: [...PEOPLE.map((person) => ({ kind: 'human' as const, id: person.id })), { kind: 'doat', id: DOAT_ID }], count: 7 },
  { id: 'inbox-sample-group-launch', kind: 'group', name: 'Launch crew', members: [{ kind: 'human', id: PEOPLE[0].id }, { kind: 'human', id: PEOPLE[1].id }, { kind: 'human', id: PEOPLE[2].id }, { kind: 'doat', id: DOAT_ID }], count: 7 },
  { id: 'inbox-sample-dm-mina', kind: 'dm', name: 'Mina Torres', members: [{ kind: 'human', id: PEOPLE[0].id }, { kind: 'human', id: PEOPLE[1].id }], count: 5 },
  { id: 'inbox-sample-dm-doat', kind: 'dm', name: 'Quill', members: [{ kind: 'human', id: PEOPLE[0].id }, { kind: 'doat', id: DOAT_ID }], count: 5 }
];

const COPY = [
  'The launch brief is ready for review. I linked the task so the decision stays with the work.',
  'I added the latest customer notes and the open questions from yesterday.',
  'The checklist now covers scope, owners, and the approval needed before the next step.',
  'Thanks, I will review this and record any changes before we move ahead.',
  'The revised copy is in place. Please check the opening section when you have a moment.',
  'That looks good to me. I will keep the notes together here for the team.',
  'One small update: the handoff is ready, and the remaining question is now resolved.',
  'I have added the review record below so it is easy to find later.',
  'The final notes are ready to share with the group.'
] as const;

function participants(scope: MessagingScope): { people: Person[]; doat: MessagingWork['doats'][number]; task: Task } {
  const createdAt = '2026-10-24T10:00:00.000Z';
  const people: Person[] = PEOPLE.map((person) => ({ ...person, workspaceId: scope.workspaceId, createdAt }));
  const doat: MessagingWork['doats'][number] = {
    id: DOAT_ID, workspaceId: scope.workspaceId, createdAt, updatedAt: createdAt,
    identity: { name: 'Quill', role: 'Research Doat' },
    intelligence: { providerId: 'unavailable', providerAvailability: 'unavailable', businessContextRefs: [] },
    capabilities: [], governance: { autonomy: 'supervised', approvalRequired: true, allowedProjectPaths: [], maxConcurrentRuns: 1 },
    appearance: { active: { id: 'inbox-sample-visual', revision: 1, createdAt, source: 'procedural', spec: { seed: 'inbox-sample', shape: 'orb', paletteId: 'slate', expressionStyle: 'composed', tone: 'muted', accessory: 'none' } }, history: [] },
    operations: { status: 'unavailable', updatedAt: createdAt }
  };
  const task: Task = {
    id: INBOX_SAMPLE_TASK_ID, workspaceId: scope.workspaceId, title: 'Review the launch brief',
    status: 'in_review', priority: 'medium', createdAt, updatedAt: createdAt
  };
  return { people, doat, task };
}

/** Review records for the sample set: two approvals waiting on the person and two task updates. */
function sampleReview(scope: MessagingScope, task: Task): Pick<MessagingWork, 'tasks' | 'approvals' | 'activity'> {
  const at = (minutesAgo: number): string => new Date(Date.parse('2026-10-24T14:00:00.000Z') - minutesAgo * 60_000).toISOString();
  const makeTask = (id: string, title: string, status: Task['status']): Task => ({ ...task, id, title, status, updatedAt: at(30) });
  const tasks = [task,
    { ...makeTask('inbox-sample-task-copy', 'Approve the launch copy', 'in_review'), priority: 'high' as const, dueDate: '2026-10-27', assignee: { kind: 'person' as const, id: PEOPLE[1].id }, description: 'Final pass on the launch announcement copy before it goes to the customer list.' },
    { ...makeTask('inbox-sample-task-pricing', 'Check the pricing page changes', 'in_review'), priority: 'medium' as const, dueDate: '2026-10-30', assignee: { kind: 'agent' as const, id: DOAT_ID } },
    makeTask('inbox-sample-task-notes', 'Publish the customer notes', 'in_progress'), makeTask('inbox-sample-task-handoff', 'Prepare the design handoff', 'in_progress')];
  const requester = { kind: 'agent' as const, id: DOAT_ID };
  const approvals = [
    { id: 'inbox-sample-approval-copy', taskId: 'inbox-sample-task-copy', resultId: 'sample-result-copy', requestedBy: requester, status: 'pending' as const, createdAt: at(40) },
    { id: 'inbox-sample-approval-pricing', taskId: 'inbox-sample-task-pricing', resultId: 'sample-result-pricing', requestedBy: requester, status: 'pending' as const, createdAt: at(130) }
  ];
  const activity = [
    { id: 'inbox-sample-activity-notes', workspaceId: scope.workspaceId, kind: 'task_updated' as const, occurredAt: at(25), actor: { kind: 'person' as const, id: PEOPLE[1].id }, taskId: 'inbox-sample-task-notes', summary: 'Updated “Publish the customer notes”' },
    { id: 'inbox-sample-activity-handoff', workspaceId: scope.workspaceId, kind: 'task_status_changed' as const, occurredAt: at(75), actor: { kind: 'person' as const, id: PEOPLE[2].id }, taskId: 'inbox-sample-task-handoff', summary: 'Moved “Prepare the design handoff” to In progress' }
  ];
  return { tasks, approvals, activity };
}

export function createInboxSampleWork(scope: MessagingScope): MessagingWork {
  const sample = participants(scope);
  return { people: sample.people, doats: [sample.doat], projects: [], ...sampleReview(scope, sample.task) };
}

export function createInboxSampleState(scope: MessagingScope, now = new Date().toISOString()): MessagingState {
  const self: ParticipantRef = { kind: 'human', id: PEOPLE[0].id };
  const conversations: Conversation[] = [];
  const memberships: MessagingState['memberships'] = [];
  const messages: Message[] = [];
  const reactions: Reaction[] = [];
  const readCursors: MessagingState['readCursors'] = [];
  const taskRef: EntityRef = { kind: 'task', taskId: INBOX_SAMPLE_TASK_ID };
  const origin = Date.parse(now);
  const unreadFrom = new Map<string, number>([[INBOX_SAMPLE_FIRST_CONVERSATION_ID, 1], ['inbox-sample-channel-design', 3], ['inbox-sample-channel-customer', 5], ['inbox-sample-group-launch', 4], ['inbox-sample-dm-mina', 1]]);

  ROOM_PLANS.forEach((plan, roomIndex) => {
    const memberList = plan.members;
    const createdAt = new Date(origin - 7 * 86_400_000 + roomIndex * 1000).toISOString();
    const conversation: Conversation = {
      id: plan.id, organizationId: scope.organizationId, workspaceId: scope.workspaceId,
      kind: plan.kind, ...(plan.kind === 'dm' ? {} : { name: plan.name }),
      visibility: plan.kind === 'channel' ? 'org' : 'private',
      ...(plan.kind === 'dm' ? { dmKey: memberList.map((member) => `${member.kind}:${member.id}`).sort().join('|') } : {}),
      createdAt, createdBy: self, lastMessageSeq: plan.count
    };
    conversations.push(conversation);
    memberList.forEach((participant, memberIndex) => memberships.push({
      conversationId: plan.id, participant, role: memberIndex === 0 ? 'owner' : 'member', joinedAt: createdAt
    }));

    const roots: Message[] = [];
    const authorPool = memberList.filter((member) => member.kind !== 'doat');
    for (let seq = 1; seq <= plan.count; seq += 1) {
      const threadPlan = THREAD_PLANS.get(roomIndex);
      const isThreadReply = Boolean(threadPlan?.replies.includes(seq));
      const rootSeq = threadPlan?.root ?? 0;
      const root = isThreadReply ? roots.find((item) => item.seq === rootSeq) : undefined;
      const baseAuthor = (seq === plan.count && roomIndex === 0) || threadPlan?.selfReplies?.includes(seq)
        ? self
        : authorPool[(seq + roomIndex) % authorPool.length]!;
      const slot = `${roomIndex}-${seq}`;
      const authorBase = MENTION_SLOTS.has(slot) && baseAuthor.id === self.id
        ? authorPool[(seq + roomIndex + 1) % authorPool.length]!
        : baseAuthor;
      const author: ParticipantRef = authorBase;
      const mentionsSelf = MENTION_SLOTS.has(slot) && author.id !== self.id;
      const baseBody = COPY[(seq + roomIndex) % COPY.length]!;
      const messageTime = new Date(origin - (plan.count - seq) * 3 * 60_000 - (HISTORY_DAYS_BACK.get(roomIndex)?.(seq) ?? 0) * 86_400_000).toISOString();
      const message: Message = {
        id: `inbox-sample-message-${roomIndex}-${seq}`, clientId: `inbox-sample-client-${roomIndex}-${seq}`,
        conversationId: plan.id, organizationId: scope.organizationId, workspaceId: scope.workspaceId, seq, author,
        type: 'text', body: mentionsSelf ? `@Avery Chen ${baseBody}` : baseBody, createdAt: messageTime,
        ...(root ? { threadRootId: root.id } : {}),
        mentions: mentionsSelf ? [{ participant: self, start: 0, end: 11 }] : [],
        attachments: roomIndex === 1 && seq === 6 ? [{ id: 'inbox-sample-attachment-1', name: 'hero-v3.png', mimeType: 'image/png', sizeBytes: 482_113, status: 'metadata_only' }] : [],
        refs: (roomIndex === 0 && seq === 3) || (roomIndex === 2 && seq === 4) ? [taskRef] : roomIndex === 3 && seq === 2 ? [{ kind: 'approval', approvalId: 'inbox-sample-approval-copy' }] : [],
        sendState: roomIndex === 0 && seq === plan.count ? 'failed' : 'local_saved',
        ...(roomIndex === 0 && seq === plan.count ? { failureReason: 'storage_unavailable' as const } : {})
      };
      if (!root) roots.push(message);
      messages.push(message);
      if (seq === 2 || seq === 4) reactions.push({ messageId: message.id, emoji: seq === 2 ? '👍' : '✅', actorPersonId: PEOPLE[1].id, at: messageTime });
      if (seq === 5 && (roomIndex === 0 || roomIndex === 3)) reactions.push({ messageId: message.id, emoji: '🎉', actorPersonId: PEOPLE[0].id, at: messageTime });
      conversation.lastMessageAt = messageTime;
    }
    readCursors.push({
      conversationId: plan.id, actorPersonId: PEOPLE[0].id,
      lastReadSeq: unreadFrom.get(plan.id) ?? plan.count,
      updatedAt: now
    });
  });

  const drafts: Draft[] = [
    { conversationId: 'inbox-sample-channel-customer', actorPersonId: PEOPLE[0].id, body: 'Draft summary for the customer call: three open questions and the follow-up owner.', updatedAt: new Date(origin - 20 * 60_000).toISOString() },
    { conversationId: 'inbox-sample-dm-mina', actorPersonId: PEOPLE[0].id, body: 'Thanks Mina, can we move the review to Thursday?', updatedAt: new Date(origin - 45 * 60_000).toISOString() },
    { conversationId: 'inbox-sample-channel-design', threadRootId: 'inbox-sample-message-1-2', actorPersonId: PEOPLE[0].id, body: 'I will fold the hero change into the next pass and post the result here.', updatedAt: new Date(origin - 70 * 60_000).toISOString() }
  ];
  const saved: SavedMessage[] = SAVED_SLOTS.map(([room, seq], index) => ({
    messageId: `inbox-sample-message-${room}-${seq}`, conversationId: ROOM_PLANS[room]!.id, actorPersonId: PEOPLE[0].id, savedAt: new Date(origin - (index + 1) * 600_000).toISOString()
  }));

  const state: MessagingState = {
    schemaVersion: 1, organizationId: scope.organizationId, workspaceId: scope.workspaceId, selfPersonId: PEOPLE[0].id,
    conversations, memberships, messages, reactions, saved, readCursors, drafts
  };
  const first = conversations[0]!;
  const root = messages.find((message) => message.conversationId === first.id && message.seq === 2)!;
  root.replyCount = 2;
  root.lastReplyAt = messages.find((message) => message.conversationId === first.id && message.seq === 7)!.createdAt;
  const groupRoot = messages.find((message) => message.conversationId === 'inbox-sample-group-launch' && message.seq === 3)!;
  groupRoot.replyCount = 2;
  groupRoot.lastReplyAt = messages.find((message) => message.conversationId === groupRoot.conversationId && message.seq === 7)!.createdAt;
  THREAD_PLANS.forEach((plan, roomIndex) => {
    const conversationId = ROOM_PLANS[roomIndex]!.id;
    if (roomIndex === 0 || roomIndex === 3) return;
    const threadRoot = messages.find((message) => message.conversationId === conversationId && message.seq === plan.root)!;
    threadRoot.replyCount = plan.replies.length;
    threadRoot.lastReplyAt = messages.find((message) => message.conversationId === conversationId && message.seq === plan.replies[plan.replies.length - 1])!.createdAt;
  });
  return state;
}

export function createInboxSampleStorage(storage: StorageLike): StorageLike {
  return {
    getItem: (key) => storage.getItem(`${SAMPLE_STORAGE_PREFIX}${key}`),
    setItem: (key, value) => storage.setItem(`${SAMPLE_STORAGE_PREFIX}${key}`, value)
  };
}

export function seedInboxSampleStorage(storage: StorageLike, scope: MessagingScope): void {
  const sampleStorage = createInboxSampleStorage(storage);
  sampleStorage.setItem(messagingStorageKey(scope), serializeMessagingState(createInboxSampleState(scope)));
}

export function clearInboxSampleStorage(storage: Storage & StorageLike, scope: MessagingScope): void {
  for (const key of [
    messagingStorageKey(scope), messagingRecoveryKey(scope),
    MESSAGING_STORAGE_KEY, MESSAGING_RECOVERY_KEY
  ]) storage.removeItem(`${SAMPLE_STORAGE_PREFIX}${key}`);
}
