// Explicit dev-only fixture: never imported by the production entry point.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectSidebar } from '../src/renderer/components/ProjectSidebar.js';
import { ProjectCreateDialog } from '../src/renderer/components/ProjectCreateDialog.js';
import { GlobalTopBar } from '../src/renderer/components/GlobalTopBar.js';
let fixtureRoot: ReturnType<typeof createRoot>;
let fixtureKey=0;
const projects=[{id:'qa-operations',name:'Operations',path:'/verification/operations'},{id:'qa-long',name:'A deliberately long project name for sidebar overflow verification',path:'/verification/research'}];
const titles=['Review the complete quarterly operating plan and resolve outstanding decisions with the team','Short title','Discuss project requirements','Review delivery notes','Check the weekly schedule','Prepare launch checklist','Review open questions','Confirm the final document'];
const histories=Object.fromEntries(projects.map(p=>[p.id,titles.map((title,i)=>({id:p.id+'-'+i,cwd:p.path,title,createdAt:new Date(Date.UTC(2026,9,27,10,i)).toISOString(),updatedAt:new Date(Date.UTC(2026,9,28,0,50-i)).toISOString(),filePath:p.path+'/'+i+'.jsonl'}))]));
function Fixture(){
 const [collapsed,setCollapsed]=useState(false),[expanded,setExpanded]=useState(new Set(['qa-operations'])),[selected,setSelected]=useState('qa-operations-0'),[activeProject,setActiveProject]=useState(projects[0]),[view,setView]=useState('home'),[lastOpen,setLastOpen]=useState(''),[menu,setMenu]=useState<string>(),[deleted,setDeleted]=useState('');
 const [data,setData]=useState(histories),[entries,setEntries]=useState(projects);
 (window as any).sidebarFixture={setCount:(count:number)=>setData(Object.fromEntries(projects.map(p=>[p.id,Array.from({length:count},(_,i)=>({id:p.id+'-'+i,cwd:p.path,title:titles[i]??'Verification conversation '+i,createdAt:new Date(Date.UTC(2026,9,27,10,i)).toISOString(),updatedAt:new Date(Date.UTC(2026,9,28,0,50-i)).toISOString(),filePath:p.path+'/'+i+'.jsonl'}))]))),empty:()=>setEntries([]),refresh:()=>setData(current=>({...current,[projects[0].id]:current[projects[0].id].map((h,i)=>i===7?{...h,updatedAt:'2026-10-29T00:00:00Z'}:h)}))};
 const activeSession={id:'qa-session',codexConversationId:selected,cwd:activeProject.path,status:'idle',messages:[],model:'verification-only',reasoningEffort:'high',permissionMode:'default',webSearch:false,startedAt:'2026-10-27T10:00:00Z',updatedAt:'2026-10-28T00:50:00Z'};
 return <div className="shell" data-sidebar={collapsed?'collapsed':'expanded'} data-last-open={lastOpen} data-delete-request={deleted}>
  <GlobalTopBar chatOpen={false} onOpenChat={()=>{}} tabs={[{id:'qa-home',destination:{type:'view',view:'home'}}]} activeTabId="qa-home" choices={[]} labelFor={()=>'Sidebar verification'} canGoBack={false} canGoForward={false} sidebarCollapsed={collapsed} inspectorAvailable={false} inspectorOpen={false} pendingNotifications={0} onGoBack={()=>{}} onGoForward={()=>{}} onToggleSidebar={()=>setCollapsed(v=>!v)} onToggleInspector={()=>{}} onActivate={()=>{}} onClose={()=>{}} onOpen={()=>{}} onOpenInbox={()=>{}} onReorder={()=>{}} onSwitchRelative={()=>{}} />
  <ProjectSidebar activeProject={activeProject} activeSession={activeSession as any} activeSessionId="qa-session" activeView={view as any} collapsed={collapsed} projects={entries} historiesByProject={data} expandedProjectIds={expanded} sessionsForProject={()=>[]} formatRelativeTime={iso=>String(Math.max(1,Math.round((Date.UTC(2026,9,28,1)-Date.parse(iso))/60000)))+'m'}
    onAddProject={()=>setLastOpen('native-folder-picker')} onCreateProject={(name,path)=>setLastOpen('create:'+name+':'+path)} onDeleteHistory={(event,p,h)=>{event.preventDefault();event.stopPropagation();setDeleted(h.id)}} onNewThread={()=>setLastOpen('new-work')} onOpenHistory={(p,h)=>{setSelected(h.id);setActiveProject(p);setLastOpen(h.id)}} onOpenSession={()=>{}} onProjectKeyDown={(event,fn)=>{if(['Enter',' '].includes(event.key)){event.preventDefault();fn()}}} onSelectBusinessView={v=>setView(v)} onOpenHome={()=>setView('home')} onSelectSkills={()=>setView('skills')} onToggleProject={p=>setExpanded(current=>{const next=new Set(current);next.has(p.id)?next.delete(p.id):next.add(p.id);return next})} onToggleProjectMenu={p=>setMenu(p.id)} openProjectMenuId={menu} />
  <main className="workspace" aria-label="Verification canvas"><p style={{padding:24}}>Isolated sidebar verification fixture</p></main>
 </div>;
}
export function showSidebarQuality(){
 if(!import.meta.env.DEV)throw Error('Verification fixture requires development mode');
 localStorage.setItem('gwira.sidebar.sections.v2',JSON.stringify({favorites:true,projects:true,recent:true}));
 localStorage.setItem('gwira.sidebar.favorites.v1',JSON.stringify({'history:qa-operations:qa-operations-0':true,'history:qa-operations:qa-operations-1':true}));
 document.getElementById('root')!.style.display='none';const host=document.createElement('div');host.id='sidebar-quality-fixture';host.style='position:fixed;inset:0';document.body.append(host);fixtureRoot=createRoot(host);fixtureRoot.render(<Fixture/>);
}

export function showTestProjectDialog(mode: 'success'|'cancel'|'error') {
 if(!import.meta.env.DEV)throw Error('Verification only');
 const host=document.createElement('div');host.id='project-dialog-fixture';document.body.append(host);const root=createRoot(host);
 root.render(<ProjectCreateDialog onChooseFolder={async()=>{if(mode==='error')throw Error('Test-only picker failure');return mode==='cancel'?{canceled:true}:{canceled:false,path:'/verification/selected-folder'}}} onCreate={(name,path)=>{host.dataset.created=name+':'+path;root.unmount()}} onClose={()=>{root.unmount();host.remove()}}/>);
}

export function remountSidebarQuality(){fixtureRoot.render(<Fixture key={++fixtureKey}/>)}
