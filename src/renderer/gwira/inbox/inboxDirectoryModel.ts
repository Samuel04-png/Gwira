import type { ConversationListItem, ParticipantView } from '../messaging/domain/selectors.js';
import { filterConversations, navSectionOf, type NavSectionId } from './inboxNavModel.js';
export const DIRECTORY_SECTIONS = [
  { id: 'channels', label: 'Channels', empty: 'No channels yet.' },
  { id: 'group', label: 'Group chats', empty: 'No group chats yet.' },
  { id: 'dm', label: 'Direct messages', empty: 'No conversations yet.' },
  { id: 'doat', label: 'Daots', empty: 'No Daots added.' }
] as const;
export interface DirectoryPreferences {
  collapsed: string[]; pins: string[]; hidden: string[];
  sort: Partial<Record<NavSectionId, 'recent' | 'alphabetical'>>;
  unreadOnly: string[]; hideMuted: string[];
}
export const emptyDirectoryPreferences = (): DirectoryPreferences => ({ collapsed: [], pins: [], hidden: [], sort: {}, unreadOnly: [], hideMuted: [] });
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'))] : [];
export function restoreDirectoryPreferences(raw: string | null): DirectoryPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyDirectoryPreferences();
    const v = value as Record<string, unknown>, sort: DirectoryPreferences['sort'] = {};
    for (const { id } of DIRECTORY_SECTIONS) {
      const mode = v.sort && typeof v.sort === 'object' ? (v.sort as Record<string, unknown>)[id] : undefined;
      if (mode === 'recent' || mode === 'alphabetical') sort[id] = mode;
    }
    return { collapsed: strings(v.collapsed), pins: strings(v.pins), hidden: strings(v.hidden), sort, unreadOnly: strings(v.unreadOnly), hideMuted: strings(v.hideMuted) };
  } catch { return emptyDirectoryPreferences(); }
}
export function directoryPreferenceKey(scope: string): string { return `gwira.inbox.directory.v1:${scope}`; }
export function toggleDirectoryValue(values: string[], id: string): string[] { return values.includes(id) ? values.filter(v => v !== id) : [...values, id]; }
export function directoryItems(items: readonly ConversationListItem[], section: NavSectionId, prefs: DirectoryPreferences, selectedId?: string, muted: ReadonlySet<string> = new Set()): ConversationListItem[] {
  return items.filter(item => navSectionOf(item) === section && ((!item.conversation.archivedAt && !prefs.hidden.includes(item.conversation.id) && (!prefs.unreadOnly.includes(section) || item.unread > 0) && (!prefs.hideMuted.includes(section) || !muted.has(item.conversation.id))) || item.conversation.id === selectedId))
    .sort((a,b) => prefs.sort[section] === 'alphabetical' ? a.title.localeCompare(b.title) || a.conversation.id.localeCompare(b.conversation.id) : b.sortAt.localeCompare(a.sortAt) || a.conversation.id.localeCompare(b.conversation.id));
}
export interface DirectorySearchHit { id: string; label: string; category: string; conversation?: ConversationListItem; participant?: ParticipantView }
/** Input conversations are already authorized by selectConversationList. Never search raw records. */
export function searchDirectory(conversations: readonly ConversationListItem[], participants: readonly ParticipantView[], query: string, actorId?: string | null): DirectorySearchHit[] {
  if (!query.trim()) return [];
  const words = query.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().split(/\s+/);
  const matches = (value: string): boolean => words.every(word => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(word));
  const hits: DirectorySearchHit[] = filterConversations(conversations.filter(c => !c.conversation.archivedAt), query).map(c => ({ id: c.conversation.id, label: c.title, category: DIRECTORY_SECTIONS.find(s => s.id === navSectionOf(c))!.label, conversation: c }));
  const existing = new Set(conversations.filter(c => c.conversation.kind === 'dm' && !c.conversation.archivedAt).flatMap(c => c.members.map(m => `${m.ref.kind}:${m.ref.id}`)));
  for (const p of participants) if (p.available && p.ref.kind !== 'system' && !(p.ref.kind === 'human' && p.ref.id === actorId) && !existing.has(`${p.ref.kind}:${p.ref.id}`) && matches(`${p.name} ${p.ref.id} ${p.role ?? ''}`)) hits.push({ id: `${p.ref.kind}:${p.ref.id}`, label: p.name, category: p.ref.kind === 'doat' ? 'Daots' : 'Employees', participant: p });
  // Put categories containing a direct name match ahead of incidental member/identifier matches.
  const rank = (hit: DirectorySearchHit): number => matches(hit.label) ? 0 : 1;
  const categoryRanks = new Map<string, number>();
  for (const hit of hits) categoryRanks.set(hit.category, Math.min(categoryRanks.get(hit.category) ?? 1, rank(hit)));
  return hits.sort((a,b) => (categoryRanks.get(a.category)! - categoryRanks.get(b.category)!) || a.category.localeCompare(b.category) || rank(a)-rank(b) || a.label.localeCompare(b.label)).slice(0,100);
}
