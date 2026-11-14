import type {ExpectedWorkspace} from './scopedPreferences.js';

export interface CloudApprovalTask {
 id:string; organization_id:string; created_by:string; reviewer_id:string;
 title:string; status:'in_progress'|'in_review'|'done'; created_at:string; updated_at:string;
}
export interface CloudApprovalResult {
 id:string; organization_id:string; task_id:string; submitted_by:string; result_text:string;
 status:'pending'|'approved'|'changes_requested'; submitted_at:string; decided_at:string|null; decided_by:string|null;
}
export type ApprovalRequest = {type:'list'} | {type:'decide';id:string;decision:'approved'|'changes_requested'};
export type ApprovalResponse = {tasks:CloudApprovalTask[];results:CloudApprovalResult[]} | null;
export interface CloudApprovalsApi {request(input:ApprovalRequest,expected:ExpectedWorkspace):Promise<ApprovalResponse>}
