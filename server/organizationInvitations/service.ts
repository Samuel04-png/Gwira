import {createHash,randomBytes} from 'node:crypto';
export type InviteRole='admin'|'member';
export interface Invitation {id:string;organization_id:string;organization_name:string;email:string;assigned_role:InviteRole;expires_at:string;generation:number;}
export interface InvitationGateway {
 verifyUser(bearer:string):Promise<{id:string;verified:boolean}>;
 create(actorId:string,input:{organizationId:string;email:string;role:InviteRole;teamIds:string[]},digest:string):Promise<Invitation>;
 resend(actorId:string,id:string,digest:string):Promise<Invitation>;
 delivery(id:string,generation:number,sent:boolean):Promise<void>;
 preview(digest:string):Promise<{organization_name:string;assigned_role:InviteRole;status:string;expires_at:string}|null>;
 accept(bearer:string,digest:string):Promise<string>;
 revoke(bearer:string,id:string):Promise<void>;
}
export interface Mail {to:string;subject:string;html:string;text:string;idempotencyKey:string;}
export interface MailTransport {send(mail:Mail):Promise<void>;}
export class AccessError extends Error {constructor(readonly code:string,message:string){super(message);this.name='AccessError';}}
export function emailAddress(value:string):string {const email=value.trim().toLowerCase();if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n]/.test(value))throw new AccessError('invalid_email','Enter a valid email address.');return email;}
const uuid=(value:string):boolean=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function tokenDigest(token:string):string {if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AccessError('invalid_invitation','This invitation is invalid. Ask an organization admin for a new invitation.');return createHash('sha256').update(token,'utf8').digest('hex');}
export function acceptanceUrl(configuredUrl:string,token:string):string {const url=new URL(configuredUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new AccessError('configuration_required','A trusted HTTPS invitation page must be configured.');tokenDigest(token);url.hash=new URLSearchParams({token}).toString();return url.href;}
const escape=(value:string):string=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function invitationMail(invitation:Invitation,url:string):Mail {
 const expiry=new Date(invitation.expires_at).toISOString().replace('T',' ').replace('.000Z',' UTC');
 const intro=`You've been invited to join ${invitation.organization_name} on Gwira.`;
 const text=`Hello,\n\n${intro}\n\nGwira helps teams coordinate work, manage tasks, and collaborate with AI agents.\n\nAccept invitation: ${url}\n\nThis invitation expires on ${expiry}.\n\nIf you weren't expecting this invitation, you can ignore this email.\n\nGwira Team`;
 return {to:invitation.email,subject:`You're invited to join ${invitation.organization_name.replace(/[\r\n]/g,' ')} on Gwira`,text,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main style="max-width:560px;margin:auto;padding:24px;font-family:Arial,sans-serif;line-height:1.6"><h1>Gwira</h1><p>Hello,</p><p>${escape(intro)}</p><p>Gwira helps teams coordinate work, manage tasks, and collaborate with AI agents.</p><p><a href="${escape(url)}">Accept invitation</a></p><p>This invitation expires on ${escape(expiry)}.</p><p>If you weren't expecting this invitation, you can ignore this email.</p><p>Gwira Team</p></main></body></html>`,idempotencyKey:`gwira-invitation-${invitation.id}-${invitation.generation}`};
}
/** Trusted server only. Never instantiate with a renderer-provided actor or email provider key. */
export class InvitationService {
 constructor(private readonly gateway:InvitationGateway,private readonly transport:MailTransport,private readonly config:{externalSendingEnabled:boolean;acceptancePageUrl?:string}){}
 private async actor(bearer:string):Promise<string>{if(!bearer||bearer.length>8192)throw new AccessError('sign_in_required','Sign in to continue.');const user=await this.gateway.verifyUser(bearer);if(!user.verified)throw new AccessError('verification_required','Verify your email before continuing.');return user.id;}
 private configuredPage():string {if(!this.config.externalSendingEnabled||!this.config.acceptancePageUrl)throw new AccessError('configuration_required','Invitations are disabled until HTTPS onboarding and verified email delivery are configured.');acceptanceUrl(this.config.acceptancePageUrl,'A'.repeat(43));return this.config.acceptancePageUrl;}
 private async send(invitation:Invitation,raw:string,page:string):Promise<{id:string;delivery:'sent'}>{try{await this.transport.send(invitationMail(invitation,acceptanceUrl(page,raw)));}catch{await this.gateway.delivery(invitation.id,invitation.generation,false);throw new AccessError('delivery_failed','Delivery could not be confirmed. The invitation is saved; retry through Resend after checking delivery configuration.');}await this.gateway.delivery(invitation.id,invitation.generation,true);return {id:invitation.id,delivery:'sent'};}
 async invite(bearer:string,input:{organizationId:string;email:string;role:InviteRole;teamIds:string[]}):Promise<{id:string;delivery:'sent'}>{const page=this.configuredPage();const actor=await this.actor(bearer);if(!uuid(input.organizationId)||!Array.isArray(input.teamIds)||input.teamIds.length>20||input.teamIds.some(id=>!uuid(id)))throw new AccessError('invalid_team','Choose teams from this organization.');if(!['admin','member'].includes(input.role))throw new AccessError('invalid_role','Choose a supported organization role.');const raw=randomBytes(32).toString('base64url');const invitation=await this.gateway.create(actor,{...input,email:emailAddress(input.email),teamIds:[...new Set(input.teamIds)]},tokenDigest(raw));return this.send(invitation,raw,page);}
 async resend(bearer:string,id:string):Promise<{id:string;delivery:'sent'}>{const page=this.configuredPage(),actor=await this.actor(bearer);if(!uuid(id))throw new AccessError('invalid_invitation','Choose a valid invitation.');const raw=randomBytes(32).toString('base64url');return this.send(await this.gateway.resend(actor,id,tokenDigest(raw)),raw,page);}
 async preview(raw:string):ReturnType<InvitationGateway['preview']>{return this.gateway.preview(tokenDigest(raw));}
 async accept(bearer:string,raw:string):Promise<string>{await this.actor(bearer);return this.gateway.accept(bearer,tokenDigest(raw));}
 async revoke(bearer:string,id:string):Promise<void>{await this.actor(bearer);if(!uuid(id))throw new AccessError('invalid_invitation','Choose a valid invitation.');await this.gateway.revoke(bearer,id);}
}
/** One provider, native server fetch. Not bundled into Electron or invoked in tests. */
export class ResendMailTransport implements MailTransport {
 constructor(private readonly key:string,private readonly from:string,private readonly request:typeof fetch=fetch) {if(!key||!from||/[\r\n]/.test(from))throw new AccessError('configuration_required','Configure verified email sending credentials on the server.');}
 async send(mail:Mail):Promise<void>{const response=await this.request('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json','Idempotency-Key':mail.idempotencyKey},body:JSON.stringify({from:this.from,to:[mail.to],subject:mail.subject,html:mail.html,text:mail.text}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new AccessError('delivery_failed','Email provider did not confirm delivery.');}
}
