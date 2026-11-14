import type { GwiraLocalState } from '../../domain/types.js';

export type Id = string;
export type IsoDate = string;

export const MESSAGING_SCHEMA_VERSION = 1 as const;
export const SYSTEM_PARTICIPANT_ID = 'gwira.system';

// Persistence and content limits. The serialized byte budget is authoritative.
export const MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;
export const MAX_BODY = 4_000;
export const MAX_CONVERSATIONS = 200;
export const MAX_MESSAGES_PER_CONVERSATION = 500;
export const MAX_MESSAGES_TOTAL = 2_000;
export const MAX_DRAFTS = 100;
/** Hard cap on messages that could not be saved; further sends are refused until they are retried or storage recovers. */
export const MAX_UNSAVED_MESSAGES = 25;
export const MAX_NAME = 80;
export const MAX_TOPIC = 200;
export const MAX_MEMBERS = 200;
export const MAX_MENTIONS = 20;
export const MAX_ATTACHMENTS = 10;
export const MAX_REFS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_SEARCH_RESULTS = 100;
export const REACTION_EMOJI = ['👍', '👎', '✅', '🎉', '❤️', '😄', '👀', '🙏'] as const;

export type ParticipantKind = 'human' | 'doat' | 'system';
/** human -> Person.id, doat -> Doat.id, system -> SYSTEM_PARTICIPANT_ID. */
export interface ParticipantRef { kind: ParticipantKind; id: Id }

export type ConversationKind = 'dm' | 'group' | 'channel';
export type ConversationVisibility = 'private' | 'org';

export interface Conversation {
  id: Id;
  organizationId: Id;
  workspaceId: Id;
  kind: ConversationKind;
  name?: string;
  topic?: string;
  visibility: ConversationVisibility;
  /** Sorted `${kind}:${id}|${kind}:${id}`; unique per workspace for DMs. */
  dmKey?: string;
  linkedTaskId?: Id;
  linkedProjectId?: Id;
  createdAt: IsoDate;
  createdBy: ParticipantRef;
  archivedAt?: IsoDate;
  lastMessageAt?: IsoDate;
  /** Monotonic: never lowered by trimming, so sequence numbers are never reused. */
  lastMessageSeq: number;
}

export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
export interface Membership {
  conversationId: Id;
  participant: ParticipantRef;
  role: MemberRole;
  joinedAt: IsoDate;
  leftAt?: IsoDate;
  muted?: boolean;
}

export type MessageType = 'text' | 'system' | 'approval_event' | 'task_event' | 'doat_run_event';
/** Local mode never produces delivered/seen states. */
export type SendState = 'local_saved' | 'server_saved' | 'failed';
export type FailureReason = 'storage_full' | 'storage_unavailable' | 'validation';

export interface Mention { participant: ParticipantRef; start: number; end: number }
export interface AttachmentRef { id: Id; name: string; mimeType: string; sizeBytes: number; status: 'metadata_only' }
export type EntityRef =
  | { kind: 'task'; taskId: Id }
  | { kind: 'approval'; approvalId: Id }
  | { kind: 'activity'; activityId: Id }
  | { kind: 'doat_run'; doatId: Id; runId: string };

export interface Message {
  id: Id;
  clientId: string;
  conversationId: Id;
  organizationId: Id;
  workspaceId: Id;
  seq: number;
  author: ParticipantRef;
  type: MessageType;
  body: string;
  createdAt: IsoDate;
  editedAt?: IsoDate;
  deletedAt?: IsoDate;
  threadRootId?: Id;
  replyCount?: number;
  lastReplyAt?: IsoDate;
  mentions: Mention[];
  attachments: AttachmentRef[];
  refs: EntityRef[];
  sendState: SendState;
  failureReason?: FailureReason;
}

export interface Reaction { messageId: Id; emoji: string; actorPersonId: Id; at: IsoDate }
export interface SavedMessage { messageId: Id; conversationId: Id; actorPersonId: Id; savedAt: IsoDate }
export interface ReadCursor { conversationId: Id; actorPersonId: Id; lastReadSeq: number; updatedAt: IsoDate }
/** A local actor/thread draft. References are ids only and are revalidated on every load. */
export interface Draft { conversationId: Id; threadRootId?: Id; actorPersonId: Id; body: string; refs?: EntityRef[]; updatedAt: IsoDate }

export interface MessagingState {
  schemaVersion: typeof MESSAGING_SCHEMA_VERSION;
  organizationId: Id;
  workspaceId: Id;
  selfPersonId: Id | null;
  conversations: Conversation[];
  memberships: Membership[];
  messages: Message[];
  reactions: Reaction[];
  saved: SavedMessage[];
  readCursors: ReadCursor[];
  drafts: Draft[];
}

export interface MessagingScope { organizationId: Id; workspaceId: Id }
/** Read-only slices of Gwira work state. Messaging never writes these. */
export type MessagingWork = Pick<GwiraLocalState, 'people' | 'doats' | 'projects' | 'tasks' | 'approvals' | 'activity'>;

export type MessagingErrorCode =
  | 'scope_mismatch' | 'no_actor' | 'invalid_actor' | 'forbidden' | 'not_found'
  | 'invalid' | 'duplicate' | 'limit' | 'unsupported';
export interface MessagingError { code: MessagingErrorCode; message: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: MessagingError };

export function createEmptyMessagingState(scope: MessagingScope, selfPersonId: Id | null = null): MessagingState {
  return {
    schemaVersion: MESSAGING_SCHEMA_VERSION,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    selfPersonId,
    conversations: [], memberships: [], messages: [], reactions: [], saved: [], readCursors: [], drafts: []
  };
}

export function messagingError(code: MessagingErrorCode, message: string): { ok: false; error: MessagingError } {
  return { ok: false, error: { code, message } };
}

export function sameScope(state: { organizationId: Id; workspaceId: Id }, scope: MessagingScope): boolean {
  return state.organizationId === scope.organizationId && state.workspaceId === scope.workspaceId;
}
