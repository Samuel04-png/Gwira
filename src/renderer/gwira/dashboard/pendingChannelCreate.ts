import type { ChannelRequest } from '../../../shared/cloudChannels.js';

export type PendingChannelCreate = Extract<ChannelRequest, {type: 'create'}>;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parsePendingChannelCreate(raw: string | null): PendingChannelCreate | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !('type' in value) || value.type !== 'create' ||
      !('id' in value) || !uuid(value.id) ||
      !('name' in value) || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80 ||
      !('topic' in value) || typeof value.topic !== 'string' || value.topic.length > 200 ||
      !('visibility' in value) || (value.visibility !== 'org' && value.visibility !== 'private') ||
      !('members' in value) || !Array.isArray(value.members) || value.members.length > 100 || !value.members.every(uuid)) {
    throw new Error('Invalid pending channel creation.');
  }
  return {type: 'create', id: value.id, name: value.name, topic: value.topic, visibility: value.visibility, members: value.members};
}
