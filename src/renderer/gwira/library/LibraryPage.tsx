import React, { useEffect, useMemo, useRef, useState } from 'react';
import operationsIllustration from '../../assets/library/operations.png';
import financeIllustration from '../../assets/library/finance.png';
import hrIllustration from '../../assets/library/hr.png';
import salesMarketingIllustration from '../../assets/library/sales_marketing.png';
import customerSupportIllustration from '../../assets/library/customer_support.png';
import policiesIllustration from '../../assets/library/policies.png';
import sopsIllustration from '../../assets/library/sops.png';
import reportsIllustration from '../../assets/library/reports.png';

type LibraryTab = 'All' | 'Docs' | 'Files' | 'Folders';
type LibraryFilter = 'recent' | 'favorites' | 'created' | 'shared' | 'private' | 'workspace' | 'assigned' | 'archived';
type LibrarySort = 'updated' | 'name-asc' | 'name-desc' | 'created';
type LibraryMenu = 'create' | 'filters' | 'sort' | undefined;

interface LibraryDocument {
  id: string;
  title: string;
  type: 'Doc' | 'PDF' | 'Spreadsheet' | 'Presentation' | 'Folder';
  collection: string;
  owner: string;
  updated: string;
  access: 'Workspace' | 'Private' | 'Shared';
  doatAccess: string;
  verified?: boolean;
  description: string;
  createdAt: string;
  favorite?: boolean;
  assigned?: boolean;
  archived?: boolean;
}

const libraryStorageKey = 'gwira.library.records.v1';
const defaultDocuments: LibraryDocument[] = [
  { id: 'operations-handbook', title: 'Operations handbook', type: 'Doc', collection: 'Operations', owner: 'Maya Chen', updated: 'Today, 09:42', access: 'Workspace', doatAccess: 'Operations Doats', verified: true, favorite: true, description: 'How Gwira runs day-to-day operations, ownership and handoffs.', createdAt: '2026-10-15T09:42:00.000Z' },
  { id: 'customer-escalations', title: 'Customer escalation playbook', type: 'Doc', collection: 'Customer Support', owner: 'Amara Banda', updated: 'Yesterday', access: 'Shared', doatAccess: 'Support Doats', verified: true, assigned: true, description: 'Triage paths, response commitments and escalation owners.', createdAt: '2026-10-14T12:00:00.000Z' },
  { id: 'fy26-budget', title: 'FY26 budget assumptions', type: 'Spreadsheet', collection: 'Finance', owner: 'Noah Patel', updated: 'Oct 12', access: 'Private', doatAccess: 'No access', description: 'Planning assumptions and approved financial scenarios.', createdAt: '2026-10-12T09:00:00.000Z' },
  { id: 'security-policy', title: 'Information security policy', type: 'PDF', collection: 'Policies', owner: 'Maya Chen', updated: 'Oct 10', access: 'Workspace', doatAccess: 'All Doats', verified: true, description: 'The source of truth for handling company information.', createdAt: '2026-10-10T09:00:00.000Z' },
  { id: 'onboarding-sop', title: 'New hire onboarding SOP', type: 'Doc', collection: 'SOPs', owner: 'Amara Banda', updated: 'Oct 08', access: 'Workspace', doatAccess: 'People Doats', description: 'A practical checklist for a consistent first week.', createdAt: '2026-10-08T09:00:00.000Z' },
  { id: 'q3-review', title: 'Q3 customer insights report', type: 'Presentation', collection: 'Reports', owner: 'Noah Patel', updated: 'Sep 30', access: 'Shared', doatAccess: 'Research Doats', description: 'Themes, trends, and opportunities from customer feedback.', createdAt: '2026-09-30T09:00:00.000Z' }
];

const collections = [
  { image: operationsIllustration, title: 'Operations', description: 'Runbooks and operational knowledge' },
  { image: financeIllustration, title: 'Finance', description: 'Plans, budgets and reporting' },
  { image: hrIllustration, title: 'HR', description: 'People, onboarding and hiring' },
  { image: salesMarketingIllustration, title: 'Sales & Marketing', description: 'Go-to-market playbooks' },
  { image: customerSupportIllustration, title: 'Customer Support', description: 'Customer guidance and answers' },
  { image: policiesIllustration, title: 'Policies', description: 'Approved company standards' },
  { image: sopsIllustration, title: 'SOPs', description: 'Repeatable ways of working' },
  { image: reportsIllustration, title: 'Reports', description: 'Business reviews and analysis' }
] as const;

const tabs: LibraryTab[] = ['All', 'Docs', 'Files', 'Folders'];

function typeIcon(type: LibraryDocument['type']): string {
  return type === 'Folder' ? '□' : type === 'PDF' ? 'PDF' : type === 'Spreadsheet' ? '▦' : type === 'Presentation' ? '▣' : '▤';
}

function loadLibraryRecords(): LibraryDocument[] {
  try {
    const stored = JSON.parse(localStorage.getItem(libraryStorageKey) ?? 'null');
    if (Array.isArray(stored) && stored.every((item) => typeof item?.id === 'string' && typeof item.title === 'string' && typeof item.type === 'string' && typeof item.createdAt === 'string')) return stored as LibraryDocument[];
  } catch { /* use the initial sample knowledge */ }
  return defaultDocuments;
}

function filterLabel(filter: LibraryFilter): string {
  return ({ recent: 'Recent', favorites: 'Favorites', created: 'Created by Me', shared: 'Shared with Me', private: 'Private', workspace: 'Workspace', assigned: 'Assigned', archived: 'Archived' })[filter];
}

function emptyStateCopy({ allCount, filters, query, collectionFilter }: { allCount: number; filters: ReadonlySet<LibraryFilter>; query: string; collectionFilter?: string }): { title: string; detail: string; clear: boolean } {
  if (allCount === 0) return { title: 'Your Library is ready.', detail: 'Create a document, add a folder, or upload a file to start building your company knowledge.', clear: false };
  if (query.trim()) return { title: 'No matching documents.', detail: 'Try a different search or clear the current filters.', clear: true };
  if (filters.has('favorites')) return { title: 'No favorites yet.', detail: 'Save important knowledge to find it quickly here.', clear: true };
  if (filters.has('shared')) return { title: 'Nothing shared with you.', detail: 'Shared documents will appear here when your team adds you.', clear: true };
  if (collectionFilter) return { title: `No items in ${collectionFilter}.`, detail: 'Choose another collection or create the first item.', clear: true };
  return { title: 'No matching documents.', detail: 'Try another tab or clear the current filters.', clear: true };
}

export function LibraryPage(): React.ReactElement {
  const [tab, setTab] = useState<LibraryTab>('All');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Set<LibraryFilter>>(() => new Set());
  const [filterDraft, setFilterDraft] = useState<Set<LibraryFilter>>(() => new Set());
  const [collectionFilter, setCollectionFilter] = useState<string | undefined>();
  const [sort, setSort] = useState<LibrarySort>('updated');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [openDocument, setOpenDocument] = useState<LibraryDocument | undefined>();
  const [openMenu, setOpenMenu] = useState<LibraryMenu>();
  const [documents, setDocuments] = useState<LibraryDocument[]>(loadLibraryRecords);
  const createRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem(libraryStorageKey, JSON.stringify(documents)); }, [documents]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (![createRef, filtersRef, sortRef].some((ref) => ref.current?.contains(target))) setOpenMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpenMenu(undefined); };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutsidePointer); document.removeEventListener('keydown', closeOnEscape); };
  }, []);

  const visibleDocuments = useMemo(() => documents.filter((doc) => {
    const matchesQuery = `${doc.title} ${doc.collection} ${doc.owner}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesTab = tab === 'All' || (tab === 'Docs' && doc.type === 'Doc') || (tab === 'Files' && ['PDF', 'Spreadsheet', 'Presentation'].includes(doc.type)) || (tab === 'Folders' && doc.type === 'Folder');
    const matchesFilter = [...filters].every((filter) => (filter === 'recent' && Date.now() - Date.parse(doc.createdAt) <= 7 * 24 * 60 * 60 * 1000) || (filter === 'favorites' && doc.favorite) || (filter === 'created' && doc.owner === 'You') || (filter === 'shared' && doc.access === 'Shared') || (filter === 'private' && doc.access === 'Private') || (filter === 'workspace' && doc.access === 'Workspace') || (filter === 'assigned' && doc.assigned) || (filter === 'archived' && doc.archived));
    return matchesQuery && matchesTab && matchesFilter && (!collectionFilter || doc.collection === collectionFilter);
  }).sort((left, right) => sort === 'name-asc' ? left.title.localeCompare(right.title) : sort === 'name-desc' ? right.title.localeCompare(left.title) : sort === 'created' ? Date.parse(right.createdAt) - Date.parse(left.createdAt) : Date.parse(right.createdAt) - Date.parse(left.createdAt)), [collectionFilter, documents, filters, query, sort, tab]);

  function addRecord(type: LibraryDocument['type']): void {
    const now = new Date();
    const label = type === 'Folder' ? 'Untitled folder' : type === 'PDF' ? 'Uploaded file' : 'Untitled document';
    const next: LibraryDocument = { id: crypto.randomUUID(), title: label, type, collection: 'Unsorted', owner: 'You', updated: 'Just now', access: 'Private', doatAccess: 'No access', description: type === 'Folder' ? 'A new place to organize knowledge.' : 'A new Library item.', createdAt: now.toISOString() };
    setDocuments((current) => [next, ...current]);
    setTab(type === 'Folder' ? 'Folders' : type === 'Doc' ? 'Docs' : 'Files');
    setFilters(new Set()); setFilterDraft(new Set()); setCollectionFilter(undefined); setQuery(''); setOpenMenu(undefined);
    if (type === 'Doc') setOpenDocument(next);
  }

  function clearFilters(): void { setFilters(new Set()); setFilterDraft(new Set()); setCollectionFilter(undefined); setQuery(''); setTab('All'); }
  function toggleDraftFilter(value: LibraryFilter): void { setFilterDraft((current) => { const next = new Set(current); next.has(value) ? next.delete(value) : next.add(value); return next; }); }
  function applyFilters(): void { setFilters(new Set(filterDraft)); setOpenMenu(undefined); }
  function handleSortMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      items[(currentIndex + direction + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  }
  const emptyCopy = emptyStateCopy({ allCount: documents.length, filters, query, collectionFilter });
  const sortLabel = ({ updated: 'Last updated', 'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A', created: 'Date created' })[sort];
  const filterOptions: { group: string; items: LibraryFilter[] }[] = [{ group: 'Quick access', items: ['recent', 'favorites', 'created'] }, { group: 'Access', items: ['shared', 'private', 'workspace'] }, { group: 'Status', items: ['assigned', 'archived'] }];

  if (openDocument) return <LibraryDocumentView document={openDocument} onBack={() => setOpenDocument(undefined)} />;

  return <section className="gwira-library" aria-label="Library">
    <header className="library-header">
      <div><p className="library-eyebrow">Knowledge hub</p><h1>Library</h1><p>Store files, documents, and business knowledge.</p></div>
      <div className="library-actions"><div className="library-create" ref={createRef}><button type="button" className="library-create-primary" onClick={() => addRecord('Doc')}><span>＋</span> Create</button><button type="button" className="library-create-toggle" aria-label="Create options" aria-expanded={openMenu === 'create'} onClick={() => setOpenMenu((current) => current === 'create' ? undefined : 'create')}>⌄</button>{openMenu === 'create' ? <div className="library-dropdown library-create-menu" role="menu"><button type="button" role="menuitem" onClick={() => addRecord('Doc')}>New document</button><button type="button" role="menuitem" onClick={() => addRecord('Folder')}>New folder</button><button type="button" role="menuitem" onClick={() => addRecord('PDF')}>Upload files</button><button type="button" role="menuitem" disabled title="Import is not implemented yet.">Import</button></div> : null}</div></div>
    </header>

    <section className="library-collections" aria-labelledby="library-collections-heading"><div className="library-section-title"><div><h2 id="library-collections-heading">Collections</h2><p>Browse knowledge by the teams and systems that use it.</p></div><button type="button" className="library-text-button" disabled title="Collection management is not implemented yet.">Manage collections</button></div><div className="library-collection-grid">{collections.map((collection) => <button type="button" key={collection.title} className={`library-collection-card ${collectionFilter === collection.title ? 'is-selected' : ''}`} aria-pressed={collectionFilter === collection.title} onClick={() => setCollectionFilter((current) => current === collection.title ? undefined : collection.title)}><CollectionIllustration src={collection.image} label={collection.title} /><span><strong>{collection.title}</strong><small>{collection.description}</small></span></button>)}</div></section>

    <section className="library-index" aria-label="Library index">
      <div className="library-index-toolbar"><div className="library-tabs" role="tablist">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div><div className="library-controls"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library..." aria-label="Search library" /></label><div className="library-filter" ref={filtersRef}><button type="button" className={filters.size || collectionFilter ? 'active' : ''} aria-expanded={openMenu === 'filters'} onClick={() => { setFilterDraft(new Set(filters)); setOpenMenu((current) => current === 'filters' ? undefined : 'filters'); }}>☷ Filters{filters.size ? ` (${filters.size})` : ''}</button>{openMenu === 'filters' ? <div className="library-dropdown library-filter-menu"><div className="library-filter-options">{filterOptions.map(({ group, items }) => <fieldset key={group}><legend>{group}</legend>{items.map((value) => <label key={value}><input type="checkbox" checked={filterDraft.has(value)} onChange={() => toggleDraftFilter(value)} />{filterLabel(value)}</label>)}</fieldset>)}</div><footer><button type="button" onClick={() => { setFilterDraft(new Set()); setFilters(new Set()); }}>Clear</button><button type="button" className="library-apply-button" onClick={applyFilters}>Apply</button></footer></div> : null}</div><div className="library-sort-control" ref={sortRef}><button type="button" aria-label="Sort library" aria-expanded={openMenu === 'sort'} onClick={() => setOpenMenu((current) => { const next = current === 'sort' ? undefined : 'sort'; if (next) queueMicrotask(() => sortMenuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()); return next; })}>{sortLabel}<span>⌄</span></button>{openMenu === 'sort' ? <div className="library-dropdown library-sort-menu" ref={sortMenuRef} role="menu" onKeyDown={handleSortMenuKeyDown}>{(['updated', 'name-asc', 'name-desc', 'created'] as const).map((value) => <button type="button" key={value} role="menuitemradio" aria-checked={sort === value} className={sort === value ? 'active' : ''} onClick={() => { setSort(value); setOpenMenu(undefined); }}><span>{({ updated: 'Last updated', 'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A', created: 'Date created' })[value]}</span>{sort === value ? <b aria-hidden="true">✓</b> : null}</button>)}</div> : null}</div></div></div>
      {filters.size || collectionFilter ? <div className="library-filter-chips">{[...filters].map((filter) => <span key={filter}>{filterLabel(filter)}<button type="button" aria-label={`Remove ${filterLabel(filter)} filter`} onClick={() => setFilters((current) => { const next = new Set(current); next.delete(filter); return next; })}>×</button></span>)}{collectionFilter ? <span>{collectionFilter}<button type="button" aria-label={`Remove ${collectionFilter} filter`} onClick={() => setCollectionFilter(undefined)}>×</button></span> : null}<button type="button" onClick={clearFilters}>Clear filters</button></div> : null}
      {visibleDocuments.length === 0 ? <div className="library-empty"><span>▤</span><h2>{emptyCopy.title}</h2><p>{emptyCopy.detail}</p>{emptyCopy.clear ? <button type="button" onClick={clearFilters}>Clear filters</button> : <button type="button" className="library-primary" onClick={() => addRecord('Doc')}>Create document</button>}</div> : <div className="library-table-wrap"><table className="library-table"><thead><tr><th>Name</th><th>Collection</th><th>Updated</th><th>Access</th><th aria-label="Actions" /></tr></thead><tbody>{visibleDocuments.map((doc) => <tr key={doc.id} className={selectedId === doc.id ? 'selected' : ''} onClick={() => setSelectedId(doc.id)}><td><button type="button" className="library-document-title" onClick={(event) => { event.stopPropagation(); setOpenDocument(doc); }}><span className={`doc-type-icon ${doc.type.toLowerCase()}`}>{typeIcon(doc.type)}</span><span><strong>{doc.title}{doc.verified ? <i title="Verified source of truth">✓</i> : null}</strong><small>{doc.description}</small></span></button></td><td><span className="collection-chip">{doc.collection}</span></td><td>{doc.updated}</td><td><span className={`access-badge ${doc.access.toLowerCase()}`}>{doc.access}</span></td><td><button type="button" className="library-row-menu" aria-label={`Actions for ${doc.title}`} onClick={(event) => event.stopPropagation()}>•••</button></td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}

function CollectionIllustration({ src, label }: { src: string; label: string }): React.ReactElement {
  return <span className="collection-illustration" title={label}><img src={src} alt="" aria-hidden="true" /></span>;
}

function LibraryDocumentView({ document, onBack }: { document: LibraryDocument; onBack: () => void }): React.ReactElement {
  return <article className="gwira-document" aria-label={document.title}><header className="document-topbar"><button type="button" onClick={onBack}>← Library</button><div><button type="button">☆ Save</button><button type="button">Share</button><button type="button" className="library-primary">Edit</button></div></header><div className="document-cover"><span>▤</span><small>{document.collection} knowledge</small></div><div className="document-page"><div className="document-status"><span className={document.verified ? 'verified' : ''}>{document.verified ? '✓ Verified source of truth' : 'Working knowledge'}</span><span>Updated {document.updated}</span></div><h1>{document.title}</h1><div className="document-meta"><span><b>Owner</b> {document.owner}</span><span><b>Access</b> {document.access}</span><span><b>Doat access</b> {document.doatAccess}</span></div><p className="document-lead">{document.description} This living document gives the team a reliable, clear starting point for consistent work.</p><h2>Purpose</h2><p>Use this guidance whenever the team needs a shared decision framework. It captures the approved process, explains who owns each step, and identifies when to involve another team.</p><h2>How we work</h2><ul><li>Start with the current customer or business context.</li><li>Follow the named owner and escalation path.</li><li>Record decisions in the related task so the work stays traceable.</li></ul><div className="document-callout"><strong>Gwira guidance</strong><p>Doats can use this document only when they have the access shown above. Verified knowledge is preferred when planning work.</p></div><h2>Related knowledge</h2><div className="document-related"><button type="button">▤ Related SOP <small>Approved process</small></button><button type="button">✓ Linked task <small>Review this quarter</small></button><button type="button">◉ Related Doat <small>Operations assistant</small></button></div></div></article>;
}
