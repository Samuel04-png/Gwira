import React,{useEffect,useState} from 'react';
import type {PlanRecord} from '../../shared/accountAuth.js';
import {NewTabLauncher} from '../components/NewTabLauncher.js';
import {RightWorkspace} from '../components/RightWorkspace.js';
import {WorkspaceFiles} from '../workspaceTools/WorkspaceFiles.js';
import {WorkspaceTerminalStart} from '../workspaceTools/WorkspaceTerminal.js';
import {WorkSessionsUnavailable} from '../workSessions/WorkSessions.js';
import {planText} from './planDocuments.js';
import type {WorkspaceDestination} from '../workspaceTabs.js';
import '../workspaceTools/workspaceTools.css';
import './cloudHome.css';

export function AuthenticatedWorkspace({plan,open,onCloseTool,destination,onOpenTool,width,onWidthChange}:{plan:PlanRecord|null;open:boolean;onCloseTool:()=>void;destination:WorkspaceDestination;onOpenTool:(destination:WorkspaceDestination)=>void;width:number;onWidthChange:(width:number)=>void}):React.ReactElement {
 const [viewport,setViewport]=useState(window.innerWidth);
 const [canvasTarget,setCanvasTarget]=useState<HTMLDivElement|null>(null);
 useEffect(()=>{const resize=()=>setViewport(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const max=Math.max(0,Math.floor(Math.min(650,viewport*.7,viewport-56)));
 const limits={min:Math.min(260,max),max};
 const visibleWidth=Math.max(limits.min,Math.min(limits.max,width));
 const launcher=destination.type==='launcher';
 const files=destination.type==='files';
 const compactWidth=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gw-files-compact-width'))||610;
 const compact=visibleWidth<=compactWidth;
 return <RightWorkspace open={open} single={!launcher&&!files} launcherOpen={launcher} canvasRef={setCanvasTarget} width={visibleWidth} limits={limits} onWidthChange={onWidthChange}
   tools={launcher?null:files?<section className="workspace-tools" aria-label="Workspace tools" data-files-layout="true" data-files-compact={compact?'true':undefined}><WorkspaceFiles cloudDocument={plan?{title:plan.title,markdown:planText(plan)}:null} canvasTarget={canvasTarget} compact={compact} open={open} onClose={onCloseTool}/></section>:destination.type==='terminal'?<WorkspaceTerminalStart restricted/>:<WorkSessionsUnavailable onClose={onCloseTool}/>}
   canvas={launcher?<NewTabLauncher onTool={tool=>onOpenTool(tool==='sessions'?{type:'work-sessions'}:tool==='files'?{type:'files'}:{type:'terminal'})}/>:null}/>;
}
