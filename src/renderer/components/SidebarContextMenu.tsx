import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SidebarPreferences, SidebarSection, SidebarSort } from '../sidebarModel.js';
import { Icon } from './Icon.js';
type Panel = 'root' | 'organize' | 'sort' | 'show';
export function SidebarContextMenu({ section, panel, position, preferences, onPanelChange, onClose, onPreferencesChange, menuRef,projectGroupingUnavailable=false,sectionsOnly=false }: {
  section: SidebarSection; panel: Panel; position:{top:number;left:number}; preferences: SidebarPreferences;
  onPanelChange:(panel:Panel)=>void; onClose:()=>void; onPreferencesChange:(update:Partial<SidebarPreferences>)=>void; menuRef:React.RefObject<HTMLDivElement|null>;
  projectGroupingUnavailable?:boolean;
  sectionsOnly?:boolean;
}):React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null), subRef = useRef<HTMLDivElement>(null);
  const [rootPosition,setRootPosition]=useState(position),[subPosition,setSubPosition]=useState(position);
  const keyboardSubmenu = useRef(false);
  useLayoutEffect(()=>{
    const root=rootRef.current;if(!root)return;
    const gap=Number.parseFloat(getComputedStyle(root).getPropertyValue('--gw-space-2'));
    const rect=root.getBoundingClientRect();
    setRootPosition({left:Math.max(gap,Math.min(position.left,innerWidth-rect.width-gap)),top:Math.max(gap,Math.min(position.top+gap,innerHeight-rect.height-gap))});
  },[position]);
  useLayoutEffect(()=>{
    if(panel==='root')return;
    const trigger=rootRef.current?.querySelector<HTMLElement>(`[data-panel="${panel}"]`),sub=subRef.current;
    if(!trigger||!sub)return;
    const a=trigger.getBoundingClientRect(),r=sub.getBoundingClientRect(),gap=Number.parseFloat(getComputedStyle(sub).getPropertyValue('--gw-space-1'));
    const right=a.right+gap,left=right+r.width<=innerWidth-gap?right:Math.max(gap,a.left-r.width-gap);
    setSubPosition({left,top:Math.max(gap,Math.min(a.top,innerHeight-r.height-gap))});
  },[panel,rootPosition]);
  useEffect(()=>{if(panel!=='root'&&keyboardSubmenu.current){requestAnimationFrame(()=>subRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());keyboardSubmenu.current=false}},[panel]);
  const openPanel=(next:Panel,keyboard=false)=>{keyboardSubmenu.current=keyboard;onPanelChange(next)};
  const sort=section==='projects'?preferences.projectSort:preferences.recentSort;
  const group=section==='projects'?preferences.projectGrouping:preferences.recentGrouping;
  const options:Array<{value:SidebarSort;label:string}>=[{value:'updated',label:'Last updated'},{value:'manual',label:'Manual order'},{value:'created',label:'Date created'},{value:'name',label:'Name'}];
  const check=(yes:boolean)=>yes?<Icon name="trace-check" />:<span className="sidebar-menu-check-space" aria-hidden="true" />;
  const handleKey=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    const menu=(event.target as HTMLElement).closest('[role="menu"]');
    const buttons=[...(menu?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])];
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus()}
    if(event.key==='ArrowRight'){const next=(document.activeElement as HTMLElement).dataset.panel as Panel|undefined;if(next){event.preventDefault();openPanel(next,true)}}
    if(event.key==='ArrowLeft'||event.key==='Escape'){event.preventDefault();if(panel!=='root'){const previous=panel;onPanelChange('root');rootRef.current?.querySelector<HTMLButtonElement>(`[data-panel="${previous}"]`)?.focus()}else if(event.key==='Escape')onClose()}
    if(event.key==='Tab')onClose();
  };
  const submenuButton=(next:Panel,label:string,icon:'sidebar'|'sort'|'list')=><button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={panel===next} data-panel={next} onMouseEnter={()=>openPanel(next)} onClick={()=>openPanel(next,true)}><Icon name={icon}/><span>{label}</span><Icon name="chevron-right" /></button>;
  return createPortal(<div ref={menuRef} className="sidebar-menu-layer" onKeyDown={handleKey}>
    <div ref={rootRef} className="sidebar-context-menu gw-sidebar-overlay" role="menu" aria-label={`${section==='favorites'?'Pinned':section==='projects'?'Projects':'Recents'} options`} style={rootPosition}>
      {sectionsOnly?submenuButton('show','Show sections','list'):section==='favorites'?<>{(['updated','manual'] as const).map(value=><button key={value} type="button" role="menuitemradio" aria-checked={preferences.pinnedSort===value} onClick={()=>{onPreferencesChange({pinnedSort:value});onClose()}}><span>{value==='updated'?'Last updated':'Manual order'}</span>{check(preferences.pinnedSort===value)}</button>)}{!preferences.visible.projects&&!preferences.visible.recent?<><hr/>{submenuButton('show','Show sections','list')}</>:null}</>:<>{submenuButton('organize','Organize sidebar','sidebar')}{submenuButton('sort','Sort chats by','sort')}<hr/>{submenuButton('show','Show sections','list')}</>}
    </div>
    {panel!=='root'?<div ref={subRef} className="sidebar-context-menu sidebar-submenu gw-sidebar-overlay" role="menu" aria-label={panel==='sort'?'Sort chats by':panel==='organize'?'Organize sidebar':'Show sections'} style={subPosition}>
      {panel==='sort'?<>{options.map(option=><button type="button" role="menuitemradio" aria-checked={sort===option.value} key={option.value} onClick={()=>{onPreferencesChange(section==='projects'?{projectSort:option.value}:{recentSort:option.value});onClose()}}><span>{option.label}</span>{check(sort===option.value)}</button>)}<p className="sidebar-menu-help">Manual order: drag rows, or use Alt + ↑ / ↓.</p></>:panel==='organize'?<>{(['project','list'] as const).map(value=><button type="button" role="menuitemradio" aria-checked={group===value} key={value} disabled={projectGroupingUnavailable&&value==='project'} title={projectGroupingUnavailable&&value==='project'?'Projects are unavailable in authenticated workspaces.':undefined} onClick={()=>{onPreferencesChange(section==='projects'?{projectGrouping:value}:{recentGrouping:value});onClose()}}><Icon name={value==='project'?'folder':'list'}/><span>{value==='project'?'By project':'In one list'}</span>{check(group===value)}</button>)}</>:<>{(['favorites','projects','recent'] as const).map(key=><button type="button" role="menuitemcheckbox" aria-checked={preferences.visible[key]} key={key} disabled={preferences.visible[key]&&Object.values(preferences.visible).filter(Boolean).length===1} title={preferences.visible[key]&&Object.values(preferences.visible).filter(Boolean).length===1?'Keep one section visible so hidden sections can be restored.':undefined} onClick={()=>onPreferencesChange({visible:{...preferences.visible,[key]:!preferences.visible[key]}})}><span>{key==='favorites'?'Pinned':key==='projects'?'Projects':'Recents'}</span>{check(preferences.visible[key])}</button>)}</>}
    </div>:null}
  </div>,document.body);
}
