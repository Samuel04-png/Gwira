import {describe,expect,it,vi} from 'vitest';
import {parseInitialConversation,persistInitialConversation} from '../src/renderer/auth/initialConversation.js';

const userId='11111111-1111-4111-8111-111111111111';
const organizationId='22222222-2222-4222-8222-222222222222';
const conversationId='33333333-3333-4333-8333-333333333333';
const messageId='44444444-4444-4444-8444-444444444444';
const marker={userId,organizationId,conversationId,messageId,goal:'A goal'};

describe('initial conversation recovery',()=>{
 it('validates account scope and supports earlier recovery markers',()=>{
  expect(parseInitialConversation(JSON.stringify(marker),userId,organizationId)).toEqual(marker);
  expect(parseInitialConversation(JSON.stringify({userId,organizationId}),userId,organizationId)).toEqual({userId,organizationId});
  expect(()=>parseInitialConversation(JSON.stringify(marker),'another-user',organizationId)).toThrow();
  expect(()=>parseInitialConversation(JSON.stringify({...marker,messageId:'bad'}),userId,organizationId)).toThrow();
 });
 it('retries the same IDs in order, and does not send mismatched goals',async()=>{
  const request=vi.fn().mockResolvedValue(null);
  await persistInitialConversation({request},marker,'A goal');
  await persistInitialConversation({request},marker,'A goal');
  expect(request.mock.calls.slice(0,3)).toEqual(request.mock.calls.slice(3,6));
  expect(request.mock.calls.map(([input])=>input.type)).toEqual(['create','send','link_onboarding','create','send','link_onboarding']);
  await expect(persistInitialConversation({request},marker,'Another goal')).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(6);
 });
 it('leaves legacy onboarding recovery to the existing restore RPC',async()=>{
  const request=vi.fn().mockResolvedValue(null);
  await persistInitialConversation({request},{userId,organizationId},'A goal');
  expect(request).not.toHaveBeenCalled();
 });
});
