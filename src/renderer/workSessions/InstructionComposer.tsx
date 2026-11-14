import React, { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useConversationDraft } from '../components/useConversationDraft.js';
import { CompactActionMenu } from '../components/CompactActionMenu.js';
import type { WorkSessionView } from './model.js';
export interface InstructionResult { message: string }
export interface InstructionActions {
  scopeKey?: string;
  onInstruction?: (row: WorkSessionView, text: string, clientId: string) => Promise<InstructionResult>;
  onDraftInstruction?: (row: WorkSessionView, text: string) => void;
}
export function InstructionComposer({ row, scopeKey = 'local', onInstruction, onDraftInstruction, focusToken, canOpen }: InstructionActions & { row: WorkSessionView; focusToken: number; canOpen: boolean }): React.ReactElement {
  const [text, setText] = useConversationDraft(`work-instruction:${scopeKey}:${row.id}`);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null), inFlight = useRef(false), attempt = useRef<{ text: string; id: string } | undefined>(undefined);
  const attemptKey = `gwira.work-instruction-attempt:${scopeKey}:${row.id}`;
  const employee = row.workerKind === 'person';
  useLayoutEffect(() => { if (focusToken) input.current?.focus(); }, [focusToken]);
  useLayoutEffect(() => { const el = input.current; if (!el) return; const max = parseFloat(getComputedStyle(el).getPropertyValue('--gw-work-composer-max')); el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, max)}px`; }, [text]);
  async function submit(): Promise<void> {
    if (!text.trim() || inFlight.current || !employee || !onInstruction) return;
    inFlight.current = true; setBusy(true); setError(''); setFeedback('Saving local message…');
    const original = text;
    if (!attempt.current) { try { const saved = JSON.parse(localStorage.getItem(attemptKey) ?? 'null'); if (saved?.text === original && typeof saved.id === 'string') attempt.current = saved; } catch { /* new attempt is retained in memory */ } }
    if (attempt.current?.text !== original) attempt.current = { text: original, id: crypto.randomUUID() };
    try { localStorage.setItem(attemptKey, JSON.stringify(attempt.current)); } catch { /* retain in memory until acknowledged */ }
    try { const result = await onInstruction(row, original, attempt.current.id); setText(current => current === original ? '' : current); attempt.current = undefined; try { localStorage.removeItem(attemptKey); } catch { /* stale metadata cannot resend without an explicit submission */ } setFeedback(result.message); }
    catch (cause) { setFeedback(''); setError(cause instanceof Error ? cause.message : 'Could not save the instruction. Your draft is retained. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="work-instruction" aria-label={`Instruction for ${row.owner}`}><h4>{employee ? 'Message employee' : 'Give instruction'}</h4><form onSubmit={event => { event.preventDefault(); void submit(); }}>
    <label htmlFor={`instruction-${row.id}`}>To {row.owner}</label><textarea id={`instruction-${row.id}`} ref={input} rows={1} value={text} aria-label={`Instruction to ${row.owner}`} placeholder={employee ? 'Write a task-linked message…' : 'Ask for follow-up changes'} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
    <div className="work-instruction__toolbar"><span>{employee ? 'On this device only' : 'Queue by default'}</span>{!employee ? <CompactActionMenu label="Instruction delivery options" actions={[
      { label: 'Add to Queue', disabled: true, reason: 'Durable queue adapter is not connected.', onSelect: () => {} },
      { label: 'Steer current work', disabled: true, reason: 'Provider has no safe steering boundary.', onSelect: () => {} },
      { label: 'Continue in conversation', disabled: !canOpen || !onDraftInstruction, reason: 'No accessible local session is linked.', onSelect: () => onDraftInstruction?.(row, text) }
    ]} /> : null}<button type="submit" disabled={busy || !text.trim() || !employee || !onInstruction} title={employee ? 'Save to the local employee conversation, linked to this task.' : 'A durable execution queue is not connected.'}><Icon name={busy ? 'running' : 'send'} />{employee ? busy ? 'Saving…' : 'Save message' : 'Queue'}</button></div>
  </form><p className="work-sessions__note">{employee ? 'Saved in local Inbox. Employee notification and delivery confirmation are not connected.' : 'Queue and steering are unavailable. Your draft stays here.'}</p>{feedback ? <p role="status">{feedback}</p> : null}{error ? <p role="alert">{error}</p> : null}
  </section>;
}
