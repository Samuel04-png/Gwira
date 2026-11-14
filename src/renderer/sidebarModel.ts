/** Sidebar-only preferences. These never mutate project or conversation records. */
export type SidebarSort = 'updated' | 'created' | 'name' | 'manual';
export type SidebarSection = 'favorites' | 'projects' | 'recent';
export interface SidebarPreferences {
  pinnedSort: 'updated' | 'manual'; projectSort: SidebarSort; recentSort: SidebarSort;
  projectGrouping: 'project' | 'list'; recentGrouping: 'project' | 'list';
  visible: Record<SidebarSection, boolean>;
}
export function readSidebarPreferences(raw: unknown): SidebarPreferences {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const sort = (key: string): SidebarSort => ['created', 'name', 'manual'].includes(String(value[key])) ? value[key] as SidebarSort : 'updated';
  const visible = value.visible && typeof value.visible === 'object' ? value.visible as Record<string, unknown> : {};
  // Keep at least one section visible, so its menu can restore hidden sections.
  const sections = { favorites: visible.favorites !== false, projects: visible.projects !== false, recent: visible.recent !== false };
  if (!Object.values(sections).some(Boolean)) sections.projects = true;
  return { pinnedSort: value.pinnedSort === 'manual' ? 'manual' : 'updated', projectSort: sort('projectSort'), recentSort: sort('recentSort'), projectGrouping: value.projectGrouping === 'list' ? 'list' : 'project', recentGrouping: value.recentGrouping === 'project' ? 'project' : 'list', visible: sections };
}
export function orderSidebarItems<T extends { key: string; title: string; updatedAt: string; createdAt?: string }>(items: T[], sort: SidebarSort, saved: string[] = []): T[] {
  const rank = new Map(saved.map((key, index) => [key, index]));
  const time = (item: T) => Date.parse(sort === 'created' ? item.createdAt ?? item.updatedAt : item.updatedAt) || 0;
  return [...items].sort((a,b) => sort === 'manual' ? (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) || a.key.localeCompare(b.key) : sort === 'name' ? a.title.localeCompare(b.title) || a.key.localeCompare(b.key) : time(b) - time(a) || a.key.localeCompare(b.key));
}
export function moveSidebarItem(saved: string[], keys: string[], moving: string, target: string): string[] {
  if (moving === target || !keys.includes(moving) || !keys.includes(target)) return saved;
  const order = [...saved.filter(key => keys.includes(key)), ...keys.filter(key => !saved.includes(key))];
  const targetIndex = order.indexOf(target);
  const next = order.filter(key => key !== moving);
  next.splice(targetIndex, 0, moving);
  return next;
}
export function visibleSidebarItems<T extends { key: string }>(items: T[], expanded: boolean, selectedKey?: string, limit = 5): T[] {
  if (expanded || items.length <= limit) return items;
  const first = items.slice(0, limit);
  const selected = items.find(item => item.key === selectedKey);
  // Selection remains visible even when it sits beyond the initial subset.
  return selected && !first.some(item => item.key === selectedKey) ? [...first.slice(0, limit - 1), selected] : first;
}

/** Preserve pins/order when a live session becomes a recorded conversation. */
export function remapSidebarKeys(keys: string[], aliases: ReadonlyMap<string,string>): string[] {
  return [...new Set(keys.map(key => aliases.get(key) ?? key))];
}
