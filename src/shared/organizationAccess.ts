/** Hosted access contracts. Distinct from local Person.role and local team membership. */
export type OrganizationRole='owner'|'admin'|'member';
export interface CloudOrganization {id:string;name:string;role:OrganizationRole;}
export interface CloudTeam {id:string;organizationId:string;name:string;}
export interface OrganizationInvitation {id:string;organizationId:string;email:string;role:'admin'|'member';teamIds:string[];invitedBy:string;createdAt:string;expiresAt:string;status:'pending'|'accepted'|'expired'|'revoked';delivery:'queued'|'sent'|'failed';}
export interface OrganizationAccessApi {
 listInvitations(organizationId:string):Promise<OrganizationInvitation[]>;
 invite(input:{organizationId:string;email:string;role:'admin'|'member';teamIds:string[]}):Promise<void>;
 resend(invitationId:string):Promise<void>;
 revoke(invitationId:string):Promise<void>;
}
/** Production stays local until hosted Auth, session bridge and tenant loader exist. */
export const ORGANIZATION_ACCOUNTS_ENABLED=false;
export const ORGANIZATION_ACCOUNTS_DISABLED_REASON='Hosted onboarding, secure account sessions and organization data loading are not configured. Local people and teams remain available.';
