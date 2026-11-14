import {describe,it,expect} from 'vitest';
import {createEmptyLocalState,type GwiraLocalState} from '../../src/renderer/gwira/domain/types.js';
import {reduceGwira} from '../../src/renderer/gwira/domain/reducer.js';
import {boardTransition} from '../../src/renderer/gwira/board/boardTransitions.js';
import {buildBoard} from '../../src/renderer/gwira/board/boardModel.js';
import {parseBoardPrefs} from '../../src/renderer/gwira/board/boardPreferences.js';
import {NO_FILTERS} from '../../src/renderer/gwira/workfilters/workFilters.js';
const at='2026-10-30T10:00:00Z';
function state():GwiraLocalState{const s=createEmptyLocalState({organizationId:'o',workspaceId:'w'},at);return {...s,people:[{id:'p',workspaceId:'w',name:'QA',role:'Manager',createdAt:at}],tasks:[{id:'t',workspaceId:'w',title:'Planning',status:'todo',priority:'medium',assignee:{kind:'person',id:'p'},createdAt:at,updatedAt:at}]};}
describe('Board lifecycle adapter',()=>{
 it('uses an allowed human planning transition and the existing reducer',()=>{
  const s=state(),result=boardTransition(s,'t','working');expect(result).toEqual({status:'in_progress'});
  const next=reduceGwira(s,{type:'TRANSITION_TASK',taskId:'t',status:result.status!,at,activityId:'a',actor:{kind:'person',id:'p'}});
  expect(next.tasks[0].status).toBe('in_progress');expect(s.tasks[0].status).toBe('todo');
 });
 it('rejects illegal jumps, unavailable states and missing records',()=>{
  expect(boardTransition(state(),'t','completed').reason).toMatch(/not an allowed/);
  expect(boardTransition(state(),'t','failed').reason).toMatch(/not an allowed/);
  expect(boardTransition(state(),'gone','working').reason).toMatch(/no longer/);
 });
 it('does not turn any recorded agent execution into a visual completion',()=>{
  for(const status of ['running','error','completed','stopped'] as const){const s=state();s.tasks[0].agentRun={status,sessionId:'run',startedAt:at};s.tasks[0].status='in_review';expect(boardTransition(s,'t','completed').reason).toMatch(/execution state/);}
  const s=state();s.tasks[0].assignee={kind:'agent',id:'d'};expect(boardTransition(s,'t','working').reason).toMatch(/Only assigned human/);
 });
 it('keeps approval decisions in their existing controls',()=>{
  const s=state();s.tasks[0].status='in_review';s.approvals=[{id:'a',taskId:'t',status:'pending',requestedBy:{kind:'person',id:'p'},createdAt:at,resultId:'result'}];expect(boardTransition(s,'t','completed').reason).toMatch(/approval decision/);
 });
});
describe('Board group and preference integrity',()=>{
 const records={tasks:[{id:'a',title:'A',status:'working' as const,ownerKind:'person' as const,ownerId:'p',ownerName:'QA',priority:'high',projectId:'x',projectName:'X'},{id:'b',title:'B',status:'failed' as const,ownerKind:'doat' as const,ownerId:'d',ownerName:'QA',priority:'low'}]};
 it('preserves column identities through filters without duplicating tasks',()=>{
  for(const groupBy of ['status','owner','project'] as const){const all=buildBoard(records,{filters:NO_FILTERS,groupBy}),filtered=buildBoard(records,{filters:{...NO_FILTERS,status:'working'},groupBy});expect(filtered.columns.map(c=>c.id)).toEqual(all.columns.map(c=>c.id));expect(all.columns.flatMap(c=>c.tasks.map(t=>t.id)).sort()).toEqual(['a','b']);}
 });
 it('supports priority and attention criteria with the shared List projection',()=>{
  expect(buildBoard(records,{filters:NO_FILTERS,criteria:{priority:'high',due:'all',attention:'all',kind:'all'}}).shown).toBe(1);
 });
 it('repairs malformed settings and retains hidden/collapsed columns without touching records',()=>{
  expect(parseBoardPrefs({groupBy:'bad',collapsed:['working',5],hidden:['failed'],hideEmpty:true})).toMatchObject({groupBy:'status',collapsed:['working'],hidden:['failed'],hideEmpty:true});
 });
});
