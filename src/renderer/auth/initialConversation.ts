import type {CloudConversationsApi} from '../../shared/cloudConversations.js';

export type InitialConversationMarker={userId:string;organizationId:string;conversationId?:string;messageId?:string;goal?:string};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseInitialConversation(raw:string|null,userId:string,organizationId:string):InitialConversationMarker|null {
 if(raw===null)return null;
 const value:unknown=JSON.parse(raw);
 if(value===null)return null;
 if(!value||typeof value!=='object'||!('userId'in value)||!('organizationId'in value)||value.userId!==userId||value.organizationId!==organizationId)throw Error('Initial message recovery is invalid.');
 if(!('conversationId'in value)&&!('messageId'in value)&&!('goal'in value))return {userId,organizationId};
 if(!('conversationId'in value)||!uuid(value.conversationId)||!('messageId'in value)||!uuid(value.messageId)||!('goal'in value)||typeof value.goal!=='string'||!value.goal.trim()||value.goal.length>2000)throw Error('Initial message recovery is invalid.');
 return {userId,organizationId,conversationId:value.conversationId,messageId:value.messageId,goal:value.goal};
}

export async function persistInitialConversation(api:CloudConversationsApi,marker:InitialConversationMarker,goal:string):Promise<void> {
 if(!marker.conversationId&&!marker.messageId&&!marker.goal)return;
 if(!marker.conversationId||!marker.messageId||marker.goal!==goal)throw Error('The saved first message does not match.');
 await api.request({type:'create',id:marker.conversationId,title:goal.slice(0,200),visibility:'private'});
 await api.request({type:'send',id:marker.conversationId,messageId:marker.messageId,content:goal});
 await api.request({type:'link_onboarding',id:marker.conversationId,messageId:marker.messageId});
}
