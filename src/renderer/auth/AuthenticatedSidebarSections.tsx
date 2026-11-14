import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {CloudConversation} from '../../shared/cloudConversations.js';
import {Icon,NewThreadIcon} from '../components/Icon.js';
import {SidebarSectionHeading} from '../components/SidebarSectionHeading.js';
import {SidebarConversationRow,formatSidebarTime} from '../components/SidebarConversationRow.js';
import {SidebarContextMenu} from '../components/SidebarContextMenu.js';
import {AuthenticatedProjects} from './AuthenticatedProjects.js';
import {moveSidebarItem,orderSidebarItems,readSidebarPreferences,visibleSidebarItems,type SidebarPreferences,type SidebarSection} from '../sidebarModel.js';

type Settings={preferences:SidebarPreferences;orders:Record<'favorites'|'recent',string[]>};
const defaults=():Settings=>({preferences:readSidebarPreferences(null),orders:{favorites:[],recent:[]}});

export function AuthenticatedSidebarSections({items,projectItems,pins,activeConversationIds,selected,workspace,userId,organizationId,disabled,loading,loadFailed,actionError,activityError,onSelect,onPin,onArchive,onConversationsChanged,onArchived}:{items:CloudConversation[];projectItems:CloudConversation[];pins:string[];activeConversationIds:ReadonlySet<string>;selected:string|null;workspace?:string;userId?:string;organizationId?:string;disabled:boolean;loading:boolean;loadFailed:boolean;actionError?:string;activityError?:string;onSelect:(id:string|null)=>void;onPin:(id:string,pinned:boolean)=>void;onArchive:(id:string,archived:boolean)=>void;onConversationsChanged:()=>Promise<{conversations:CloudConversation[]}>;onArchived:(ids:string[])=>Promise<void>}):React.ReactElement {
 const [settings,setSettings]=useState(defaults),[ready,setReady]=useState(false),[error,setError]=useState('');
 const [expanded,setExpanded]=useState({favorites:true,projects:false,recent:true});
 const [createProjectRequest,setCreateProjectRequest]=useState(0);
 const [listLimits,setListLimits]=useState({favorites:5,recent:5});
 const [menu,setMenu]=useState<{section:SidebarSection;panel:'root'|'organize'|'sort'|'show';position:{top:number;left:number}}>();
 const [archiveTarget,setArchiveTarget]=useState<CloudConversation>();
 const archiveTrigger=useRef<HTMLButtonElement|null>(null);
 const menuRef=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null),writes=useRef<Promise<void>>(Promise.resolve()),live=useRef(true);
 useEffect(()=>{live.current=true;if(!userId||!organizationId){setError('Sidebar preferences could not be loaded. Refresh workspace access.');return()=>{live.current=false;};}void window.codexDesktop.scopedPreferences.read('sidebar',{userId,organizationId}).then(raw=>{if(!live.current)return;if(raw){const parsed:unknown=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid sidebar settings.');const value=parsed as {preferences?:unknown;orders?:{favorites?:unknown;recent?:unknown}};const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];setSettings({preferences:readSidebarPreferences(value.preferences),orders:{favorites:strings(value.orders?.favorites),recent:strings(value.orders?.recent)}});}setReady(true);}).catch(()=>{if(live.current)setError('Sidebar preferences could not be loaded. Refresh workspace access and try again.');});return()=>{live.current=false;};},[userId,organizationId]);
 useEffect(()=>{if(!menu)return;const close=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setMenu(undefined);};const resize=()=>setMenu(undefined);document.addEventListener('pointerdown',close);window.addEventListener('resize',resize);return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',resize);};},[!!menu]);
 const save=(next:Settings)=>{setSettings(next);if(!ready||!userId||!organizationId)return;const pending=writes.current.catch(()=>{}).then(()=>{if(!live.current)throw Error('Account context changed.');return window.codexDesktop.scopedPreferences.write('sidebar',JSON.stringify(next),{userId,organizationId});});writes.current=pending;void pending.then(()=>{if(live.current)setError('');}).catch(()=>{if(live.current)setError('Sidebar preferences could not be saved.');});};
 const preferences=settings.preferences;
 const sorted=(section:'favorites'|'recent')=>orderSidebarItems(items.filter(item=>pins.includes(item.id)===(section==='favorites')).map(item=>({...item,key:item.id,updatedAt:item.updated_at,createdAt:item.created_at})),section==='favorites'?preferences.pinnedSort:preferences.recentSort,settings.orders[section]);
 const favorite=sorted('favorites'),recent=sorted('recent');
 const move=(section:'favorites'|'recent',moving:string,target:string)=>{const list=section==='favorites'?favorite:recent;save({...settings,orders:{...settings.orders,[section]:moveSidebarItem(settings.orders[section],list.map(item=>item.id),moving,target)}});};
 const heading=(section:SidebarSection,label:string)=><SidebarSectionHeading label={label} projects={section==='projects'} expanded={expanded[section]} controls={`cloud-${section}`} onToggle={()=>setExpanded(current=>({...current,[section]:!current[section]}))}>
  <div className={section==='projects'?'projects-header-actions sidebar-heading-actions':'sidebar-heading-actions'}><button type="button" className="sidebar-heading-action" disabled={!ready} aria-label={section==='projects'?'Projects section options':section==='favorites'?'Pinned options':'Recent options'} title={`${label} options`} aria-haspopup="menu" aria-expanded={menu?.section===section} onClick={event=>openMenu(section,event.currentTarget)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();openMenu(section,event.currentTarget,true);}}}><Icon name="more"/></button>{section==='projects'&&<button type="button" className="sidebar-heading-action" disabled={disabled||!userId||!organizationId} aria-label="Create project" title="Create project" onClick={event=>{event.currentTarget.focus();setExpanded(current=>({...current,projects:true}));setCreateProjectRequest(current=>current+1);}}><Icon name="plus"/></button>}{section==='recent'&&<button type="button" className="sidebar-heading-action" disabled={disabled} aria-label="New chat" title="New chat" onClick={()=>onSelect(null)}><NewThreadIcon/></button>}</div>
 </SidebarSectionHeading>;
 function openMenu(section:SidebarSection,button:HTMLButtonElement,focus=false):void{if(menu?.section===section){setMenu(undefined);return;}trigger.current=button;const rect=button.getBoundingClientRect();setMenu({section,panel:'root',position:{top:rect.bottom,left:rect.left}});document.dispatchEvent(new CustomEvent('gw-item-preview-open',{detail:'sidebar-menu'}));if(focus)requestAnimationFrame(()=>menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());}
 const rows=(section:'favorites'|'recent',list:typeof favorite)=>{
  const manual=(section==='favorites'?preferences.pinnedSort:preferences.recentSort)==='manual';
  const shown=visibleSidebarItems(list,false,selected??undefined,listLimits[section]);
  return <>
   {!loading&&!loadFailed&&!list.length&&<p className="sidebar-section-empty">{section==='favorites'?'No pinned conversations.':'No recent conversations.'}</p>}
   <div className="sidebar-item-list">{shown.map(item=><SidebarConversationRow key={item.id} title={item.title} preview={{context:workspace,metadata:`Last activity: ${formatSidebarTime(item.updated_at)}`}} time={formatSidebarTime(item.updated_at)} pinned={pins.includes(item.id)} activity={activeConversationIds.has(item.id)} onOpen={()=>onSelect(item.id)} onTogglePin={()=>onPin(item.id,!pins.includes(item.id))} disabled={disabled} className={`sidebar-shortcut-item${selected===item.id?' active-thread is-selected':''}`} aria-current={selected===item.id?'page':undefined} aria-keyshortcuts={manual?'Alt+ArrowUp Alt+ArrowDown':undefined} draggable={manual&&!disabled} onDragStart={event=>{if(manual)event.dataTransfer.setData('text/plain',item.id);}} onDragOver={event=>{if(manual)event.preventDefault();}} onDrop={event=>{if(manual){event.preventDefault();move(section,event.dataTransfer.getData('text/plain'),item.id);}}} onKeyDown={event=>{if(event.target===event.currentTarget&&manual&&event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const index=list.findIndex(candidate=>candidate.id===item.id);const target=list[index+(event.key==='ArrowUp'?-1:1)];if(target)move(section,item.id,target.id);}}}>{item.created_by===userId&&<button type="button" disabled={disabled} aria-label={`${item.archived_at?'Unarchive':'Archive'} ${item.title}`} title={item.archived_at?'Unarchive conversation':'Archive conversation'} onClick={event=>{event.stopPropagation();if(item.archived_at)onArchive(item.id,false);else{archiveTrigger.current=event.currentTarget;setArchiveTarget(item);}}}><Icon name="archive"/></button>}</SidebarConversationRow>)}</div>
   {list.length>listLimits[section]&&<button type="button" className="sidebar-show-more" onClick={()=>setListLimits(current=>({...current,[section]:current[section]+50}))}>Show more ({list.length-shown.length})</button>}
   {listLimits[section]>5&&<button type="button" className="sidebar-show-more" onClick={()=>setListLimits(current=>({...current,[section]:5}))}>Show less</button>}
  </>;
 };
 return <>
  {error&&<p role="alert">{error}</p>}
  {actionError&&<p role="alert">{actionError}</p>}
  {activityError&&<p role="status">{activityError}</p>}
  {loading&&<p className="sidebar-section-empty" role="status">Loading conversations…</p>}
  {loadFailed&&<p role="alert">Conversations could not be loaded. Check your connection and workspace access, then restart Gwira.</p>}
  <section className="sidebar-work-section sidebar-favorites" aria-label="Pinned" hidden={!preferences.visible.favorites}>{heading('favorites','Pinned')}<div id="cloud-favorites" hidden={!expanded.favorites}>{rows('favorites',favorite)}</div></section>
  <section className="sidebar-work-section" aria-label="Projects" hidden={!preferences.visible.projects}>{heading('projects','Projects')}<div id="cloud-projects" hidden={!expanded.projects}>{userId&&organizationId&&<AuthenticatedProjects scope={{userId,organizationId}} items={projectItems} pins={pins} selected={selected} createRequest={createProjectRequest} disabled={disabled} onSelect={onSelect} onPin={onPin} onArchiveRequest={item=>{archiveTrigger.current=document.activeElement instanceof HTMLButtonElement?document.activeElement:null;setArchiveTarget(item);}} onConversationsChanged={onConversationsChanged} onArchived={onArchived}/>}</div></section>
  <section className="sidebar-work-section sidebar-recent" aria-label="Recent" hidden={!preferences.visible.recent}>{heading('recent','Recents')}<div id="cloud-recent" hidden={!expanded.recent}>{rows('recent',recent)}</div></section>
  {archiveTarget&&<ArchiveConversationDialog title={archiveTarget.title} onClose={()=>{setArchiveTarget(undefined);requestAnimationFrame(()=>archiveTrigger.current?.focus());}} onConfirm={()=>{const heading=archiveTrigger.current?.closest('section')?.querySelector<HTMLButtonElement>('.sidebar-collapsible-heading');onArchive(archiveTarget.id,true);setArchiveTarget(undefined);requestAnimationFrame(()=>heading?.focus());}}/>}
  {menu&&<SidebarContextMenu section={menu.section} panel={menu.panel} position={menu.position} preferences={preferences} projectGroupingUnavailable sectionsOnly={menu.section==='projects'} onPanelChange={panel=>setMenu(current=>current?{...current,panel}:current)} onClose={()=>{setMenu(undefined);trigger.current?.focus();}} onPreferencesChange={patch=>{const next=readSidebarPreferences({...preferences,...patch});const orders={...settings.orders};if(patch.pinnedSort==='manual'&&!orders.favorites.length)orders.favorites=favorite.map(item=>item.id);if(patch.recentSort==='manual'&&!orders.recent.length)orders.recent=recent.map(item=>item.id);save({preferences:next,orders});}} menuRef={menuRef}/>}
 </>;
}

function ArchiveConversationDialog({title,onClose,onConfirm}:{title:string;onClose:()=>void;onConfirm:()=>void}):React.ReactElement {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 return createPortal(<dialog ref={dialog} className="gw-project-dialog gw-sidebar-overlay" aria-labelledby="archive-conversation-title" aria-describedby="archive-conversation-description" onCancel={event=>{event.preventDefault();onClose();}}>
  <form onSubmit={event=>{event.preventDefault();onConfirm();}}>
   <header><h2 id="archive-conversation-title">Archive conversation?</h2></header>
   <p id="archive-conversation-description">Archive “{title}”? You can find and restore it using conversation search.</p>
   <footer><button type="button" autoFocus onClick={onClose}>Cancel</button><button type="submit" className="gw-project-create">Archive</button></footer>
  </form>
 </dialog>,document.body);
}
