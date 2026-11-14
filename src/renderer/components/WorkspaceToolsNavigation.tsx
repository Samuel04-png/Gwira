import React from 'react';
import {NavigationIcon} from './Icon.js';
import {WORKSPACE_ROUTES,type RoutableWorkspaceView,type WorkspaceNavigation} from '../navigationTypes.js';

export const workspaceToolRoutes=WORKSPACE_ROUTES.filter(route=>!['home','dashboard','inbox','my-work','library','organization','schedule'].includes(route.view));

export function WorkspaceToolsNavigation({activeView,onNavigate}:{activeView:WorkspaceNavigation;onNavigate:(view:RoutableWorkspaceView)=>void}):React.ReactElement {
 return <><header className="gwira-sidebar-header"><h2>Workspace tools</h2></header><nav className="desktop-tools-navigation" aria-label="Workspace tools">{workspaceToolRoutes.map(route=><button key={route.view} type="button" data-navigation-view={route.view} aria-current={activeView===route.view?'page':undefined} onClick={()=>onNavigate(route.view)}><NavigationIcon name={route.icon} size={18}/>{route.label}</button>)}</nav></>;
}
