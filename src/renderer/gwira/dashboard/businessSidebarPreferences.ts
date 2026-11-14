export interface BusinessSidebarPreferences {
  pinned: boolean;
  channels: boolean;
  people: boolean;
}

export function parseChannelSidebarPreferences(raw: string | null): {filter: 'all' | 'unread' | 'muted'; sort: 'recent' | 'name'} {
  if (raw === null) return {filter: 'all', sort: 'recent'};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !('filter' in value) || (value.filter !== 'all' && value.filter !== 'unread' && value.filter !== 'muted') ||
      !('sort' in value) || (value.sort !== 'recent' && value.sort !== 'name')) {
    throw new Error('Invalid channel sidebar preferences.');
  }
  return {filter: value.filter, sort: value.sort};
}

export function parseBusinessSidebarPreferences(raw: string | null): BusinessSidebarPreferences {
  if (raw === null) return { pinned: true, channels: true, people: true };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !('pinned' in value) || typeof value.pinned !== 'boolean' ||
      !('channels' in value) || typeof value.channels !== 'boolean' ||
      !('people' in value) || typeof value.people !== 'boolean') {
    throw new Error('Invalid business sidebar preferences.');
  }
  return { pinned: value.pinned, channels: value.channels, people: value.people };
}
