import {resolveAppRoute,type AppRoute,type AppRouteInput,type InvitationIntent,type RouteMembership,type PendingRouteInvitation,type WorkspaceSetupProgress} from '../../shared/resolveAppRoute.js';
export interface AccountRoutingFacts {profileComplete:boolean;pendingInvitations:PendingRouteInvitation[];setup:WorkspaceSetupProgress[]}
import {classifyFailure,logRoutingFailure} from './accessIssue.js';
import type {AccessIssue} from '../../shared/accountAuth.js';
const pending=()=>({status:'loading'} as const);
/** The existing auth controller supplies verified identity/membership, never renderer flags. */
export class AccountRoutingCoordinator {
 private generation=0;
 private input:AppRouteInput={session:{status:'loading'},profile:pending(),memberships:pending(),pendingInvitations:pending(),setup:pending(),invitation:{status:'none'}};
 issue?:AccessIssue;
 constructor(private readonly publish:()=>void){}
 pendingInvitations():Array<{id:string;organizationName:string}>{return this.input.pendingInvitations.status==='ready'?this.input.pendingInvitations.value.map(i=>({id:i.id,organizationName:i.organizationName})):[];}
 destination():AppRoute{return resolveAppRoute(this.input);}
 session(status:'loading'|'none'|'expired'|'unverified'):void {
  this.generation++;this.issue=undefined;
  this.input={...this.input,session:{status},profile:pending(),memberships:pending(),pendingInvitations:pending(),setup:pending(),selectedWorkspaceId:undefined,lastWorkspaceId:undefined};
 }
 intent(invitation:InvitationIntent):void{this.input={...this.input,invitation};}
 fail(message:string,issue:AccessIssue='backend'):void{this.generation++;this.issue=issue;this.input={...this.input,session:{status:'error',message},profile:{status:'error',message}};}
 async resolve(userId:string,memberships:RouteMembership[],loader:()=>Promise<AccountRoutingFacts>,lastWorkspaceId?:string,selectedWorkspaceId?:string):Promise<void> {
  const generation=++this.generation;
  this.input={...this.input,session:{status:'verified',userId},profile:pending(),memberships:{status:'ready',value:memberships},pendingInvitations:pending(),setup:pending(),lastWorkspaceId,selectedWorkspaceId};this.publish();
  try{const facts=await loader();if(generation!==this.generation)return;
   this.input={...this.input,profile:{status:'ready',value:{complete:facts.profileComplete}},pendingInvitations:{status:'ready',value:facts.pendingInvitations},setup:{status:'ready',value:facts.setup}};
  }catch(error){if(generation!==this.generation)return;logRoutingFailure((error as {stage?:string}).stage??'routing_facts',error);const failure=classifyFailure(error);this.issue=failure.issue;this.input={...this.input,session:{status:'error',message:failure.message},profile:{status:'error',message:failure.message}};}
  this.publish();
 }
 dispose():void{this.generation++;}
}
