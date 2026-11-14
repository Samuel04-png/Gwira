import React from 'react';
import {Icon} from './Icon.js';

export function SidebarSectionHeading({label,expanded,controls,onToggle,projects=false,children}:{label:string;expanded:boolean;controls:string;onToggle:()=>void;projects?:boolean;children?:React.ReactNode}):React.ReactElement {
 return <div className={projects?'projects-header sidebar-section-row':'sidebar-section-row'}>
  <button type="button" className={projects?'projects-header-toggle':'sidebar-collapsible-heading'} aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>{label}<span className={`sidebar-chevron${expanded?' open':''}`} aria-hidden="true"><Icon name="chevron-right"/></span></button>
  {children}
 </div>;
}
