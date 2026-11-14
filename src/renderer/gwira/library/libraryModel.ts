/** Device-local Library records. Access labels are metadata, never authorization. */
export type LibraryType = 'Doc' | 'PDF' | 'Spreadsheet' | 'Presentation' | 'Folder' | 'Image' | 'File';
export type LibraryTab = 'Suggested' | 'Favorites' | 'Folders' | 'Images' | 'All';
export type LibrarySort = 'updated' | 'name-asc' | 'name-desc' | 'created';
export interface LibraryDocument {
  id: string; title: string; type: LibraryType; collection: string; owner: string; updated: string;
  access: 'Workspace' | 'Private' | 'Shared'; doatAccess: string; description: string; createdAt: string;
  favorite?: boolean; assigned?: boolean; archived?: boolean; verified?: boolean;
  /** Optional metadata/content belonging only to this existing local record format. */
  updatedAt?: string; path?: string; content?: string; parentId?: string; lastOpenedAt?: string;
}
export const LIBRARY_STORAGE_KEY = 'gwira.library.records.v1';
export const LIBRARY_PREFERENCES_KEY = 'gwira.library.preferences.v1';
const types: LibraryType[] = ['Doc','PDF','Spreadsheet','Presentation','Folder','Image','File'];
export interface LibraryPreferences { view: 'grid' | 'list'; sort: LibrarySort; showNames: boolean; }
export function readLibraryPreferences(raw: string | null): LibraryPreferences {
  try { const value = JSON.parse(raw ?? '{}'); return { view: value?.view === 'list' ? 'list' : 'grid', sort: ['name-asc','name-desc','created'].includes(value?.sort) ? value.sort : 'updated', showNames: value?.showNames === true }; }
  catch { return { view:'grid',sort:'updated',showNames:false }; }
}
export function parseLibraryRecords(raw: string | null): LibraryDocument[] {
  if (!raw) return [];
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('Library data could not be read. Your saved data has not been replaced. Restore the Library store from a backup, then retry.'); }
  if (!Array.isArray(value)) throw new Error('Library storage has an unsupported format. Your saved data has not been replaced.');
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || !types.includes(item.type) || !Number.isFinite(Date.parse(item.createdAt))) throw new Error('A saved Library item is invalid. Your data has not been replaced. Restore a valid backup, then retry.');
    ids.add(item.id);
    for (const field of ['content','path','parentId','updatedAt','lastOpenedAt']) if (item[field] !== undefined && typeof item[field] !== 'string') throw new Error('A saved Library item has invalid metadata. Restore a valid backup, then retry.');
    return { ...item, collection: typeof item.collection === 'string' ? item.collection : 'Unsorted', owner: typeof item.owner === 'string' ? item.owner : '', updated: typeof item.updated === 'string' ? item.updated : '', access: ['Workspace','Shared'].includes(item.access) ? item.access : 'Private', doatAccess: typeof item.doatAccess === 'string' ? item.doatAccess : '', description: typeof item.description === 'string' ? item.description : '' } as LibraryDocument;
  });
}
export function libraryTypeForName(name: string): LibraryType {
  if (/\.(png|jpe?g|webp)$/i.test(name)) return 'Image';
  if (/\.pdf$/i.test(name)) return 'PDF';
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return 'Spreadsheet';
  if (/\.(pptx?|odp)$/i.test(name)) return 'Presentation';
  return 'File';
}
const epoch = (item: LibraryDocument, field: 'created' | 'updated') => Date.parse(field === 'created' ? item.createdAt : item.updatedAt ?? item.createdAt) || 0;
export function selectLibraryRecords(records: readonly LibraryDocument[], options: { tab: LibraryTab; query: string; folderId?: string; type?: LibraryType; collection?: string; archived: boolean; sort: LibrarySort }): LibraryDocument[] {
  const query = options.query.trim().toLocaleLowerCase();
  const collator = new Intl.Collator(undefined, { numeric:true,sensitivity:'base' });
  return records.filter(item => !!item.archived === options.archived && (!options.folderId || item.parentId === options.folderId) && (!options.type || item.type === options.type) && (!options.collection || item.collection === options.collection) && (options.tab !== 'Favorites' || item.favorite) && (options.tab !== 'Folders' || item.type === 'Folder') && (options.tab !== 'Images' || item.type === 'Image') && `${item.title} ${item.description} ${item.collection} ${item.owner}`.toLocaleLowerCase().includes(query)).sort((a,b) => {
    if (options.sort === 'name-asc') return collator.compare(a.title,b.title) || a.id.localeCompare(b.id);
    if (options.sort === 'name-desc') return collator.compare(b.title,a.title) || a.id.localeCompare(b.id);
    if (options.tab === 'Suggested' && a.favorite !== b.favorite) return Number(!!b.favorite) - Number(!!a.favorite);
    return epoch(b,options.sort) - epoch(a,options.sort);
  });
}
export function libraryFolderChoices(records: readonly LibraryDocument[], itemId: string): LibraryDocument[] {
  const descendants = new Set([itemId]);
  let changed = true;
  while (changed) { changed = false; for (const item of records) if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) { descendants.add(item.id); changed = true; } }
  return records.filter(item => item.type === 'Folder' && !item.archived && !descendants.has(item.id));
}
/** Remove only Library references; originals on disk are never deleted. */
export function removeLibraryRecord(records: readonly LibraryDocument[], id: string): LibraryDocument[] { return records.filter(item => item.id !== id).map(item => item.parentId === id ? { ...item, parentId:undefined } : item); }
