import React from 'react';
import {Icon} from './Icon.js';
import {ItemTitle,type ItemPreview} from './ItemTitle.js';

export function SidebarConversationRow({title,preview,time,pinned,onOpen,onTogglePin,children,activity,disabled=false,className='',...rowProps}:{title:string;preview?:ItemPreview;time:React.ReactNode;pinned:boolean;onOpen:()=>void;onTogglePin:()=>void;children?:React.ReactNode;activity?:boolean;disabled?:boolean}&Omit<React.HTMLAttributes<HTMLDivElement>,'title'|'onClick'|'children'>):React.ReactElement {
 return <div {...rowProps} className={`sidebar-conversation-row ${className}`} role="button" tabIndex={disabled?-1:0} aria-label={activity?`${title}, AI response generating`:title} aria-disabled={disabled||undefined} onClick={()=>{if(!disabled)onOpen();}} onKeyDown={event=>{rowProps.onKeyDown?.(event);if(!event.defaultPrevented&&event.target===event.currentTarget&&!disabled&&['Enter',' '].includes(event.key)){event.preventDefault();onOpen();}}}>
  <ItemTitle sidebar className="thread-title sidebar-item-title" text={title} preview={preview}/>
  {activity&&<span className="sidebar-activity" role="img" aria-label="AI response generating" title="AI response generating"/>}
  <span className="thread-time sidebar-item-time">{time}</span>
  <span className="sidebar-row-actions"><button type="button" className="pin-thread-button" disabled={disabled} aria-label={`${pinned?'Unpin':'Pin'} ${title}`} title={pinned?'Unpin conversation':'Pin conversation'} onClick={event=>{event.stopPropagation();onTogglePin();}}><Icon name={pinned?'unpin':'pin'}/></button>{children}</span>
 </div>;
}

export function formatSidebarTime(iso:string):string {
 const minutes=Math.floor(Math.max(0,Date.now()-Date.parse(iso))/60000);
 if(minutes<1)return 'now';
 if(minutes<60)return `${minutes}m`;
 const hours=Math.floor(minutes/60);
 return hours<24?`${hours}h`:`${Math.floor(hours/24)}d`;
}
