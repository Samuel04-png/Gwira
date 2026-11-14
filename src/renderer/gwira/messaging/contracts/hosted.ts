/**
 * Future hosted contracts: TYPES ONLY. Nothing here is implemented, simulated, or
 * called by the local prototype (no network, no Supabase).
 *
 * Hosted requirements (not built): server-side authorization on every call,
 * organization_id on all rows with RLS by membership, server-assigned seq/ids with a
 * unique clientId index, server-computed unread, signed attachment URLs with malware
 * scanning, realtime fan-out, audit log, rate limits, and Doat messages only from a
 * verified run service with run-id binding.
 */
import type { Conversation, Id, Message, ReadCursor, Result } from '../domain/types.js';
import type { SendInput } from '../domain/reducer.js';

export interface AuthContext { organizationId: Id; workspaceId: Id; actorPersonId: Id }
export type NewMessageInput = SendInput;

export interface MessagingRepository {
  listConversations(ctx: AuthContext): Promise<Result<Conversation[]>>;
  listMessages(ctx: AuthContext, conversationId: Id, opts: { afterSeq?: number; limit: number }): Promise<Result<Message[]>>;
  /** Idempotent on (conversationId, clientId). */
  appendMessage(ctx: AuthContext, input: NewMessageInput): Promise<Result<Message>>;
  markRead(ctx: AuthContext, conversationId: Id, seq: number): Promise<Result<ReadCursor>>;
}

/** Hosted-only delivery states. The local UI must never render these. */
export type HostedDeliveryState = 'queued' | 'delivered' | 'rejected';

export interface MessageTransport {
  send(message: Message): Promise<{ status: 'accepted' | 'rejected'; serverSeq?: number; reason?: string }>;
}
export interface PresenceProvider {
  subscribe(ctx: AuthContext, conversationId: Id, onChange: (participants: Id[]) => void): () => void;
}
export interface UploadTicket { uploadUrl: string; expiresAt: string }
export interface AttachmentStore {
  createUpload(meta: { name: string; mimeType: string; sizeBytes: number }): Promise<UploadTicket>;
}
