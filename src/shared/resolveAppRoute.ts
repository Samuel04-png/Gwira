/** Server facts only. An empty ready result is different from a failed or pending query. */
export type RouteFact<T> = {status:'loading'} | {status:'error';message:string} | {status:'ready';value:T};
export interface RouteMembership {id:string;role:'owner'|'admin'|'member'}
export interface PendingRouteInvitation {id:string;organizationId:string;organizationName:string}
export interface WorkspaceSetupProgress {organizationId:string;creatorUserId:string;step:'invite_team'|'meet_gwira'|'complete'}
export type InvitationIntent = {status:'none'} | {status:'loading'} | {status:'review';organizationName:string} | {status:'mismatch';organizationName:string} | {status:'invalid'} | {status:'error';message:string};
export interface AppRouteInput {
 session:{status:'loading'|'none'|'expired'|'unverified'} | {status:'error';message:string} | {status:'verified';userId:string};
 profile:RouteFact<{complete:boolean}>;
 memberships:RouteFact<readonly RouteMembership[]>;
 pendingInvitations:RouteFact<readonly PendingRouteInvitation[]>;
 setup:RouteFact<readonly WorkspaceSetupProgress[]>;
 invitation:InvitationIntent;
 selectedWorkspaceId?:string;
 lastWorkspaceId?:string;
}
export type AppRoute =
 | {type:'AuthEntry';reason:'signed_out'|'expired'|'unverified'}
 | {type:'ResolvingSession'}
 | {type:'AboutYou'}
 | {type:'InvitationReview';organizationName:string}
 | {type:'InvitationMismatch';organizationName:string}
 | {type:'InvalidInvitation'}
 | {type:'WorkspaceSetup';step:'where_to';invitationIds:readonly string[]}
 | {type:'WorkspaceSetup';step:'invite_team';workspaceId:string}
 | {type:'MeetGwira';workspaceId:string}
 | {type:'WorkspaceReady';workspaceId:string;pendingInvitationCount:number}
 | {type:'WorkspaceHub';reason:'choose'|'last_workspace_revoked'}
 | {type:'AccessError';reason:'backend'|'membership_revoked';message:string};

/** No IO, mutation, time, redirects or membership creation. Order is part of the contract. */
export function resolveAppRoute(input:Readonly<AppRouteInput>):AppRoute {
 if(input.session.status==='error')return {type:'AccessError',reason:'backend',message:input.session.message};
 if(input.session.status==='loading')return {type:'ResolvingSession'};
 if(input.session.status!=='verified')return {type:'AuthEntry',reason:input.session.status==='none'?'signed_out':input.session.status};
 // Failed facts never become zero memberships, even when another fact is still loading.
 for(const fact of [input.profile,input.memberships,input.pendingInvitations]) {
  if(fact.status==='error')return {type:'AccessError',reason:'backend',message:fact.message};
 }
 if(input.profile.status!=='ready'||input.memberships.status!=='ready'||input.pendingInvitations.status!=='ready')return {type:'ResolvingSession'};
 if(!input.profile.value.complete)return {type:'AboutYou'};
 const intent=input.invitation;
 if(intent.status==='loading')return {type:'ResolvingSession'};
 if(intent.status==='error')return {type:'AccessError',reason:'backend',message:intent.message};
 if(intent.status==='invalid')return {type:'InvalidInvitation'};
 if(intent.status==='mismatch')return {type:'InvitationMismatch',organizationName:intent.organizationName};
 if(intent.status==='review')return {type:'InvitationReview',organizationName:intent.organizationName};
 const memberships=input.memberships.value;
 if(input.selectedWorkspaceId&&!memberships.some(m=>m.id===input.selectedWorkspaceId))return {type:'AccessError',reason:'membership_revoked',message:'You no longer have access to that workspace. Choose a workspace you can access.'};
 if(!memberships.length)return {type:'WorkspaceSetup',step:'where_to',invitationIds:input.pendingInvitations.value.map(i=>i.id)};
 const remembered=memberships.find(m=>m.id===input.lastWorkspaceId);
 if(!input.selectedWorkspaceId&&!remembered&&memberships.length>1)return {type:'WorkspaceHub',reason:input.lastWorkspaceId?'last_workspace_revoked':'choose'};
 const selected=memberships.find(m=>m.id===input.selectedWorkspaceId)??remembered??memberships[0];
 if(input.setup.status==='error')return {type:'AccessError',reason:'backend',message:input.setup.message};
 if(input.setup.status!=='ready')return {type:'ResolvingSession'};
 const userId=input.session.userId;
 const setup=input.setup.value.find(s=>s.organizationId===selected.id&&s.creatorUserId===userId);
 if(selected.role==='owner'&&!setup)return {type:'AccessError',reason:'backend',message:'Your workspace setup progress could not be verified. Try again.'};
 if(setup?.step==='invite_team')return {type:'WorkspaceSetup',step:'invite_team',workspaceId:selected.id};
 if(setup?.step==='meet_gwira')return {type:'MeetGwira',workspaceId:selected.id};
 return {type:'WorkspaceReady',workspaceId:selected.id,pendingInvitationCount:input.pendingInvitations.value.length};
}
