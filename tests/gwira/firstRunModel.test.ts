import {describe,expect,it} from 'vitest';
import {approvedReply,buildFirstRunMessages,planReadyMessage,planReadyNarrowMessage} from '../../src/renderer/gwira/firstRun/firstRunModel.js';
import {initialMeetState,meetReducer,type MeetState} from '../../src/renderer/gwira/onboarding/meetGwiraModel.js';
import type {PlanRecord} from '../../src/shared/accountAuth.js';

const plan:PlanRecord={id:'p',title:'Plan',version:2,status:'draft',markdown:'',structured:{},summary:'',updatedAt:'2026-11-07T00:00:00Z'};
const base={startedAt:'2026-11-07T00:00:00Z',chat:[],planFailed:false,planPending:false};
const state=(over:Partial<MeetState>):MeetState=>({...initialMeetState,...over});

describe('first-run transcript',()=>{
 it('is empty before the first goal',()=>expect(buildFirstRunMessages({...base,state:initialMeetState})).toEqual([]));
 it('restores the goal, answered questions and the pending question from saved state',()=>{
  const asked=meetReducer(initialMeetState,{type:'submit',text:'Follow up on overdue payments'});
  expect(asked.act).toBe('clarifying');
  const first=buildFirstRunMessages({...base,state:asked});
  expect(first.map(x=>x.role)).toEqual(['user','codex']);expect(first.at(-1)!.text).toMatch(/\?$/);
  const answered=meetReducer(asked,{type:'submit',text:'Draft messages for approval'});
  const second=buildFirstRunMessages({...base,state:answered,plan:answered.act==='proposal'?plan:undefined});
  expect(second.slice(0,3).map(x=>x.role)).toEqual(['user','codex','user']);expect(second[2].text).toBe('Draft messages for approval');
 });
 it('only says a plan is ready when a saved plan exists',()=>{
  const s=state({act:'proposal',goal:'g'});
  expect(buildFirstRunMessages({...base,state:s,plan}).at(-1)!.text).toBe(planReadyMessage);
  expect(buildFirstRunMessages({...base,state:s,plan,narrow:true}).at(-1)!.text).toBe(planReadyNarrowMessage);
  expect(buildFirstRunMessages({...base,state:s}).some(x=>x.text===planReadyMessage)).toBe(false);
  expect(buildFirstRunMessages({...base,state:s,planFailed:true}).at(-1)!.text).toMatch(/couldn’t save the plan/);
  expect(buildFirstRunMessages({...base,state:s,planPending:true}).at(-1)!.text).toMatch(/preparing a plan/);
 });
 it('appends plan-stage chat in order with stable ids',()=>{
  const chat=[{role:'user' as const,text:'Change step 2',at:'2026-11-07T00:01:00Z'},{role:'gwira' as const,text:'Done',at:'2026-11-07T00:01:01Z'}];
  const m=buildFirstRunMessages({...base,state:state({act:'proposal',goal:'g'}),plan,chat});
  expect(m.slice(-2).map(x=>x.text)).toEqual(['Change step 2','Done']);expect(new Set(m.map(x=>x.id)).size).toBe(m.length);
 });
});
describe('approval reply',()=>{
 it('states the limits of plan approval and never claims actions',()=>{
  const r=approvedReply(plan,['Gmail']);
  expect(r).toMatch(/version 2/);expect(r).toMatch(/Approval covers the plan only/);expect(r).toMatch(/Gmail is not connected/);expect(r).not.toMatch(/I(?:’ve| have)? (sent|created)/);
  expect(approvedReply(plan,[])).not.toMatch(/not connected/);
 });
});
