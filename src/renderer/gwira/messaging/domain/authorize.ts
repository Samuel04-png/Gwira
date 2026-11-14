/**
 * LOCAL INTEGRITY CHECKS ONLY. This file is not authentication, verified
 * identity, or server-side authorization: any local user can choose any
 * `selfPersonId`, and anyone with device access can read device storage.
 * The checks keep one workspace's data, one actor's rows, and one
 * conversation's membership from leaking into another through the UI.
 */
import type { Conversation, EntityRef, Id, MemberRole, Membership, Message, MessagingScope, MessagingWork, ParticipantRef } from './types.js';
import { SYSTEM_PARTICIPANT_ID } from './types.js';

export interface LocalContext {
  organizationId: Id;
  workspaceId: Id;
  actorPersonId: Id | null;
  work: MessagingWork;
}

export function createLocalContext(scope: MessagingScope, actorPersonId: Id | null, work: MessagingWork): LocalContext {
  return { organizationId: scope.organizationId, workspaceId: scope.workspaceId, actorPersonId, work };
}

export function isCurrentPerson(ctx: LocalContext, personId: Id | null | undefined): boolean {
  return !!personId && ctx.work.people.some((person) => person.id === personId && person.workspaceId === ctx.workspaceId);
}

export function isCurrentDoat(ctx: LocalContext, doatId: Id): boolean {
  return ctx.work.doats.some((doat) => doat.id === doatId && doat.workspaceId === ctx.workspaceId);
}

/** Humans and Doats are valid participants only if they exist in the current workspace records. */
export function isEligibleParticipant(ctx: LocalContext, participant: ParticipantRef): boolean {
  if (participant.kind === 'human') return isCurrentPerson(ctx, participant.id);
  if (participant.kind === 'doat') return isCurrentDoat(ctx, participant.id);
  return participant.id === SYSTEM_PARTICIPANT_ID;
}

export function hasValidActor(ctx: LocalContext): boolean {
  return isCurrentPerson(ctx, ctx.actorPersonId);
}

export function inScope(ctx: LocalContext, item: { organizationId: Id; workspaceId: Id }): boolean {
  return item.organizationId === ctx.organizationId && item.workspaceId === ctx.workspaceId;
}

export function activeMembership(memberships: readonly Membership[], conversationId: Id, participant: ParticipantRef): Membership | undefined {
  return memberships.find((item) => item.conversationId === conversationId && item.participant.kind === participant.kind && item.participant.id === participant.id && !item.leftAt);
}

export function actorRole(ctx: LocalContext, conv: Conversation, memberships: readonly Membership[]): MemberRole | undefined {
  if (!ctx.actorPersonId) return undefined;
  return activeMembership(memberships, conv.id, { kind: 'human', id: ctx.actorPersonId })?.role;
}

export function canReadConversation(ctx: LocalContext, conv: Conversation, memberships: readonly Membership[]): boolean {
  if (!hasValidActor(ctx) || !inScope(ctx, conv)) return false;
  if (conv.kind === 'channel' && conv.visibility === 'org') return true;
  return actorRole(ctx, conv, memberships) !== undefined;
}

export function canPostInConversation(ctx: LocalContext, conv: Conversation, memberships: readonly Membership[]): boolean {
  if (!hasValidActor(ctx) || !inScope(ctx, conv) || conv.archivedAt) return false;
  const role = actorRole(ctx, conv, memberships);
  return role !== undefined && role !== 'guest';
}

export function canJoinChannel(ctx: LocalContext, conv: Conversation, memberships: readonly Membership[]): boolean {
  return hasValidActor(ctx) && inScope(ctx, conv) && !conv.archivedAt && conv.kind === 'channel' && conv.visibility === 'org' && actorRole(ctx, conv, memberships) === undefined;
}

/** Only the human author may edit their own non-deleted text message. */
export function canEditMessage(ctx: LocalContext, msg: Message): boolean {
  return hasValidActor(ctx) && inScope(ctx, msg) && msg.type === 'text' && !msg.deletedAt
    && msg.author.kind === 'human' && msg.author.id === ctx.actorPersonId;
}

export function canDeleteMessage(ctx: LocalContext, msg: Message): boolean {
  return hasValidActor(ctx) && inScope(ctx, msg) && !msg.deletedAt
    && msg.author.kind === 'human' && msg.author.id === ctx.actorPersonId;
}

export function canReact(ctx: LocalContext, conv: Conversation, memberships: readonly Membership[], msg: Message, actorPersonId: Id): boolean {
  return actorPersonId === ctx.actorPersonId && msg.conversationId === conv.id && !msg.deletedAt && inScope(ctx, msg)
    && canReadConversation(ctx, conv, memberships) && !conv.archivedAt;
}

export type ResolvedRef =
  | { status: 'available'; ref: EntityRef; label: string; taskId?: Id }
  | { status: 'unavailable'; ref: EntityRef; label: string };

/** Resolves a reference by id inside the current workspace only; never copies the record. */
export function resolveEntityRef(ctx: LocalContext, ref: EntityRef): ResolvedRef {
  const unavailable = (label: string): ResolvedRef => ({ status: 'unavailable', ref, label });
  const { work, workspaceId } = ctx;
  if (ref.kind === 'task') {
    const task = work.tasks.find((item) => item.id === ref.taskId && item.workspaceId === workspaceId);
    return task ? { status: 'available', ref, label: task.title, taskId: task.id } : unavailable('Task unavailable');
  }
  if (ref.kind === 'approval') {
    const approval = work.approvals.find((item) => item.id === ref.approvalId);
    const task = approval ? work.tasks.find((item) => item.id === approval.taskId && item.workspaceId === workspaceId) : undefined;
    return approval && task ? { status: 'available', ref, label: task.title, taskId: task.id } : unavailable('Approval unavailable');
  }
  if (ref.kind === 'activity') {
    const event = work.activity.find((item) => item.id === ref.activityId && item.workspaceId === workspaceId);
    const task = event?.taskId ? work.tasks.find((item) => item.id === event.taskId && item.workspaceId === workspaceId) : undefined;
    return event ? { status: 'available', ref, label: event.summary, taskId: task?.id } : unavailable('Activity unavailable');
  }
  const task = work.tasks.find((item) => item.workspaceId === workspaceId && item.agentRun?.sessionId === ref.runId && item.assignee?.id === ref.doatId);
  return task && isCurrentDoat(ctx, ref.doatId) ? { status: 'available', ref, label: task.title, taskId: task.id } : unavailable('Run record unavailable');
}
