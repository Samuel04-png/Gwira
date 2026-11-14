/** Explicitly imported by the development-only Electron QA runner; never part of the production graph. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InboxNav } from '../src/renderer/gwira/inbox/InboxNav.js';
import type { ConversationListItem } from '../src/renderer/gwira/messaging/domain/selectors.js';
import type { InboxDestination } from '../src/renderer/gwira/inbox/inboxNavModel.js';
export function showInboxSidebarFixture(mode: 'overflow'|'empty'|'status' = 'overflow'): void {
  if (!import.meta.env.DEV) throw Error('Development fixture only');
  document.querySelector('#inbox-sidebar-fixture')?.remove();
  const host=document.createElement('div');host.id='inbox-sidebar-fixture';host.style.cssText='position:fixed;inset:38px 0 0 64px;z-index:200;background:var(--gw-surface);display:flex';document.body.append(host);
  const rows: ConversationListItem[]= mode==='empty'?[]:Array.from({length:mode==='status'?3:64},(_,i)=>({conversation:{id:`qa-directory-${i}`,organizationId:'qa',workspaceId:'qa',kind:i%4===0?'channel':i%4===1?'group':'dm',visibility:i%8===0?'private':'org',createdAt:'2026-10-30T12:00:00Z',createdBy:{kind:'human',id:'actor'},lastMessageSeq:0},title:`${i===0?'A very long conversation title covering quarterly collaboration planning across departments':'QA collaborator'} ${i}`,members:[{ref:{kind:i%4===3?'doat':'human',id:`worker-${i}`},name:`QA collaborator ${i}`,available:true}],hasDoatMember:i%4===3,unread:i%3===0?2:0,mentionUnread:i%7===0?1:0,isMember:true,sortAt:'2026-10-30T12:00:00Z'}));
  function Fixture():React.ReactElement {const [destination,setDestination]=useState<InboxDestination>({kind:'conversation',id:'qa-directory-0'});return <><div style={{width:'var(--gw-inbox-navigator-width)',height:'100%'}}><InboxNav scopeKey={`qa-fixture:${mode}`} conversations={rows} destination={destination} onSelectDestination={setDestination} pendingApprovals={0} header={<div className="gw-inbox-nav-header"><div className="gw-inbox-nav-title"><h1>Inbox</h1></div></div>} directory={{participants:[],statuses:new Map([['worker-3','working'],['worker-7','failed'],['worker-11','completed']]),mutedIds:new Set(['qa-directory-4'])}} /></div><p style={{padding:'var(--gw-space-4)',color:'var(--gw-text-muted)'}}>Isolated development fixture · {mode}</p></>}
  createRoot(host).render(<Fixture/>);
}
