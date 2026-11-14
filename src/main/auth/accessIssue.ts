import {AccountError} from './gateway.js';
import type {AccessIssue} from '../../shared/accountAuth.js';

export interface ClassifiedFailure {issue:AccessIssue;message:string}
const messages:Record<AccessIssue,string>={
 network:'Gwira couldn’t reach its servers. Check your internet connection, then try again.',
 session_expired:'Your session has expired or was ended. Sign in again to continue.',
 setup_unavailable:'Account setup isn’t available on this server yet. Your account is safe and nothing was changed. Try again later or contact Gwira support.',
 access_denied:'Your account doesn’t have permission to open this workspace. Ask a workspace owner to check your access.',
 backend:'Your workspace could not be opened right now. Try again in a moment.'
};
/** Backend contracts missing from the project (table, function or schema not exposed). */
const missingContract=new Set(['PGRST205','PGRST202','PGRST106','42P01','42883','3F000']);

export function classifyFailure(error:unknown):ClassifiedFailure {
 const code=error instanceof AccountError?error.code:'';
 const issue:AccessIssue=code==='network'?'network':code==='session_expired'?'session_expired':code==='setup_unavailable'?'setup_unavailable':code==='access_denied'?'access_denied':'backend';
 return {issue,message:messages[issue]};
}
export function isMissingContract(code:string):boolean{return missingContract.has(code);}

/** Redacted development diagnostics: stage, status class and bounded provider code only. Never bodies, tokens or emails. */
export function logRoutingFailure(stage:string,error:unknown):void {
 const code=error instanceof AccountError?error.code:'unclassified';
 console.warn('Gwira route resolution failed',JSON.stringify({stage,code,issue:classifyFailure(error).issue}));
}
