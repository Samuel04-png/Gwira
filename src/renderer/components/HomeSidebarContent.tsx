import React from 'react';
import {Icon,NavigationIcon,NewThreadIcon,SearchIcon} from './Icon.js';

export function HomeSidebarContent({onNewWork,newWorkDisabled=false,newWorkDisabledReason,onLibrary,libraryActive=false,libraryDisabledReason,onSearch,searchOpen=false,sections,footer,onScroll,workspaceLabel}:{
 onNewWork:()=>void;newWorkDisabled?:boolean;newWorkDisabledReason?:string;onLibrary?:()=>void;libraryActive?:boolean;libraryDisabledReason?:string;
 onSearch?:()=>void;searchOpen?:boolean;
 sections:React.ReactNode;footer:React.ReactNode;onScroll?:()=>void;workspaceLabel:string;
}):React.ReactElement {
 return <>
  <header className="gwira-sidebar-header"><div className="gwira-title" aria-label={workspaceLabel}><strong>Gwira</strong></div><div className="sidebar-header-actions"><button className="sidebar-notification" type="button" disabled title="Notifications are not implemented yet." aria-label="Notifications unavailable"><Icon name="bell"/></button><button className="sidebar-search" type="button" disabled={!onSearch} aria-label={onSearch?'Search conversations':'Search unavailable'} title={onSearch?'Search conversations':'Search is not implemented yet.'} aria-expanded={onSearch?searchOpen:undefined} onClick={onSearch}><SearchIcon/></button></div></header>
  <div className="nav-block top-actions"><button type="button" className="ghost-button sidebar-new-work" disabled={newWorkDisabled} title={newWorkDisabledReason} onClick={onNewWork}><NewThreadIcon className="nav-icon"/>New work</button><button type="button" data-navigation-view="library" aria-current={libraryActive?'page':undefined} className={`ghost-button${libraryActive?' active':''}`} disabled={!!libraryDisabledReason} title={libraryDisabledReason} onClick={onLibrary}><NavigationIcon name="library" active={libraryActive} size={18} className="nav-icon"/>Library</button></div>
  <div className="sidebar-content-scroll" onScroll={onScroll}>{sections}</div>
  {footer}
 </>;
}
