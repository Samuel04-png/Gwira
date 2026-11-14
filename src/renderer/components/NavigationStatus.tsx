import React from 'react';
import { Icon } from './Icon.js';
import type { NavigationStatusKind } from '../navigationStatusModel.js';
export type { NavigationStatusKind } from '../navigationStatusModel.js';
/** The caller supplies recorded activity and owns acknowledgement. No timers invent state. */
export function NavigationStatus({ status, label }: { status?: NavigationStatusKind; label: string }): React.ReactElement | null {
  if (!status) return null;
  return <span className={`navigation-status is-${status}`} role="img" aria-label={label} title={label}>{status === 'completed' ? <span className="navigation-status__dot" /> : <Icon name={status === 'working' ? 'running' : status === 'approval' ? 'blocked' : 'failed'} />}</span>;
}
