import type { ExpectedWorkspace } from './scopedPreferences.js';

export interface CloudChannel {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  topic: string;
  visibility: 'org' | 'private';
  created_at: string;
  updated_at: string;
  is_member: boolean;
  muted: boolean;
  unread: number;
  member_count: number;
}

export interface CloudChannelMessage {
  id: string;
  organization_id: string;
  channel_id: string;
  seq: number;
  author_id: string;
  body: string;
  created_at: string;
}

export type ChannelRequest =
  | { type: 'list' }
  | { type: 'messages'; id: string }
  | { type: 'create'; id: string; name: string; topic: string; visibility: 'org' | 'private'; members: string[] }
  | { type: 'join'; id: string }
  | { type: 'send'; id: string; messageId: string; body: string }
  | { type: 'read'; id: string; seq: number }
  | { type: 'preference'; id: string; muted?: boolean; markRead?: boolean };

export type ChannelResult = CloudChannel[] | CloudChannelMessage[] | string | null;
export interface CloudChannelsApi {
  request(input: { type: 'list' }, expected: ExpectedWorkspace): Promise<CloudChannel[]>;
  request(input: { type: 'messages'; id: string }, expected: ExpectedWorkspace): Promise<CloudChannelMessage[]>;
  request(input: Extract<ChannelRequest, { type: 'create' | 'send' }>, expected: ExpectedWorkspace): Promise<string>;
  request(input: Extract<ChannelRequest, { type: 'join' | 'read' | 'preference' }>, expected: ExpectedWorkspace): Promise<null>;
}
