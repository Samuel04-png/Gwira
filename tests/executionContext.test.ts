import {describe, expect, it, vi} from 'vitest';
import {ExecutionContext} from '../src/main/auth/executionContext.js';
import type {AccountSnapshot} from '../src/shared/accountAuth.js';

const initial: AccountSnapshot = {phase:'initializing', configured:true, googleEnabled:false, organizations:[], teams:[], invitationPending:false, invitationSendingEnabled:false};

describe('machine tool execution boundary', () => {
  it('denies access until explicit local mode and invalidates tickets on a transition', () => {
    const boundary = new ExecutionContext();
    const revoked = vi.fn();
    boundary.onChange(revoked);
    expect(() => boundary.localTicket()).toThrow();
    boundary.update({...initial, phase:'offline_local', localModeAllowed:true});
    const ticket = boundary.localTicket();
    boundary.update({...initial, phase:'authenticating'});
    expect(() => boundary.assertLocal(ticket)).toThrow();
    expect(revoked).toHaveBeenCalledTimes(2);
    boundary.update({...initial, phase:'offline_local', localModeAllowed:true});
    expect(() => boundary.assertLocal(ticket)).toThrow();
  });

  it('never grants machine tools to signed-in or disabled local contexts', () => {
    const boundary = new ExecutionContext();
    for (const state of [
      {...initial, phase:'offline_local' as const},
      {...initial, phase:'offline_local' as const, localModeAllowed:true, user:{id:'a', email:'a@example.test'}},
      {...initial, phase:'organization_ready' as const, localModeAllowed:true, user:{id:'a', email:'a@example.test'}},
      {...initial, phase:'session_expired' as const}
    ]) {
      boundary.update(state);
      expect(() => boundary.localTicket()).toThrow();
    }
  });

  it('revokes local grants immediately and waits for every in-flight operation before transition', async () => {
    const boundary = new ExecutionContext();
    boundary.update({...initial, phase:'offline_local', localModeAllowed:true});
    const first = boundary.beginLocalOperation();
    const second = boundary.beginLocalOperation();
    boundary.revoke();
    expect(() => boundary.assertLocal(first.ticket)).toThrow();
    expect(() => boundary.beginLocalOperation()).toThrow();
    let drained = false;
    const waiting = boundary.waitForLocalOperations().then(() => { drained = true; });
    first.release(); first.release();
    await Promise.resolve();
    expect(drained).toBe(false);
    second.release();
    await waiting;
    expect(drained).toBe(true);
  });
});
