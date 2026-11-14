import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { CompactActionMenu, type CompactAction } from '../components/CompactActionMenu.js';
import { WorkAvatar, WorkStatus } from './WorkRow.js';
import { InstructionComposer, type InstructionActions } from './InstructionComposer.js';
import { recordedSteps, type WorkSessionView } from './model.js';
import { formatDayLabel, formatTimeLabel } from '../gwira/inbox/inboxNavModel.js';
const time = (value?: string): string => value && Number.isFinite(Date.parse(value)) ? `${formatDayLabel(value)} ${formatTimeLabel(value)}` : 'Not recorded';
export function WorkInspector({ row, onBack, onReview, onConversation, canOpen, onExpand, expanded, onCancel, stopping, focusToken, actions, initialArea = 'overview', ...instructions }: InstructionActions & { row: WorkSessionView; onBack: () => void; onReview: () => void; onConversation: () => void; canOpen: boolean; onExpand: () => void; expanded?: boolean; onCancel: () => Promise<boolean>; stopping: boolean; focusToken: number; actions: CompactAction[]; initialArea?: string }): React.ReactElement {
  const [area, setArea] = useState(initialArea), [allEvents, setAllEvents] = useState(false), [confirm, setConfirm] = useState(false), [feedback, setFeedback] = useState(''), [error, setError] = useState(''), [requesting, setRequesting] = useState(false), [instructionFocus, setInstructionFocus] = useState(0);
  const request = useRef(false), heading = useRef<HTMLButtonElement>(null);
  const events = [...row.events, ...recordedSteps(row)].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const completed = events.filter(event => event.status === 'Completed').length;
  const running = row.workerKind !== 'person' && row.task?.agentRun?.status === 'running';
  useEffect(() => {
    const status = row.task?.agentRun?.status;
    if (!feedback.startsWith('Cancellation requested.') || !status || status === 'running') return;
    setFeedback(status === 'stopped' ? 'Local run stopped. Completed actions remain recorded.' : status === 'error' ? 'Local run failed. Review the recorded activity.' : 'Local run completed. Completed actions remain recorded.');
  }, [row.task?.agentRun?.status, feedback]);
  async function cancel(): Promise<void> {
    if (request.current || stopping) return;
    request.current = true; setRequesting(true); setError('');
    try { if (!await onCancel()) throw Error('Cancellation could not be requested. Review the run and try again.'); setConfirm(false); setFeedback('Cancellation requested. Waiting for the local process to exit.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not request cancellation. Try again.'); }
    finally { request.current = false; setRequesting(false); heading.current?.focus(); }
  }
  return <article className="work-inspector" aria-label={`Work details: ${row.title}`} onKeyDown={event => { if (event.key === 'Escape' && confirm) { event.preventDefault(); event.stopPropagation(); setConfirm(false); heading.current?.focus(); } }}>
    <header className="work-sessions__detail-heading"><button ref={heading} type="button" aria-label="Back to work sessions" onClick={onBack}><Icon name="arrow-left" />Back</button><div className="work-inspector__identity"><WorkAvatar row={row} /><div><h3>{row.owner}</h3><p title={row.title}>{row.title}</p></div><CompactActionMenu label="Selected work options" actions={actions} /></div><WorkStatus row={row} /><time dateTime={row.updatedAt}>{time(row.updatedAt)}</time></header>
    <div className="work-sessions__controls work-inspector__actions"><button type="button" onClick={() => { setArea('overview'); setInstructionFocus(value => value + 1); }}><Icon name="threads" />{row.workerKind === 'person' ? 'Message' : 'Give instruction'}</button>{row.approvals.some(approval => approval.status === 'pending') ? <button type="button" onClick={() => setArea('outputs')}><Icon name="review" />Review</button> : null}{!expanded ? <button type="button" title="Open full Work Session in an application tab" onClick={onExpand}><Icon name="external" />Expand</button> : null}</div>
    <nav className="work-sessions__detail-tabs" aria-label="Session detail areas">{['overview', 'activity', 'outputs'].map(tab => <button key={tab} type="button" aria-current={area === tab ? 'page' : undefined} onClick={() => setArea(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</nav>
    {feedback ? <p className="work-inspector__feedback" role="status">{feedback}</p> : null}{error ? <p className="work-inspector__feedback" role="alert">{error}</p> : null}
    <div className="work-sessions__detail-grid">
      {area === 'overview' ? <section className="work-sessions__overview"><h4>Current work</h4>{row.objective ? <p>{row.objective}</p> : null}<dl><dt>Responsible</dt><dd>{row.owner}</dd>{row.project ? <><dt>Project</dt><dd>{row.project}</dd></> : null}<dt>Started</dt><dd>{time(row.startedAt)}</dd><dt>Last recorded</dt><dd>{time(row.updatedAt)}</dd><dt>Progress</dt><dd>{completed ? `${completed} recorded operations completed. Planned total is unknown.` : row.status}</dd></dl>
        <div className="work-sessions__controls">{canOpen ? <button type="button" onClick={onConversation}><Icon name="threads" />Open conversation</button> : null}{row.task ? <button type="button" onClick={onReview}><Icon name="work" />Open related task</button> : null}<button type="button" onClick={() => setArea('activity')}><Icon name="list" />View execution</button>{running ? <button type="button" disabled={stopping || requesting} onClick={() => setConfirm(true)}><Icon name="stop" />{stopping || requesting ? 'Cancelling…' : 'Cancel local run'}</button> : null}</div>
        {confirm ? <div className="work-sessions__confirmation" role="alert"><p>Request cancellation? Completed actions remain recorded. The run stops only after the process exits.</p><button autoFocus type="button" disabled={requesting || stopping} onClick={() => void cancel()}>Request cancellation</button><button type="button" onClick={() => { setConfirm(false); heading.current?.focus(); }}>Keep working</button></div> : null}
        {row.group === 'attention' ? <p className="work-sessions__note">Inspect the recorded activity before retrying any operation. Safe retry and reassignment services are not connected.</p> : null}
        <InstructionComposer key={row.id} row={row} canOpen={canOpen && !!row.session} focusToken={focusToken + instructionFocus} {...instructions} />
        {row.children.length ? <section><h4>Recorded assignments</h4>{row.children.map(child => <p key={child.id}>{child.owner} · {child.title} · {child.status}</p>)}</section> : null}
      </section> : null}
      {area === 'activity' ? <section className="work-sessions__activity" tabIndex={-1}><h4>Activity history</h4><p className="work-sessions__note">Recorded actions. Raw tool payloads are withheld.</p><ol>{(allEvents ? events : events.slice(-6)).map(event => <li key={event.id}><details><summary><Icon name={event.status === 'Failed' ? 'failed' : event.status === 'Running' ? 'running' : 'trace-check'} /><span>{event.title}<small>{event.status} · <time dateTime={event.at}>{time(event.at)}</time></small></span></summary><p>{event.detail}</p></details></li>)}</ol>{!events.length ? <p>No activity history is recorded for this work.</p> : null}{events.length > 6 ? <button type="button" aria-expanded={allEvents} onClick={() => setAllEvents(!allEvents)}>{allEvents ? 'Show recent events' : `Show all ${events.length} events`}</button> : null}</section> : null}
      {area === 'outputs' ? <section className="work-sessions__outputs"><h4>Outputs and approvals</h4>{row.approvals.map(approval => <div className="work-sessions__approval" key={approval.id}><Icon name="review" /><h5>Recorded result</h5><dl><dt>Result</dt><dd>{approval.resultId}</dd><dt>Approval</dt><dd>{approval.status.replaceAll('_', ' ')}</dd><dt>Requested</dt><dd>{time(approval.createdAt)}</dd></dl><p className="work-sessions__note">Reviewer identity and server authorization are not connected. Approval decisions remain in the existing task review flow.</p><button type="button" onClick={onReview}>Review recorded task</button></div>)}{!row.approvals.length ? <p>No structured outputs are linked to this work.</p> : null}</section> : null}
    </div>
  </article>;
}
