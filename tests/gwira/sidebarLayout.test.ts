import {describe,expect,it} from 'vitest';
import {parseSidebarLayout} from '../../src/renderer/auth/sidebarLayout.js';

describe('account-scoped sidebar layout',()=>{
 it('defaults to no saved preference and preserves other layout settings',()=>{
  expect(parseSidebarLayout(null)).toEqual({});
  expect(parseSidebarLayout('{"sidebarExpanded":true,"other":42}')).toEqual({sidebarExpanded:true,other:42});
 });
 it('rejects invalid layout data instead of silently replacing it',()=>{
  for(const raw of ['null','[]','{"sidebarExpanded":"yes"}','not-json'])expect(()=>parseSidebarLayout(raw)).toThrow();
 });
});
