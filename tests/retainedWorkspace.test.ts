import {describe,expect,it} from 'vitest';
import type {AccountSnapshot} from '../src/shared/accountAuth.js';
import {retainedWorkspace} from '../src/renderer/auth/retainedWorkspace.js';

const organization={id:'workspace-a',name:'Workspace A',role:'owner' as const};
const state:AccountSnapshot={
 phase:'organization_ready',configured:true,googleEnabled:false,
 user:{id:'user-a',email:'a@example.test'},organizations:[organization],activeOrganization:organization,
 teams:[],invitationPending:false,invitationSendingEnabled:false
};
const meet={type:'MeetGwira' as const,workspaceId:organization.id};
const resolving={type:'ResolvingSession' as const};

describe('retaining Home during access revalidation',()=>{
 it('retains the same workspace during resolution and updates it when setup completes',()=>{
  const previous=retainedWorkspace(null,meet,state);
  expect(previous).not.toBeNull();
  expect(retainedWorkspace(previous,resolving,state)).toBe(previous);
  expect(retainedWorkspace(previous,{type:'WorkspaceReady',workspaceId:organization.id,pendingInvitationCount:0},state)?.ready).toBe(true);
 });
 it.each([
  {...state,user:undefined},
  {...state,user:{id:'user-b',email:'b@example.test'}},
  {...state,activeOrganization:undefined},
  {...state,organizations:[]},
  {...state,phase:'access_revoked' as const},
  {...state,activeOrganization:{...organization,role:'member' as const},organizations:[{...organization,role:'member' as const}]}
 ])('discards the shell when its verified scope changes',changed=>{
  expect(retainedWorkspace(retainedWorkspace(null,meet,state),resolving,changed)).toBeNull();
 });
 it('discards the shell on an access error or another destination',()=>{
  const previous=retainedWorkspace(null,meet,state);
  expect(retainedWorkspace(previous,{type:'AccessError',reason:'membership_revoked',message:'Access revoked'},state)).toBeNull();
  expect(retainedWorkspace(previous,{type:'AuthEntry',reason:'signed_out'},state)).toBeNull();
 });
});
