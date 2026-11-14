import type { MessageView, ReactionSummary } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';

/** Small fixed reaction set; arbitrary emoji input is intentionally not offered. */
export const REACTION_EMOJIS: readonly string[] = ['👍', '❤️', '😂', '🎉', '🙏', '👀'];

export function reactionLabel(reaction: ReactionSummary): string {
  const people = reaction.count === 1 ? '1 person' : `${reaction.count} people`;
  return `${reaction.emoji} reaction from ${people}${reaction.reactedByActor ? ', including you' : ''}. ${reaction.reactedByActor ? 'Remove your reaction' : 'Add your reaction'}`;
}

export function reactionPickerLabel(emoji: string, active: boolean): string {
  return `${active ? 'Remove' : 'Add'} ${emoji} reaction`;
}

/** Fixed-set reactions first (in set order), then any other stored emoji in original order. */
export function orderReactions(reactions: readonly ReactionSummary[]): ReactionSummary[] {
  const rank = (emoji: string): number => { const i = REACTION_EMOJIS.indexOf(emoji); return i < 0 ? REACTION_EMOJIS.length : i; };
  return reactions.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item.emoji) - rank(b.item.emoji) || a.index - b.index).map((entry) => entry.item);
}

export interface MessageActionFlags {
  react: boolean;
  reply: boolean;
  save: boolean;
  edit: boolean;
  remove: boolean;
  copy: boolean;
  markUnread: boolean;
}

/** Which toolbar buttons apply; edit/remove follow the domain's local-integrity authorization. */
export function messageActionFlags(view: MessageView, opts: { inThread: boolean; canPost?: boolean }): MessageActionFlags {
  const live = !view.isDeleted;
  const sent = view.message.sendState !== 'failed';
  return {
    react: live && sent,
    reply: live && sent && !opts.inThread && opts.canPost !== false,
    save: live && sent,
    edit: live && view.canEdit,
    remove: live && view.canDelete,
    copy: live,
    markUnread: live && !opts.inThread && !view.isOwn
  };
}

export function replyCountLabel(count: number): string {
  return count === 1 ? '1 reply' : `${count} replies`;
}

export function threadHeading(replyCount: number): string {
  return replyCount === 0 ? 'No replies yet' : replyCountLabel(replyCount);
}

export function actionFailureMessage(result: DispatchResult, verb: string): string | undefined {
  if (!result.ok) return `Could not ${verb}: ${result.error.message}`;
  if (!result.durable) return `${verb[0]!.toUpperCase()}${verb.slice(1)} applied in memory only; not saved to this device yet.`;
  return undefined;
}

/** Plain text for the clipboard; never markup. */
export function copyableText(view: MessageView): string {
  return view.isDeleted ? '' : view.message.body;
}
