import {describe, expect, it} from 'vitest';
import type {AccountSnapshot} from '../src/shared/accountAuth.js';
import {mayMountLegacyShell} from '../src/renderer/auth/localShellAccess.js';

const initial: AccountSnapshot = {
  phase: 'initializing',
  configured: true,
  googleEnabled: false,
  organizations: [],
  teams: [],
  invitationPending: false,
  invitationSendingEnabled: false
};

describe('legacy shell access', () => {
  it('only mounts for explicit unauthenticated local mode', () => {
    expect(mayMountLegacyShell(initial)).toBe(false);
    expect(mayMountLegacyShell({...initial, phase: 'offline_local'})).toBe(false);
    expect(mayMountLegacyShell({...initial, phase: 'offline_local', localModeAllowed: true})).toBe(true);
    expect(mayMountLegacyShell({...initial, phase: 'offline_local', localModeAllowed: true, user: {id: 'account-a', email: 'a@example.test'}})).toBe(false);
  });

  it('does not expose the shared shell during account or workspace transitions', () => {
    for (const id of ['account-a', 'account-b']) {
      for (const route of [{type: 'MeetGwira', workspaceId: 'workspace'} as const, {type: 'WorkspaceReady', workspaceId: 'workspace', pendingInvitationCount: 0} as const]) {
        expect(mayMountLegacyShell({...initial, phase: 'organization_ready', user: {id, email: `${id}@example.test`}, route, localModeAllowed: true})).toBe(false);
      }
    }
    expect(mayMountLegacyShell({...initial, phase: 'signed_out', localModeAllowed: true})).toBe(false);
  });
});
