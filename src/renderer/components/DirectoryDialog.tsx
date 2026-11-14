import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './Icon.js';
export function DirectoryDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}):React.ReactElement{
 const ref=useRef<HTMLDivElement>(null),origin=useRef(document.activeElement as HTMLElement|null);
 useEffect(()=>{const dialog=ref.current;(dialog?.querySelector<HTMLElement>('input')??dialog?.querySelector<HTMLElement>('button'))?.focus();return()=>{requestAnimationFrame(()=>{
  // StrictMode replays effects while the dialog remains mounted. Restore only
  // after a real close, and never take focus away from a newer dialog.
  const current=document.querySelector('[role=dialog]');
  if(!dialog?.isConnected&&origin.current?.isConnected&&(!current||current.contains(origin.current)))origin.current.focus({preventScroll:true});
 });};},[]);
 return createPortal(<div className="desktop-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} className="desktop-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button,input,select,textarea')].filter(c=>!c.hasAttribute('disabled'));const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><header><h2>{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></header>{children}</div></div>,document.body);
}
