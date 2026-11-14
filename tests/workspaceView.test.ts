import {describe,expect,it} from 'vitest';
import {workspaceView} from '../src/renderer/auth/workspaceView.js';
import type {AccountSnapshot} from '../src/shared/accountAuth.js';

const organization={id:'a',name:'A',role:'owner'} as const;
const state:AccountSnapshot={phase:'organization_ready',configured:true,googleEnabled:false,user:{id:'u',email:'u@example.test'},organizations:[organization],activeOrganization:organization,teams:[{id:'one',organizationId:'a',name:'One'},{id:'other',organizationId:'b',name:'Other'}],invitationPending:false,invitationSendingEnabled:false};

describe('authorized workspace view',()=>{
 it('shows only teams belonging to the active authorized workspace',()=>expect(workspaceView(state,'a')?.teams.map(team=>team.name)).toEqual(['One']));
 it('does not show data for a different destination, signed out user, or missing membership',()=>{
  expect(workspaceView(state,'b')).toBeUndefined();
  expect(workspaceView({...state,user:undefined},'a')).toBeUndefined();
  expect(workspaceView({...state,organizations:[]},'a')).toBeUndefined();
  expect(workspaceView({...state,organizations:[{...organization,role:'member'}]},'a')).toBeUndefined();
 });
});
