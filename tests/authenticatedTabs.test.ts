import {describe,expect,it} from 'vitest';
import {activeAuthenticatedConversation,closeAuthenticatedConversationTabs,closeAuthenticatedTab,homeTabId,initialAuthenticatedTabs,restoreAuthenticatedTabs,selectAuthenticatedTab,serializeAuthenticatedTabs} from '../src/renderer/auth/authenticatedTabs.js';
import {navigateGlobalTab,newGlobalTab,openWorkspaceTab,reorderWorkspaceTab,selectWorkspaceTab} from '../src/renderer/workspaceTabs.js';

describe('authenticated workspace tabs',()=>{
 it('starts with Home only and no legacy workspace tools',()=>{
  const state=initialAuthenticatedTabs();
  expect(state.tabs.map(tab=>tab.id)).toEqual([homeTabId]);
  expect(state.workspaceTabs).toEqual([]);
  expect(activeAuthenticatedConversation(state)).toBeNull();
 });
 it('opens conversations in the active tab without creating more tabs',()=>{
  let state=selectAuthenticatedTab(initialAuthenticatedTabs(),'a');
  state=selectAuthenticatedTab(state,'b');
  state=selectAuthenticatedTab(state,'a');
  expect(state.tabs.map(tab=>tab.id)).toEqual([homeTabId]);
  expect(activeAuthenticatedConversation(state)).toBe('a');
 });
 it('uses the existing manager fallback when closing the active tab',()=>{
  let state=selectAuthenticatedTab(initialAuthenticatedTabs(),'a');
  state=newGlobalTab(state,()=> 'second');
  state=selectAuthenticatedTab(state,'b');
  state=closeAuthenticatedTab(state,'second');
  expect(activeAuthenticatedConversation(state)).toBe('a');
  state=closeAuthenticatedTab(state,homeTabId);
  expect(activeAuthenticatedConversation(state)).toBeNull();
  expect(state.globalTabs).toHaveLength(1);
 });
 it('removes all tabs for an archived conversation without changing an unrelated active tab',()=>{
  let state=selectAuthenticatedTab(initialAuthenticatedTabs(),'a');
  state=selectAuthenticatedTab(newGlobalTab(state,()=> 'second'),'a');
  state=selectAuthenticatedTab(newGlobalTab(state,()=> 'third'),'b');
  const next=closeAuthenticatedConversationTabs(state,'a');
  expect(next.globalTabs?.map(tab=>tab.id)).toEqual(['third']);
  expect(activeAuthenticatedConversation(next)).toBe('b');
  expect(next.closed?.some(tab=>tab.destination.type==='conversation'&&tab.destination.conversationId==='a')).toBe(false);
 });
 it('leaves a Home fallback when archiving the only open conversation',()=>{
  const next=closeAuthenticatedConversationTabs(selectAuthenticatedTab(initialAuthenticatedTabs(),'a'),'a');
  expect(next.globalTabs).toHaveLength(1);
  expect(activeAuthenticatedConversation(next)).toBeNull();
  expect(next.globalTabs?.[0]?.destination).toEqual({type:'view',view:'home'});
 });
 it('restores tab order, selection and authorized conversations',()=>{
  const conversation='11111111-1111-4111-8111-111111111111',viewId='22222222-2222-4222-8222-222222222222';
  let state=selectAuthenticatedTab(initialAuthenticatedTabs(),conversation);
  state=openWorkspaceTab(state,{type:'view',view:'dashboard'},()=>viewId);
  state=reorderWorkspaceTab(state,viewId,homeTabId);
  expect(state.globalTabs?.map(tab=>tab.id)).toEqual([viewId,homeTabId]);
  const restored=restoreAuthenticatedTabs(serializeAuthenticatedTabs(state),new Set([conversation]));
  expect(restored?.state.globalTabs).toEqual(state.globalTabs);
  expect(restored?.state.activeGlobalTabId).toBe(viewId);
  expect(restored?.removed).toBe(false);
 });
 it('drops revoked conversations, unsafe destinations and duplicate tabs',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const raw=JSON.stringify({version:1,active:id,tabs:[
   {id:homeTabId,destination:{type:'view',view:'home'}},
   {id,destination:{type:'conversation',projectId:'cloud',conversationId:id}},
   {id:'22222222-2222-4222-8222-222222222222',destination:{type:'terminal'}},
   {id:homeTabId,destination:{type:'view',view:'home'}}
  ]});
  const restored=restoreAuthenticatedTabs(raw,new Set());
  expect(restored?.state.globalTabs).toEqual(initialAuthenticatedTabs().globalTabs);
  expect(restored?.state.activeGlobalTabId).toBe(homeTabId);
  expect(restored?.removed).toBe(true);
 });
 it('preserves independent tabs with the same destination and stable ids',()=>{
  const second='22222222-2222-4222-8222-222222222222',conversation='11111111-1111-4111-8111-111111111111';
  let state=selectAuthenticatedTab(initialAuthenticatedTabs(),conversation);
  state=newGlobalTab(state,()=>second);
  state=selectAuthenticatedTab(state,conversation);
  expect(state.globalTabs).toHaveLength(2);
  state=navigateGlobalTab(state,{type:'view',view:'library'});
  expect(state.globalTabs?.[0]?.destination).toEqual({type:'conversation',projectId:'cloud',conversationId:conversation});
  const restored=restoreAuthenticatedTabs(serializeAuthenticatedTabs(state),new Set([conversation]))!;
  expect(restored.state.globalTabs).toEqual(state.globalTabs);
  expect(restored.removed).toBe(false);
  expect(activeAuthenticatedConversation(selectWorkspaceTab(restored.state,homeTabId))).toBe(conversation);
 });
 it('keeps duplicate authorized destinations on restore and removes revoked ones',()=>{
  const second='22222222-2222-4222-8222-222222222222',conversation='11111111-1111-4111-8111-111111111111';
  let state=selectAuthenticatedTab(initialAuthenticatedTabs(),conversation);
  state=selectAuthenticatedTab(newGlobalTab(state,()=>second),conversation);
  expect(restoreAuthenticatedTabs(serializeAuthenticatedTabs(state),new Set([conversation]))?.state.globalTabs).toEqual(state.globalTabs);
  expect(restoreAuthenticatedTabs(serializeAuthenticatedTabs(state),new Set())?.state.globalTabs).toEqual(initialAuthenticatedTabs().globalTabs);
 });
 it('rejects malformed state instead of importing local tabs',()=>{
  expect(restoreAuthenticatedTabs(null,new Set())).toBeNull();
  for(const raw of ['null','{}','{"version":2,"tabs":[],"active":"x"}','not json'])expect(()=>restoreAuthenticatedTabs(raw,new Set())).toThrow();
 });
});
