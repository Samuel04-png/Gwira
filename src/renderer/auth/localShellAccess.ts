import type {AccountSnapshot} from '../../shared/accountAuth.js';

/**
 * The legacy shell has machine-wide stores and IPC. It must not be mounted as
 * an authenticated workspace until those resources have an ownership boundary.
 */
export function mayMountLegacyShell(state: AccountSnapshot): boolean {
  return state.phase === 'offline_local' && state.localModeAllowed === true && !state.user;
}
