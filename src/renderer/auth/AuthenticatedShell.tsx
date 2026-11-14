import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {AccountCommand,AccountSnapshot} from '../../shared/accountAuth.js';
import {HomeOnlyTopBar} from '../components/GlobalTopBar.js';
import {PrimaryRail} from '../components/PrimaryRail.js';
import {primaryNavigationSelection} from '../components/iconModel.js';
import {WorkspaceShell} from '../components/WorkspaceShell.js';
import {closeWorkspaceTab,navigateGlobalTab,newGlobalTab,openWorkspaceTab,selectWorkspaceTab,type WorkspaceDestination,type WorkspaceTab,type WorkspaceTabsState} from '../workspaceTabs.js';
import {WORKSPACE_ROUTES,type RoutableWorkspaceView} from '../navigationTypes.js';
import {NavigationIcon} from '../components/Icon.js';
import {AuthenticatedDashboardSidebar} from '../gwira/dashboard/DashboardSidebar.js';
import {WorkspaceToolsNavigation,workspaceToolRoutes} from '../components/WorkspaceToolsNavigation.js';
import {UnavailableScheduleSidebar,type AvailableCategory} from '../gwira/schedule/SchedulePage.js';
import {UnavailableWorkspaceView} from './UnavailableWorkspaceView.js';
import {homeTabId} from './authenticatedTabs.js';
import {stepNavigation,visitNavigation,type NavigationHistory} from './navigationHistory.js';
import {useAuthenticatedNotifications} from './useAuthenticatedNotifications.js';
import {useAuthenticatedChannels} from './useAuthenticatedChannels.js';
import {AuthenticatedInbox} from './AuthenticatedInbox.js';
import {AuthenticatedTeamsPage} from '../gwira/workspace/TeamsPage.js';
import './authenticatedHome.css';

export function AuthenticatedShell({state,busy,navigationBusy=false,send,children,sidebarContent,workspaceContent,workspaceWidth,workspacePlanId,tabs,tabState,updateTabState,onSelect,onClose,onReorder,sidebar,onToggleSidebar,onToggleWorkspace,workspaceOpen,conversationActions,globalChat,tabError,onRetryTabs}:{state:AccountSnapshot;busy:boolean;navigationBusy?:boolean;send:(command:AccountCommand)=>Promise<void>;children:React.ReactNode;sidebarContent:(navigate:(view:RoutableWorkspaceView)=>void,view:RoutableWorkspaceView,selectHome:(id:string|null)=>void)=>React.ReactNode;workspaceContent:(destination:WorkspaceDestination,onOpenTool:(destination:WorkspaceDestination)=>void,onCloseTool:()=>void)=>React.ReactNode;workspaceWidth:number;workspacePlanId?:string;tabs?:Array<{id:string;title:string}>;tabState:WorkspaceTabsState;updateTabState:(next:WorkspaceTabsState)=>void;onSelect?:(id:string|null)=>void;onClose?:(id:string)=>void;onReorder?:(id:string,target:string)=>void;sidebar?:boolean;onToggleSidebar?:()=>void;onToggleWorkspace?:()=>void;workspaceOpen?:boolean;conversationActions?:React.ReactNode;globalChat?:(open:boolean,onClose:()=>void)=>React.ReactNode;tabError?:string;onRetryTabs?:()=>void}):React.ReactElement {
 const [accountOpen,setAccountOpen]=useState(false);
 const notifications=useAuthenticatedNotifications(state.user?.id&&state.activeOrganization?.id?{userId:state.user.id,organizationId:state.activeOrganization.id}:undefined);
 const channelScope=state.user?.id&&state.activeOrganization?.id?{userId:state.user.id,organizationId:state.activeOrganization.id}:undefined;
 const channels=useAuthenticatedChannels(channelScope);
 const [requestedChannel,setRequestedChannel]=useState<{id:string;nonce:number}>();
 const [chatOpen,setChatOpen]=useState(false);
 const closeChat=()=>{setChatOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.global-topbar [aria-label="Gwira Chat"]')?.focus());};
 const toggleChat=()=>{if(!chatOpen&&workspaceOpen)onToggleWorkspace?.();setChatOpen(value=>!value);};
 const toggleWorkspace=()=>{if(chatOpen)setChatOpen(false);onToggleWorkspace?.();};
 const [moreOpen,setMoreOpen]=useState(false);
 const [scheduleCategory,setScheduleCategory]=useState<AvailableCategory>('upcoming');
 const sidebarRef=useRef<HTMLElement>(null);
 const accountRef=useRef<HTMLDivElement>(null);
 const accountMenuRef=useRef<HTMLDivElement>(null);
 const [accountPosition,setAccountPosition]=useState({left:0,bottom:0});
 useLayoutEffect(()=>{if(!accountOpen)return;const position=()=>{const anchor=accountRef.current?.getBoundingClientRect();const menu=accountMenuRef.current?.getBoundingClientRect();if(anchor&&menu)setAccountPosition({left:Math.max(8,Math.min(anchor.right+8,window.innerWidth-menu.width-8)),bottom:Math.max(8,window.innerHeight-anchor.bottom)});};position();window.addEventListener('resize',position);document.addEventListener('scroll',position,true);return()=>{window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);};},[accountOpen]);
 useEffect(()=>{if(!accountOpen)return;const close=(event:PointerEvent)=>{if(!accountRef.current?.contains(event.target as Node)&&!accountMenuRef.current?.contains(event.target as Node))setAccountOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[accountOpen]);
 useEffect(()=>{if(!moreOpen)return;const close=(event:PointerEvent)=>{if(event.target instanceof Element&&!event.target.closest('.gwira-more-menu,[aria-label="More"]'))setMoreOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){setMoreOpen(false);sidebarRef.current?.querySelector<HTMLButtonElement>('[aria-label="More"]')?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);document.dispatchEvent(new CustomEvent('gw-item-preview-open',{detail:'sidebar-more'}));return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[moreOpen]);
 const activeGlobal=tabState.globalTabs?.find(tab=>tab.id===tabState.activeGlobalTabId);
 const view:RoutableWorkspaceView=activeGlobal?.destination.type==='view'?activeGlobal.destination.view:'home';
 const businessSidebar=['dashboard','inbox','my-work','organization'].includes(view);
 const sidebarContext=view==='home'||view==='library'?'home':'business';
 const [histories,setHistories]=useState<Record<string,NavigationHistory>>({});
 const activeId=tabState.activeGlobalTabId??homeTabId;
 const history=histories[activeId]??{views:[view],index:0};
 const updateHistory=(next:NavigationHistory)=>setHistories(current=>({...current,[activeId]:next}));
 const showView=(target:RoutableWorkspaceView)=>{setMoreOpen(false);updateTabState(navigateGlobalTab(tabState,{type:'view',view:target}));if(target==='home')onSelect?.(null);};
 const navigate=(target:RoutableWorkspaceView)=>{if(busy||navigationBusy)return;updateHistory(visitNavigation(history,target));showView(target);};
 const selectHome=(id:string|null)=>{updateHistory(visitNavigation(history,'home'));onSelect?.(id);};
 const moveHistory=(direction:-1|1)=>{const next=stepNavigation(history,direction);updateHistory(next);showView(next.views[next.index]??'home');};
 const closeView=(id:string)=>{const wasActive=tabState.activeGlobalTabId===id;const next=closeWorkspaceTab(tabState,id);updateTabState(next);setHistories(current=>{const copy={...current};delete copy[id];return copy;});if(!wasActive)return;const tab=next.globalTabs?.find(item=>item.id===next.activeGlobalTabId);if(tab?.destination.type==='conversation')onSelect?.(tab.destination.conversationId);else if(tab?.destination.type==='view'&&tab.destination.view==='home')onSelect?.(null);};
 const [tools,setTools]=useState<WorkspaceTabsState>(()=>{const tab:WorkspaceTab={id:crypto.randomUUID(),destination:{type:'launcher'}};return {tabs:[tab],globalTabs:[],workspaceTabs:[tab],activeTabId:tab.id,activeWorkspaceTabId:tab.id};});
 const previousWorkspace=useRef<{open:boolean;planId?:string}>({open:false});
 const openingLauncher=useRef(false);
 useEffect(()=>{const previous=previousWorkspace.current;if(workspaceOpen&&workspacePlanId&&(!previous.open||previous.planId!==workspacePlanId)&&!openingLauncher.current)setTools(current=>openWorkspaceTab(current,{type:'files'}));openingLauncher.current=false;previousWorkspace.current={open:!!workspaceOpen,planId:workspacePlanId};},[workspaceOpen,workspacePlanId]);
 const selectedTool=tools.workspaceTabs?.find(tab=>tab.id===tools.activeWorkspaceTabId)?.destination??{type:'launcher'};
 const openTool=(destination:WorkspaceDestination)=>setTools(current=>openWorkspaceTab(current,destination));
 const closeTool=(tab:WorkspaceTab)=>{if((tools.workspaceTabs?.length??0)===1){onToggleWorkspace?.();return;}setTools(current=>closeWorkspaceTab(current,tab.id));};
 const workspaceRef=useRef<HTMLElement>(null);
 return <main className="shell authenticated-home cloud-home" style={{'--gw-workspace-width':`${workspaceWidth}px`,'--gw-work-width':'320px','--gw-shell-sidebar-width':'324px'} as React.CSSProperties} data-tools-open={!!workspaceOpen} data-assistant-open={chatOpen} data-sidebar={sidebar?'expanded':'collapsed'} data-authenticated-home data-app-route="AuthenticatedHome">
  <HomeOnlyTopBar tabs={tabs} globalTabs={(tabState.globalTabs??[]).filter(tab=>tab.destination.type!=='conversation'||tabs?.some(item=>tab.destination.type==='conversation'&&item.id===tab.destination.conversationId))} activeGlobalTabId={tabState.activeGlobalTabId??homeTabId} disabled={busy||navigationBusy} onSelect={selectHome} onClose={onClose} onReorder={onReorder} onToggleSidebar={onToggleSidebar} sidebarCollapsed={!sidebar} onToggleWorkspace={toggleWorkspace} workspaceOpen={workspaceOpen} chatOpen={chatOpen} onOpenChat={globalChat?toggleChat:undefined} notifications={state.user?.id&&state.activeOrganization?.id?notifications:undefined} workspaceTabs={tools.workspaceTabs} activeWorkspace={tools.activeWorkspaceTabId} onSelectWorkspace={tab=>setTools(current=>selectWorkspaceTab(current,tab.id))} onCloseWorkspace={closeTool} onNewWorkspace={()=>{openTool({type:'launcher'});if(!workspaceOpen){openingLauncher.current=true;toggleWorkspace();}}} onNavigate={navigate} onCloseView={closeView} onActivateTab={tab=>{updateTabState(selectWorkspaceTab(tabState,tab.id));if(tab.destination.type==='conversation')onSelect?.(tab.destination.conversationId);else if(tab.destination.type==='view'&&tab.destination.view==='home')onSelect?.(null);}} onNewTab={()=>{updateTabState(newGlobalTab(tabState));onSelect?.(null);}} canGoBack={history.index>0} canGoForward={history.index<history.views.length-1} onGoBack={()=>moveHistory(-1)} onGoForward={()=>moveHistory(1)} conversationActions={conversationActions}/>
  {tabError&&<div className="authenticated-tabs-error" role="alert">{tabError} <button type="button" onClick={onRetryTabs}>Retry</button></div>}
  <aside ref={sidebarRef} data-sidebar-context={sidebarContext} className={`sidebar gwira-two-layer-sidebar is-${sidebarContext}-sidebar${sidebar?'':' is-collapsed'}`} aria-label="Gwira navigation">
   <PrimaryRail restricted selection={primaryNavigationSelection(view,sidebarContext)} onHome={()=>navigate('home')} onWorkspace={()=>navigate('dashboard')} onSchedule={()=>navigate('schedule')} moreOpen={moreOpen} onMore={()=>setMoreOpen(value=>!value)} onMoreKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const last=event.key==='ArrowUp';setMoreOpen(true);requestAnimationFrame(()=>{const items=sidebarRef.current?.querySelectorAll<HTMLButtonElement>('.gwira-more-menu button');items?.[last?items.length-1:0]?.focus();});}}} account={<div ref={accountRef} className="authenticated-home__account" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setAccountOpen(false);event.currentTarget.querySelector<HTMLButtonElement>('.authenticated-home__avatar')?.focus();}}}>
     <button type="button" className="authenticated-home__avatar" aria-label="Account menu" title="Account" aria-expanded={accountOpen} onClick={()=>setAccountOpen(value=>!value)}>{(state.user?.displayName||state.user?.email||'?').slice(0,1).toUpperCase()}</button>
     {accountOpen&&createPortal(<div ref={accountMenuRef} className="authenticated-home__menu" role="group" aria-label="Account" style={accountPosition}><strong>{state.user?.displayName||state.user?.email}</strong><small>{state.activeOrganization?.name}</small>{state.organizations.filter(org=>org.id!==state.activeOrganization?.id).map(org=><button type="button" disabled={busy} key={org.id} onClick={()=>void send({type:'switch',organizationId:org.id})}>Switch to {org.name}</button>)}<button type="button" disabled={busy} onClick={()=>void send({type:'refresh'})}>Refresh access</button><button type="button" disabled={busy} onClick={()=>void send({type:'sign_out'})}>Sign out</button></div>,document.body)}
    </div>}/>
   {moreOpen&&<div className="gwira-more-menu" role="menu" onKeyDown={event=>{const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];const index=items.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus();}if(event.key==='Escape'){event.preventDefault();setMoreOpen(false);sidebarRef.current?.querySelector<HTMLButtonElement>('[aria-label="More"]')?.focus();}}}>{workspaceToolRoutes.map(route=><button type="button" role="menuitem" key={route.view} data-navigation-view={route.view} className={view===route.view?'active':''} onClick={()=>navigate(route.view)}><NavigationIcon name={route.icon} active={view===route.view} size={18}/>{route.label}</button>)}</div>}
   {sidebarContent(navigate,view,selectHome)}
   {state.user?.id&&state.activeOrganization?.id&&channelScope&&<div className="gwira-secondary-sidebar" hidden={!sidebar||!businessSidebar}><AuthenticatedDashboardSidebar key={`${state.user.id}:${state.activeOrganization.id}`} activeView={view} onNavigate={navigate} workspace={state.activeOrganization.name} scope={channelScope} canManageDirectory={state.activeOrganization.role==='owner'||state.activeOrganization.role==='admin'} channels={channels} onOpenChannel={id=>{setRequestedChannel(current=>({id,nonce:(current?.nonce??0)+1}));navigate('inbox');}}/></div>}
   {workspaceToolRoutes.some(route=>route.view===view)&&<div className="gwira-secondary-sidebar" hidden={!sidebar}><WorkspaceToolsNavigation activeView={view} onNavigate={navigate}/></div>}
   {view==='schedule'&&<div className="gwira-secondary-sidebar" hidden={!sidebar}><UnavailableScheduleSidebar category={scheduleCategory} onSelect={setScheduleCategory}/></div>}
  </aside>
  {workspaceContent(selectedTool,openTool,()=>{const tab=tools.workspaceTabs?.find(item=>item.id===tools.activeWorkspaceTabId);if(tab)closeTool(tab);})}
  {globalChat?.(chatOpen,closeChat)}
  <WorkspaceShell activeView={view} workspaceRef={workspaceRef} chat={children} skills={<UnavailableWorkspaceView view="skills" workspace={state.activeOrganization?.name??'Workspace'}/>} businessViews={Object.fromEntries(WORKSPACE_ROUTES.filter(route=>route.view!=='home'&&route.view!=='skills').map(route=>[route.view,route.view==='inbox'&&channelScope?<AuthenticatedInbox key="inbox" scope={channelScope} channels={channels} requestedChannel={requestedChannel} active={view==='inbox'}/>:route.view==='teams'&&channelScope?<AuthenticatedTeamsPage key={`${channelScope.userId}:${channelScope.organizationId}`} scope={channelScope} teams={state.teams} active={view==='teams'}/>:<UnavailableWorkspaceView key={route.view} view={route.view} workspace={state.activeOrganization?.name??'Workspace'} scheduleCategory={scheduleCategory}/>]))}/>
 </main>;
}
