import {describe,it,expect} from 'vitest';
import {decide,initialMeetState,meetReducer,brief,propose} from '../../src/renderer/gwira/onboarding/meetGwiraModel.js';
describe('Meet Gwira local conversation',()=>{
 it.each([['Build a website','website'],['Prepare customer collections','collections'],['Organize employees','people']])('asks a relevant question for %s',(goal,kind)=>{const s=meetReducer(initialMeetState,{type:'submit',text:goal});expect(s.act).toBe('clarifying');expect(decide(s.goal,[],0).kind).toBe(kind);const next=meetReducer(s,{type:'skip'});expect(next.act).toBe('proposal');expect(brief(next)).toContain('No tasks, messages or connections');});
 it('asks for useful context on vague goals, then stops when sufficient',()=>{let s=meetReducer(initialMeetState,{type:'submit',text:'Run my business better'});s=meetReducer(s,{type:'submit',text:'A business website'});expect(s.asked).toBe(2);s=meetReducer(s,{type:'submit',text:'Book a service'});expect(s.act).toBe('proposal');expect(s.answers).toHaveLength(2)});
 it('never asks past the question cap',()=>expect(decide('Business',[],3).question).toBeUndefined());
 it('preserves goal and answers through review; editing invalidates context',()=>{let s=meetReducer(initialMeetState,{type:'submit',text:'Build website to book services'});s=meetReducer(s,{type:'review'});expect(s.act).toBe('review');s=meetReducer(s,{type:'export'});expect(s.act).toBe('result');expect(meetReducer(s,{type:'back'}).goal).toBe(s.goal);expect(meetReducer(s,{type:'edit'}).answers).toEqual([])});
 it('rejects empty submits and out-of-order exports',()=>{expect(meetReducer(initialMeetState,{type:'submit',text:'  '})).toBe(initialMeetState);expect(meetReducer(initialMeetState,{type:'export'})).toBe(initialMeetState)});
});

describe('personalized local proposals',()=>{
 it.each([
  ['Follow up on overdue customer payments','collections','Gmail'],
  ['Build a simple website for my business','website',undefined],
  ['Set up employee assignments for this week','people',undefined],
  ['Track stock levels and low inventory','inventory','Google Sheets'],
  ['Respond to customer WhatsApp messages faster','messages','WhatsApp Business']
 ])('matches purpose and tools for %s',(goal,kind,tool)=>{
  const state={...initialMeetState,goal};const p=propose(state);
  expect(decide(goal,[],3).kind).toBe(kind);expect(p.steps).toHaveLength(3);
  expect(p.doat).not.toMatch(/Doat/);expect(p.doat).toBe(propose(state).doat);
  expect(p.integrations[0]?.name).toBe(tool);
 });
 it('uses source and answer context without changing the primary purpose',()=>{
  const state={...initialMeetState,goal:'Prepare collections from an Excel file',answers:[{question:'Focus?',answer:'Prepare collection assignments'}]};
  const p=propose(state);expect(p.steps[0][1]).toContain('Excel');expect(p.steps[1][0]).toContain('assignments');expect(p.role).toBe('Collections planning');
 });
 it('keeps payment approvals separate from collection messages',()=>{
  expect(decide('Approve outgoing payments',[],3).kind).toBe('approvals');
  expect(decide('Follow up on late payments',[{question:'Focus?',answer:'Draft emails for approval'}],3).kind).toBe('collections');
 });
 it('changes title, steps and role for materially different goals',()=>{
  const p=['Collect overdue payments','Build website','Track stock'].map(goal=>propose({...initialMeetState,goal}));
  expect(new Set(p.map(x=>x.name)).size).toBe(3);expect(new Set(p.map(x=>x.role)).size).toBe(3);expect(new Set(p.map(x=>x.steps[0][0])).size).toBe(3);
 });
});
