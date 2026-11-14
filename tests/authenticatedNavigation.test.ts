import {describe,expect,it} from 'vitest';
import {initialNavigationHistory,stepNavigation,visitNavigation} from '../src/renderer/auth/navigationHistory.js';

describe('authenticated navigation history',()=>{
 it('deduplicates visits and truncates forward history after a new destination',()=>{
  let state=visitNavigation(initialNavigationHistory,'dashboard');
  state=visitNavigation(state,'dashboard');
  state=visitNavigation(state,'inbox');
  state=stepNavigation(state,-1);
  expect(state.views[state.index]).toBe('dashboard');
  state=visitNavigation(state,'library');
  expect(state.views).toEqual(['home','dashboard','library']);
  expect(stepNavigation(state,1).index).toBe(2);
 });
 it('clamps navigation at both ends',()=>{
  expect(stepNavigation(initialNavigationHistory,-1).index).toBe(0);
  expect(stepNavigation(initialNavigationHistory,1).index).toBe(0);
 });
});
