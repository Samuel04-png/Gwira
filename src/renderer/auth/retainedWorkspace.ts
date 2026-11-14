import type {AccountSnapshot} from '../../shared/accountAuth.js';
import type {AppRoute} from '../../shared/resolveAppRoute.js';
import {workspaceView} from './workspaceView.js';

export type RetainedWorkspace={state:AccountSnapshot;workspaceId:string;ready:boolean};

export function retainedWorkspace(previous:RetainedWorkspace|null,route:AppRoute,state:AccountSnapshot):RetainedWorkspace|null {
 if((route.type==='MeetGwira'||route.type==='WorkspaceReady')&&workspaceView(state,route.workspaceId)){
  return {state,workspaceId:route.workspaceId,ready:route.type==='WorkspaceReady'};
 }
 if(route.type!=='ResolvingSession'||state.phase!=='organization_ready'||!previous||!state.user||
    state.user.id!==previous.state.user?.id||!workspaceView(state,previous.workspaceId)||
    state.activeOrganization?.role!==previous.state.activeOrganization?.role)return null;
 return previous;
}
