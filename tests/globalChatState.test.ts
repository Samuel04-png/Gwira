import {describe, expect, it} from 'vitest';
import {parseGlobalChatState, prepareGlobalChatMessage, selectGlobalChatConversation} from '../src/renderer/auth/globalChatState.js';

const conversationId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';

describe('authenticated Gwira Chat state', () => {
  it('creates stable IDs for a new message and reuses them after an unconfirmed request', () => {
    const state = {...parseGlobalChatState(null), draft: '  Hello  '};
    const ids = [conversationId, messageId];
    const pending = prepareGlobalChatMessage(state, () => ids.shift()!);
    expect(pending).toEqual({conversationId, messageId, content: 'Hello', create: true});
    expect(prepareGlobalChatMessage({...state, pending}, () => { throw Error('Must not create a new ID'); })).toEqual(pending);
    expect(() => prepareGlobalChatMessage({...state, draft: 'Different', pending}, () => messageId)).toThrow();
    expect(parseGlobalChatState(JSON.stringify({...state, pending}))).toEqual({...state, pending});
  });

  it('rejects malformed or inconsistent stored state', () => {
    for (const value of [
      {},
      {conversationId: '../other', draft: '', pending: null},
      {conversationId, draft: 'x'.repeat(10001), pending: null},
      {conversationId: null, draft: 'hello', pending: {conversationId, messageId, content: 'hello', create: false}},
      {conversationId: null, draft: '', pending: {conversationId, messageId, content: '', create: true}},
      {conversationId: null, draft: '', pending: null, width: 541}
    ]) expect(() => parseGlobalChatState(JSON.stringify(value))).toThrow();
  });

  it('keeps unsent drafts separate when switching conversations', () => {
    const first = {...parseGlobalChatState(null), draft: 'new draft'};
    const second = selectGlobalChatConversation(first, conversationId);
    expect(second.draft).toBe('');
    const back = selectGlobalChatConversation({...second, draft: 'other draft'}, null);
    expect(back.draft).toBe('new draft');
    expect(selectGlobalChatConversation(back, conversationId).draft).toBe('other draft');
    expect(parseGlobalChatState(JSON.stringify(back))).toEqual(back);
  });

  it('restores a scoped panel width and accepts older saved state', () => {
    const older = {conversationId: null, draft: '', drafts: {}, pending: null};
    expect(parseGlobalChatState(JSON.stringify(older)).width).toBe(392);
    const resized = {...parseGlobalChatState(null), width: 480};
    expect(parseGlobalChatState(JSON.stringify(resized))).toEqual(resized);
    expect(selectGlobalChatConversation(resized, conversationId).width).toBe(480);
  });
});
