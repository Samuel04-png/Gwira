import React from 'react';
import {createRoot} from 'react-dom/client';
import {DashboardPage} from '../src/renderer/gwira/dashboard/DashboardPage.js';
import {createEmptyLocalState} from '../src/renderer/gwira/domain/types.js';
import {DoatAvatar} from '../src/renderer/gwira/doats/ui/DoatAvatar.js';
import {createProceduralAvatarSpec} from '../src/renderer/gwira/doats/ui/avatarModel.js';
export function emptyDashboard():void {
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 const node=document.body.appendChild(Object.assign(document.createElement('div'),{id:'dashboard-white-empty-fixture'}));Object.assign(node.style,{position:'fixed',top:'38px',left:'324px',right:'392px',bottom:0,zIndex:'1000'});
 const state=createEmptyLocalState({organizationId:'qa',workspaceId:'qa'},new Date().toISOString());
 createRoot(node).render(<DashboardPage state={state} panelOpen={false} onPanelOpenChange={()=>{}} onStartConversation={async()=>false} onAskAboutRecord={()=>{}} onOpenTask={()=>{}} onCreateTask={()=>''} onUpdateTask={()=>{}}/>);
}
export function avatarProbe():void {
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 const node=document.body.appendChild(Object.assign(document.createElement('div'),{id:'avatar-artwork-probe'}));Object.assign(node.style,{position:'fixed',top:'100px',left:'400px',zIndex:'2000',background:'var(--gw-surface)',padding:'16px'});
 createRoot(node).render(<DoatAvatar spec={createProceduralAvatarSpec('artwork-fallback')} label="Artwork probe" size={72} imageSrc='/gwira/dashboard/test-profiles/inventory.png'/>);
}
