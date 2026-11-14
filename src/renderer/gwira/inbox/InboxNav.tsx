import { InboxDirectory, type InboxDirectoryProps } from './InboxDirectory.js';
import { directoryPreferenceKey, emptyDirectoryPreferences, restoreDirectoryPreferences, searchDirectory } from './inboxDirectoryModel.js';
import { CompactActionMenu } from '../../components/CompactActionMenu.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationListItem } from '../messaging/domain/selectors.js';
import { ShellIcon, NavigationIcon } from '../../components/Icon.js';
import {
  NAV_QUICK_IDS, NEEDS_REVIEW_NAV_ID, highlightSegments, moveNavIndex, unreadBadgeLabel, type InboxDestination, type InboxQuickDestination
} from './inboxNavModel.js';
import type { MessageSearchOutcome } from './inboxSearch.js';
import './navigator.css';

export interface InboxNavProps {
  ephemeral?: boolean;
  dataUnavailable?: boolean;
  directory?: Omit<InboxDirectoryProps, 'conversations' | 'selectedId' | 'preferences' | 'onPreferences' | 'onSelect' | 'onAdd'>;
  scopeKey?: string;
  conversations: readonly ConversationListItem[];
  pendingApprovals: number;
  /** The main pane already says there is nothing to do; do not repeat it with the empty-list hint. */
  hideEmptyHint?: boolean;
  destination: InboxDestination;
  onSelectDestination: (destination: InboxDestination) => void;
  searchMessages?: (query: string) => MessageSearchOutcome;
  onOpenMessage?: (conversationId: string, messageId: string) => void;
  mentionsCount?: number;
  savedCount?: number;
  draftsCount?: number;
  onStartConversation?: () => void;
  /** Opens the New conversation dialog on the given type. */
  onAddConversation?: (kind: 'channel' | 'group' | 'dm', sectionId?: string) => void;
  /** Shared Inbox title/actor controls, supplied by the page. */
  header?: React.ReactNode;
  /** Explicit conversation-header search intent; nonce permits repeated requests. */
  messageSearchRequest?: { conversationId: string; conversationTitle?: string; nonce: number };
}

export function InboxNav({ conversations, pendingApprovals, hideEmptyHint, destination, onSelectDestination, searchMessages, onOpenMessage,ephemeral=false,dataUnavailable=false,
  mentionsCount = 0, savedCount = 0, draftsCount = 0, onStartConversation, onAddConversation,
  header, messageSearchRequest, directory, scopeKey = 'local' }: InboxNavProps): React.ReactElement {
  const preferenceKey = directoryPreferenceKey(scopeKey);
  const [preferences, setPreferences] = useState(() => { if(ephemeral)return emptyDirectoryPreferences();try { return restoreDirectoryPreferences(localStorage.getItem(preferenceKey)); } catch { return emptyDirectoryPreferences(); } });
  const [preferenceError, setPreferenceError] = useState('');
  const updatePreferences: InboxDirectoryProps['onPreferences'] = update => setPreferences(update);
  useEffect(()=>{if(ephemeral)return;try {localStorage.setItem(preferenceKey,JSON.stringify(preferences));setPreferenceError('');}catch{setPreferenceError('Navigation preferences could not be saved. Allow local storage, then try again.');}},[preferences,preferenceKey,ephemeral]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [resultIndex, setResultIndex] = useState(-1);
  const [query, setQuery] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [messageScope, setMessageScope] = useState<{ id: string; title: string }>();
  const [searchMode, setSearchMode] = useState<'conversations' | 'messages'>('conversations');
  const [focusId, setFocusId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedId = destination.kind === 'conversation' ? destination.id : undefined;
  const totalUnread = useMemo(() => conversations.reduce((sum, item) => sum + item.unread, 0), [conversations]);
  const targets: string[] = [...NAV_QUICK_IDS];
  const activeId = destination.kind === 'utility' ? destination.view : destination.id;
  const tabStop = focusId && targets.includes(focusId) ? focusId : targets.includes(activeId) ? activeId : targets[0] ?? 'needs-review';
  const searchHits = useMemo(() => searchDirectory(conversations, directory?.participants ?? [], query), [conversations, directory?.participants, query]);
  const openHit = (index: number): void => { const hit = searchHits[index]; if (!hit) return; setSearchOpen(false); setQuery(''); if (hit.conversation) { updatePreferences(p=>({...p,hidden:p.hidden.filter(id=>id!==hit.conversation!.conversation.id)})); selectConversation(hit.conversation.conversation.id); } else if (hit.participant) directory?.onStartParticipant?.(hit.participant.ref); };
  useEffect(()=>{if(searchOpen && resultIndex>=0)navRef.current?.querySelector(`#inbox-search-hit-${resultIndex}`)?.scrollIntoView({block:'nearest'});},[resultIndex,searchOpen]);
  const scopedMessageQuery = messageScope ? `${messageQuery} in:"${messageScope.id}"` : messageQuery;
  const outcome = useMemo(() => searchMode === 'messages' && scopedMessageQuery.trim() && searchMessages ? searchMessages(scopedMessageQuery) : undefined, [searchMode, scopedMessageQuery, searchMessages]);

  useEffect(() => {
    const switchSearch = (event: KeyboardEvent): void => {
      if (ephemeral||!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k' || key === 'f') {
        setSearchMode(key === 'f' && searchMessages ? 'messages' : 'conversations');
        if (key === 'f') setMessageScope(undefined);
        setSearchOpen(true); requestAnimationFrame(()=>searchRef.current?.focus());
      }
    };
    window.addEventListener('keydown', switchSearch, true);
    return () => window.removeEventListener('keydown', switchSearch, true);
  }, [searchMessages,ephemeral]);

  useEffect(() => {
    if (!messageSearchRequest || !searchMessages) return;
    // Conversation IDs come from the readable selector; reject delimiter characters
    // rather than constructing a query with an ambiguous quoted operand.
    const id = messageSearchRequest.conversationId;
    if (!id || /["\\\r\n]/.test(id)) return;
    setSearchMode('messages');
    const readable = conversations.find((item) => item.conversation.id === id);
    if (!readable) return;
    setMessageScope({ id, title: readable.title || messageSearchRequest.conversationTitle || 'Conversation' });
    setMessageQuery('');
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [messageSearchRequest?.conversationId, messageSearchRequest?.nonce]);

  const focusTarget = (id: string): void => {
    setFocusId(id);
    navRef.current?.querySelectorAll<HTMLElement>('[data-nav-id]').forEach((node) => { if (node.dataset.navId === id) node.focus(); });
  };
  const selectConversation = (id: string): void => { onSelectDestination({ kind: 'conversation', id }); };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !(event.target instanceof HTMLElement) || !event.target.dataset.navId) return;
    if (event.key === 'ArrowDown' && event.target.dataset.navId === 'saved') { event.preventDefault(); navRef.current?.querySelector<HTMLButtonElement>('.gw-inbox-directory .sidebar-collapsible-heading')?.focus(); return; }
    const next = moveNavIndex(targets.indexOf(event.target.dataset.navId), targets.length, event.key);
    const id = targets[next];
    if (id !== undefined) { event.preventDefault(); focusTarget(id); }
  };
  const setMode = (mode: 'conversations' | 'messages'): void => {
    setSearchMode(mode);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const utility = (id: InboxQuickDestination, title: string, count: number, icon: 'unread' | 'threads' | 'drafts' | 'review' | 'at' | 'bookmark', label?: string): React.ReactElement => {
    const selected = destination.kind === 'utility' && destination.view === id;
    return <button
    type="button" data-nav-id={id} tabIndex={tabStop === id ? 0 : -1}
    className={`gw-msg-nav__row gw-msg-nav__utility${selected ? ' is-selected' : ''}${count > 0 && id === 'unread' ? ' has-unread' : ''}`}
    aria-current={selected ? 'page' : undefined} onFocus={() => setFocusId(id)} onClick={() => onSelectDestination({ kind: 'utility', view: id })}>
    <NavigationIcon name={icon} active={selected} size={18} /><span className="gw-msg-nav__title">{title}</span>
    {count > 0 ? <span className={`gw-msg-badge${id === 'needs-review' ? ' is-waiting' : ''}`} aria-label={label ?? `${count} ${title.toLowerCase()}`}>{unreadBadgeLabel(count)}</span> : null}
  </button>;
  };

  return <nav ref={navRef} className="gw-msg-nav" aria-label="Conversations" onKeyDown={onKeyDown}>
    <div className="gw-msg-nav__header">{header}<CompactActionMenu label="Inbox options" actions={[
      {label:'Expand all sections',onSelect:()=>updatePreferences(p=>({...p,collapsed:[]}))},
      {label:'Collapse all sections',onSelect:()=>updatePreferences(p=>({...p,collapsed:['pinned','channels','group','dm','doat']}))},
      {label:'Restore closed conversations',disabled:!preferences.hidden.length,reason:!preferences.hidden.length?'No conversations are closed in your personal list.':undefined,onSelect:()=>updatePreferences(p=>({...p,hidden:[]}))}
    ]} /></div>
    {preferenceError ? <p className="gw-msg-nav__empty" role="alert">{preferenceError}</p> : null}
    <div className="gw-msg-nav__search">
      <div className="gw-msg-nav__search-control"><ShellIcon name="search" />
        <input ref={searchRef} disabled={dataUnavailable} title={dataUnavailable?'Inbox messaging is not connected.':undefined} type="search" role={searchMode === 'conversations' ? 'combobox' : undefined} aria-expanded={searchMode === 'conversations' ? searchOpen && Boolean(query.trim()) : undefined} aria-controls={searchMode === 'conversations' && searchOpen && query.trim() ? 'inbox-directory-search' : undefined} aria-autocomplete="list" aria-activedescendant={searchOpen && searchHits[resultIndex] ? `inbox-search-hit-${resultIndex}` : undefined} onFocus={()=>setSearchOpen(true)} onBlur={event=>{if(!event.currentTarget.closest('.gw-msg-nav__search')?.contains(event.relatedTarget as Node|null))setSearchOpen(false)}} value={searchMode === 'messages' ? messageQuery : query}
          data-message-search={searchMode === 'messages' ? '' : undefined}
          placeholder={searchMode === 'messages' ? 'Search messages' : 'Find a conversation'}
          aria-label={searchMode === 'messages' ? 'Search messages' : 'Search conversations'}
          aria-keyshortcuts={searchMode === 'messages' ? 'Control+F Meta+F' : 'Control+K Meta+K'}
          onChange={(event) => { setSearchOpen(true); setResultIndex(-1); if (searchMode === 'messages') setMessageQuery(event.target.value); else setQuery(event.target.value); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault(); event.stopPropagation(); setSearchOpen(false);
              if (searchMode === 'messages') { setMessageQuery(''); setMessageScope(undefined); setSearchMode('conversations'); } else setQuery('');
            }
            if (searchMode === 'conversations' && query.trim()) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSearchOpen(true); setResultIndex(i => Math.max(0,Math.min(searchHits.length-1,i+(event.key === 'ArrowDown'?1:-1)))); }
              if (event.key === 'Enter') { event.preventDefault(); openHit(Math.max(0,resultIndex)); }
            } else if (event.key === 'ArrowDown') { event.preventDefault(); focusTarget(targets[0] ?? NEEDS_REVIEW_NAV_ID); }
          }} />
        {searchMessages ? <button type="button" className="gw-msg-nav__search-mode" aria-label={searchMode === 'messages' ? 'Search conversations' : 'Search messages'} title={searchMode === 'messages' ? 'Switch to conversation search (⌘K)' : 'Switch to message search (⌘F)'} onClick={() => setMode(searchMode === 'messages' ? 'conversations' : 'messages')}><span aria-hidden="true">{searchMode === 'messages' ? '⌘K' : '⌘F'}</span></button> : null}
      </div>
      {searchMode === 'conversations' && searchOpen && query.trim() ? <div id="inbox-directory-search" className="gw-inbox-directory-search gw-sidebar-overlay" role="listbox" aria-label="Directory search results" onMouseDown={event=>event.preventDefault()}>
        {searchHits.length ? searchHits.map((hit,index)=><React.Fragment key={hit.id}>{index === 0 || searchHits[index-1]?.category !== hit.category ? <div className="gw-inbox-directory-search__category" role="presentation">{hit.category}</div> : null}<button id={`inbox-search-hit-${index}`} type="button" role="option" aria-selected={index===resultIndex} tabIndex={-1} onMouseEnter={()=>setResultIndex(index)} onClick={()=>openHit(index)}><span>{hit.label}</span><small>{hit.participant ? 'Start conversation' : hit.conversation?.conversation.visibility === 'private' ? 'Private' : ''}</small></button></React.Fragment>) : <p role="status">No matches. Try a name or identifier.</p>}
      </div> : null}
      {searchMode === 'messages' ? <div className="gw-msg-nav__search-scope">{messageScope ? <><span title={messageScope.title}>In {conversations.find((item) => item.conversation.id === messageScope.id)?.title || messageScope.title}</span><button type="button" aria-label="Search all conversations" title="Search all conversations" onClick={() => { setMessageScope(undefined); searchRef.current?.focus(); }}><ShellIcon name="close" /></button></> : <span>Messages · this device</span>}</div> : null}
    </div>
    <div className="gw-msg-nav__utilities" role="group" aria-label="Inbox views">
      {utility('unread', 'Unread', totalUnread, 'unread', `${totalUnread} unread messages`)}
      {utility('threads', 'Threads', 0, 'threads')}
      {utility('drafts', 'Drafts', draftsCount, 'drafts', `${draftsCount} drafts`)}
      {utility('needs-review', 'Needs review', pendingApprovals, 'review', `${pendingApprovals} pending approvals`)}
      {utility('mentions', 'Mentions', mentionsCount, 'at')}
      {utility('saved', 'Saved', savedCount, 'bookmark')}
    </div>
    {outcome ? <div className="gw-msg-nav__list gw-msg-search" role="region" aria-label="Message search results">
      {outcome.notes.map((note) => <p key={note} className="gw-msg-search__note" role="status">{note}</p>)}
      {outcome.results.length === 0 ? <p className="gw-msg-nav__empty" role="status">{outcome.active ? 'No messages match.' : 'Type words to search messages.'}</p> : <ul className="gw-msg-search__list">
        {outcome.results.map((result) => <li key={result.message.id}><button type="button" className="gw-msg-search__hit" onClick={() => onOpenMessage?.(result.conversationId, result.message.id)}>
          <span className="gw-msg-search__meta"><strong>{result.conversationTitle}</strong><span>{result.author.name} · {new Date(result.message.createdAt).toLocaleDateString()}</span></span>
          <span className="gw-msg-search__snippet">{highlightSegments(result.snippet, result.ranges).map((segment, index) => segment.match ? <mark key={index}>{segment.text}</mark> : <React.Fragment key={index}>{segment.text}</React.Fragment>)}</span>
        </button></li>)}
      </ul>}
    </div> : <InboxDirectory conversations={conversations} participants={directory?.participants ?? []} selectedId={selectedId} preferences={preferences} onPreferences={updatePreferences} onSelect={id=>{updatePreferences(p=>({...p,hidden:p.hidden.filter(v=>v!==id)}));selectConversation(id)}} onAdd={onAddConversation} {...directory} dataUnavailable={dataUnavailable} onCloseConversation={id=>{if(id===selectedId)onSelectDestination({kind:'utility',view:'unread'});}} />}
  </nav>;
}
