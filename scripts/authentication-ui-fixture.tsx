import React from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {AccountGate} from '../src/renderer/auth/AccountGate.js';
import type {AccountApi,AccountSnapshot} from '../src/shared/accountAuth.js';
let root:Root;
/** Isolated visual states. Imported by the Electron driver through Vite only. */
export function showAuthenticationFixture(scenario:string):void {
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 const user={id:'fixture-user',email:'alex@example.test'}, organization={id:'fixture-organization',name:'Northstar Studio',role:'owner' as const};
 let state:AccountSnapshot={route:{type:'AuthEntry',reason:'signed_out'},phase:'signed_out',configured:true,googleEnabled:true,organizations:[],teams:[],invitationPending:false,invitationSendingEnabled:false};
 if(scenario==='otp'||scenario==='otp-error'||scenario==='pending')state={...state,phase:'awaiting_verification',email:user.email,resendAt:Date.now()+30000,error:scenario==='otp-error'?'That code is invalid or expired. Check it or request a new code.':undefined};
 if(scenario==='external')state.phase='authenticating_externally';
 if(scenario==='success')state={...state,phase:'authenticated',user};
 if(scenario==='organization')state={...state,phase:'no_organization',user};
 if(scenario==='selection')state={...state,phase:'select_organization',user,organizations:[organization,{id:'second-fixture',name:'Northstar Operations',role:'member'}]};
 if(scenario==='invitation')state={...state,phase:'invitation_pending',user,invitationPending:true,invitation:{organizationName:'Northstar Studio',role:'member',expiresAt:new Date(Date.now()+86400000).toISOString()}};
 if(scenario==='expired')state={...state,phase:'session_expired',error:'Your session expired. Sign in again to continue.'};
 if(scenario==='network')state={...state,phase:'error',error:'Could not reach Gwira. Check your connection and try again.'};
 let listener:(s:AccountSnapshot)=>void=()=>{};
 const api:AccountApi={snapshot:async()=>state,onChange:callback=>{listener=callback;return()=>{};},command:async command=>{
  if(command.type==='cancel')state={...state,phase:'signed_out',error:undefined};
  if(command.type==='google')state={...state,phase:'authenticating_externally'};
  if(command.type==='email')state={...state,phase:'awaiting_verification',email:command.email,resendAt:Date.now()+60000};
  if(command.type==='verify'){await new Promise(r=>setTimeout(r,700));state={...state,error:'That code is invalid or expired. Check it or request a new code.'};}
  if(command.type==='switch')state={...state,phase:'organization_ready',activeOrganization:state.organizations.find(o=>o.id===command.organizationId)};
  listener(state);return state;
 },listInvitations:async()=>[],invite:async()=>{},resendInvitation:async()=>{},revokeInvitation:async()=>{}};
 document.getElementById('root')!.style.display='none';
 const node=document.getElementById('authentication-fixture')??document.body.appendChild(Object.assign(document.createElement('div'),{id:'authentication-fixture'}));
 root??=createRoot(node);root.render(<React.Fragment key={scenario+Date.now()}><AccountGate api={api}><p>Local mode selected in visual fixture</p></AccountGate><div role="note" style={{position:'fixed',top:'var(--gw-space-3)',right:'var(--gw-space-4)',fontSize:'var(--gw-type-caption)',color:'var(--gw-auth-secondary)',maxWidth:'45%',textAlign:'right'}}>Development preview · simulated account · no email sent</div></React.Fragment>);
}
