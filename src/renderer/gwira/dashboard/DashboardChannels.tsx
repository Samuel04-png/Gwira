import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GwiraLocalState } from '../domain/types.js';
import { MessagingProvider } from '../messaging/react/MessagingProvider.js';
import { useMessaging } from '../messaging/react/useMessaging.js';
import { selectConversationList, selectEligibleParticipants } from '../messaging/domain/selectors.js';
import { CreateConversationDialog } from '../inbox/InboxPage.js';
import { CompactActionMenu } from '../../components/CompactActionMenu.js';
import { Icon } from '../../components/Icon.js';
import { SidebarSection as Section } from '../../components/SidebarSection.js';

export type ChannelSidebarPreferences = { filter: 'all' | 'unread' | 'muted'; sort: 'recent' | 'name' };
export interface ChannelSidebarEntry { id: string; title: string; unread: number; muted: boolean; sortAt: string }

export function ChannelsSection({id='dashboard-channels',expanded,onToggle,entries,preferences,onPreferences,onOpen,onCreate,createDisabled,createTitle,createDialog,error,onRetry,createButtonRef,preferencesDisabled=false,loading=false}:{
  id?:string;expanded:boolean;onToggle:()=>void;entries:ChannelSidebarEntry[];preferences:ChannelSidebarPreferences;
  onPreferences:(update:Partial<ChannelSidebarPreferences>)=>void;onOpen:(id:string)=>void;onCreate:()=>void;
  createDisabled?:boolean;createTitle:string;createDialog?:React.ReactNode;error?:string;onRetry?:()=>void;createButtonRef?:React.Ref<HTMLButtonElement>;preferencesDisabled?:boolean;loading?:boolean;
}):React.ReactElement {
  const entriesToShow=entries.filter(item=>preferences.filter==='all'||(preferences.filter==='unread'?item.unread>0:item.muted));
  entriesToShow.sort((a,b)=>preferences.sort==='name'?a.title.localeCompare(b.title):b.sortAt.localeCompare(a.sortAt));
  return <Section id={id} label="Channels" expanded={expanded} onToggle={onToggle} actions={<div className="dashboard-sidebar__section-actions">
    <CompactActionMenu label="Channels options" actions={[
      ...(['all', 'unread', 'muted'] as const).map(filter => ({ label: filter === 'all' ? 'All channels' : filter === 'unread' ? 'Unread' : 'Muted', checked: preferences.filter === filter, disabled: preferencesDisabled, onSelect: () => onPreferences({ filter }) })),
      ...(['recent', 'name'] as const).map(sort => ({ label: sort === 'recent' ? 'Recent activity' : 'Alphabetical', checked: preferences.sort === sort, disabled: preferencesDisabled, onSelect: () => onPreferences({ sort }) }))
    ]} />
    <button ref={createButtonRef} className="compact-menu-trigger" type="button" aria-label="Create channel" title={createTitle} disabled={createDisabled} onClick={onCreate}><Icon name="plus" /></button>
    {createDialog}
  </div>}>
    {error ? <p className="dashboard-sidebar__empty" role="alert">{error} {onRetry&&<button type="button" onClick={onRetry}>Retry</button>}</p> : null}
    {entriesToShow.length ? entriesToShow.map(item => <button key={item.id} type="button" className="dashboard-sidebar__nav-row" title={item.title} onClick={() => onOpen(item.id)}><Icon name="hash" /><span className="dashboard-sidebar__name">{item.title.replace(/^#/, '')}</span>{item.unread ? <span className="dashboard-sidebar__unread" aria-label={`${item.unread} unread messages`}>{item.unread}</span> : null}</button>) : loading ? <p className="dashboard-sidebar__empty" role="status">Loading channels…</p> : error ? null : <p className="dashboard-sidebar__empty">{preferences.filter === 'all' ? 'No channels yet.' : 'No matching channels.'}</p>}
  </Section>;
}

export function DashboardChannels({ state, activeView, expanded, onToggle, onOpen }: { state: GwiraLocalState; activeView: string; expanded: boolean; onToggle: () => void; onOpen: (id: string) => void }): React.ReactElement {
  const scope = useMemo(() => ({ organizationId: state.organization.id, workspaceId: state.workspace.id }), [state.organization.id, state.workspace.id]);
  return <MessagingProvider key={`${scope.organizationId}:${scope.workspaceId}:${activeView}`} scope={scope} work={state}><Channels expanded={expanded} onToggle={onToggle} onOpen={onOpen} /></MessagingProvider>;
}
function Channels({ expanded, onToggle, onOpen }: { expanded: boolean; onToggle: () => void; onOpen: (id: string) => void }): React.ReactElement {
  const { state, scope, work, actions, writesBlocked } = useMessaging();
  const preferenceKey = `gwira.sidebar.channels:${scope.organizationId}:${scope.workspaceId}`;
  const [preferences, setPreferences] = useState<ChannelSidebarPreferences>(() => {
    try { const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}'); return { filter: ['all', 'unread', 'muted'].includes(saved.filter) ? saved.filter : 'all', sort: saved.sort === 'name' ? 'name' : 'recent' }; } catch { return { filter: 'all', sort: 'recent' }; }
  });
  const save = (update: Partial<typeof preferences>): void => { const next = { ...preferences, ...update }; setPreferences(next); try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* preference remains usable in memory */ } };
  const [create, setCreate] = useState(false), [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (): void => { setCreate(false); trigger.current?.focus(); };
  const entries = selectConversationList(state, scope, work).filter(item => item.conversation.kind === 'channel' && !item.conversation.archivedAt).map(item=>({
    id:item.conversation.id,title:item.title,unread:item.unread,sortAt:item.sortAt,
    muted:state.memberships.some(member=>member.conversationId===item.conversation.id&&member.participant.kind==='human'&&member.participant.id===state.selfPersonId&&!member.leftAt&&member.muted)
  }));
  const createDialog=create ? createPortal(<CreateConversationDialog error={error} initialKind="channel" participants={selectEligibleParticipants(work, scope)} selfPersonId={state.selfPersonId} onClose={close} onCreate={(kind, values) => {
      const result = kind === 'channel' ? actions.createChannel(values) : kind === 'group' ? actions.createGroup(values.name, values.members) : actions.createDm(values.members[0]!);
      if (!result.ok) { setError(result.error.message); return; }
      close(); if (!result.durable) setError('Channel is in memory. Open Inbox to retry saving it.');
    }} />, document.body) : null;
  return <ChannelsSection expanded={expanded} onToggle={onToggle} entries={entries} preferences={preferences} onPreferences={save} onOpen={onOpen} createTitle={!state.selfPersonId ? 'Add a workspace person in Directory before creating a channel.' : writesBlocked ? 'Resolve messaging storage recovery in Inbox first.' : 'Create channel'} createDisabled={!state.selfPersonId||writesBlocked} createButtonRef={trigger} onCreate={()=>{setError('');setCreate(true);}} createDialog={createDialog} error={error}/>;
}
