import React, { useMemo } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { inboxCounts, inboxItems } from './inboxViewModel.js';

export interface InboxPageProps {
  state: GwiraLocalState;
  onOpenTask: (taskId: string) => void;
}

/** A local work feed, not an integration inbox. */
export function InboxPage({ state, onOpenTask }: InboxPageProps): React.ReactElement {
  const items = useMemo(() => inboxItems(state), [state]);
  const counts = useMemo(() => inboxCounts(state), [state]);
  return <section className="gwira-inbox" aria-label="Inbox">
    <header className="gwira-inbox__header"><div><h1>Inbox</h1><p>Local approvals and workspace activity. External messaging is not connected.</p></div><span>{counts.pendingApprovals} pending approvals</span></header>
    {items.length === 0 ? <div className="gwira-inbox__empty"><h2>Nothing to review</h2><p>Task updates and approval requests will appear here.</p></div> : <ol className="gwira-inbox__items">{items.map((item) => <li key={item.id} className={`gwira-inbox__item is-${item.kind}`}>
      {item.kind === 'approval' ? <><strong>Approval requested</strong><button type="button" onClick={() => onOpenTask(item.taskId)}>{item.title}</button><span>Result {item.resultId}</span></> : <>{item.taskId ? <button type="button" onClick={() => onOpenTask(item.taskId!)}>{item.title}</button> : <strong>{item.title}</strong>}<span>{item.event.kind.replaceAll('_', ' ')}</span></>}
      <time dateTime={item.occurredAt}>{item.occurredAt}</time>
    </li>)}</ol>}
    <footer className="gwira-inbox__footer">{counts.activity} local activity records retained.</footer>
  </section>;
}
