import {describe,it,expect} from 'vitest';
import {parseListPrefs,defaultListPrefs,criteriaCount} from '../../src/renderer/gwira/list/listPreferences.js';
describe('List preference migration',()=>{
 it('repairs old densities and invalid columns without breaking saved grouping',()=>{
  expect(parseListPrefs({rowHeight:36,groupBy:'status',columns:['assignee','unknown']})).toMatchObject({rowHeight:48,groupBy:'status',columns:['assignee']});
 });
 it('supports deliberately hidden optional columns and repairs corrupt criteria',()=>{
  expect(parseListPrefs({columns:[],criteria:{kind:'invalid',due:'bad'}})).toMatchObject({columns:[],criteria:{kind:'all',due:'all'}});
  expect(criteriaCount(defaultListPrefs().criteria)).toBe(0);
 });
});
