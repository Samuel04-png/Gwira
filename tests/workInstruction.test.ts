import { describe, expect, it } from 'vitest';
import { saveEmployeeInstruction } from '../src/renderer/workSessions/localInstruction.js';
import { projectWorkSessions } from '../src/renderer/workSessions/model.js';
import { LocalMessagingRepository } from '../src/renderer/gwira/messaging/data/localRepository.js';
import { createEmptyLocalState } from '../src/renderer/gwira/domain/types.js';
import { makeWork, scope, B, TASK, t0 } from './gwira/messagingFixtures.js';
function setup() {
 const state={...createEmptyLocalState(scope,t0),...makeWork()};state.tasks=state.tasks.map(task=>task.id===TASK?{...task,agentRun:undefined,assignee:{kind:'person' as const,id:B}}:task);
 const entries=new Map<string,string>();let fail=false;
 const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{if(fail)throw Error('storage unavailable');entries.set(key,value);}};
 const repository=new LocalMessagingRepository({storage,scope,getWork:()=>state});
 const row=projectWorkSessions(state,[])[0];
 return {state,row,repository,setFailure:(value:boolean)=>{fail=value;}};
}
describe('task-linked local employee instructions',()=>{
 it('records the correct recipient and task without claiming delivery',()=>{const {state,row,repository}=setup();const result=saveEmployeeInstruction(repository,state,row,'Please review the task.','request-1');const snapshot=repository.getSnapshot().state;expect(snapshot.conversations).toHaveLength(1);expect(snapshot.messages[0]).toMatchObject({body:'Please review the task.',refs:[{kind:'task',taskId:TASK}],sendState:'local_saved'});expect(snapshot.memberships.some(member=>member.participant.id===B)).toBe(true);expect(result.message).toContain('Delivery is not confirmed');});
 it('uses the same idempotency key on explicit retry',()=>{const {state,row,repository}=setup();saveEmployeeInstruction(repository,state,row,'Please review.','same-request');saveEmployeeInstruction(repository,state,row,'Please review.','same-request');expect(repository.getSnapshot().state.messages).toHaveLength(1);});
 it('rejects a changed owner before creating any conversation',()=>{const {state,row,repository}=setup();state.tasks=state.tasks.map(task=>task.id===TASK?{...task,assignee:undefined}:task);expect(()=>saveEmployeeInstruction(repository,state,row,'Do work','stale')).toThrow('assignment changed');expect(repository.getSnapshot().state.messages).toHaveLength(0);});
 it('rejects cross-workspace repository use',()=>{const {state,row,repository}=setup();state.organization.id='other';expect(()=>saveEmployeeInstruction(repository,state,row,'Do work','scope')).toThrow('workspace person');});
 it('retains failed local saves and retries without duplicates after storage recovery',()=>{const {state,row,repository,setFailure}=setup();setFailure(true);expect(()=>saveEmployeeInstruction(repository,state,row,'Review after recovery','retry-key')).toThrow('draft is retained');setFailure(false);saveEmployeeInstruction(repository,state,row,'Review after recovery','retry-key');expect(repository.getSnapshot().state.messages).toHaveLength(1);expect(repository.getSnapshot().state.messages[0].sendState).toBe('local_saved');});
});
