import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MockConversationQueue } from '../src/renderer/conversationQueueMock.js';
import { QueuedMessageList } from '../src/renderer/components/QueuedMessageList.js';
import { GwiraThinkingIndicator } from '../src/renderer/components/GwiraThinkingIndicator.js';

function Fixture(): React.ReactElement {
  const [adapter] = useState(() => new MockConversationQueue(import.meta.env.DEV));
  const [, redraw] = useState(0);
  const [generation] = useState(() => new Date(Date.now() - 6000).toISOString());
  const [status, setStatus] = useState<'thinking' | 'working'>('thinking');
  const [text, setText] = useState('');
  const refresh = (): void => redraw((value) => value + 1);
  return <div className="workspace__view--chat"><div className="conversation-dev-fixture"><h1>Development-only queue adapter</h1><p>No backend operations are executed. This state is isolated from the application.</p><GwiraThinkingIndicator status={status} startedAt={generation} activityLabel={status === 'working' ? 'Reading document · recorded test event' : undefined} /><button onClick={() => setStatus('working')}>Use recorded activity</button><label>Mock request<textarea aria-label="Mock request" value={text} onChange={(event) => setText(event.target.value)} /></label><button onClick={() => { adapter.enqueue({ id: crypto.randomUUID(), workspaceId: 'dev-workspace', conversationId: 'dev-conversation', submittedAt: new Date().toISOString(), text, status: 'pending' }); setText(''); refresh(); }}>Queue in mock adapter</button><button onClick={() => { adapter.claim('dev-workspace', 'dev-conversation'); refresh(); }}>Claim next mock request</button><QueuedMessageList requests={adapter.snapshot()} onEdit={(id, value) => { adapter.edit(id, value); refresh(); }} onRemove={(id) => { adapter.remove(id); refresh(); }} onMoveEarlier={(id) => { adapter.moveEarlier(id); refresh(); }} /></div></div>;
}
export function showConversationFixture(): void {
  if (!import.meta.env.DEV) throw new Error('Development fixture only');
  const node = document.createElement('div'); node.id = 'conversation-dev-fixture'; document.body.appendChild(node);
  Object.assign(node.style, { position: 'fixed', inset: '0', zIndex: '10000', background: 'white', overflow: 'auto' });
  createRoot(node).render(<Fixture />);
}
