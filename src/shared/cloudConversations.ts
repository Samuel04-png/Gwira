export interface CloudConversation {
 id:string; organization_id:string; created_by:string; title:string;
 visibility:'private'|'shared'; archived_at:string|null; created_at:string; updated_at:string;
}
export interface CloudMessage {
 id:string; conversation_id:string; author_type:'user'|'rules'|'assistant'; author_id:string|null;
 content:string; created_at:string; status:'saved';
}
export interface ConversationList {conversations:CloudConversation[];pins:string[]}
export interface ConversationActivity {activeConversationIds:string[]}
export interface CloudSidebarProject {id:string;organization_id:string;owner_id:string;name:string;pinned:boolean;created_at:string;updated_at:string}
export interface CloudSidebarSection {id:string;project_id:string;name:string;created_at:string}
export interface CloudSidebarProjectLink {project_id:string;conversation_id:string;section_id:string|null}
export interface CloudSidebarProjects {projects:CloudSidebarProject[];sections:CloudSidebarSection[];links:CloudSidebarProjectLink[]}
export type ConversationRequest =
 | {type:'list'}
 | {type:'activity'}
 | {type:'projects'}
 | {type:'project_change';projectId:string;action:'create'|'rename'|'pin'|'remove'|'section'|'move'|'unlink'|'archive_chats';value?:string;sectionId?:string;conversationId?:string}
 | {type:'messages';id:string}
 | {type:'create';id:string;title:string;visibility:'private'|'shared'}
 | {type:'send';id:string;messageId:string;content:string}
 | {type:'generate';id:string;messageId:string}
 | {type:'save_plan';id:string;messageId:string;expectedVersion:number|null}
 | {type:'update';id:string;action:'rename'|'archive'|'unarchive'|'delete';value?:string}
 | {type:'pin';id:string;pinned:boolean}
 | {type:'plan';id:string}
 | {type:'link_onboarding';id:string;messageId:string}
 | {type:'onboarding'};
export type ConversationResult = ConversationList | ConversationActivity | CloudSidebarProjects | CloudMessage[] | {plan:PlanRecord|null} | {status:'generating'|'completed'|'failed'} | string | null;
export interface CloudConversationsApi {request(input:ConversationRequest, expected?:import('./scopedPreferences.js').ExpectedWorkspace):Promise<ConversationResult>}
import type {PlanRecord} from './accountAuth.js';
