import React from 'react';
import { ShellIcon } from './Icon.js';
import { CompactActionMenu } from './CompactActionMenu.js';

/** Same toolbar footprint while running, with cancellation acknowledged by the host. */
export function ConversationExecutionControls({ busy, hasDraft, onStop, onStopAndSend }: { busy: boolean; hasDraft: boolean; onStop: () => void; onStopAndSend: () => void }): React.ReactElement {
  return <div className="conversation-execution" aria-label="Running work controls">
    {hasDraft ? <CompactActionMenu label="Send options" icon="chevron-down" actions={[
      { label: 'Add to Queue', icon: 'queued', description: 'Run after current work.', disabled: true, reason: 'Durable queue adapter is not connected.', onSelect: () => {} },
      { label: 'Steer with Message', icon: 'arrow-right', description: 'Redirect current work.', disabled: true, reason: 'Provider does not support safe steering.', onSelect: () => {} },
      { label: 'Stop & Send', icon: 'send', description: 'Stop current work and send.', disabled: busy, onSelect: onStopAndSend }
    ]} /> : null}
    <button type="button" className="conversation-execution__stop" disabled={busy} title={busy ? 'Waiting for cancellation acknowledgement' : 'Stop current work. Completed actions are preserved.'} aria-label={busy ? 'Cancelling current work' : 'Stop current work'} onClick={onStop}><ShellIcon name={busy ? 'running' : 'stop'} /></button>
    <span className="conversation-status" role="status">{busy ? 'Cancelling…' : 'Gwira is working. You can keep writing.'}</span>
  </div>;
}
