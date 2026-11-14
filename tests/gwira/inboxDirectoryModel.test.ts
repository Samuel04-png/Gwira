import { describe, expect, it } from 'vitest';
import { directoryItems, directoryPreferenceKey, emptyDirectoryPreferences, restoreDirectoryPreferences, searchDirectory } from '../../src/renderer/gwira/inbox/inboxDirectoryModel.js';
import { createInboxSampleState, createInboxSampleWork } from '../../src/renderer/gwira/inbox/inboxDevSample.js';
import { selectConversationList, selectEligibleParticipants } from '../../src/renderer/gwira/messaging/domain/selectors.js';
const scope={organizationId:'org',workspaceId:'workspace'};
const state=createInboxSampleState(scope),work=createInboxSampleWork(scope),items=selectConversationList(state,scope,work);
describe('Inbox collaboration directory',()=>{
 it('restores only supported preference values and isolates personal scope',()=>{
  expect(restoreDirectoryPreferences('{bad')).toEqual(emptyDirectoryPreferences());
  expect(restoreDirectoryPreferences(JSON.stringify({pins:['a','a',8],sort:{channels:'alphabetical',dm:'invalid'},collapsed:['dm']}))).toEqual({...emptyDirectoryPreferences(),pins:['a'],sort:{channels:'alphabetical'},collapsed:['dm']});
  expect(directoryPreferenceKey(JSON.stringify(['org','a','actor']))).not.toBe(directoryPreferenceKey(JSON.stringify(['org','b','actor'])));
  expect(directoryPreferenceKey(JSON.stringify(['org','a','actor']))).not.toBe(directoryPreferenceKey(JSON.stringify(['org','a','other'])));
 });
 it('round trips personal state without altering conversation records',()=>{
  const p={...emptyDirectoryPreferences(),pins:[items[0].conversation.id],hidden:[items[1].conversation.id],collapsed:['dm'],unreadOnly:['channels']};
  expect(restoreDirectoryPreferences(JSON.stringify(p))).toEqual(p);
  expect(state.conversations.some(c=>c.id===p.hidden[0])).toBe(true);
 });
 it('sorts by real activity or title with stable identifiers',()=>{
  const p=emptyDirectoryPreferences();const recent=directoryItems(items,'channels',p);
  expect(recent[0].sortAt>=recent[1].sortAt).toBe(true);
  p.sort.channels='alphabetical';expect(directoryItems(items,'channels',p).map(i=>i.title)).toEqual(['#customer-notes','#design-crit','#launch-planning']);
 });
 it('keeps selection through unread, muted and personal-close filters',()=>{
  const selected=items.find(c=>c.conversation.kind==='channel')!,id=selected.conversation.id;
  const p={...emptyDirectoryPreferences(),hidden:[id],unreadOnly:['channels'],hideMuted:['channels']};
  expect(directoryItems(items,'channels',p,undefined,new Set([id])).some(c=>c.conversation.id===id)).toBe(false);
  expect(directoryItems(items,'channels',p,id,new Set([id])).some(c=>c.conversation.id===id)).toBe(true);
 });
 it('finds readable records by identifiers and employees without creating records',()=>{
  const participants=selectEligibleParticipants(work,scope),before=state.conversations.length;
  expect(searchDirectory(items,participants,'inbox-sample-channel-design')[0].conversation?.conversation.id).toBe('inbox-sample-channel-design');
  expect(searchDirectory(items,participants,'Sam').find(hit=>hit.participant)?.participant?.name).toBe('Sam Rivera');
  expect(state.conversations).toHaveLength(before);
 });
 it('never leaks a private channel from the underlying state into search',()=>{
  const changed={...state,conversations:state.conversations.map((c,i)=>i===0?{...c,visibility:'private' as const}:c),memberships:state.memberships.filter(m=>!(m.conversationId===state.conversations[0].id&&m.participant.id===state.selfPersonId))};
  const readable=selectConversationList(changed,scope,work);
  expect(readable.some(c=>c.conversation.id===state.conversations[0].id)).toBe(false);
  expect(searchDirectory(readable,[],state.conversations[0].id)).toEqual([]);
 });
});
