import React from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {AccountGate} from '../src/renderer/auth/AccountGate.js';
import {resolveAppRoute,type AppRouteInput} from '../src/shared/resolveAppRoute.js';
import type {AccountApi,AccountSnapshot} from '../src/shared/accountAuth.js';
let root:Root;
export function showRoutingFixture(scenario:string):void {
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 let facts:AppRouteInput={session:{status:'verified',userId:'fixture-user'},profile:{status:'ready',value:{complete:true}},memberships:{status:'ready',value:[{id:'fixture-workspace',role:'member'}]},pendingInvitations:{status:'ready',value:[]},setup:{status:'ready',value:[]},invitation:{status:'none'}};
 if(scenario==='initial')facts.session={status:'loading'};
 if(scenario==='new-account')facts.profile={status:'ready',value:{complete:false}};
 if(scenario==='no-workspace')facts.memberships={status:'ready',value:[]};
 if(scenario==='owner')facts.setup={status:'ready',value:[{organizationId:'fixture-workspace',creatorUserId:'fixture-user',step:'invite_team'}]};
 if(scenario==='meet')facts.setup={status:'ready',value:[{organizationId:'fixture-workspace',creatorUserId:'fixture-user',step:'meet_gwira'}]};
 if(scenario==='invited-new'){facts.memberships={status:'ready',value:[]};facts.invitation={status:'review',organizationName:'Invited test workspace'};}
 if(scenario==='invited-existing')facts.invitation={status:'review',organizationName:'Invited test workspace'};
 if(scenario==='mismatch')facts.invitation={status:'mismatch',organizationName:'Invited test workspace'};
 if(scenario==='invalid')facts.invitation={status:'invalid'};
 if(scenario==='multiple')facts.memberships={status:'ready',value:[{id:'fixture-workspace',role:'member'},{id:'second-fixture',role:'member'}]};
 if(scenario==='expired')facts.session={status:'expired'};
 if(scenario==='revoked')facts.selectedWorkspaceId='removed-fixture';
 if(scenario==='backend')facts.memberships={status:'error',message:'Your workspace access could not be checked. Try again.'};
 if(scenario==='pending') {facts.memberships={status:'ready',value:[]};facts.pendingInvitations={status:'ready',value:[{id:'fixture-invite',organizationId:'second-fixture',organizationName:'Invited test workspace'}]};}
 let listener:(s:AccountSnapshot)=>void=()=>{};
 const snapshot=():AccountSnapshot=>{
  const route=resolveAppRoute(facts);
  const organizations=facts.memberships.status==='ready'?facts.memberships.value.map(member=>({...member,name:member.id==='second-fixture'?'Second workspace':'First workspace'})):[];
  const activeOrganization=route.type==='WorkspaceReady'?organizations.find(org=>org.id===route.workspaceId):undefined;
  return {phase:facts.session.status==='none'?'signed_out':facts.session.status==='expired'?'session_expired':facts.session.status==='loading'?'initializing':'organization_ready',route,configured:true,googleEnabled:true,user:['none','expired','loading'].includes(facts.session.status)?undefined:{id:'fixture-user',email:'alex@example.test'},organizations,activeOrganization,teams:[],invitationPending:facts.invitation.status!=='none',invitationSendingEnabled:false};
 };
 const api:AccountApi={snapshot:async()=>snapshot(),onChange:fn=>{listener=fn;return()=>{};},command:async command=>{
  if(command.type==='sign_out'||command.type==='cancel')facts.session={status:'none'};
  if(command.type==='dismiss_invitation')facts.invitation={status:'none'};
  if(command.type==='accept_invitation'){facts.invitation={status:'none'};facts.memberships={status:'ready',value:[{id:'second-fixture',role:'member'}]};facts.selectedWorkspaceId='second-fixture';}
  if(command.type==='switch')facts.selectedWorkspaceId=command.organizationId;
  if(command.type==='refresh'){facts.session={status:'loading'};listener(snapshot());await new Promise(r=>setTimeout(r,150));facts.session={status:'verified',userId:'fixture-user'};facts.memberships={status:'ready',value:[{id:'fixture-workspace',role:'member'}]};}
  const next=snapshot();listener(next);return next;
 },listInvitations:async()=>[],invite:async()=>{},resendInvitation:async()=>{},revokeInvitation:async()=>{}};
 document.getElementById('root')!.style.display='none';const node=document.getElementById('routing-fixture')??document.body.appendChild(Object.assign(document.createElement('div'),{id:'routing-fixture'}));
 root??=createRoot(node);root.render(<React.Fragment key={scenario+Date.now()}><AccountGate api={api}><div id="forbidden-local-home">Local Home must never mount for cloud routes</div></AccountGate><p role="note" style={{position:'fixed',right:'var(--gw-space-4)',top:0,fontSize:'var(--gw-type-caption)'}}>Routing fixture · simulated server facts</p></React.Fragment>);
}
