import { StatusIndicator } from './StatusIndicator.js';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CodexSession, CodexThreadHistory, ReasoningEffort } from '../../shared/types.js';
import { mergeOutputIntoMessages } from '../messageMerge.js';
import { ShellIcon } from './Icon.js';
import { GwiraLogo } from './GwiraLogo.js';
import { ConversationExecutionControls } from './ConversationExecutionControls.js';
import { useConversationScroll } from './useConversationScroll.js';
import { useConversationDraft } from './useConversationDraft.js';
import { requestConversationStop } from '../conversationModel.js';
import { globalChatRows, clampChatWidth } from '../globalChatModel.js';
import { buildPromptWithAttachments, type ComposerAttachment } from '../composerAttachments.js';
import { Transcript } from './Transcript.js';

interface Props {
  open: boolean; cwd?: string; projectName?: string; model: string;
  reasoningEffort: ReasoningEffort; available: boolean; existingSessions?: CodexSession[]; onClose: () => void;
}

interface HeaderProps {
  view: 'chat' | 'sessions';
  title?: string;
  loading: boolean;
  busy: boolean;
  sessionsDisabled?: boolean;
  onSessions: () => void;
  onRefresh: () => void;
  onNew: () => void;
  onClose: () => void;
}

export function GlobalAssistantHeader({view, title, loading, busy, sessionsDisabled = false, onSessions, onRefresh, onNew, onClose}: HeaderProps): React.ReactElement {
  return <header>
    <div className="global-assistant__heading">
      {view === 'chat' ? <button type="button" aria-label="Conversation sessions" title={sessionsDisabled ? 'Confirm the pending message before switching conversations.' : 'Back to sessions'} disabled={sessionsDisabled} onClick={onSessions}><ShellIcon name="arrow-left" /></button> : null}
      <GwiraLogo /><h2>{view === 'sessions' ? 'Sessions' : 'Gwira Chat'}</h2>
      {view === 'chat' && title ? <span className="global-assistant__title" title={title}>· {title}</span> : null}
    </div>
    <div className="global-assistant__header-actions">
      {view === 'sessions' ? <button type="button" aria-label="Refresh conversations" title="Refresh" disabled={loading} onClick={onRefresh}><ShellIcon name="refresh" /></button> : null}
      <button type="button" aria-label="New Gwira conversation" title="New conversation" disabled={busy} onClick={onNew}><ShellIcon name="plus" /></button>
      <button type="button" aria-label="Close Gwira Chat" title="Close chat" onClick={onClose}><ShellIcon name="close" /></button>
    </div>
  </header>;
}

export function GlobalAssistantFrame({open, width, onWidthChange, onEscape, children}: {
  open: boolean; width: number; onWidthChange: (width: number) => void; onEscape: () => void; children: React.ReactNode;
}): React.ReactElement {
  const dragging = useRef<{x: number; width: number} | undefined>(undefined);
  return <aside id="gwira-assistant-panel" className="global-assistant" hidden={!open} aria-label="Gwira Chat" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onEscape(); }
  }}>
    <div className="global-assistant__resize" role="separator" tabIndex={0} aria-label="Resize Gwira Chat" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={540} aria-valuenow={width}
      onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); onWidthChange(event.key === 'Home' ? 320 : event.key === 'End' ? 540 : width + (event.key === 'ArrowLeft' ? 20 : -20)); } }}
      onPointerDown={event => { dragging.current = {x:event.clientX, width}; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (dragging.current) onWidthChange(dragging.current.width + dragging.current.x - event.clientX); }}
      onPointerUp={() => { dragging.current = undefined; }} onPointerCancel={() => { dragging.current = undefined; }} />
    {children}
  </aside>;
}

export function GlobalAssistantComposerFooter({onAddAttachments, attachmentsDisabled, attachmentTitle, model, action}: {
  onAddAttachments?: () => void; attachmentsDisabled: boolean; attachmentTitle: string; model: string; action: React.ReactNode;
}): React.ReactElement {
  return <div className="global-assistant__composer-footer">
    <button type="button" aria-label="Add attachments" title={attachmentTitle} disabled={attachmentsDisabled} onClick={onAddAttachments}><ShellIcon name="plus" /></button>
    <span className="global-assistant__model" title={`Model: ${model}`}><small>{model}</small></span>
    {action}
  </div>;
}

export const GlobalAssistantInput = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function GlobalAssistantInput(props, ref) {
    return <textarea id="gwira-assistant-input" aria-label="Message Gwira" rows={1} {...props} ref={ref} />;
  }
);

export function GlobalAssistantFeed({feedRef, onScroll, following, onJump, children}: {
  feedRef: React.RefObject<HTMLDivElement | null>; onScroll: () => void; following: boolean; onJump: () => void; children: React.ReactNode;
}): React.ReactElement {
  return <div className="global-assistant__feed" ref={feedRef} onScroll={onScroll}>
    {children}
    {!following ? <button className="conversation-jump" type="button" onClick={onJump}><ShellIcon name="sort-down" />Jump to latest</button> : null}
  </div>;
}

export function GlobalAssistantSessionRow({title, updatedAt, icon, status, active, disabled, onClick}: {
  title: string; updatedAt: string; icon: 'threads' | 'running' | 'failed'; status?: string; active: boolean; disabled: boolean; onClick: () => void;
}): React.ReactElement {
  return <button type="button" className="global-assistant__session" aria-current={active ? 'true' : undefined} disabled={disabled} onClick={onClick}>
    <ShellIcon name={icon} />
    <span><strong>{title}</strong><small><time dateTime={updatedAt}>{new Date(updatedAt).toLocaleString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}</time>{status ? ` · ${status}` : ''}</small></span>
  </button>;
}

export function GlobalAssistantSessionSearch({query, onQueryChange, filter}: {
  query: string; onQueryChange: (value: string) => void; filter?: React.ReactNode;
}): React.ReactElement {
  return <div className="global-assistant__search"><ShellIcon name="search" /><input aria-label="Search conversations" autoFocus value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search conversations…" />{filter}</div>;
}

export function GlobalAssistantEmpty({description}: {description: string}): React.ReactElement {
  return <div className="global-assistant__empty"><GwiraLogo size="empty" /><h3>What can I help you with?</h3><p>{description}</p></div>;
}

export function globalAssistantSessionKeys(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  event.preventDefault();
  items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
}

export const GlobalAssistantContext = React.forwardRef<HTMLButtonElement, {
  label: string; expanded: boolean; onClick: () => void;
}>(function GlobalAssistantContext({label, expanded, onClick}, ref) {
  return <button className="global-assistant__context" ref={ref} type="button" aria-label="Conversation context and permissions" aria-expanded={expanded} onClick={onClick}><ShellIcon name="folder" /><span>{label}</span><ShellIcon name="chevron-down" /></button>;
});

/** Shell-owned view of existing sessions. Hiding it never unmounts or cancels a run. */
export function GlobalAssistantPanel({ open, cwd, projectName, model, reasoningEffort, available, existingSessions = [], onClose }: Props): React.ReactElement {
  const [sessions, setSessions] = useState<Record<string, CodexSession>>({});
  const sessionsRef = useRef<Record<string, CodexSession>>({});
  const [activeId, setActiveId] = useState<string>();
  const session = activeId ? sessions[activeId] : undefined;
  const sessionRef = useRef(session); sessionRef.current = session;
  const scope = session?.cwd ?? cwd;
  const draftKey = activeId ?? `new:${cwd ?? ''}`;
  const [draft, setDraft, setScopedDraft] = useConversationDraft(draftKey);
  const [files, setFiles] = useState<Record<string, ComposerAttachment[]>>({});
  const attachments = files[draftKey] ?? [];
  const [view, setView] = useState<'chat' | 'sessions'>('chat');
  const [histories, setHistories] = useState<CodexThreadHistory[]>([]);
  const [query, setQuery] = useState('');
  const [runningOnly, setRunningOnly] = useState(false);
  const [listHovered, setListHovered] = useState(false);
  const frozenOrder = useRef<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const historyRequest = useRef(0);
  const pendingDrafts = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState(false);
  const cancellingRef = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [details, setDetails] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<string, number>>({});
  const running = session?.status === 'running';
  const scroll = useConversationScroll(feedRef, session?.messages, session?.id, open);
  const missing = !scope ? 'Add a project from Home to give Gwira Chat a source folder.' : !available && !session ? 'No model is available. Check your local model settings.' : undefined;
  const title = session ? session.messages.find(m => m.role === 'user')?.text.replace(/<image[\s\S]*?<\/image>/g, '').replace(/\s+/g, ' ').slice(0, 80) || 'Conversation' : 'New conversation';
  const rows = globalChatRows(scope, [...existingSessions.filter(s => !sessions[s.id]), ...Object.values(sessions)], histories, activeId, query, runningOnly);
  const rowKey = (row: (typeof rows)[number]): string => `${row.kind}:${row.kind === 'session' ? row.session.id : row.history.id}`;
  if (listHovered) rows.sort((a, b) => { const rank = (key: string): number => { const index = frozenOrder.current.indexOf(key); return index < 0 ? frozenOrder.current.length : index; }; return rank(rowKey(a)) - rank(rowKey(b)); });
  const [width, setWidth] = useState(() => { try { return clampChatWidth(Number(localStorage.getItem('gwira.chat.width') ?? 392)); } catch { return 392; } });

  function update(next: CodexSession): void { if (sessionRef.current?.id === next.id) sessionRef.current = next; sessionsRef.current = {...sessionsRef.current, [next.id]: next}; setSessions(sessionsRef.current); }
  function error(key: string, text: string): void { setErrors(current => ({...current, [key]: text})); }
  function rememberScroll(): void { if (feedRef.current) positions.current[draftKey] = feedRef.current.scrollTop; }
  function select(id?: string): void { rememberScroll(); setActiveId(id); setView('chat'); setDetails(false); }
  function closeDetails(): void { setDetails(false); detailsTrigger.current?.focus(); }
  function changeWidth(next: number): void { setWidth(clampChatWidth(next)); }
  useEffect(() => {
    document.documentElement.style.setProperty('--gw-assistant-width', `${width}px`);
    try { localStorage.setItem('gwira.chat.width', String(width)); } catch { /* Size remains usable in memory. */ }
  }, [width]);
  useEffect(() => {
    const removeOutput = window.codexDesktop.onOutput(event => {
      const current = sessionsRef.current[event.sessionId]; if (!current) return;
      const createdAt = new Date().toISOString();
      update({...current, messages: mergeOutputIntoMessages(current.messages, {id: `${event.sessionId}-${Date.now()}-${current.messages.length}`, role:event.role, chunk:event.chunk, createdAt}), updatedAt:createdAt});
    });
    const removeExit = window.codexDesktop.onExit(event => {
      const current = sessionsRef.current[event.sessionId]; if (!current) return;
      update({...current, status:event.status, error:event.error, codexConversationId:event.session?.codexConversationId ?? current.codexConversationId});
      const saved = pendingDrafts.current.get(current.id); pendingDrafts.current.delete(current.id);
      if (event.status === 'error') {
        if (saved) setScopedDraft(current.id, value => value || saved);
        error(current.id, "Gwira couldn't complete this request right now. Your message is saved. Review any completed work before sending again.");
      }
    });
    return () => { removeOutput(); removeExit(); };
  }, []);
  useEffect(() => { if (open && view === 'chat') inputRef.current?.focus(); }, [open, view, activeId]);
  useLayoutEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft, open, view]);
  useLayoutEffect(() => { if (view === 'chat' && feedRef.current && positions.current[draftKey] !== undefined) { feedRef.current.scrollTop = positions.current[draftKey]!; scroll.onScroll(); } }, [draftKey, view, open]);
  useEffect(() => {
    if (!details) return;
    detailsRef.current?.focus();
    const outside = (event: PointerEvent): void => { if (!detailsRef.current?.contains(event.target as Node) && !detailsTrigger.current?.contains(event.target as Node)) setDetails(false); };
    window.addEventListener('pointerdown', outside); return () => window.removeEventListener('pointerdown', outside);
  }, [details]);
  async function refresh(): Promise<void> {
    const request = ++historyRequest.current;
    if (!scope) { setHistories([]); return; }
    setLoading(true); setHistoryError('');
    try { const next = await window.codexDesktop.listHistories(scope); if (request === historyRequest.current) setHistories(next); }
    catch { if (request === historyRequest.current) setHistoryError('Couldn’t load saved conversations. Refresh to try again.'); }
    finally { if (request === historyRequest.current) setLoading(false); }
  }
  useEffect(() => { setHistories([]); if (view === 'sessions' && open) void refresh(); return () => { ++historyRequest.current; }; }, [view, scope, open]);
  async function openHistory(history: CodexThreadHistory): Promise<void> {
    if (busyRef.current || history.cwd !== scope) return;
    busyRef.current = true; setBusy(true); setHistoryError('');
    try {
      const cached = [...Object.values(sessionsRef.current), ...existingSessions].find(s => s.codexConversationId === history.id && s.cwd === history.cwd);
      const next = cached ?? await window.codexDesktop.resumeSession({cwd:history.cwd, codexConversationId:history.id, title:history.title, filePath:history.filePath, model:history.model, permissionMode:'default'});
      update(next); select(next.id);
    } catch { setHistoryError('Couldn’t open this conversation. Refresh and try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function addFiles(): Promise<void> {
    const key = draftKey;
    try { const result = await window.codexDesktop.selectFiles(); if (!result.canceled) setFiles(current => ({...current, [key]: [...current[key] ?? [], ...result.files.map(f => ({...f, id:crypto.randomUUID()}))]})); }
    catch { error(key, 'Could not attach files. Try choosing the files again.'); }
  }
  async function paste(event: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const images = Array.from(event.clipboardData.items).filter(item => item.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault(); const key = draftKey;
    try { for (const item of images) {
      const file = item.getAsFile(); if (!file) continue;
      const dataUrl = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const saved = await window.codexDesktop.savePastedImage({dataUrl, name:file.name || 'image.png'});
      setFiles(current => ({...current, [key]: [...current[key] ?? [], {...saved, id:crypto.randomUUID(), kind:'image'}]}));
    } } catch { error(key, 'Could not paste the image. Try choosing the file with Add attachments.'); }
  }
  async function send(): Promise<void> {
    const text = buildPromptWithAttachments(draft, attachments).trim();
    if (!text || busyRef.current || sessionRef.current?.status === 'running' || missing) return;
    const key = draftKey, originalDraft = draft, sentFiles = attachments;
    busyRef.current = true; setBusy(true); error(key, '');
    const messageId = crypto.randomUUID(); let target = sessionRef.current;
    try {
      target ??= await window.codexDesktop.startSession({cwd:scope!, model, reasoningEffort, permissionMode:'default', webSearch:false, context:'business'});
      if (!sessionRef.current) {
        setScopedDraft(target.id, originalDraft); setScopedDraft(key, '');
        setFiles(current => ({...current, [target!.id]: sentFiles, [key]: []}));
        setActiveId(target.id);
      }
      const createdAt = new Date().toISOString();
      update({...target, status:'running', messages:[...target.messages, {id:messageId, role:'user', text, createdAt}], updatedAt:createdAt});
      pendingDrafts.current.set(target.id, text);
      await window.codexDesktop.sendInput({sessionId:target.id, input:text, model:model === 'gwira-auto' ? model : target.model, reasoningEffort:target.reasoningEffort, permissionMode:target.permissionMode, webSearch:false, skipUserAppend:true});
      if (sessionsRef.current[target.id]?.status !== 'error') setScopedDraft(target.id, '');
      setFiles(current => ({...current, [target!.id]: (current[target!.id] ?? []).filter(f => !sentFiles.some(sent => sent.id === f.id))}));
    } catch {
      if (target) { const current = sessionsRef.current[target.id] ?? target; update({...current, status:'error', messages:current.messages.filter(m => m.id !== messageId)}); }
      error(target?.id ?? key, 'Couldn’t send your message. Your draft is saved. Try again when your connection is available.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function stop(sendAfter = false): Promise<void> {
    const target = sessionRef.current;
    if (!target || cancellingRef.current || busyRef.current) return;
    cancellingRef.current = true; setCancelling(true); error(target.id, '');
    try {
      const acknowledgement = await requestConversationStop(window.codexDesktop, target.id);
      if (acknowledgement.status === 'error') throw new Error('The run ended with an error. Your draft is saved. Review the result before sending again.');
      setNotices(current => ({...current, [target.id]:'Run stopped. Completed actions were not undone.'}));
      if (sendAfter && sessionRef.current?.id === target.id) await send();
    } catch (cause) { error(target.id, cause instanceof Error ? cause.message : 'Cancellation is not confirmed. Your draft is saved.'); }
    finally { cancellingRef.current = false; setCancelling(false); }
  }

  return <GlobalAssistantFrame open={open} width={width} onWidthChange={changeWidth} onEscape={() => { if (details) closeDetails(); else onClose(); }}>
    <GlobalAssistantHeader view={view} title={session ? title : undefined} loading={loading} busy={busy || cancelling}
      onSessions={() => { rememberScroll(); setView('sessions'); setDetails(false); }}
      onRefresh={() => void refresh()} onNew={() => select()} onClose={onClose} />
    {view === 'sessions' ? <div className="global-assistant__sessions">
      <GlobalAssistantSessionSearch query={query} onQueryChange={setQuery} filter={<button type="button" aria-label="Show running conversations" title="Show running conversations" aria-pressed={runningOnly} onClick={() => setRunningOnly(!runningOnly)}><ShellIcon name="filter" /></button>} />
      <p className="global-assistant__scope" title={scope}>{scope === cwd && projectName ? projectName : scope?.split('/').filter(Boolean).pop() ?? 'No source folder'}</p>
      {loading ? <p role="status">Loading conversations…</p> : null}
      {historyError ? <p className="global-assistant__error" role="alert">{historyError}</p> : null}
      <div className="global-assistant__session-list" aria-label="Conversations" onPointerEnter={() => { frozenOrder.current = rows.map(rowKey); setListHovered(true); }} onPointerLeave={() => setListHovered(false)} onKeyDown={globalAssistantSessionKeys}>
        {rows.map(row => { const live = row.kind === 'session'; const item = live ? row.session : row.history;
          return <GlobalAssistantSessionRow key={`${row.kind}:${item.id}`} active={row.active} disabled={busy || cancelling}
            icon={row.running ? 'running' : live && row.session.status === 'error' ? 'failed' : 'threads'}
            title={row.kind === 'session' ? row.title : row.history.title} updatedAt={item.updatedAt}
            status={row.running ? 'Working' : live && row.session.status === 'error' ? 'Failed' : undefined}
            onClick={() => { if (row.kind === 'session') { update(row.session); select(row.session.id); } else void openHistory(row.history); }} />; })}
        {!loading && !rows.length ? <p>{query || runningOnly ? 'No conversations match these filters.' : historyError ? 'Saved conversations are unavailable.' : 'No conversations in this source folder yet.'}</p> : null}
      </div>
    </div> : <>
      <GlobalAssistantFeed feedRef={feedRef} onScroll={() => { scroll.onScroll(); rememberScroll(); }} following={scroll.following} onJump={scroll.jump}>
        {session?.messages.length ? <Transcript messages={session.messages} isRunning={running} compact /> : <GlobalAssistantEmpty description={scope ? `Ready to help with ${session ? scope.split('/').filter(Boolean).pop() : projectName ?? scope.split('/').filter(Boolean).pop()}.` : 'Choose a project from Home to get started.'} />}
      </GlobalAssistantFeed>
      <form className="conversation-composer is-compact" onSubmit={event => { event.preventDefault(); void send(); }}>
        <div className="global-assistant__input-box">
          {scope ? <GlobalAssistantContext ref={detailsTrigger} label={scope === cwd && projectName ? projectName : scope.split('/').filter(Boolean).pop() ?? scope} expanded={details} onClick={() => setDetails(!details)} /> : null}
          {attachments.length ? <div className="global-assistant__attachments">{attachments.map(file => <button type="button" key={file.id} title={file.path} aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => ({...current, [draftKey]: attachments.filter(f => f.id !== file.id)}))}><ShellIcon name={file.kind === 'image' ? 'image' : 'attachment'} /><span>{file.name}</span><ShellIcon name="close" /></button>)}</div> : null}
          <GlobalAssistantInput ref={inputRef} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} onPaste={event => { void paste(event); }} placeholder={running ? 'Ask for follow-up changes' : 'Ask Gwira anything…'} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <GlobalAssistantComposerFooter attachmentsDisabled={busy} attachmentTitle="Add attachments" onAddAttachments={() => void addFiles()} model={model === 'gwira-auto' ? 'Gwira Auto' : session?.model ?? model}
            action={running ? <ConversationExecutionControls busy={cancelling || busy} hasDraft={!!draft.trim() || !!attachments.length} onStop={() => { void stop(); }} onStopAndSend={() => { void stop(true); }} /> : <button className="global-assistant__send" type="submit" disabled={busy || (!draft.trim() && !attachments.length) || !!missing} title={missing ?? 'Send message'} aria-label="Send message to Gwira">{busy ? <StatusIndicator status="loading" animate compact/> : <ShellIcon name="send" />}</button>} />
          {details ? <div className="global-assistant__details" ref={detailsRef} tabIndex={-1} role="dialog" aria-label="Conversation context and permissions"><div><strong>Conversation context</strong><button type="button" aria-label="Close conversation context" onClick={closeDetails}><ShellIcon name="close" /></button></div><p>{scope}</p><strong>{session?.permissionMode === 'full-access' ? 'Full access' : 'Default permissions'}</strong><p>Uses this session’s existing local execution permissions. Change source folders by starting a new conversation from the selected Home project.</p><small>Model: {model === 'gwira-auto' ? 'Gwira Auto' : session?.model ?? model}</small></div> : null}
        </div>
        {notices[draftKey] ? <p className="global-assistant__notice" role="status">{notices[draftKey]}</p> : null}
        {missing ? <p className="global-assistant__notice">{missing}</p> : null}
        {errors[draftKey] ? <p className="global-assistant__error" role="alert">{errors[draftKey]}</p> : null}
      </form>
    </>}
  </GlobalAssistantFrame>;
}
