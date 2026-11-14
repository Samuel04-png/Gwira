import {describe,it,expect} from 'vitest';
import {resolveAppRoute,type AppRouteInput,type RouteFact} from '../src/shared/resolveAppRoute.js';
import {AccountRoutingCoordinator} from '../src/main/auth/routingCoordinator.js';
const ready=<T>(value:T):RouteFact<T>=>({status:'ready',value});
const base=():AppRouteInput=>({session:{status:'verified',userId:'user'},profile:ready({complete:true}),memberships:ready([{id:'a',role:'member'}]),pendingInvitations:ready([]),setup:ready([]),invitation:{status:'none'}});
describe('central route decision table — controlled server facts',()=>{
 it.each([
  ['unresolved session',{session:{status:'loading'}},'ResolvingSession'],
  ['signed out',{session:{status:'none'}},'AuthEntry'],
  ['expired session',{session:{status:'expired'}},'AuthEntry'],
  ['unverified identity',{session:{status:'unverified'}},'AuthEntry'],
  ['new account missing name',{profile:ready({complete:false}),memberships:ready([])},'AboutYou'],
  ['new account without workspace',{memberships:ready([])},'WorkspaceSetup'],
  ['owner at team step',{memberships:ready([{id:'a',role:'owner'}]),setup:ready([{organizationId:'a',creatorUserId:'user',step:'invite_team'}])},'WorkspaceSetup'],
  ['owner at Meet Gwira',{memberships:ready([{id:'a',role:'owner'}]),setup:ready([{organizationId:'a',creatorUserId:'user',step:'meet_gwira'}])},'MeetGwira'],
  ['completed owner',{memberships:ready([{id:'a',role:'owner'}]),setup:ready([{organizationId:'a',creatorUserId:'user',step:'complete'}])},'WorkspaceReady'],
  ['missing owner progress is unknown',{memberships:ready([{id:'a',role:'owner'}])},'AccessError'],
  ['invited new user',{memberships:ready([]),invitation:{status:'review',organizationName:'B'}},'InvitationReview'],
  ['invited existing user',{lastWorkspaceId:'a',invitation:{status:'review',organizationName:'B'}},'InvitationReview'],
  ['wrong email with membership',{invitation:{status:'mismatch',organizationName:'B'}},'InvitationMismatch'],
  ['used or expired invitation',{invitation:{status:'invalid'}},'InvalidInvitation'],
  ['invitation verification pending',{invitation:{status:'loading'}},'ResolvingSession'],
  ['invitation network failure',{invitation:{status:'error',message:'offline'}},'AccessError'],
  ['returning user',{lastWorkspaceId:'a'},'WorkspaceReady'],
  ['several, last authorized',{memberships:ready([{id:'a',role:'member'},{id:'b',role:'member'}]),lastWorkspaceId:'b'},'WorkspaceReady'],
  ['several, no preference',{memberships:ready([{id:'a',role:'member'},{id:'b',role:'member'}])},'WorkspaceHub'],
  ['several, revoked preference',{memberships:ready([{id:'a',role:'member'},{id:'b',role:'member'}]),lastWorkspaceId:'removed'},'WorkspaceHub'],
  ['revoked explicit selection',{selectedWorkspaceId:'removed'},'AccessError'],
  ['backend unavailable',{memberships:{status:'error',message:'offline'}},'AccessError'],
  ['memberships not verified',{memberships:{status:'loading'}},'ResolvingSession'],
  ['pending invitations loading',{pendingInvitations:{status:'loading'}},'ResolvingSession'],
  ['setup loading',{setup:{status:'loading'}},'ResolvingSession'],
  ['setup unavailable',{setup:{status:'error',message:'offline'}},'AccessError'],
  ['identity lookup failed',{session:{status:'error',message:'offline'}},'AccessError'],
 ] as Array<[string,Partial<AppRouteInput>,string]>)('%s',(_,patch,type)=>expect(resolveAppRoute({...base(),...patch}).type).toBe(type));
 it('pending invitations without a link do not hijack returning users',()=>{
  const input={...base(),pendingInvitations:ready([{id:'i',organizationId:'b',organizationName:'B'}])};
  expect(resolveAppRoute(input)).toEqual({type:'WorkspaceReady',workspaceId:'a',pendingInvitationCount:1});
  expect(resolveAppRoute({...input,memberships:ready([])})).toEqual({type:'WorkspaceSetup',step:'where_to',invitationIds:['i']});
 });
 it('profile completion retains explicit intent and then review takes priority over last workspace',()=>{
  const input:AppRouteInput={...base(),profile:ready({complete:false}),lastWorkspaceId:'a',invitation:{status:'review',organizationName:'B'}};
  expect(resolveAppRoute(input).type).toBe('AboutYou');expect(input.invitation.status).toBe('review');
  expect(resolveAppRoute({...input,profile:ready({complete:true})}).type).toBe('InvitationReview');
 });
 it('scopes setup to workspace and creator, not every member',()=>{
  const input:AppRouteInput={...base(),setup:ready([{organizationId:'a',creatorUserId:'other',step:'meet_gwira'},{organizationId:'b',creatorUserId:'user',step:'meet_gwira'}])};
  expect(resolveAppRoute(input).type).toBe('WorkspaceReady');
 });
 it('does not mutate inputs or execute effects on repeated resolutions',()=>{
  const input=base(),copy=structuredClone(input);Object.freeze(input);const first=resolveAppRoute(input);
  expect(resolveAppRoute(input)).toEqual(first);expect(input).toEqual(copy);
 });
 it('an invalid link can be dismissed and resolve normally without a redirect loop',()=>{
  expect(resolveAppRoute({...base(),invitation:{status:'invalid'}}).type).toBe('InvalidInvitation');
  expect(resolveAppRoute(base()).type).toBe('WorkspaceReady');
 });
 it('errors take precedence over loading; no-workspace is only a successful empty result',()=>{
  expect(resolveAppRoute({...base(),profile:{status:'loading'},memberships:{status:'error',message:'offline'}}).type).toBe('AccessError');
  expect(resolveAppRoute({...base(),memberships:ready([])}).type).toBe('WorkspaceSetup');
 });
});
describe('main route coordinator',()=>{
 const facts={profileComplete:true,pendingInvitations:[],setup:[]};
 it('publishes loading then a destination and never creates a workspace or accepts an invitation',async()=>{
  const routes:string[]=[];const c=new AccountRoutingCoordinator(()=>routes.push(c.destination().type));c.intent({status:'review',organizationName:'B'});
  await c.resolve('user',[{id:'a',role:'member'}],async()=>facts,'a');
  expect(routes).toEqual(['ResolvingSession','InvitationReview']);
 });
 it('holds on unavailable bootstrap data instead of inferring zero workspaces',async()=>{
  const c=new AccountRoutingCoordinator(()=>{});await c.resolve('user',[],async()=>{throw Error('Missing profile table')});expect(c.destination().type).toBe('AccessError');
 });
 it('discards late backend results after sign-out or expiry',async()=>{
  let finish!:(value:typeof facts)=>void;const c=new AccountRoutingCoordinator(()=>{});
  const load=c.resolve('user',[{id:'a',role:'member'}],()=>new Promise(resolve=>finish=resolve));
  c.session('expired');finish(facts);await load;expect(c.destination()).toEqual({type:'AuthEntry',reason:'expired'});
 });
 it('discards an earlier identity snapshot when a new account resolves',async()=>{
  let finish!:(value:typeof facts)=>void;const c=new AccountRoutingCoordinator(()=>{});
  const old=c.resolve('old',[{id:'a',role:'member'}],()=>new Promise(resolve=>finish=resolve));
  await c.resolve('new',[{id:'b',role:'member'}],async()=>facts);finish(facts);await old;
  expect(c.destination()).toEqual({type:'WorkspaceReady',workspaceId:'b',pendingInvitationCount:0});
 });
});
