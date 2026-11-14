import {describe,it,expect} from 'vitest';
import {AccountError} from '../src/main/auth/gateway.js';
import {classifyFailure,isMissingContract} from '../src/main/auth/accessIssue.js';

describe('classifyFailure',()=>{
 it.each(['network','session_expired','setup_unavailable','access_denied'] as const)('maps %s',code=>{
  expect(classifyFailure(new AccountError(code,'x')).issue).toBe(code);
 });
 it('falls back to a generic backend issue without leaking internals',()=>{
  const r=classifyFailure(new Error('relation "gwira.workspace_setup" does not exist'));
  expect(r.issue).toBe('backend');
  expect(r.message).not.toMatch(/gwira\.|relation/);
 });
 it('recognises missing backend contracts',()=>{
  for(const c of ['PGRST205','PGRST202','42P01','42883'])expect(isMissingContract(c)).toBe(true);
  expect(isMissingContract('42501')).toBe(false);
 });
});
