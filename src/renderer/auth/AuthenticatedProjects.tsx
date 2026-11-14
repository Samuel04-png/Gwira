import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {CloudConversation,CloudSidebarProject,CloudSidebarProjects,CloudConversationsApi,ConversationRequest} from '../../shared/cloudConversations.js';
import type {ExpectedWorkspace} from '../../shared/scopedPreferences.js';
import {CompactActionMenu} from '../components/CompactActionMenu.js';
import {Icon} from '../components/Icon.js';
import {ItemTitle} from '../components/ItemTitle.js';

const empty:CloudSidebarProjects={projects:[],sections:[],links:[]};
type ProjectChange=Extract<ConversationRequest,{type:'project_change'}>;
type Dialog={kind:'create'|'rename'|'section'|'remove'|'archive';project?:CloudSidebarProject};
const projectError=(error:unknown,fallback:string)=>error instanceof Error&&error.message.includes('Project storage is not configured on this server.')?'Project storage is not configured on this server. Contact your workspace administrator.':fallback;

export function AuthenticatedProjects({scope,items,pins,selected,createRequest,disabled,onSelect,onPin,onArchiveRequest,onConversationsChanged,onArchived,api=window.codexDesktop.conversations}:{scope:ExpectedWorkspace;items:CloudConversation[];pins:string[];selected:string|null;createRequest:number;disabled:boolean;onSelect:(id:string)=>void;onPin:(id:string,pinned:boolean)=>void;onArchiveRequest:(item:CloudConversation)=>void;onConversationsChanged:()=>Promise<{conversations:CloudConversation[]}>;onArchived:(ids:string[])=>Promise<void>;api?:CloudConversationsApi}):React.ReactElement {
 const [data,setData]=useState<CloudSidebarProjects>(empty),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [expanded,setExpanded]=useState<Set<string>>(new Set()),[expandedSections,setExpandedSections]=useState<Set<string>>(new Set());
 const [dialog,setDialog]=useState<Dialog>(),[dialogError,setDialogError]=useState(''),[value,setValue]=useState('');
 const [projectLimit,setProjectLimit]=useState(20);
 const live=useRef(true),lock=useRef(false),dialogRef=useRef<HTMLDialogElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 const dialogId=useRef(''),pendingChats=useRef(new Map<string,string>());
 const load=async()=>{const result=await api.request({type:'projects'},scope);if(!result||Array.isArray(result)||typeof result!=='object'||!('projects'in result)||!Array.isArray(result.projects)||!Array.isArray(result.sections)||!Array.isArray(result.links))throw Error('Invalid project response.');if(live.current)setData(result);};
 useEffect(()=>{live.current=true;void load().catch(error=>{if(live.current)setError(projectError(error,'Projects could not be loaded. Check access and try again.'));}).finally(()=>{if(live.current)setLoading(false);});return()=>{live.current=false;};},[scope.userId,scope.organizationId]);
 useEffect(()=>{if(!dialog)return;const node=dialogRef.current;node?.showModal();if(!['remove','archive'].includes(dialog.kind))node?.querySelector<HTMLInputElement>('input')?.focus();return()=>node?.close();},[dialog]);
 const mutate=async(input:ProjectChange)=>{await api.request(input,scope);await load();};
 const run=async(work:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();}catch(error){if(live.current)setError(projectError(error,'The project change could not be confirmed. Check access and try again.'));}finally{lock.current=false;if(live.current)setBusy(false);}};
 const openDialog=(next:Dialog)=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;dialogId.current=crypto.randomUUID();setDialogError('');setValue(next.kind==='rename'?next.project?.name??'':'');setDialog(next);};
 useEffect(()=>{if(createRequest>0)openDialog({kind:'create'});},[createRequest]);
 const closeDialog=()=>{setDialog(undefined);requestAnimationFrame(()=>returnFocus.current?.isConnected&&returnFocus.current.focus());};
 const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!dialog||lock.current)return;const name=value.trim();if(!['remove','archive'].includes(dialog.kind)&&(!name||name.length>160))return;lock.current=true;setBusy(true);setDialogError('');
  try{
   const projectId=dialog.project?.id??dialogId.current;
   const action=dialog.kind==='create'?'create':dialog.kind==='rename'?'rename':dialog.kind==='section'?'section':dialog.kind==='archive'?'archive_chats':'remove';
   await mutate({type:'project_change',projectId,action,...(['remove','archive_chats'].includes(action)?{}:{value:name}),...(action==='section'?{sectionId:dialogId.current}:{})});
   if(action==='archive_chats'){
    const refreshed=await onConversationsChanged(),linked=new Set(data.links.filter(link=>link.project_id===projectId).map(link=>link.conversation_id));
    await onArchived(refreshed.conversations.filter(item=>item.archived_at&&linked.has(item.id)).map(item=>item.id));
   }
   if(live.current){if(action==='create'){setExpanded(current=>new Set(current).add(projectId));setProjectLimit(current=>Math.max(current,data.projects.length+1));}closeDialog();}
  }catch(error){if(live.current)setDialogError(projectError(error,'The project change could not be confirmed. Check access and try again.'));}
  finally{lock.current=false;if(live.current)setBusy(false);}
 };
 const toggle=(id:string,set:React.Dispatch<React.SetStateAction<Set<string>>>)=>set(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const newChat=(project:CloudSidebarProject,sectionId?:string)=>void run(async()=>{
  const pendingKey=`${project.id}:${sectionId??''}`;
  const id=pendingChats.current.get(pendingKey)??crypto.randomUUID();pendingChats.current.set(pendingKey,id);
  await api.request({type:'create',id,title:'New chat',visibility:'private'},scope);
  await mutate({type:'project_change',projectId:project.id,action:'move',conversationId:id,sectionId});
  await onConversationsChanged();pendingChats.current.delete(pendingKey);if(live.current)onSelect(id);
 });
 const chats=(project:CloudSidebarProject,sectionId:string|null)=>data.links.filter(link=>link.project_id===project.id&&link.section_id===sectionId).map(link=>items.find(item=>item.id===link.conversation_id&&!item.archived_at)).filter((item):item is CloudConversation=>!!item);
 const conversationRows=(project:CloudSidebarProject,sectionId:string|null)=>chats(project,sectionId).map(chat=><div className={`cloud-project-chat${selected===chat.id?' is-selected':''}`} key={chat.id}><button type="button" className="sidebar-show-more" aria-current={selected===chat.id?'page':undefined} disabled={disabled||busy} onClick={()=>onSelect(chat.id)}><ItemTitle sidebar text={chat.title}/></button><CompactActionMenu label={`Project options for ${chat.title}`} actions={[
  {label:pins.includes(chat.id)?'Unpin conversation':'Pin conversation',disabled:busy||disabled,onSelect:()=>onPin(chat.id,!pins.includes(chat.id))},
  ...(chat.created_by===scope.userId?[{label:'Archive conversation',disabled:busy||disabled,onSelect:()=>onArchiveRequest(chat)}]:[]),
  ...data.sections.filter(section=>section.project_id===project.id&&section.id!==sectionId).map(section=>({label:`Move to ${section.name}`,disabled:busy||disabled,onSelect:()=>void run(()=>mutate({type:'project_change',projectId:project.id,action:'move',conversationId:chat.id,sectionId:section.id}))})),
  ...(sectionId?[{label:'Move to project',disabled:busy||disabled,onSelect:()=>void run(()=>mutate({type:'project_change',projectId:project.id,action:'move',conversationId:chat.id}))}]:[]),
  {label:'Remove from project',disabled:busy||disabled,onSelect:()=>void run(()=>mutate({type:'project_change',projectId:project.id,action:'unlink',conversationId:chat.id}))}
 ]}/></div>);
 return <>
  {loading&&<p className="sidebar-section-empty" role="status">Loading projects…</p>}
  {error&&<p role="alert" className="sidebar-section-empty">{error} <button type="button" disabled={busy} onClick={()=>void run(load)}>Retry</button></p>}
  {!loading&&!error&&!data.projects.length&&<p className="sidebar-section-empty">Create a project to organize conversations.</p>}
  {data.projects.slice().sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updated_at.localeCompare(a.updated_at)).slice(0,projectLimit).map(project=><div key={project.id} className="project-group">
   <div className="project-pill cloud-project-pill">
    <button type="button" className="cloud-project-toggle" aria-expanded={expanded.has(project.id)} onClick={()=>toggle(project.id,setExpanded)}><Icon name={expanded.has(project.id)?'folder-open':'folder'}/><ItemTitle sidebar text={project.name}/></button>
    <div className="project-actions">
     <CompactActionMenu label={`Options for ${project.name}`} actions={[
      {label:project.pinned?'Unpin project':'Pin project',disabled:busy||disabled,onSelect:()=>void run(()=>mutate({type:'project_change',projectId:project.id,action:'pin',value:String(!project.pinned)}))},
      {label:'Edit name',disabled:busy||disabled,onSelect:()=>openDialog({kind:'rename',project})},
      {label:'New section',disabled:busy||disabled,onSelect:()=>openDialog({kind:'section',project})},
      {label:'New chat',disabled:busy||disabled,onSelect:()=>newChat(project)},
      {label:'Archive chats',disabled:busy||disabled||!data.links.some(link=>link.project_id===project.id&&items.some(item=>item.id===link.conversation_id&&item.created_by===scope.userId&&!item.archived_at)),onSelect:()=>openDialog({kind:'archive',project})},
      {label:'Remove project',destructive:true,disabled:busy||disabled,onSelect:()=>openDialog({kind:'remove',project})}
     ]}/>
    </div>
   </div>
   {expanded.has(project.id)&&<div className="cloud-project-contents">
    {conversationRows(project,null)}
    {data.sections.filter(section=>section.project_id===project.id).map(section=><div key={section.id}>
     <button type="button" className="sidebar-show-more" aria-expanded={expandedSections.has(section.id)} onClick={()=>toggle(section.id,setExpandedSections)}><Icon name="folder"/><ItemTitle sidebar text={section.name}/></button>
     {expandedSections.has(section.id)&&<div>{conversationRows(project,section.id)}<button type="button" className="sidebar-show-more" disabled={disabled||busy} onClick={()=>newChat(project,section.id)}>New chat in section</button></div>}
    </div>)}
    <label className="sidebar-section-empty">Add conversation <select disabled={disabled||busy} value="" onChange={event=>{const id=event.currentTarget.value;if(id)void run(()=>mutate({type:'project_change',projectId:project.id,action:'move',conversationId:id}));}}><option value="">Choose conversation</option>{items.filter(item=>!item.archived_at&&!data.links.some(link=>link.project_id===project.id&&link.conversation_id===item.id)).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
   </div>}
  </div>)}
  {data.projects.length>projectLimit&&<button type="button" className="sidebar-show-more" onClick={()=>setProjectLimit(current=>current+20)}>Show more projects ({data.projects.length-projectLimit})</button>}
  {dialog&&createPortal(<dialog ref={dialogRef} className="gw-project-dialog gw-sidebar-overlay" aria-labelledby="cloud-project-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)closeDialog();}}><form onSubmit={event=>void submit(event)}><header><h2 id="cloud-project-dialog-title">{dialog.kind==='create'?'Create project':dialog.kind==='rename'?'Edit project':dialog.kind==='section'?'New section':dialog.kind==='archive'?'Archive project chats?':'Remove project?'}</h2><button type="button" className="gw-project-dialog__close" aria-label="Close dialog" disabled={busy} onClick={closeDialog}><Icon name="close"/></button></header>{dialog.kind==='remove'?<p>Remove “{dialog.project?.name}”? Conversations will not be deleted.</p>:dialog.kind==='archive'?<p>Archive your conversations in “{dialog.project?.name}”? Other people’s conversations are not changed. You can restore yours through search.</p>:<label className="gw-project-name-field"><Icon name="folder"/><input aria-label={dialog.kind==='section'?'Section name':'Project name'} placeholder={dialog.kind==='section'?'Section name':'Project name'} autoFocus required maxLength={160} value={value} disabled={busy} onChange={event=>setValue(event.target.value)}/></label>}{dialog.kind==='create'&&<div className="gw-project-source-section"><label>Source folders</label><div className="gw-project-source"><Icon name="folder"/><span>Cloud project without a local folder. Local folders are not available in this authenticated workspace.</span></div></div>}{dialogError&&<p role="alert" className="gw-project-dialog__error">{dialogError}</p>}<footer><button type="button" autoFocus={dialog.kind==='remove'||dialog.kind==='archive'} disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className="gw-project-create" disabled={busy||(!['remove','archive'].includes(dialog.kind)&&!value.trim())}>{busy?'Saving…':dialog.kind==='remove'?'Remove':dialog.kind==='archive'?'Archive':dialog.kind==='create'?'Create project':'Save'}</button></footer></form></dialog>,document.body)}
 </>;
}
