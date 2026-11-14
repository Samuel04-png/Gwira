import type {RoutableWorkspaceView} from '../navigationTypes.js';

export type NavigationHistory={views:RoutableWorkspaceView[];index:number};
export const initialNavigationHistory:NavigationHistory={views:['home'],index:0};
export function visitNavigation(state:NavigationHistory,view:RoutableWorkspaceView):NavigationHistory {
 if(state.views[state.index]===view)return state;
 const views=[...state.views.slice(0,state.index+1),view].slice(-100);
 return {views,index:views.length-1};
}
export function stepNavigation(state:NavigationHistory,direction:-1|1):NavigationHistory {
 return {...state,index:Math.max(0,Math.min(state.views.length-1,state.index+direction))};
}
