import type {ExpectedWorkspace} from './scopedPreferences.js';

export interface CloudNotification {
 id: string;
 organization_id: string;
 recipient_id: string;
 title: string;
 body: string;
 created_at: string;
 read_at: string | null;
}

export type NotificationRequest = {type:'list'} | {type:'mark_read'; id:string};
export interface CloudNotificationsApi {
 request(input: NotificationRequest, expected: ExpectedWorkspace): Promise<CloudNotification[] | null>;
}
