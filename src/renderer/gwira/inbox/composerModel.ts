import { MAX_BODY, MAX_REFS } from '../messaging/domain/types.js';
import type { EntityRef, Mention, ParticipantRef } from '../messaging/domain/types.js';
import type { ParticipantView } from '../messaging/domain/selectors.js';

export interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

export interface MentionInsertion {
  body: string;
  caret: number;
}

/** A real, currently available work record that can be attached to a local message. */
export interface ComposerLinkOption {
  ref: Extract<EntityRef, { kind: 'task' | 'approval' }>;
  label: string;
  detail?: string;
  disabled?: boolean;
}

export function entityRefKey(ref: EntityRef): string {
  switch (ref.kind) {
    case 'task': return `task:${ref.taskId}`;
    case 'approval': return `approval:${ref.approvalId}`;
    case 'activity': return `activity:${ref.activityId}`;
    case 'doat_run': return `doat_run:${ref.doatId}:${ref.runId}`;
  }
}

/** Keeps first-seen real refs and never exceeds the domain's message-reference limit. */
export function normalizeComposerRefs(refs: readonly EntityRef[], limit = MAX_REFS): EntityRef[] {
  const seen = new Set<string>();
  const result: EntityRef[] = [];
  for (const ref of refs) {
    const key = entityRefKey(ref);
    if (!seen.has(key) && result.length < limit) {
      seen.add(key);
      result.push(ref);
    }
  }
  return result;
}

/** Toggles one link without allowing UI state to exceed the domain limit. */
export function toggleComposerRef(refs: readonly EntityRef[], ref: EntityRef, limit = MAX_REFS): EntityRef[] {
  const key = entityRefKey(ref);
  const existing = normalizeComposerRefs(refs, limit);
  if (existing.some((item) => entityRefKey(item) === key)) return existing.filter((item) => entityRefKey(item) !== key);
  return existing.length < limit ? [...existing, ref] : existing;
}

export function composerDraftKey(conversationId: string, threadRootId: string | undefined, actor: ParticipantRef): string {
  return [conversationId, threadRootId ?? '', actor.kind, actor.id].map((part) => `${part.length}:${part}`).join('|');
}

export function getMentionQuery(body: string, caret: number): MentionQuery | undefined {
  const cursor = Math.max(0, Math.min(caret, body.length));
  const prefix = body.slice(0, cursor);
  const match = /(^|\s)@([^\s@]*)$/u.exec(prefix);
  if (!match) return undefined;
  const start = cursor - match[2].length - 1;
  return { start, end: cursor, query: match[2] };
}

export function filterMentionCandidates(candidates: readonly ParticipantView[], query: string): ParticipantView[] {
  const normalized = query.trim().toLocaleLowerCase();
  return candidates.filter((candidate) => candidate.available && candidate.ref.kind !== 'system'
    && candidate.name.toLocaleLowerCase().includes(normalized));
}

export function insertMention(body: string, mentionQuery: MentionQuery, candidate: ParticipantView): MentionInsertion {
  const token = `@${candidate.name}`;
  const withSpace = `${token} `;
  const next = `${body.slice(0, mentionQuery.start)}${withSpace}${body.slice(mentionQuery.end)}`;
  return { body: next, caret: mentionQuery.start + withSpace.length };
}

function isMentionBoundary(character: string | undefined): boolean {
  return character === undefined || /[\s.,!?;:()[\]{}]/u.test(character);
}

export function parseMentions(body: string, candidates: readonly ParticipantView[]): Mention[] {
  const available = candidates.filter((candidate) => candidate.available && candidate.ref.kind !== 'system')
    .slice().sort((left, right) => right.name.length - left.name.length);
  const mentions: Mention[] = [];
  for (let start = 0; start < body.length; start += 1) {
    if (body[start] !== '@' || (start > 0 && !/\s/u.test(body[start - 1]))) continue;
    const candidate = available.find((item) => {
      const tokenEnd = start + item.name.length + 1;
      return body.slice(start + 1, tokenEnd).toLocaleLowerCase() === item.name.toLocaleLowerCase()
        && isMentionBoundary(body[tokenEnd]);
    });
    if (!candidate) continue;
    const end = start + candidate.name.length + 1;
    mentions.push({ participant: candidate.ref, start, end });
    start = end - 1;
  }
  return mentions;
}

export function limitComposerBody(body: string): string {
  return body.slice(0, MAX_BODY);
}

export function composerCharactersRemaining(body: string): number {
  return Math.max(0, MAX_BODY - body.length);
}

export function shouldShowComposerCounter(body: string, threshold = 200): boolean {
  return body.length >= Math.max(0, MAX_BODY - threshold);
}

export function shouldSendOnEnter(input: {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  nativeIsComposing?: boolean;
  keyCode?: number;
}): boolean {
  return input.key === 'Enter' && !input.shiftKey && !input.isComposing && !input.nativeIsComposing && input.keyCode !== 229;
}

/** Layout budget is based on the actual pane, after its header/notice chrome.
 * Links are always disclosed in a bounded overlay, so ref count never adds height.
 */
export function composerLayoutBudget(input: { paneHeight: number; chromeHeight?: number; hasMode?: boolean; hasError?: boolean; hasDoatNote?: boolean }): { composerHeight: number; textareaHeight: number; popupHeight: number; compact: boolean } {
  const paneHeight = Number.isFinite(input.paneHeight) ? Math.max(0, input.paneHeight) : 500;
  const chromeHeight = Number.isFinite(input.chromeHeight) ? Math.max(0, input.chromeHeight ?? 0) : 0;
  const bodyHeight = Math.max(0, paneHeight - chromeHeight);
  const compact = bodyHeight < 320;
  const hasContext = Boolean(input.hasMode || input.hasDoatNote);
  const fixedHeight = (compact ? 56 : 80) + (hasContext ? (compact ? 16 : 32) : 0) + (input.hasError ? 32 : 0);
  const minimumComposerHeight = fixedHeight + 20;
  // Reserve timeline space when possible, but never shrink input and actions to
  // satisfy that preference. The entire box remains bounded by the body height.
  const composerHeight = Math.max(20, Math.min(bodyHeight, Math.max(minimumComposerHeight, bodyHeight - Math.min(32, bodyHeight * .15))));
  const textareaHeight = Math.max(20, Math.min(160, bodyHeight * .3, composerHeight - fixedHeight));
  // Popovers can cover the error/auxiliary area while open; anchor them above the
  // action row and use the pane body, not the tiny composer, as their budget.
  return { composerHeight: Math.floor(composerHeight), textareaHeight: Math.floor(textareaHeight), popupHeight: Math.max(40, Math.min(260, bodyHeight - 48)), compact };
}
