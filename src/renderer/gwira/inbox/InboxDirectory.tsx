import React, { useMemo, useRef, useState } from 'react';
import type { ConversationListItem, ParticipantView } from '../messaging/domain/selectors.js';
import type { ParticipantRef } from '../messaging/domain/types.js';
import { SidebarSection } from '../../components/SidebarSection.js';
import { CompactActionMenu, type CompactAction } from '../../components/CompactActionMenu.js';
import { NavigationStatus, type NavigationStatusKind } from '../../components/NavigationStatus.js';
import { ItemTitle } from '../../components/ItemTitle.js';
import { ShellIcon } from '../../components/Icon.js';
import { NAV_ADD_ACTIONS, avatarInitials, stableConversationOrder, unreadBadgeLabel, type NavSectionId } from './inboxNavModel.js';
import { DIRECTORY_SECTIONS, directoryItems, toggleDirectoryValue, type DirectoryPreferences } from './inboxDirectoryModel.js';

export interface InboxDirectoryProps {
  dataUnavailable?: boolean;
  unavailableSections?: readonly NavSectionId[];
  personalPinsAvailable?: boolean;
  conversations: readonly ConversationListItem[]; participants: readonly ParticipantView[]; selectedId?: string;
  preferences: DirectoryPreferences; onPreferences: (update: (p: DirectoryPreferences) => DirectoryPreferences) => void;
  mutedIds?: ReadonlySet<string>; statuses?: ReadonlyMap<string, NavigationStatusKind>;
  onSelect: (id: string) => void; onStartParticipant?: (ref: ParticipantRef) => void;
  onAdd?: (kind: 'channel' | 'group' | 'dm', section?: string) => void;
  onRead?: (id: string, unread: boolean) => void; onDetails?: (id: string) => void;
  onMute?: (id: string, muted: boolean) => void;
  allowMarkUnread?: boolean;
  onCloseConversation?: (id: string) => void;
  onProfile?: (id: string) => void; onWorkSessions?: () => void;
}
function ConversationRow({ item, pinned, muted, status, onSelect, actions }: { item: ConversationListItem; pinned: boolean; muted: boolean; status?: NavigationStatusKind; onSelect: () => void; actions: CompactAction[] }): React.ReactElement {
  const [context, setContext] = useState<{x:number;y:number;nonce:number}>();
  const kind = item.conversation.kind, name = kind === 'channel' ? item.title.replace(/^#/,'') : item.title;
  return <div className={`gw-inbox-directory__row${muted ? ' is-muted' : ''}`} onContextMenu={event => { event.preventDefault(); setContext({x:event.clientX,y:event.clientY,nonce:Date.now()}); }}>
    <button type="button" data-nav-id={item.conversation.id} className={`gw-msg-nav__row gw-msg-nav__conversation-row${pinned ? ' is-selected' : ''}${item.unread > 0 ? ' has-unread' : ''}`} aria-current={pinned ? 'page' : undefined} onClick={onSelect}>
      {kind === 'channel' || kind === 'group' ? <span className="gw-msg-nav__glyph" aria-hidden="true"><ShellIcon name={kind === 'group' ? 'users' : item.conversation.visibility === 'private' ? 'lock' : 'hash'} /></span> : <span className={`gw-msg-nav__avatar${item.hasDoatMember ? ' is-doat' : ''}`} aria-hidden="true">{item.hasDoatMember ? <ShellIcon name="doats" /> : avatarInitials(name)}</span>}
      <ItemTitle text={name} className="gw-msg-nav__title" />
      {item.hasDoatMember && kind === 'dm' ? <span className="gw-inbox-directory__ai" title="AI worker">AI</span> : null}
      {status ? <NavigationStatus status={status} label={status === 'working' ? 'Recorded run working' : status === 'failed' ? 'Recorded run failed' : status === 'completed' ? 'Recorded run completed' : 'Waiting for approval'} /> : null}
      {item.mentionUnread > 0 ? <span className="gw-inbox-directory__mention" aria-label={`${item.mentionUnread} mentions`}>@</span> : null}
      {item.unread > 0 ? <span className="gw-msg-badge" aria-label={`${item.unread} unread messages`}>{unreadBadgeLabel(item.unread)}</span> : null}
    </button>
    <CompactActionMenu label={`Options for ${name}`} actions={actions} contextRequest={context} className="gw-inbox-directory__more" />
  </div>;
}
export function InboxDirectory({ conversations, participants, selectedId, preferences: prefs, onPreferences, mutedIds = new Set(), statuses, onSelect, onStartParticipant, onAdd, onRead, onDetails, onProfile, onWorkSessions, onCloseConversation,dataUnavailable=false,unavailableSections=[],personalPinsAvailable=true,onMute,allowMarkUnread=true }: InboxDirectoryProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null), [held, setHeld] = useState(false), [heldIds, setHeldIds] = useState<string[]>([]);
  const sorted = useMemo(() => DIRECTORY_SECTIONS.flatMap(s => directoryItems(conversations,s.id,prefs,selectedId,mutedIds)),[conversations,prefs,selectedId,mutedIds]);
  const ordered = stableConversationOrder(sorted,heldIds,held);
  const pinned = prefs.pins.flatMap(id => conversations.filter(c => c.conversation.id === id && !c.conversation.archivedAt && !prefs.hidden.includes(id)));
  const pinSet = new Set(pinned.map(c => c.conversation.id));
  const toggle = (field: 'collapsed' | 'pins' | 'unreadOnly' | 'hideMuted', id: string): void => {
    onPreferences(p => ({...p,[field]:toggleDirectoryValue(p[field],id), ...(field === 'pins' ? {collapsed:p.collapsed.filter(v=>v!=='pinned')} : {})}));
    if (field === 'pins') requestAnimationFrame(()=>{
      const row=listRef.current?.querySelector<HTMLButtonElement>(`[data-nav-id="${CSS.escape(id)}"]`);
      if(row?.getClientRects().length) row.parentElement?.querySelector<HTMLButtonElement>('.compact-menu-trigger')?.focus();
    });
  };
  const row = (item: ConversationListItem): React.ReactElement => {
    const id = item.conversation.id, doat = item.conversation.kind === 'dm' ? item.members.find(m => m.ref.kind === 'doat') : undefined;
    const actions: CompactAction[] = [
      {label:'Open conversation',onSelect:()=>onSelect(id)},
      {label:prefs.pins.includes(id)?'Unpin conversation':'Pin conversation',icon:prefs.pins.includes(id)?'unpin':'pin',disabled:!personalPinsAvailable,reason:personalPinsAvailable?undefined:'Inbox conversation pins are not connected yet.',onSelect:()=>toggle('pins',id)},
      ...(onRead&&(item.isMember||allowMarkUnread)&&(item.unread>0||allowMarkUnread) ? [{label:item.unread > 0?'Mark read':'Mark unread',onSelect:()=>onRead(id,item.unread === 0)}] : []),
      ...(onMute ? [{label:mutedIds.has(id)?'Unmute channel':'Mute channel',disabled:!item.isMember,reason:item.isMember?undefined:'Join the channel first.',onSelect:()=>onMute(id,!mutedIds.has(id))}] : []),
      ...(onDetails ? [{label:'Open details',onSelect:()=>onDetails(id)}] : []),
      ...(doat && onProfile ? [{label:'Open Daot profile & capabilities',onSelect:()=>onProfile(doat.ref.id)}] : []),
      ...(doat && onWorkSessions ? [{label:'View Work Sessions',onSelect:onWorkSessions}] : []),
      ...(item.conversation.kind === 'dm' ? [{label:'Close from personal list',description:'Messages are kept. Find it again with search.',onSelect:()=>{onPreferences(p=>({...p,hidden:toggleDirectoryValue(p.hidden,id),pins:p.pins.filter(v=>v!==id)}));onCloseConversation?.(id);}}] : [])
    ];
    return <ConversationRow key={id} item={item} pinned={id === selectedId} muted={mutedIds.has(id)} status={doat ? statuses?.get(doat.ref.id) : undefined} onSelect={()=>onSelect(id)} actions={actions} />;
  };
  const toggleSection = (id:string):void=>toggle('collapsed',id);
  return <div ref={listRef} className="gw-msg-nav__list gw-inbox-directory" onPointerEnter={()=>{setHeldIds(ordered.map(c=>c.conversation.id));setHeld(true)}} onPointerLeave={()=>{if(!listRef.current?.contains(document.activeElement))setHeld(false)}} onFocusCapture={()=>{if(!held){setHeldIds(ordered.map(c=>c.conversation.id));setHeld(true)}}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null)&&!event.currentTarget.matches(':hover'))setHeld(false)}} onKeyDown={event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')].filter(b=>!b.disabled&&b.getClientRects().length>0), index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(index<0)return;
    if(index===0 && event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();event.currentTarget.closest('nav')?.querySelector<HTMLButtonElement>('[data-nav-id="saved"]')?.focus();return;}
    event.preventDefault();event.stopPropagation();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)))]?.focus();
  }}>
    {pinned.length ? <SidebarSection id="inbox-directory-pinned" label="Pinned" expanded={!prefs.collapsed.includes('pinned')} onToggle={()=>toggleSection('pinned')}>{pinned.map(row)}</SidebarSection> : null}
    {DIRECTORY_SECTIONS.map(section=>{
      const closed = prefs.collapsed.includes(section.id), add = NAV_ADD_ACTIONS[section.id];
      const items = ordered.filter(c=>directoryItems([c],section.id,prefs,selectedId,mutedIds).length && !pinSet.has(c.conversation.id));
      const doatsWithoutChat = section.id === 'doat' ? participants.filter(p=>p.ref.kind === 'doat' && p.available && !conversations.some(c=>c.conversation.kind==='dm'&&c.members.some(m=>m.ref.kind==='doat'&&m.ref.id===p.ref.id))) : [];
      return <SidebarSection key={section.id} id={`inbox-directory-${section.id}`} label={section.label} expanded={!closed} onToggle={()=>toggleSection(section.id)} actions={<span className="gw-inbox-directory__heading-actions">
        <CompactActionMenu label={`${section.label} options`} actions={[
          {label:'Sort by recent activity',checked:prefs.sort[section.id]!=='alphabetical',onSelect:()=>{setHeld(false);onPreferences(p=>({...p,sort:{...p.sort,[section.id]:'recent'}}));}},
          {label:'Sort alphabetically',checked:prefs.sort[section.id]==='alphabetical',onSelect:()=>{setHeld(false);onPreferences(p=>({...p,sort:{...p.sort,[section.id]:'alphabetical'}}));}},
          {label:'Show unread only',checked:prefs.unreadOnly.includes(section.id),checkType:'checkbox',onSelect:()=>toggle('unreadOnly',section.id)},
          {label:'Show muted conversations',checked:!prefs.hideMuted.includes(section.id),checkType:'checkbox',onSelect:()=>toggle('hideMuted',section.id)}
        ]} />
        {onAdd ? <button type="button" aria-label={add.label} title={add.label} onClick={()=>onAdd(add.kind,section.id)}><ShellIcon name="plus" /></button> : null}
      </span>}>
        {items.map(row)}
        {!prefs.unreadOnly.includes(section.id) && onStartParticipant ? doatsWithoutChat.map(p=><button type="button" key={p.ref.id} className="gw-msg-nav__row gw-msg-nav__conversation-row" onClick={()=>onStartParticipant(p.ref)}><span className="gw-msg-nav__avatar is-doat"><ShellIcon name="doats" /></span><ItemTitle text={p.name} className="gw-msg-nav__title"/><span className="gw-inbox-directory__ai">AI</span><NavigationStatus status={statuses?.get(p.ref.id)} label="Recorded worker activity" /></button>) : null}
        {unavailableSections.includes(section.id)?<p className="gw-inbox-directory__empty">{section.label} are not connected yet.</p>:!dataUnavailable&&!items.length && (!doatsWithoutChat.length || prefs.unreadOnly.includes(section.id)) ? <p className="gw-inbox-directory__empty">{prefs.unreadOnly.includes(section.id) || prefs.hideMuted.includes(section.id) ? 'No matching conversations.' : pinSet.size && conversations.some(c=>pinSet.has(c.conversation.id) && directoryItems([c],section.id,prefs).length) ? 'Conversations pinned above.' : section.empty}</p> : null}
      </SidebarSection>;
    })}
  </div>;
}
