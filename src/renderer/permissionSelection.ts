import type { PermissionMode } from '../shared/types.js';

export function permissionSelection(current: PermissionMode, requested: PermissionMode): { mode: PermissionMode; requiresConfirmation: boolean } {
  if (requested === 'full-access' && current !== 'full-access') {
    return { mode: current, requiresConfirmation: true };
  }
  return { mode: requested, requiresConfirmation: false };
}
