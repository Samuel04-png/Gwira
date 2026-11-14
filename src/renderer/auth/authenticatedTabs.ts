import {closeWorkspaceTab,navigateGlobalTab,type WorkspaceTab,type WorkspaceTabsState} from '../workspaceTabs.js';
import {WORKSPACE_ROUTES,type RoutableWorkspaceView} from '../navigationTypes.js';

export const homeTabId='authenticated-home';

export function initialAuthenticatedTabs():WorkspaceTabsState {
 const home={id:homeTabId,destination:{type:'view' as const,view:'home' as const}};
 return {tabs:[home],globalTabs:[home],workspaceTabs:[],activeTabId:homeTabId,activeGlobalTabId:homeTabId,recent:[],closed:[]};
}

export function selectAuthenticatedTab(state:WorkspaceTabsState,id:string|null):WorkspaceTabsState {
 return navigateGlobalTab(state,id===null?{type:'view',view:'home'}:{type:'conversation',projectId:'cloud',conversationId:id});
}

export function closeAuthenticatedTab(state:WorkspaceTabsState,id:string):WorkspaceTabsState {
 return closeWorkspaceTab(state,id);
}

export function closeAuthenticatedConversationTabs(state:WorkspaceTabsState,id:string):WorkspaceTabsState {
 let next=state;
 for(const tab of state.globalTabs??[]) {
  if(tab.destination.type==='conversation'&&tab.destination.conversationId===id)next=closeAuthenticatedTab(next,tab.id);
 }
 const closed=next.closed?.filter(tab=>tab.destination.type!=='conversation'||tab.destination.conversationId!==id);
 return closed?.length!==next.closed?.length?{...next,closed}:next;
}

export function activeAuthenticatedConversation(state:WorkspaceTabsState):string|null {
 const tab=state.globalTabs?.find(item=>item.id===state.activeGlobalTabId);
 return tab?.destination.type==='conversation'?tab.destination.conversationId:null;
}

const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function serializeAuthenticatedTabs(state:WorkspaceTabsState):string {
 return JSON.stringify({version:1,tabs:state.globalTabs??[],active:state.activeGlobalTabId??homeTabId});
}

export function restoreAuthenticatedTabs(raw:string|null,authorizedConversationIds:ReadonlySet<string>):{state:WorkspaceTabsState;removed:boolean}|null {
 if(raw===null)return null;
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value)||!('version'in value)||value.version!==1||!('tabs'in value)||!Array.isArray(value.tabs)||!('active'in value)||typeof value.active!=='string')throw Error('Invalid saved tabs.');
 const result:WorkspaceTab[]=[],ids=new Set<string>();
 let removed=false;
 for(const candidate of value.tabs){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||!('id'in candidate)||!('destination'in candidate)||!candidate.destination||typeof candidate.destination!=='object'||Array.isArray(candidate.destination)||!('type'in candidate.destination)){removed=true;continue;}
  const {id,destination}=candidate;
  let tab:WorkspaceTab|undefined;
  if(destination.type==='view'&&'view'in destination&&typeof destination.view==='string'&&(WORKSPACE_ROUTES.some(route=>route.view===destination.view)||destination.view==='work-sessions')){
   const view=destination.view as RoutableWorkspaceView;
   if(id===homeTabId||uuid(id))tab={id,destination:{type:'view',view}};
  }else if(destination.type==='conversation'&&'projectId'in destination&&destination.projectId==='cloud'&&'conversationId'in destination&&uuid(destination.conversationId)&&(id===homeTabId||uuid(id))&&authorizedConversationIds.has(destination.conversationId)){
   tab={id,destination:{type:'conversation',projectId:'cloud',conversationId:destination.conversationId}};
  }
  if(!tab||ids.has(tab.id)){removed=true;continue;}
  ids.add(tab.id);result.push(tab);
 }
 if(!result.length){result.push(initialAuthenticatedTabs().tabs[0]!);removed=true;}
 const active=result.some(tab=>tab.id===value.active)?value.active:result[0]!.id;
 if(active!==value.active)removed=true;
 return {state:{tabs:result,globalTabs:result,workspaceTabs:[],activeTabId:active,activeGlobalTabId:active,recent:[],closed:[]},removed};
}
