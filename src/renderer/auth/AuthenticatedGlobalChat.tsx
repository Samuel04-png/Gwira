import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CloudConversation, CloudMessage, ConversationList} from '../../shared/cloudConversations.js';
import type {ExpectedWorkspace} from '../../shared/scopedPreferences.js';
import {GlobalAssistantComposerFooter, GlobalAssistantContext, GlobalAssistantEmpty, GlobalAssistantFeed, GlobalAssistantFrame, GlobalAssistantHeader, GlobalAssistantInput, GlobalAssistantSessionRow, GlobalAssistantSessionSearch, globalAssistantSessionKeys} from '../components/GlobalAssistantPanel.js';
import {ShellIcon} from '../components/Icon.js';
import {UserMessage} from '../components/Transcript.js';
import {AssistantResponse} from '../components/AssistantResponse.js';
import {useConversationScroll} from '../components/useConversationScroll.js';
import {clampChatWidth} from '../globalChatModel.js';
import {WorkspaceMarkdown} from '../workspaceTools/WorkspaceMarkdown.js';
import {parseGlobalChatState, prepareGlobalChatMessage, selectGlobalChatConversation, type GlobalChatState} from './globalChatState.js';

const initial = (): GlobalChatState => ({conversationId: null, draft: '', drafts: {}, pending: null, width: 392});

export function AuthenticatedGlobalChat({open, workspace, scope, onClose, onConversationsChanged}: {
  open: boolean; workspace: string; scope: ExpectedWorkspace; onClose: () => void; onConversationsChanged: () => Promise<void>;
}): React.ReactElement {
  const api = window.codexDesktop.conversations, preferences = window.codexDesktop.scopedPreferences;
  const [state, setState] = useState(initial), stateRef = useRef(state);
  const [items, setItems] = useState<CloudConversation[]>([]), [messages, setMessages] = useState<CloudMessage[]>([]);
  const [view, setView] = useState<'chat' | 'sessions'>('chat'), [query, setQuery] = useState('');
  const [listHovered, setListHovered] = useState(false);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [details, setDetails] = useState(false);
  const live = useRef(false), lock = useRef(false), sequence = useRef(0), revision = useRef(0), writes = useRef<Promise<void>>(Promise.resolve());
  const inputRef = useRef<HTMLTextAreaElement>(null), feedRef = useRef<HTMLDivElement>(null);
  const frozenOrder = useRef<string[]>([]);
  const detailsRef = useRef<HTMLDivElement>(null), detailsTrigger = useRef<HTMLButtonElement>(null);
  const scroll = useConversationScroll(feedRef, messages, state.conversationId ?? undefined, open && view === 'chat');

  function update(next: GlobalChatState): void { revision.current++; stateRef.current = next; setState(next); }
  function write(next: GlobalChatState, version?: number): Promise<void> {
    const task = writes.current.catch(() => {}).then(async () => {
      if (!live.current) throw new Error('Workspace changed.');
      if (version !== undefined && version !== revision.current) return;
      await preferences.write('global-chat', JSON.stringify(next), scope);
    });
    writes.current = task;
    return task;
  }
  async function list(): Promise<ConversationList> {
    const result = await api.request({type: 'list'}, scope);
    if (!result || typeof result !== 'object' || Array.isArray(result) || !('conversations' in result)) throw new Error('Invalid conversation list.');
    if (live.current) setItems(result.conversations.filter(item => !item.archived_at));
    return result;
  }
  async function loadMessages(id: string): Promise<void> {
    const request = ++sequence.current;
    const result = await api.request({type: 'messages', id}, scope);
    if (!Array.isArray(result)) throw new Error('Invalid conversation messages.');
    if (live.current && sequence.current === request) setMessages(result);
  }
  useEffect(() => {
    live.current = true;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const saved = parseGlobalChatState(await preferences.read('global-chat', scope));
        if (!live.current) return;
        const result = await list();
        if (!live.current) return;
        const available = !saved.conversationId || result.conversations.some(item => item.id === saved.conversationId && !item.archived_at);
        if (!available && saved.pending) throw new Error('Pending conversation is unavailable.');
        const next = available ? saved : {...saved, conversationId: null};
        update(next);
        if (next.conversationId) await loadMessages(next.conversationId);
        if (live.current) setReady(true);
      } catch {
        if (live.current) setError('Gwira Chat could not be loaded. Check your connection and workspace access, then try again.');
      } finally { if (live.current) setLoading(false); }
    })();
    return () => { live.current = false; sequence.current++; };
  }, [loadAttempt]);
  useEffect(() => { if (open && view === 'chat') inputRef.current?.focus(); }, [open, view]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 200)}px`; }
  }, [state.draft, open, view]);
  useEffect(() => {
    if (!details) return;
    detailsRef.current?.focus();
    const outside = (event: PointerEvent): void => {
      if (!detailsRef.current?.contains(event.target as Node) && !detailsTrigger.current?.contains(event.target as Node)) setDetails(false);
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [details]);
  useEffect(() => {
    document.documentElement.style.setProperty('--gw-assistant-width', `${state.width}px`);
    return () => { document.documentElement.style.removeProperty('--gw-assistant-width'); };
  }, [state.width]);
  useEffect(() => {
    if (loading || !ready) return;
    const version = revision.current;
    const timer = setTimeout(() => {
      void write(state, version).catch(() => { if (live.current) setError('Your chat draft or panel settings could not be saved on this device.'); });
    }, 500);
    return () => clearTimeout(timer);
  }, [state, loading, ready]);

  async function select(id: string | null): Promise<void> {
    if (lock.current || stateRef.current.pending) return;
    lock.current = true; setBusy(true); setError('');
    revision.current++;
    try {
      const next = selectGlobalChatConversation(stateRef.current, id);
      await write(next);
      if (!live.current) return;
      update({...next, width: stateRef.current.width}); setMessages([]); setView('chat');
      if (id) await loadMessages(id);
    } catch { if (live.current) setError('The conversation could not be opened. Check your connection and try again.'); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  async function refresh(): Promise<void> {
    setLoading(true); setError('');
    try { await list(); }
    catch { if (live.current) setError('Couldn’t load conversations. Refresh to try again.'); }
    finally { if (live.current) setLoading(false); }
  }
  async function send(): Promise<void> {
    if (lock.current || loading || !ready || !stateRef.current.draft.trim()) return;
    lock.current = true; setBusy(true); setError('');
    revision.current++;
    try {
      const pending = prepareGlobalChatMessage(stateRef.current, () => crypto.randomUUID());
      const staged = {...stateRef.current, pending};
      await write(staged);
      if (!live.current) return;
      update({...staged, width: stateRef.current.width});
      if (pending.create) await api.request({type: 'create', id: pending.conversationId, title: pending.content.slice(0, 200), visibility: 'private'}, scope);
      if (!live.current) return;
      await api.request({type: 'send', id: pending.conversationId, messageId: pending.messageId, content: pending.content}, scope);
      if (!live.current) return;
      const drafts = {...stateRef.current.drafts};
      delete drafts[stateRef.current.conversationId ?? 'new'];
      const committed = {...stateRef.current, conversationId: pending.conversationId, draft: '', drafts, pending: null};
      revision.current++;
      await write(committed);
      if (!live.current) return;
      update({...committed, width: stateRef.current.width});
      try { await Promise.all([loadMessages(pending.conversationId), list(), onConversationsChanged()]); }
      catch { if (live.current) setError('Your message was saved, but the conversation could not be refreshed.'); return; }
      if (!live.current) return;
      try {
        const result = await api.request({type: 'generate', id: pending.conversationId, messageId: pending.messageId}, scope);
        if (!result || typeof result !== 'object' || Array.isArray(result) || !('status' in result)) throw new Error('Invalid generation result.');
        if (result.status === 'completed') await loadMessages(pending.conversationId);
        else if (live.current) setError(result.status === 'generating' ? 'Gwira is still working. Open this conversation again to check the response.' : 'The AI request failed. Your message is saved.');
      } catch (cause) {
        if (live.current) {
          const text = cause instanceof Error ? cause.message : '';
          const known = ['AI is unavailable: the trusted AI server is not configured.', 'AI is unavailable: the trusted AI provider is not configured.', 'Your daily AI request limit has been reached.', 'Another response is being generated in this workspace. Check again shortly.'];
          setError(known.find(message => text.includes(message)) ?? 'The AI response could not be confirmed. Your message is saved; open the conversation again to check.');
        }
      }
    } catch {
      if (live.current) setError('Message not confirmed. Your draft is kept; retry to send it safely.');
    } finally { lock.current = false; if (live.current) setBusy(false); }
  }
  const selected = items.find(item => item.id === state.conversationId);
  const filtered = items.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if (listHovered) {
    const rank = (id: string): number => {
      const index = frozenOrder.current.indexOf(id);
      return index < 0 ? frozenOrder.current.length : index;
    };
    filtered.sort((a, b) => rank(a.id) - rank(b.id));
  }
  function closeDetails(): void { setDetails(false); detailsTrigger.current?.focus(); }
  return <GlobalAssistantFrame open={open} width={state.width} onWidthChange={value => {if (ready) update({...stateRef.current, width: clampChatWidth(value)});}} onEscape={() => {if (details) closeDetails(); else onClose();}}>
    <GlobalAssistantHeader view={view} title={selected?.title} loading={loading} busy={!ready || busy || !!state.pending} sessionsDisabled={!ready || busy || !!state.pending}
      onSessions={() => {setDetails(false); setView('sessions'); void refresh();}} onRefresh={() => void refresh()} onNew={() => void select(null)} onClose={onClose}/>
    {view === 'sessions' ? <div className="global-assistant__sessions">
      <GlobalAssistantSessionSearch query={query} onQueryChange={setQuery}/>
      <p className="global-assistant__scope">{workspace}</p>
      {loading && <p role="status">Loading conversations…</p>}
      {error && <p className="global-assistant__error" role="alert">{error}</p>}
      <div className="global-assistant__session-list" aria-label="Conversations" onPointerEnter={() => {frozenOrder.current = filtered.map(item => item.id); setListHovered(true);}} onPointerLeave={() => setListHovered(false)} onKeyDown={globalAssistantSessionKeys}>
        {filtered.map(item => <GlobalAssistantSessionRow key={item.id} title={item.title} updatedAt={item.updated_at} icon="threads"
          active={item.id === state.conversationId} disabled={busy || !!state.pending} onClick={() => void select(item.id)} />)}
        {!loading && !filtered.length && <p>{query ? 'No conversations match this search.' : 'No conversations in this workspace yet.'}</p>}
      </div>
    </div> : <>
      <GlobalAssistantFeed feedRef={feedRef} onScroll={scroll.onScroll} following={scroll.following} onJump={scroll.jump}>
        {messages.length ? <section className="transcript" aria-label="Conversation messages">{messages.map(message => message.author_type === 'user'
          ? <article className="message user" key={message.id}><UserMessage text={message.content} compact restricted/></article>
          : <AssistantResponse key={message.id} identity><WorkspaceMarkdown source={message.content}/></AssistantResponse>)}</section>
          : <GlobalAssistantEmpty description={`Ready to help with ${workspace}.`}/>}
      </GlobalAssistantFeed>
      <form className="conversation-composer is-compact" onSubmit={event => {event.preventDefault(); void send();}}>
        <div className="global-assistant__input-box">
          <GlobalAssistantContext ref={detailsTrigger} label={workspace} expanded={details} onClick={() => setDetails(!details)} />
          <GlobalAssistantInput ref={inputRef} value={state.draft} maxLength={10000} disabled={!ready || loading || busy || !!state.pending} onChange={event => update({...stateRef.current, draft: event.target.value})} placeholder="Ask Gwira anything…"
            onKeyDown={event => {if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); void send();}}}/>
          <GlobalAssistantComposerFooter attachmentsDisabled attachmentTitle="Attachments are not available in authenticated chat." model="Gwira Auto"
            action={<button className="global-assistant__send" type="submit" disabled={!ready || loading || busy || !state.draft.trim()} aria-label={state.pending ? 'Retry message to Gwira' : 'Send message to Gwira'} title={state.pending ? 'Retry saved message' : 'Send message'}><ShellIcon name="send"/></button>} />
          {details && <div className="global-assistant__details" ref={detailsRef} tabIndex={-1} role="dialog" aria-label="Conversation context and permissions"><div><strong>Conversation context</strong><button type="button" aria-label="Close conversation context" onClick={closeDetails}><ShellIcon name="close"/></button></div><p>{workspace}</p><strong>Authorized workspace</strong><p>Messages use your authorized workspace conversations. Local files and machine execution are not available in this chat.</p><small>Model: Gwira Auto</small></div>}
        </div>
        {busy && <p className="global-assistant__notice" role="status">Gwira is working…</p>}
        {error && <p className="global-assistant__error" role="alert">{error}</p>}
        {!ready && !loading && <button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Retry loading Gwira Chat</button>}
      </form>
    </>}
  </GlobalAssistantFrame>;
}
