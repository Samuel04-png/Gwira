import { describe, expect, it } from 'vitest';
import { globalChatRows, clampChatWidth } from '../src/renderer/globalChatModel.js';
import type { CodexSession, CodexThreadHistory } from '../src/shared/types.js';
const session: CodexSession = {id:'live', cwd:'/workspace/a', status:'running', messages:[{id:'u', role:'user', text:'Review recorded operations', createdAt:'2026-10-28T00:00:00Z'}], model:'recorded-model', reasoningEffort:'high', permissionMode:'default', webSearch:false, startedAt:'2026-10-28T00:00:00Z', updatedAt:'2026-10-28T00:00:00Z', codexConversationId:'saved'};
const history: CodexThreadHistory = {id:'saved', cwd:session.cwd, title:'Review recorded operations', createdAt:session.startedAt, updatedAt:session.updatedAt, filePath:'/history/saved.jsonl'};
describe('global chat source isolation and session reconciliation', () => {
 it('excludes sessions and histories from other source folders', () => {
  expect(globalChatRows('/workspace/b',[session],[history],undefined,'',false)).toEqual([]);
  expect(globalChatRows(undefined,[session],[history],undefined,'',false)).toEqual([]);
 });
 it('represents a running session with saved history exactly once', () => {
  const rows=globalChatRows(session.cwd,[session],[history],session.id,'',true);
  expect(rows).toHaveLength(1); expect(rows[0]?.running).toBe(true);
 });
 it('searches titles and filters actual running status', () => {
  expect(globalChatRows(session.cwd,[session],[history],undefined,'OPERATIONS',false)).toHaveLength(1);
  expect(globalChatRows(session.cwd,[{...session,status:'idle'}],[history],undefined,'',true)).toEqual([]);
  expect(globalChatRows(session.cwd,[session],[history],undefined,'missing',false)).toEqual([]);
 });
 it('keeps panel sizing practical when storage contains invalid values', () => {
  expect(clampChatWidth(NaN)).toBe(392); expect(clampChatWidth(0)).toBe(320); expect(clampChatWidth(900)).toBe(540); expect(clampChatWidth(439.7)).toBe(440);
 });
});
