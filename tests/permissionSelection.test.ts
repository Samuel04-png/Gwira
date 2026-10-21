import { describe, expect, it } from 'vitest';
import { permissionSelection } from '../src/renderer/permissionSelection.js';

describe('permission selection', () => {
  it('requires confirmation before escalating from workspace write to Full Access', () => {
    expect(permissionSelection('default', 'full-access')).toEqual({ mode: 'default', requiresConfirmation: true });
  });

  it('allows selecting the safe mode without confirmation', () => {
    expect(permissionSelection('full-access', 'default')).toEqual({ mode: 'default', requiresConfirmation: false });
  });
});
