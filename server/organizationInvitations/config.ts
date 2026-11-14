import {InvitationService,ResendMailTransport,acceptanceUrl} from './service.js';
import {SupabaseInvitationGateway} from './supabaseGateway.js';
/** Server startup boundary. Disabled by default, and no networking on inspection. */
export function invitationConfiguration(env:Readonly<Record<string,string|undefined>>):{enabled:false;missing:string[]}|{enabled:true;create:()=>InvitationService}{
 if(env.GWIRA_EXTERNAL_INVITATIONS_ENABLED!=='true')return {enabled:false,missing:['External invitation sending is disabled.']};
 const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','GWIRA_INVITATION_ACCEPTANCE_URL','RESEND_API_KEY','GWIRA_EMAIL_FROM'] as const;
 const missing=names.filter(name=>!env[name]);if(missing.length)return {enabled:false,missing};
 try{acceptanceUrl(env.GWIRA_INVITATION_ACCEPTANCE_URL!,'A'.repeat(43));}catch{return {enabled:false,missing:['A trusted HTTPS acceptance page without query/fragment is required.']};}
 return {enabled:true,create:()=>new InvitationService(new SupabaseInvitationGateway(env.SUPABASE_URL!,env.SUPABASE_PUBLISHABLE_KEY!,env.SUPABASE_SERVICE_ROLE_KEY!),new ResendMailTransport(env.RESEND_API_KEY!,env.GWIRA_EMAIL_FROM!),{externalSendingEnabled:true,acceptancePageUrl:env.GWIRA_INVITATION_ACCEPTANCE_URL!})};
}
