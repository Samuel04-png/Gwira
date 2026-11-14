import React from 'react';
import {SidebarNavItem} from './SidebarNavItem.js';

export function PrimaryRail({selection,onHome,onWorkspace,onSchedule,onMore,moreOpen,onMoreKeyDown,account,restricted=false}:{
 selection:'home'|'dashboard'|'schedule'|'more'|null;
 onHome:()=>void;onWorkspace?:()=>void;onSchedule?:()=>void;onMore?:()=>void;
 moreOpen?:boolean;onMoreKeyDown?:(event:React.KeyboardEvent<HTMLButtonElement>)=>void;
 account:React.ReactNode;restricted?:boolean;
}):React.ReactElement {
 return <nav className={`gwira-primary-rail${restricted?' authenticated-home__rail':''}`} aria-label="Primary navigation">
  <SidebarNavItem label="Home" tooltip="Home" icon="home" view="home" active={selection==='home'} onClick={onHome}/>
  <SidebarNavItem label={restricted&&!onWorkspace?'Workspace unavailable':'Workspace'} tooltip={restricted&&!onWorkspace?'Workspace navigation is not available for authenticated accounts yet.':undefined} icon="dashboard" active={selection==='dashboard'} view="dashboard" disabled={restricted&&!onWorkspace} onClick={onWorkspace}/>
  <SidebarNavItem label={restricted&&!onSchedule?'Schedule unavailable':'Schedule'} view="schedule" tooltip={restricted&&!onSchedule?'Schedules are not available for authenticated accounts yet.':'Schedule recurring work'} icon="clock" active={selection==='schedule'} disabled={restricted&&!onSchedule} onClick={onSchedule}/>
  <SidebarNavItem label={restricted&&!onMore?'More unavailable':'More'} tooltip={restricted&&!onMore?'Additional workspace modules are not available for authenticated accounts yet.':undefined} icon="more" active={selection==='more'} expanded={onMore?moreOpen:undefined} disabled={restricted&&!onMore} onClick={onMore} onKeyDown={onMoreKeyDown}/>
  <span className="rail-spacer"/><span className="rail-divider" aria-hidden="true"/>
  <SidebarNavItem label="Help unavailable" tooltip="Help is not implemented yet." icon="help" disabled/>
  {account}
 </nav>;
}
