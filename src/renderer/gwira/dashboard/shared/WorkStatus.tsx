import React from 'react';
import {StatusIndicator} from '../../../components/StatusIndicator.js';
import {normalizeIndicatorStatus} from '../../../components/iconModel.js';
import {WORK_STATUS_LABELS} from '../../workfilters/workModel.js';
import type {WorkGraphStatus} from '../../graph/graphModel.js';
/** Task status and recorded execution status are separate facts, never mutations. */
export function WorkStatus({status='default',execution=false,compact=false}:{status?:string;execution?:boolean;compact?:boolean}):React.ReactElement {
 const label=execution?({running:'Working',completed:'Completed',stopped:'Cancelled',error:'Failed',queued:'Queued'} as Record<string,string>)[status]??status:WORK_STATUS_LABELS[status as WorkGraphStatus]??status;
 return <StatusIndicator status={normalizeIndicatorStatus(status)} label={label} compact={compact} animate={execution&&status==='running'} className={`gw-work-status is-${status}${compact?' is-icon-only':''}`} description={execution?'Recorded execution status':'Recorded task status'}/>;
}
