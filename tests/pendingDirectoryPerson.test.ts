import {describe,expect,it} from 'vitest';
import {parsePendingDirectoryPerson} from '../src/renderer/gwira/dashboard/pendingDirectoryPerson.js';

describe('pending directory person',()=>{
 it('accepts a scoped retry or an empty preference',()=>{
  const person={type:'create',id:'11111111-1111-4111-8111-111111111111',name:'Pat',jobTitle:'Designer'};
  expect(parsePendingDirectoryPerson(JSON.stringify(person))).toEqual(person);
  expect(parsePendingDirectoryPerson(null)).toBeNull();
  expect(parsePendingDirectoryPerson('null')).toBeNull();
 });
 it('rejects malformed or incomplete requests rather than overwriting them',()=>{
  for(const raw of ['{}','not json','{"type":"create","id":"invalid","name":"x","jobTitle":"x"}','{"type":"create","id":"11111111-1111-4111-8111-111111111111","name":" ","jobTitle":"x"}'])expect(()=>parsePendingDirectoryPerson(raw)).toThrow();
 });
});
