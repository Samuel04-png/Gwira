import type {GwiraLocalState,TaskStatus} from '../domain/types.js';
import {canTransitionTask} from '../domain/lifecycle.js';
import type {WorkGraphStatus} from '../graph/graphModel.js';
const targets:Partial<Record<WorkGraphStatus,TaskStatus>>={default:'todo',working:'in_progress',waiting:'in_review',blocked:'blocked',completed:'done'};
/** Adapts the existing local lifecycle; it cannot authorize server or execution changes. */
export function boardTransition(state:GwiraLocalState,id:string,target:WorkGraphStatus):{status?:TaskStatus;reason?:string}{
 const task=state.tasks.find(task=>task.id===id&&task.workspaceId===state.workspace.id);
 if(!task)return {reason:'This task is no longer in the current workspace. Refresh the Board.'};
 if(task.assignee?.kind!=='person'||!state.people.some(p=>p.id===task.assignee?.id&&p.workspaceId===state.workspace.id))return {reason:'Only assigned human planning tasks can move here. Use task details for Doat or unassigned work.'};
 if(task.agentRun)return {reason:'Recorded execution state cannot be changed by moving a card. Review the execution in task details.'};
 if(state.approvals.some(a=>a.taskId===id&&a.status==='pending'))return {reason:'An approval decision is pending. Review the approval using its existing authorized controls.'};
 const status=targets[target];
 if(!status||!canTransitionTask(task.status,status))return {reason:'This move is not an allowed task transition. Open task details to review available controls.'};
 return {status};
}
