import React from 'react';
import { Icon, type IconName, type IconSize } from './Icon.js';
import { normalizeIndicatorStatus, type IndicatorStatus } from './iconModel.js';
export const statusPresentation: Record<IndicatorStatus,{icon:IconName;label:string}> = {
  idle:{icon:'idle',label:'Idle'},queued:{icon:'queued',label:'Queued'},pending:{icon:'clock',label:'Pending'},
  working:{icon:'operations',label:'Working'},loading:{icon:'running',label:'Loading'},waiting:{icon:'waiting',label:'Waiting for approval'},
  paused:{icon:'paused',label:'Paused'},completed:{icon:'trace-check',label:'Completed'},failed:{icon:'failed',label:'Failed'},
  warning:{icon:'warning',label:'Warning'},cancelled:{icon:'cancelled',label:'Cancelled'},offline:{icon:'offline',label:'Offline'},
};
/** Presentation only. Callers supply recorded state; task progress never implies execution. */
export function StatusIndicator({status,label,compact=false,animate=false,size=16,className='',description}:{status:IndicatorStatus;label?:string;compact?:boolean;animate?:boolean;size?:IconSize;className?:string;description?:string}):React.ReactElement {
  const presentation=statusPresentation[status], text=label??presentation.label;
  const motion=animate&&status==='loading'?'spin':animate&&status==='working'?'pulse':'none';
  return <span className={`gw-status-indicator ${className}`} data-status={status} data-status-motion={motion} role="img" aria-label={description?`${text}. ${description}`:text} title={compact?text:undefined}>
    <Icon name={presentation.icon} size={size}/>{compact?null:<span>{text}</span>}
  </span>;
}
export function AgentActivityIndicator({status,executing=false,compact=false,label}:{status:string;executing?:boolean;compact?:boolean;label?:string}):React.ReactElement {
  return <StatusIndicator status={normalizeIndicatorStatus(status)} animate={executing} compact={compact} label={label}/>;
}
