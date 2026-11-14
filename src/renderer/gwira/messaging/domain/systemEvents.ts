import { newUniqueId } from './ids.js';
import type { MessagingContext, TransitionResult } from './reducer.js';
import { SYSTEM_PARTICIPANT_ID } from './types.js';
import type { Message, MessagingState } from './types.js';
import { recomputeDerived } from './validate.js';

const APPROVAL_BODY = {
  pending: 'Approval requested',
  approved: 'Approval approved',
  changes_requested: 'Changes requested on approval'
} as const;

/**
 * P2, deliberately minimal: for each real approval whose task has a linked, active
 * channel, add one templated `approval_event` per status. The body is a template,
 * never an excerpt of Doat output; the status shown in the UI must be read from the
 * approval record. Idempotent through `clientId = sys:<approvalId>:<status>`.
 */
export function deriveSystemEvents(state: MessagingState, ctx: MessagingContext): TransitionResult {
  let next = state;
  let added = 0;
  const rand = ctx.rand ?? Math.random;
  for (const approval of ctx.work.approvals) {
    const task = ctx.work.tasks.find((item) => item.id === approval.taskId && item.workspaceId === state.workspaceId);
    if (!task) continue;
    const clientId = `sys:${approval.id}:${approval.status}`;
    for (const conv of next.conversations) {
      if (conv.kind !== 'channel' || conv.archivedAt || conv.linkedTaskId !== task.id) continue;
      if (next.messages.some((item) => item.conversationId === conv.id && item.clientId === clientId)) continue;
      const current = next.conversations.find((item) => item.id === conv.id) ?? conv;
      const taken = next;
      const message: Message = {
        id: newUniqueId('msg', Date.parse(ctx.now) || 0, rand, (candidate) => taken.messages.some((item) => item.id === candidate)),
        clientId, conversationId: conv.id, organizationId: state.organizationId, workspaceId: state.workspaceId,
        seq: current.lastMessageSeq + 1, author: { kind: 'system', id: SYSTEM_PARTICIPANT_ID }, type: 'approval_event',
        body: APPROVAL_BODY[approval.status], createdAt: approval.decidedAt ?? approval.createdAt,
        mentions: [], attachments: [], refs: [{ kind: 'approval', approvalId: approval.id }], sendState: 'local_saved'
      };
      next = recomputeDerived({ ...next, messages: [...next.messages, message] });
      added += 1;
    }
  }
  return { ok: true, state: next, value: { duplicate: added === 0 } };
}
