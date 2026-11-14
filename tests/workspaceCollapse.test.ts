import {describe,expect,it} from 'vitest';
import {createDefaultWorkspaceTabs,openWorkspaceTab,collapseWorkspaceTools,reopenWorkspaceTools,resumeWorkspaceTool,restoreWorkspaceTabs,selectWorkspaceTab} from '../src/renderer/workspaceTabs.js';

describe('independent Workspace collapse',()=>{
 it('removes every tool from visible tabs and preserves global navigation and session identities',()=>{
  let state=createDefaultWorkspaceTabs();
  state=openWorkspaceTab(state,{type:'view',view:'dashboard'},()=> 'dashboard');
  state=openWorkspaceTab(state,{type:'files'},()=> 'files');
  state=openWorkspaceTab(state,{type:'terminal',sessionId:'11111111-1111-4111-8111-111111111111'},()=> 'terminal');
  state=openWorkspaceTab(state,{type:'work-sessions'},()=> 'sessions');
  const collapsed=collapseWorkspaceTools(state);
  expect(collapsed.globalTabs).toEqual(state.globalTabs);
  expect(collapsed.workspaceCollapsed).toBe(true);
  expect(collapsed.workspaceTabs?.map(t=>t.destination.type)).toEqual(['launcher']);
  expect(collapsed.suspendedWorkspaceTabs?.map(t=>t.id)).toEqual(['files','terminal','sessions']);
  expect(collapsed.activeTabId).toBe('dashboard');
  expect(collapseWorkspaceTools(collapsed).suspendedWorkspaceTabs).toEqual(collapsed.suspendedWorkspaceTabs);
  const restored=restoreWorkspaceTabs(JSON.stringify(collapsed),()=>true);
  expect(restored.workspaceCollapsed).toBe(true);
  expect(restored.suspendedWorkspaceTabs).toEqual(collapsed.suspendedWorkspaceTabs);
  const reopened=reopenWorkspaceTools(restored);
  expect(reopened.workspaceCollapsed).toBe(false);
  expect(reopened.workspaceTabs).toHaveLength(1);
  expect(reopenWorkspaceTools(reopened).workspaceTabs).toHaveLength(1);
  expect(reopened.workspaceTabs?.every(t=>t.destination.type==='launcher')).toBe(true);
  const resumed=resumeWorkspaceTool(reopened,'terminal');
  expect(resumed.workspaceTabs).toEqual([{id:'terminal',destination:{type:'terminal',sessionId:'11111111-1111-4111-8111-111111111111'}}]);
  expect(resumed.suspendedWorkspaceTabs?.map(t=>t.id)).toEqual(['files','sessions']);
  expect(resumed.activeWorkspaceTabId).toBe('terminal');
 });
 it('keeps collapse state when global tabs change and discards invalid retained destinations',()=>{
  const collapsed=collapseWorkspaceTools(createDefaultWorkspaceTabs());
  const navigated=selectWorkspaceTab(openWorkspaceTab(collapsed,{type:'view',view:'settings'},()=> 'settings'),'settings');
  expect(navigated.workspaceCollapsed).toBe(true);
  const restored=restoreWorkspaceTabs(JSON.stringify({...collapsed,suspendedWorkspaceTabs:[{id:'bad',destination:{type:'view',view:'home'}},{id:'missing',destination:{type:'terminal',sessionId:'missing'}}]}),d=>d.type!=='terminal');
  expect(restored.suspendedWorkspaceTabs??[]).toEqual([]);
 });
});
