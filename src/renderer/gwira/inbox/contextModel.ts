import type { TaskStatus, TaskPriority, ApprovalStatus } from '../domain/types.js';
import { participantView } from '../messaging/domain/selectors.js';
import type { FeedView } from '../messaging/domain/selectors.js';
import type { EntityRef, MessagingScope, MessagingWork, SavedMessage, Message, MessagingState } from '../messaging/domain/types.js';

export type ContextMember = {
  key: string;
  kind: 'human' | 'doat';
  name: string;
  role?: string;
  available: boolean;
};

type EntityBase = { key: string; kind: 'task' | 'approval' | 'activity' | 'doat_run'; available: true; taskId?: string };
type UnavailableEntity = { key: string; kind: EntityBase['kind']; available: false; title: 'No longer available' };
export type ContextEntity =
  | (EntityBase & { kind: 'task'; title: string; status: TaskStatus; priority: TaskPriority; dueDate?: string })
  | (EntityBase & { kind: 'approval'; title: string; taskTitle: string; status: ApprovalStatus; resultId: string; taskId: string })
  | (EntityBase & { kind: 'activity'; title: string; occurredAt: string; taskId?: string })
  | (EntityBase & { kind: 'doat_run'; title: string; doatName: string; taskTitle: string; status: string; startedAt: string; completedAt?: string; taskId: string })
  | UnavailableEntity;

export interface ContextPanelModel {
  title: string;
  topic?: string;
  kind: FeedView['conversation']['kind'];
  visibility: FeedView['conversation']['visibility'];
  members: ContextMember[];
  entities: ContextEntity[];
  savedCount?: number;
}

export type SavedContext = Pick<MessagingState, 'organizationId' | 'workspaceId' | 'saved' | 'messages' | 'selfPersonId'>;

function entityIdentity(ref: EntityRef): string {
  if (ref.kind === 'task') return `task:${ref.taskId}`;
  if (ref.kind === 'approval') return `approval:${ref.approvalId}`;
  if (ref.kind === 'activity') return `activity:${ref.activityId}`;
  return `doat_run:${ref.doatId}:${ref.runId}`;
}

function unavailable(key: string, kind: ContextEntity['kind']): UnavailableEntity {
  return { key, kind, available: false, title: 'No longer available' };
}

function taskInScope(work: MessagingWork, scope: MessagingScope, taskId: string) {
  return work.tasks.find((task) => task.id === taskId && task.workspaceId === scope.workspaceId);
}

function resolveRef(ref: EntityRef, work: MessagingWork, scope: MessagingScope, key: string): ContextEntity {
  if (ref.kind === 'task') {
    const task = taskInScope(work, scope, ref.taskId);
    return task
      ? { key, kind: 'task', available: true, taskId: task.id, title: task.title, status: task.status, priority: task.priority, ...(task.dueDate ? { dueDate: task.dueDate } : {}) }
      : unavailable(key, 'task');
  }
  if (ref.kind === 'approval') {
    const approval = work.approvals.find((item) => item.id === ref.approvalId);
    const task = approval ? taskInScope(work, scope, approval.taskId) : undefined;
    return approval && task
      ? { key, kind: 'approval', available: true, taskId: task.id, taskTitle: task.title, title: 'Approval', status: approval.status, resultId: approval.resultId }
      : unavailable(key, 'approval');
  }
  if (ref.kind === 'activity') {
    const event = work.activity.find((item) => item.id === ref.activityId && item.workspaceId === scope.workspaceId);
    const relatedTask = event?.taskId ? taskInScope(work, scope, event.taskId) : undefined;
    return event
      ? { key, kind: 'activity', available: true, title: event.summary, occurredAt: event.occurredAt, ...(relatedTask ? { taskId: relatedTask.id } : {}) }
      : unavailable(key, 'activity');
  }

  const doat = work.doats.find((item) => item.id === ref.doatId && item.workspaceId === scope.workspaceId);
  const task = work.tasks.find((item) => item.workspaceId === scope.workspaceId
    && item.agentRun?.sessionId === ref.runId && item.assignee?.kind === 'agent' && item.assignee.id === ref.doatId);
  const run = task?.agentRun;
  return doat && task && run
    ? { key, kind: 'doat_run', available: true, taskId: task.id, title: 'Doat run record', doatName: doat.identity.name, taskTitle: task.title, status: run.status, startedAt: run.startedAt, ...(run.completedAt ? { completedAt: run.completedAt } : {}) }
    : unavailable(key, 'doat_run');
}

/** Resolve only against the active workspace; unavailable records expose no ids or stale fields. */
export function buildContextModel(
  feed: FeedView | undefined,
  work: MessagingWork,
  scope: MessagingScope,
  savedContext?: SavedContext
): ContextPanelModel | undefined {
  const conversation = feed?.conversation;
  if (!feed || !conversation || conversation.organizationId !== scope.organizationId || conversation.workspaceId !== scope.workspaceId) return undefined;

  const seenMembers = new Set<string>();
  const members: ContextMember[] = [];
  for (const member of feed.members) {
    if (member.ref.kind === 'system') continue;
    const key = `${member.ref.kind}:${member.ref.id}`;
    if (seenMembers.has(key)) continue;
    seenMembers.add(key);
    const resolved = participantView(work, scope, member.ref);
    members.push({
      key: `${member.ref.kind}-${members.length}`,
      kind: member.ref.kind,
      name: resolved.available ? resolved.name : 'No longer available',
      ...(resolved.available && resolved.role ? { role: resolved.role } : {}),
      available: resolved.available
    });
  }

  const refs: EntityRef[] = [];
  if (conversation.linkedTaskId) refs.push({ kind: 'task', taskId: conversation.linkedTaskId });
  for (const view of feed.messages) {
    if (!view.isDeleted) refs.push(...view.message.refs);
  }
  const seenEntities = new Set<string>();
  const entities: ContextEntity[] = [];
  for (const ref of refs) {
    const identity = entityIdentity(ref);
    if (seenEntities.has(identity)) continue;
    seenEntities.add(identity);
    entities.push(resolveRef(ref, work, scope, `entity-${entities.length}`));
  }

  let savedCount: number | undefined;
  if (savedContext && savedContext.organizationId === scope.organizationId && savedContext.workspaceId === scope.workspaceId && savedContext.selfPersonId) {
    const visibleMessages = new Set(savedContext.messages
      .filter((message: Message) => message.conversationId === conversation.id && !message.deletedAt)
      .map((message: Message) => message.id));
    savedCount = savedContext.saved.filter((item: SavedMessage) => item.conversationId === conversation.id
      && item.actorPersonId === savedContext.selfPersonId && visibleMessages.has(item.messageId)).length;
  }

  return {
    title: feed.title,
    ...(conversation.topic ? { topic: conversation.topic } : {}),
    kind: conversation.kind,
    visibility: conversation.visibility,
    members,
    entities,
    ...(savedCount !== undefined ? { savedCount } : {})
  };
}

export function taskStatusLabel(status: TaskStatus): string {
  return status.replaceAll('_', ' ');
}

export function approvalStatusLabel(status: ApprovalStatus): string {
  return status.replaceAll('_', ' ');
}
