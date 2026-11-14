import React,{useRef} from 'react';

export function RightWorkspace({open,single,launcherOpen,canvasRef,toolsRef,canvas,tools,width,limits,onWidthChange,onResizingChange}:{
 open:boolean;single:boolean;launcherOpen:boolean;
 canvasRef?:React.Ref<HTMLDivElement>;toolsRef?:React.Ref<HTMLDivElement>;
 canvas?:React.ReactNode;tools?:React.ReactNode;
 width:number;limits:{min:number;max:number};
 onWidthChange:(width:number)=>void;onResizingChange?:(resizing:boolean)=>void;
}):React.ReactElement {
 const drag=useRef<{pointerId:number;clientX:number;width:number}|undefined>(undefined);
 const clamp=(value:number)=>Math.max(limits.min,Math.min(limits.max,value));
 const stop=(event:React.PointerEvent<HTMLDivElement>)=>{
  if(drag.current?.pointerId!==event.pointerId)return;
  drag.current=undefined;onResizingChange?.(false);
 };
 return <aside className={`right-workspace${single?' right-workspace--single':''}`} aria-label="Right workspace" hidden={!open}>
  <div className="right-workspace__canvas" ref={canvasRef}>{canvas}</div>
  <div id="workspace-tools-panel" className="right-workspace__tools" ref={toolsRef} hidden={launcherOpen}>{tools}</div>
  <div className="right-workspace__resize" role="separator" tabIndex={0} aria-label="Resize Workspace" aria-orientation="vertical"
   aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={clamp(width)}
   onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();onWidthChange(event.key==='Home'?limits.min:event.key==='End'?limits.max:clamp(width+(event.key==='ArrowLeft'?10:-10)));}}
   onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();drag.current={pointerId:event.pointerId,clientX:event.clientX,width:clamp(width)};event.currentTarget.setPointerCapture(event.pointerId);onResizingChange?.(true);}}
   onPointerMove={event=>{const current=drag.current;if(current?.pointerId===event.pointerId)onWidthChange(clamp(current.width+current.clientX-event.clientX));}}
   onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}/>
 </aside>;
}
