// Development-only interaction fixture; never imported by the application.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthenticatedProjects} from '../src/renderer/auth/AuthenticatedProjects.js';
import type {CloudConversation,CloudConversationsApi,CloudSidebarProjects,ConversationRequest} from '../src/shared/cloudConversations.js';

const scope={userId:'11111111-1111-4111-8111-111111111111',organizationId:'22222222-2222-4222-8222-222222222222'};
const data:CloudSidebarProjects={projects:[],sections:[],links:[]};
const conversations:CloudConversation[]=[];
const now=()=>new Date().toISOString();
const api:CloudConversationsApi={async request(input:ConversationRequest,expected){
 if(expected?.userId!==scope.userId||expected.organizationId!==scope.organizationId)throw Error('Incorrect scope');
 if(input.type==='projects')return structuredClone(data);
 if(input.type==='create'){conversations.push({id:input.id,organization_id:scope.organizationId,created_by:scope.userId,title:input.title,visibility:input.visibility,archived_at:null,created_at:now(),updated_at:now()});return input.id;}
 if(input.type!=='project_change')throw Error('Unexpected request');
 const project=data.projects.find(item=>item.id===input.projectId);
 if(input.action==='create')data.projects.push({id:input.projectId,organization_id:scope.organizationId,owner_id:scope.userId,name:input.value!,pinned:false,created_at:now(),updated_at:now()});
 else if(!project)throw Error('Project missing');
 else if(input.action==='rename')project.name=input.value!;
 else if(input.action==='pin')project.pinned=input.value==='true';
 else if(input.action==='section')data.sections.push({id:input.sectionId!,project_id:project.id,name:input.value!,created_at:now()});
 else if(input.action==='move'){data.links=data.links.filter(link=>link.project_id!==project.id||link.conversation_id!==input.conversationId);data.links.push({project_id:project.id,conversation_id:input.conversationId!,section_id:input.sectionId??null});}
 else if(input.action==='unlink')data.links=data.links.filter(link=>link.project_id!==project.id||link.conversation_id!==input.conversationId);
 else if(input.action==='archive_chats')for(const link of data.links.filter(link=>link.project_id===project.id)){const item=conversations.find(chat=>chat.id===link.conversation_id);if(item)item.archived_at=now();}
 else if(input.action==='remove'){data.projects=data.projects.filter(item=>item.id!==project.id);data.sections=data.sections.filter(item=>item.project_id!==project.id);data.links=data.links.filter(item=>item.project_id!==project.id);}
 return null;
}};
function Fixture():React.ReactElement {
 const [items,setItems]=useState<CloudConversation[]>([]),[selected,setSelected]=useState(''),[createRequest,setCreateRequest]=useState(0),[pins,setPins]=useState<string[]>([]);
 const refresh=async()=>{const result=structuredClone(conversations);setItems(result);return {conversations:result};};
 return <main className="shell" data-selected={selected} data-sidebar="expanded"><header className="global-topbar"/><aside className="sidebar gwira-two-layer-sidebar is-home-sidebar"><div className="gwira-primary-rail"/><div className="gwira-secondary-sidebar"><div className="sidebar-content-scroll"><div className="sidebar-section-row"><span className="sidebar-collapsible-heading">Projects</span><div className="sidebar-heading-actions"><button className="sidebar-heading-action" aria-label="Create project" onClick={event=>{event.currentTarget.focus();setCreateRequest(current=>current+1);}}>+</button></div></div><AuthenticatedProjects scope={scope} api={api} items={items} pins={pins} selected={selected} createRequest={createRequest} disabled={false} onSelect={setSelected} onPin={(id,pinned)=>setPins(current=>pinned?[...current,id]:current.filter(item=>item!==id))} onArchiveRequest={()=>{}} onConversationsChanged={refresh} onArchived={async()=>{}}/></div></div></aside><div className="workspace"/></main>;
}
export function showAuthenticatedProjectsFixture():void {
 if(!import.meta.env.DEV)throw Error('Development only');
 document.getElementById('root')!.style.display='none';
 const host=document.createElement('div');host.id='authenticated-projects-fixture';host.style.cssText='position:fixed;inset:0;z-index:20000';document.body.append(host);createRoot(host).render(<Fixture/>);
}
