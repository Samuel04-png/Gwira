import {describe,expect,it} from 'vitest';
import {advanceHint,hintDelay,hintTiming,initialHintState,visibleHint,type HintState} from '../../src/renderer/gwira/onboarding/typewriterModel.js';
import {hintPhrases,moreStartingPoints,startingPoints} from '../../src/renderer/gwira/onboarding/startingPoints.js';
import {decide} from '../../src/renderer/gwira/onboarding/meetGwiraModel.js';

const phrases=['Ab…','Cd…'] as const;
describe('typewriter hint',()=>{
 it('types, holds, deletes and moves to the next phrase',()=>{
  let state:HintState=initialHintState;const seen:string[]=[];
  for(let i=0;i<20;i++){seen.push(visibleHint(state,phrases,false));state=advanceHint(state,phrases);}
  expect(seen.slice(0,5)).toEqual(['','A','Ab','Ab…','Ab…']);
  expect(seen).toContain('Cd…');
  expect(state.index).toBeLessThanOrEqual(1);
 });
 it('wraps around to the first phrase',()=>{
  let state:HintState={index:1,length:1,phase:'deleting'};state=advanceHint(state,phrases);
  expect(state).toEqual({index:0,length:0,phase:'gap'});
 });
 it('uses the specified pacing',()=>{
  expect(hintTiming.type).toBeGreaterThanOrEqual(55);expect(hintTiming.type).toBeLessThanOrEqual(80);
  expect(hintTiming.erase).toBeGreaterThanOrEqual(25);expect(hintTiming.erase).toBeLessThanOrEqual(40);
  expect(hintTiming.hold).toBeGreaterThanOrEqual(1500);expect(hintTiming.hold).toBeLessThanOrEqual(2000);
  expect(hintDelay({index:0,length:3,phase:'holding'})).toBe(hintTiming.hold);
 });
 it('shows a complete phrase when paused or reduced',()=>{
  expect(visibleHint({index:1,length:1,phase:'typing'},phrases,true)).toBe('Cd…');
 });
 it('never advances beyond the phrase length',()=>{
  expect(advanceHint({index:0,length:3,phase:'typing'},phrases).length).toBe(3);
 });
});
describe('starting points',()=>{
 it('offers four initial suggestions with unique ids and concrete editable prompts',()=>{
  expect(startingPoints).toHaveLength(4);
  const all=[...startingPoints,...moreStartingPoints];
  expect(new Set(all.map(p=>p.id)).size).toBe(all.length);
  for(const p of all)expect(p.prompt.length).toBeGreaterThan(10);
 });
 it('routes every suggestion to a specific kind of work',()=>{
  for(const p of [...startingPoints,...moreStartingPoints])expect(decide(p.prompt,[],0).kind).not.toBe('general');
 });
 it('ships six non-empty example hints',()=>{expect(hintPhrases).toHaveLength(6);for(const h of hintPhrases)expect(h.length).toBeGreaterThan(10)});
});
