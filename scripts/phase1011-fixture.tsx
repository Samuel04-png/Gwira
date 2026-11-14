import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueuedMessageList } from '../src/renderer/components/QueuedMessageList.js';
import { NavigationStatus } from '../src/renderer/components/NavigationStatus.js';
import { MockConversationQueue } from '../src/renderer/conversationQueueMock.js';
function Fixture(): React.ReactElement {
  const [queue] = useState(() => {
    const adapter = new MockConversationQueue(import.meta.env.DEV);
    for (let i = 1; i <= 4; i++) adapter.enqueue({ id: String(i), workspaceId: 'fixture', conversationId: 'fixture', text: `Queued development instruction ${i}: Review the outstanding invoices and prepare a concise summary for the operations team.`, status: 'pending', submittedAt: '2026-10-28' });
    return adapter;
  });
  const [, refresh] = useState(0);
  const act = (f: () => void): void => { f(); refresh(value => value + 1); };
  return <div className="conversation-dev-fixture workspace__view--chat"><h2>Development adapter · no business execution</h2><p>Recorded status presentation</p><div className="sidebar-group-label">{(['working', 'completed', 'failed', 'approval'] as const).map(status => <NavigationStatus key={status} status={status} label={status} />)}</div><QueuedMessageList requests={queue.snapshot()} onEdit={(id, text) => act(() => queue.edit(id, text))} onRemove={id => act(() => queue.remove(id))} onMoveEarlier={id => act(() => queue.moveEarlier(id))} /></div>;
}
export function showPhase1011Fixture(): void {
  if (!import.meta.env.DEV) throw new Error('Development fixture only');
  const host = document.createElement('div'); host.id = 'phase1011-fixture'; Object.assign(host.style, { position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--gw-surface)' }); document.body.appendChild(host); createRoot(host).render(<Fixture />);
}
