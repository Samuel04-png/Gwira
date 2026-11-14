import { describe, expect, it } from 'vitest';
import { MAX_BODY } from '../../src/renderer/gwira/messaging/domain/types.js';
import type { ParticipantView } from '../../src/renderer/gwira/messaging/domain/selectors.js';
import { composerCharactersRemaining, composerDraftKey, composerLayoutBudget, entityRefKey, filterMentionCandidates, getMentionQuery, insertMention, limitComposerBody, normalizeComposerRefs, parseMentions, shouldSendOnEnter, shouldShowComposerCounter, toggleComposerRef } from '../../src/renderer/gwira/inbox/composerModel.js';

const members: ParticipantView[] = [
  { ref: { kind: 'human', id: 'person_alice' }, name: 'Alice Smith', available: true },
  { ref: { kind: 'doat', id: 'doat_1' }, name: 'Atlas', available: true },
  { ref: { kind: 'human', id: 'person_missing' }, name: 'Missing person', available: false },
  { ref: { kind: 'system', id: 'gwira.system' }, name: 'Gwira', available: true }
];

describe('composerModel', () => {
  it('keys drafts by conversation, thread root, and actor without collisions', () => {
    const actor = { kind: 'human' as const, id: 'person_a|thread' };
    const key = composerDraftKey('conv:one', 'root|1', actor);
    expect(key).not.toBe(composerDraftKey('conv:one', undefined, actor));
    expect(key).not.toBe(composerDraftKey('conv:one', 'root|1', { kind: 'human', id: 'person_other' }));
    expect(key).not.toBe(composerDraftKey('conv', 'one|root|1', actor));
  });

  it('finds a member mention query at the caret and inserts the member name', () => {
    const body = 'Hello @ali';
    const query = getMentionQuery(body, body.length);
    expect(query).toEqual({ start: 6, end: 10, query: 'ali' });
    expect(filterMentionCandidates(members, 'ali')).toEqual([members[0]]);
    expect(insertMention(body, query!, members[0])).toEqual({ body: 'Hello @Alice Smith ', caret: 19 });
    expect(getMentionQuery('email@ali', 9)).toBeUndefined();
    expect(getMentionQuery('prefix @a suffix', 16)).toBeUndefined();
  });

  it('parses only exact, boundary-delimited mentions from available conversation members', () => {
    const body = 'Hi @Alice Smith, ask @Atlas. @Missing person and @Gwira';
    expect(parseMentions(body, members)).toEqual([
      { participant: members[0].ref, start: 3, end: 15 },
      { participant: members[1].ref, start: 21, end: 27 }
    ]);
  });

  it('applies the domain body limit and reveals the counter near the cap', () => {
    expect(limitComposerBody('x'.repeat(MAX_BODY + 3))).toHaveLength(MAX_BODY);
    expect(composerCharactersRemaining('x'.repeat(MAX_BODY - 1))).toBe(1);
    expect(shouldShowComposerCounter('x'.repeat(MAX_BODY - 199))).toBe(true);
    expect(shouldShowComposerCounter('x'.repeat(MAX_BODY - 201))).toBe(false);
  });

  it('sends on Enter but preserves newlines and IME composition', () => {
    expect(shouldSendOnEnter({ key: 'Enter' })).toBe(true);
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldSendOnEnter({ key: 'Enter', isComposing: true })).toBe(false);
    expect(shouldSendOnEnter({ key: 'Enter', nativeIsComposing: true })).toBe(false);
    expect(shouldSendOnEnter({ key: 'Enter', keyCode: 229 })).toBe(false);
    expect(shouldSendOnEnter({ key: 'a' })).toBe(false);
  });

  it('budgets the whole composer against pane chrome at high zoom', () => {
    const budget = composerLayoutBudget({ paneHeight: 232, chromeHeight: 56, hasMode: true, hasError: true, hasDoatNote: true });
    expect(budget.compact).toBe(true);
    expect(budget.composerHeight).toBeLessThan(176);
    expect(budget.textareaHeight).toBeGreaterThanOrEqual(20);
    expect(budget.textareaHeight).toBeLessThanOrEqual(176 * .3);
    expect(budget.popupHeight).toBe(128);
    const crowded = composerLayoutBudget({ paneHeight: 190, chromeHeight: 56, hasMode: true, hasError: true, hasDoatNote: true });
    expect(crowded.composerHeight).toBe(124);
    expect(crowded.textareaHeight).toBe(20);
    expect(crowded.popupHeight).toBe(86);
    const wide = composerLayoutBudget({ paneHeight: 800, chromeHeight: 56 });
    expect(wide.compact).toBe(false);
    expect(wide.textareaHeight).toBe(160);
    expect(wide.popupHeight).toBe(260);
  });

  it('keeps finite layout budgets for extreme or unavailable pane measurements', () => {
    const short = composerLayoutBudget({ paneHeight: 48, chromeHeight: 56, hasError: true });
    expect(short.textareaHeight).toBe(20);
    expect(short.composerHeight).toBe(20);
    const missing = composerLayoutBudget({ paneHeight: Number.NaN, chromeHeight: Number.NaN });
    expect(Number.isFinite(missing.composerHeight)).toBe(true);
    expect(missing.textareaHeight).toBeGreaterThanOrEqual(20);
  });

  it('deduplicates and toggles typed entity links within the domain cap', () => {
    const task = { kind: 'task' as const, taskId: 'task_1' };
    const approval = { kind: 'approval' as const, approvalId: 'approval_1' };
    expect(entityRefKey(task)).toBe('task:task_1');
    expect(normalizeComposerRefs([task, task, approval])).toEqual([task, approval]);
    expect(toggleComposerRef([task], task)).toEqual([]);
    expect(toggleComposerRef([task], approval)).toEqual([task, approval]);
    expect(normalizeComposerRefs([task, approval], 1)).toEqual([task]);
    expect(toggleComposerRef([task], approval, 1)).toEqual([task]);
  });
});
