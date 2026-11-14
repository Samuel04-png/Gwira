import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.js';
import { MessageActionButton } from './MessageActionButton.js';

export function MessageMoreMenu(): React.ReactElement {
 const [open,setOpen] = useState(false);
 const [position,setPosition] = useState({left:0,top:0});
 const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
 const close = (): void => {setOpen(false); trigger.current?.focus();};
 useLayoutEffect(() => {
  if (!open || !menu.current || !trigger.current) return;
  const r=trigger.current.getBoundingClientRect(), m=menu.current.getBoundingClientRect();
  const gap=Number.parseFloat(getComputedStyle(menu.current).getPropertyValue('--gw-space-2'));
  setPosition({left:Math.max(gap,Math.min(r.left,innerWidth-m.width-gap)),top:Math.max(gap,r.bottom+m.height+gap<=innerHeight?r.bottom+gap:r.top-m.height-gap)});
  menu.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
 },[open]);
 useEffect(() => {
  if (!open) return;
  const outside=(event:PointerEvent):void=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};
  const dismiss=():void=>setOpen(false);
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);document.addEventListener('scroll',dismiss,true);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',dismiss,true);};
 },[open]);
 return <><MessageActionButton label="More options" icon="more" buttonRef={trigger} expanded={open} onClick={()=>setOpen(!open)}/>{open?createPortal(<div ref={menu} className="message-more-menu" role="menu" aria-label="Response options" style={position} onKeyDown={event=>{if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopPropagation();close();}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();}}}><button type="button" role="menuitem" aria-disabled="true" title="The conversation provider has no context-preserving branch API. Previous tools and business actions must not be replayed."><Icon name="branch"/>Branch in new chat</button><p>Unavailable: the conversation provider does not support creating a branch with prior context.</p></div>,document.body):null}</>;
}
