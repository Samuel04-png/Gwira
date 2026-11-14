import React, { useEffect, useId, useMemo, useState } from 'react';
import type { TraceGroup, TraceRun, TraceStatus } from '../activityTraceModel.js';
import { formatTraceDuration } from '../activityTraceModel.js';
import { ShellIcon } from './Icon.js';

type Copy = (text: string) => Promise<void>;

export function TraceGlyph({ status }: { status: TraceStatus }): React.ReactElement {
  return <span className={`trace-glyph is-${status}`} role="img" aria-label={status === 'done' ? 'Completed' : status === 'waiting' ? 'Waiting for a person' : status === 'failed' ? 'Failed' : status === 'queued' ? 'Queued' : 'Running'}>
    <ShellIcon name={status === 'done' ? 'trace-check' : status === 'waiting' ? 'waiting' : status === 'failed' ? 'failed' : status === 'queued' ? 'queued' : 'running'} />
  </span>;
}

function TraceDetail({ group, onCopy }: { group: TraceGroup; onCopy: Copy }): React.ReactElement {
  const [all, setAll] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const raw = useMemo(() => group.steps.map((step) => step.raw).join('\n'), [group.steps]);
  const lines = useMemo(() => raw.trimEnd().split('\n'), [raw]);
  async function copy(): Promise<void> {
    try { await onCopy(raw); setCopyState('copied'); } catch { setCopyState('failed'); }
  }
  return <div className={`trace-detail${all ? ' is-expanded' : ''}`}>
    <div className="trace-detail__bar"><span>Command & output</span><button type="button" onClick={() => void copy()} aria-label="Copy command and output"><ShellIcon name="trace-copy" />{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Try copy again' : 'Copy'}</button></div>
    <pre tabIndex={all ? 0 : undefined} aria-label="Recorded command and output">{(all ? lines : lines.slice(0, 12)).join('\n')}</pre>
    {lines.length > 12 ? <button className="trace-detail__more" type="button" aria-expanded={all} onClick={() => setAll((value) => !value)}>{all ? 'Show fewer lines' : `Show all ${lines.length} lines`}</button> : null}
    {copyState === 'failed' ? <span className="trace-copy-status" role="status">Could not copy. Select the output to copy it manually.</span> : null}
  </div>;
}

function TraceStepRow({ group, onCopy }: { group: TraceGroup; onCopy: Copy }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <li className={`trace-step${group.background ? ' is-background' : ''}`}>
    <button type="button" className="trace-step__button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
      <TraceGlyph status={group.status} />
      <span className="trace-step__label" title={group.label}>{group.label}{group.repeats > 1 ? <span className="trace-step__repeat"> ×{group.repeats}</span> : null}</span>
      <span className="trace-step__duration">{group.durationMs !== undefined ? formatTraceDuration(group.durationMs) : ''}</span>
    </button>
    <div id={id} hidden={!open}>{open ? <TraceDetail group={group} onCopy={onCopy} /> : null}</div>
  </li>;
}

export function ActivityTrace({ run, onCopy }: { run: TraceRun; onCopy: Copy }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => { if (!run.live) setOpen(false); }, [run.live]);
  const current = run.live ? run.groups.at(-1) : undefined;
  const backgroundOnly = run.groups.every((group) => group.background);
  const failed = run.groups.filter((group) => group.status === 'failed' && !group.background);
  const summary = run.live ? `Working · ${run.stepCount} ${run.stepCount === 1 ? 'step' : 'steps'}` : `${run.durationMs !== undefined ? `Worked for ${formatTraceDuration(run.durationMs)}` : 'Recorded work'} · ${run.stepCount} ${run.stepCount === 1 ? 'step' : 'steps'}`;
  const visible = open || backgroundOnly ? run.groups : current ? [current] : failed;
  return <div className={`activity-trace${run.live ? ' is-live' : ''}`} data-trace-run>
    {!backgroundOnly ? <button className="trace-summary" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
      {run.live && current?.status !== 'running' ? <TraceGlyph status={current?.status === 'waiting' || current?.status === 'queued' ? current.status : 'running'} /> : <ShellIcon className="trace-summary__history" name="unread" />}
      <span>{summary}</span>
      <span className="trace-summary__action">{open ? 'Hide steps' : 'Show steps'}</span>
    </button> : null}
    <ol className="trace-steps" id={id} hidden={!visible.length}>{visible.map((group) => <TraceStepRow key={group.id} group={group} onCopy={onCopy} />)}</ol>
  </div>;
}
