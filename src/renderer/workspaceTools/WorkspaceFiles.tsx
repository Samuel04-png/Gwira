import { documentEntries, filesApi, useGwiraDocuments } from './gwiraDocuments.js';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {WorkspaceMarkdown} from './WorkspaceMarkdown.js';
import { Icon } from '../components/Icon.js';
import { CompactActionMenu } from '../components/CompactActionMenu.js';
import type { WorkspaceFileEntry, WorkspaceFileRoot, WorkspaceFileSearchResult, WorkspacePreview } from '../../shared/workspaceFiles.js';
import { tokenizeCode } from '../codeHighlight.js';
import { OfficePreview } from './OfficePreview.js';
import { PdfPreview } from './PdfPreview.js';
import { clampFilesPreviewRatio, DEFAULT_FILES_PREVIEW_RATIO, isMarkdownFile, parseFilesPreviewRatio, workspaceFileIcon } from './workspaceFilesModel.js';

type ActiveFile = { rootName: string; rootFingerprint: string; path: string; name: string };
type Props = {
  active: boolean;
  open: boolean;
  compact: boolean;
  activeFile?: ActiveFile;
  canvasTarget: HTMLElement | null;
  onClose: () => void;
};

const MAX_CACHED_PREVIEWS = 4;
const FILES_PREVIEW_RATIO_KEY = 'gwira.files.preview-ratio.v1';

type InlinePointerStyles = { userSelect: string; cursor: string };

function restorePointerStyles(styles: InlinePointerStyles | null): void {
  if (!styles) return;
  document.body.style.userSelect = styles.userSelect;
  document.body.style.cursor = styles.cursor;
}

function cssPixelValue(name: string, fallback: number): number {
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pathParts(relative: string): string[] {
  return relative.split(/[\\/]/).filter(Boolean);
}

function parentPath(relative: string): string {
  return pathParts(relative).slice(0, -1).join('/');
}

function searchableTree(entries: WorkspaceFileEntry[]): Record<string, WorkspaceFileEntry[]> {
  const tree: Record<string, WorkspaceFileEntry[]> = {};
  const add = (directory: string, entry: WorkspaceFileEntry): void => {
    const siblings = tree[directory] ?? (tree[directory] = []);
    if (!siblings.some((item) => item.path === entry.path)) siblings.push(entry);
  };
  for (const entry of entries) {
    const parts = pathParts(entry.path);
    for (let index = 1; index < parts.length; index += 1) {
      const path = parts.slice(0, index).join('/');
      add(parts.slice(0, index - 1).join('/'), { name: parts[index - 1]!, path, directory: true });
    }
    add(parts.slice(0, -1).join('/'), { ...entry, path: parts.join('/') });
  }
  for (const siblings of Object.values(tree)) {
    siblings.sort((left, right) => Number(right.directory) - Number(left.directory) || left.name.localeCompare(right.name));
  }
  return tree;
}

function searchExpandedPaths(entries: WorkspaceFileEntry[]): Set<string> {
  const expanded = new Set(['']);
  for (const entry of entries) {
    const parts = pathParts(entry.path);
    for (let index = 1; index < parts.length; index += 1) expanded.add(parts.slice(0, index).join('/'));
  }
  return expanded;
}

function keepRecentPreview(current: WorkspacePreview[], next: WorkspacePreview): WorkspacePreview[] {
  return [...current.filter((item) => item.path !== next.path), next].slice(-MAX_CACHED_PREVIEWS);
}

function FilesExplorerHeader({rootName,refreshDisabled,onRefresh,onChooseFolder,compact,onHidePreview,restricted=false}:{rootName?:string;refreshDisabled:boolean;onRefresh:()=>void;onChooseFolder:()=>void;compact?:boolean;onHidePreview?:()=>void;restricted?:boolean}):React.ReactElement {
 return <header className="workspace-files__header">
  <div className="workspace-files__root-label" title={rootName??'Files'}><Icon name={rootName?'folder-open':'folder'}/><span>{rootName??'Files'}</span></div>
  <div className="workspace-files__header-actions"><button type="button" aria-label="Refresh files" title="Refresh files" disabled={refreshDisabled} onClick={onRefresh}><Icon name="refresh"/></button>
   <button type="button" className="workspace-files__open-folder" disabled={restricted} title={restricted?'Local file access is unavailable in authenticated workspaces.':undefined} onClick={onChooseFolder}>Open folder</button>
   {compact&&<button type="button" aria-label="Show file preview" title="Show file preview" onClick={onHidePreview}><Icon name="close"/></button>}
  </div>
 </header>;
}

function MarkdownMode({source,onChange}:{source:boolean;onChange:(source:boolean)=>void}):React.ReactElement {
  return <div className="workspace-files__markdown-mode" role="group" aria-label="Markdown view mode">
    <button type="button" aria-pressed={!source} onClick={()=>onChange(false)}>Preview</button>
    <button type="button" aria-pressed={source} onClick={()=>onChange(true)}>Source</button>
  </div>;
}

type CloudFilesProps = {cloudDocument:{title:string;markdown:string}|null;onClose:()=>void;canvasTarget:HTMLElement|null;compact:boolean;open:boolean};

function CloudWorkspaceFiles({cloudDocument,onClose,canvasTarget,compact,open}:CloudFilesProps):React.ReactElement {
  const [source,setSource]=useState(false);
  const [explorerOpen,setExplorerOpen]=useState<boolean>();
  const explorerToggle=useRef<HTMLButtonElement>(null);
  const expanded=explorerOpen??!compact;
  useEffect(()=>{
    if(!open||!compact||!expanded)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExplorerOpen(false);explorerToggle.current?.focus();}};
    document.addEventListener('keydown',close,true);
    return ()=>document.removeEventListener('keydown',close,true);
  },[open,compact,expanded]);
  return <>
    <section className="workspace-files" data-explorer-open={expanded} aria-label="Workspace Files">
      <FilesExplorerHeader restricted refreshDisabled onRefresh={()=>{}} onChooseFolder={()=>{}} compact={compact} onHidePreview={()=>setExplorerOpen(false)}/>
      <label className="workspace-files__search"><Icon name="search"/><input type="search" aria-label="Filter files" placeholder="Filter files..." disabled title="Local file access is unavailable in authenticated workspaces."/></label>
      <div className="workspace-files__tree-wrap"><p className="workspace-files__status">Local file access is unavailable in authenticated workspaces.</p></div>
    </section>
    {canvasTarget&&createPortal(<section className="workspace-file-canvas cloud-workspace-files__preview" aria-label="Authorized plan preview">
      <header className="workspace-files__toolbar">
        <nav className="workspace-files__breadcrumbs" aria-label="File location">{cloudDocument&&<span aria-current="page" title={cloudDocument.title}>{cloudDocument.title}</span>}</nav>
        <div className="workspace-files__toolbar-actions">{cloudDocument&&<MarkdownMode source={source} onChange={setSource}/>}<button ref={explorerToggle} type="button" data-files-explorer-toggle="true" aria-label={expanded?'Hide file explorer':'Show file explorer'} aria-expanded={expanded} title={expanded?'Hide file explorer':'Show file explorer'} onClick={()=>setExplorerOpen(!expanded)}><Icon name="folder"/></button><button type="button" aria-label="Close Workspace tab" title="Close Workspace tab" onClick={onClose}><Icon name="close"/></button></div>
      </header>
      <div className="workspace-files__split"><article aria-label="Selected file preview">{cloudDocument?(source?<pre className="workspace-files__text" tabIndex={0}>{cloudDocument.markdown}</pre>:<WorkspaceMarkdown source={cloudDocument.markdown}/>):<div className="workspace-files__empty" role="status"><Icon name="file" size={20}/><h2>No authorized plan is open</h2><p>Save or review a plan from a conversation.</p></div>}</article></div>
    </section>,canvasTarget)}
  </>;
}

export function WorkspaceFiles(props:Props|CloudFilesProps):React.ReactElement {
  if('cloudDocument' in props)return <CloudWorkspaceFiles {...props}/>;
  return <LocalWorkspaceFiles {...props}/>;
}

function LocalWorkspaceFiles({ active, open, compact, activeFile, canvasTarget, onClose }: Props): React.ReactElement {
  const [initialSplit] = useState(() => {
    try {
      return { ratio: parseFilesPreviewRatio(localStorage.getItem(FILES_PREVIEW_RATIO_KEY)), error: '' };
    } catch {
      return { ratio: DEFAULT_FILES_PREVIEW_RATIO, error: 'The saved Files layout could not be read. You can still resize this panel.' };
    }
  });
  const [root, setRoot] = useState<WorkspaceFileRoot>();
  const [tree, setTree] = useState<Record<string, WorkspaceFileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [query, setQuery] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const [searchResult, setSearchResult] = useState<(WorkspaceFileSearchResult & { query: string })>();
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [collapsedSearchFolders, setCollapsedSearchFolders] = useState<Set<string>>(new Set());
  const [treeError, setTreeError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const [treeLoading, setTreeLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previews, setPreviews] = useState<WorkspacePreview[]>([]);
  const [selected, setSelected] = useState<string>();
  const [side, setSide] = useState<string>();
  const [currentFolder, setCurrentFolder] = useState('');
  const [explorerOpen, setExplorerOpen] = useState<boolean>();
  const [zoom, setZoom] = useState(100);
  const [pdfSearch, setPdfSearch] = useState('');
  const [page, setPage] = useState(1);
  const [comparisonSplit, setComparisonSplit] = useState(50);
  const [previewRatio, setPreviewRatio] = useState(initialSplit.ratio);
  const [splitPreferenceError, setSplitPreferenceError] = useState(initialSplit.error);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [resizing, setResizing] = useState(false);
  const [markdownSourceByPath, setMarkdownSourceByPath] = useState<Record<string, boolean>>({});
  const generation = useRef(0);
  const searchGeneration = useRef(0);
  const previewGeneration = useRef(0);
  const sidePreviewGeneration = useRef(0);
  const scrollPosition = useRef(0);
  const splitPointerStyles = useRef<InlinePointerStyles | null>(null);
  const imagePointerStyles = useRef<InlinePointerStyles | null>(null);
  const imagePan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const splitPointerId = useRef<number | null>(null);
  const workspaceTarget = canvasTarget?.closest<HTMLElement>('.right-workspace') ?? null;
  const minimumPreviewWidth = cssPixelValue('--gw-files-preview-min-width', 220);
  const minimumExplorerWidth = cssPixelValue('--gw-files-explorer-min-width', 160);
  const effectivePreviewRatio = clampFilesPreviewRatio(previewRatio, workspaceWidth, minimumPreviewWidth, minimumExplorerWidth);
  const displayedSearch = searchResult?.query === query.trim() ? searchResult : undefined;
  const visibleTree = useMemo(() => displayedSearch ? searchableTree(displayedSearch.entries) : tree, [displayedSearch, tree]);
  const autoExpanded = useMemo(() => displayedSearch ? searchExpandedPaths(displayedSearch.entries) : undefined, [displayedSearch]);
  const selectedPreview = previews.find((item) => item.path === selected);
  const sidePreview = previews.find((item) => item.path === side);
  const rootMismatch = !!activeFile && (!root || root.fingerprint !== activeFile.rootFingerprint);

  useLayoutEffect(() => {
    if (!workspaceTarget) {
      setWorkspaceWidth(0);
      return;
    }
    const measure = (): void => setWorkspaceWidth(workspaceTarget.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(workspaceTarget);
    measure();
    return () => observer.disconnect();
  }, [workspaceTarget]);

  useLayoutEffect(() => {
    workspaceTarget?.style.setProperty('--gw-files-preview-ratio', `${effectivePreviewRatio}%`);
  }, [effectivePreviewRatio, workspaceTarget]);

  useEffect(() => () => {
    workspaceTarget?.style.removeProperty('--gw-files-preview-ratio');
  }, [workspaceTarget]);

  useEffect(() => {
    try {
      localStorage.setItem(FILES_PREVIEW_RATIO_KEY, String(previewRatio));
      setSplitPreferenceError('');
    } catch {
      setSplitPreferenceError('The Files pane size could not be saved. It will reset when Gwira closes.');
    }
  }, [previewRatio]);

  useEffect(() => () => {
    restorePointerStyles(splitPointerStyles.current);
    restorePointerStyles(imagePointerStyles.current);
    splitPointerId.current = null;
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== splitPointerId.current || !workspaceTarget) return;
      const rect = workspaceTarget.getBoundingClientRect();
      const border = Number.parseFloat(getComputedStyle(workspaceTarget).borderLeftWidth) || 0;
      const ratio = ((event.clientX - rect.left - border) / workspaceTarget.clientWidth) * 100;
      setPreviewRatio(clampFilesPreviewRatio(ratio, workspaceWidth, minimumPreviewWidth, minimumExplorerWidth));
    };
    const finishPointerResize = (): void => {
      if (splitPointerId.current === null) return;
      splitPointerId.current = null;
      restorePointerStyles(splitPointerStyles.current);
      splitPointerStyles.current = null;
      setResizing(false);
    };
    const handlePointerEnd = (event: PointerEvent): void => {
      if (event.pointerId === splitPointerId.current) finishPointerResize();
    };
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);
    window.addEventListener('blur', finishPointerResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
      window.removeEventListener('blur', finishPointerResize);
    };
  }, [minimumExplorerWidth, minimumPreviewWidth, resizing, workspaceTarget, workspaceWidth]);

  async function loadFolder(relative: string, chosen = root): Promise<void> {
    if (!chosen) return;
    const version = generation.current;
    setTreeLoading(true);
    setTreeError('');
    try {
      const entries = await filesApi(chosen.id).list(chosen.id, relative);
      if (version === generation.current) setTree((current) => ({ ...current, [relative]: entries }));
    } catch {
      if (version === generation.current) setTreeError('This folder could not be read. Refresh it or choose the folder again.');
    } finally {
      if (version === generation.current) setTreeLoading(false);
    }
  }

  async function chooseRoot(): Promise<void> {
    const version = ++generation.current;
    setTreeError('');
    setPreviewError('');
    try {
      const chosen = await window.codexDesktop.workspaceFiles.chooseRoot();
      if (!chosen || version !== generation.current) return;
      setRoot(chosen);
      setTree({});
      setPreviews([]);
      setSelected(undefined);
      setSide(undefined);
      setCurrentFolder('');
      setQuery('');
      setCollapsedSearchFolders(new Set());
      setExpanded(new Set(['']));
      setTreeLoading(true);
      setTreeError('');
      setPreviewLoading(false);
      const entries = await filesApi(chosen.id).list(chosen.id, '');
      if (version === generation.current) setTree({ '': entries });
    } catch {
      if (version === generation.current) setTreeError('Folder access could not be opened. Choose a readable local folder and try again.');
    } finally {
      if (version === generation.current) setTreeLoading(false);
    }
  }

  async function refreshTree(): Promise<void> {
    if (!root) return;
    const version = ++generation.current;
    const folders = [...expanded].filter(Boolean).sort((left, right) => pathParts(left).length - pathParts(right).length);
    const refreshed: Record<string, WorkspaceFileEntry[]> = {};
    let skippedFolders = 0;
    setTreeLoading(true);
    setTreeError('');
    try {
      refreshed[''] = await filesApi(root.id).list(root.id, '');
      for (const folder of folders) {
        try {
          refreshed[folder] = await filesApi(root.id).list(root.id, folder);
        } catch {
          skippedFolders += 1;
        }
      }
      if (version !== generation.current) return;
      setTree(refreshed);
      if (selected) {
        try {
          const preview = await filesApi(root.id).preview(root.id, selected);
          if (version === generation.current) setPreviews((current) => keepRecentPreview(current, preview));
        } catch {
          if (version === generation.current) setPreviewError('This file is no longer available in the selected folder. Choose another file or reopen the folder.');
        }
      }
      if (skippedFolders) setTreeError('Some expanded folders could not be refreshed because they moved or are no longer available.');
      setSearchRevision((revision) => revision + 1);
    } catch {
      if (version === generation.current) setTreeError('This folder could not be refreshed. Check that it still exists and that access is allowed.');
    } finally {
      if (version === generation.current) setTreeLoading(false);
    }
  }

  async function preview(entry: WorkspaceFileEntry, toSide = false): Promise<void> {
    if (!root) {
      setPreviewError('Choose the approved workspace folder before opening files.');
      return;
    }
    const version = generation.current;
    const request = toSide ? ++sidePreviewGeneration.current : ++previewGeneration.current;
    if (!toSide) {
      setSelected(entry.path);
      setCurrentFolder(parentPath(entry.path));
      setPreviewError('');
      setActionStatus('');
      setZoom(100);
      setPage(1);
      setPdfSearch('');
      setExpanded((current) => {
        const next = new Set(current);
        const segments = pathParts(parentPath(entry.path));
        let parent = '';
        next.add('');
        for (const segment of segments) {
          parent = parent ? `${parent}/${segment}` : segment;
          next.add(parent);
        }
        return next;
      });
      setPreviewLoading(true);
    }
    setPreviewError('');
    try {
      const content = await filesApi(root.id).preview(root.id, entry.path);
      if (version !== generation.current || request !== (toSide ? sidePreviewGeneration.current : previewGeneration.current)) return;
      setPreviews((current) => keepRecentPreview(current, content));
      if (toSide) setSide(content.path);
    } catch {
      if (version === generation.current && request === (toSide ? sidePreviewGeneration.current : previewGeneration.current)) {
        if (toSide) setActionStatus('The side preview could not be opened. Check that the file is still available.');
        else setPreviewError('This file could not be opened. Check that it still exists inside the approved folder and is readable.');
      }
    } finally {
      if (!toSide && version === generation.current && request === previewGeneration.current) setPreviewLoading(false);
    }
  }

  async function navigateToFolder(relative: string): Promise<void> {
    const parts = pathParts(relative);
    let parent = '';
    const nextExpanded = new Set(['']);
    setQuery('');
    setSearchError('');
    setSelected(undefined);
    setCurrentFolder(parts.join('/'));
    for (const part of parts) {
      parent = parent ? `${parent}/${part}` : part;
      nextExpanded.add(parent);
      if (!tree[parent]) await loadFolder(parent);
    }
    setExpanded(nextExpanded);
  }

  function toggleDirectory(entry: WorkspaceFileEntry): void {
    if (query.trim() && !(visibleTree[entry.path]?.length)) {
      void navigateToFolder(entry.path);
      return;
    }
    const currentExpanded = query.trim()
      ? (autoExpanded?.has(entry.path) ?? false) && !collapsedSearchFolders.has(entry.path)
      : expanded.has(entry.path);
    if (query.trim()) {
      setCollapsedSearchFolders((current) => {
        const next = new Set(current);
        if (currentExpanded) next.add(entry.path);
        else next.delete(entry.path);
        return next;
      });
      return;
    }
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
    if (!tree[entry.path]) void loadFolder(entry.path);
  }

  async function copyPath(relative: string): Promise<void> {
    if (!root) return;
    setActionStatus('Copying path…');
    try {
      await filesApi(root.id).copyPath(root.id, relative);
      setActionStatus('File path copied.');
    } catch {
      setActionStatus('The path could not be copied. Check that the item is still in the approved folder.');
    }
  }

  async function reveal(relative: string): Promise<void> {
    if (!root) return;
    setActionStatus('Opening the containing folder…');
    try {
      await filesApi(root.id).reveal(root.id, relative);
      setActionStatus('Opened the containing folder.');
    } catch {
      setActionStatus('The containing folder could not be opened. Check that the item is still available.');
    }
  }

  useEffect(() => {
    if (!active || !root || !query.trim()) {
      setSearchResult(undefined);
      setSearchError('');
      setSearchLoading(false);
      setCollapsedSearchFolders(new Set());
      return;
    }
    const request = ++searchGeneration.current;
    const searchedQuery = query.trim();
    setSearchResult(undefined);
    setSearchError('');
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void filesApi(root.id).search(root.id, searchedQuery)
        .then((result) => {
          if (request === searchGeneration.current) setSearchResult({ ...result, query: searchedQuery });
        })
        .catch(() => {
          if (request === searchGeneration.current) setSearchError('Files could not be searched. Check folder access and try again.');
        })
        .finally(() => {
          if (request === searchGeneration.current) setSearchLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      searchGeneration.current += 1;
    };
  }, [active, query, root?.id, searchRevision]);

  const documents = useGwiraDocuments();
  useEffect(() => {
    if (!documents) return;
    const wantsDocuments = !root || (!!activeFile && activeFile.rootFingerprint === documents.root.fingerprint && root.fingerprint !== documents.root.fingerprint);
    if (!wantsDocuments) return;
    generation.current += 1;
    setRoot(documents.root);
    setTree({ '': documentEntries(documents) });
    setPreviews([]);
    setSelected(undefined);
    setSide(undefined);
    setCurrentFolder('');
    setQuery('');
    setCollapsedSearchFolders(new Set());
    setExpanded(new Set(['']));
    setTreeError('');
    setPreviewError('');
  }, [documents, root?.id, activeFile?.rootFingerprint]);
  useEffect(() => {
    if (!documents || root?.id !== documents.root.id) return;
    setTree({ '': documentEntries(documents) });
    setPreviews((current) => current.map((item) => { const file = documents.files.find((entry) => entry.path === item.path); return file ? { ...item, text: file.text } : item; }));
  }, [documents]);

  useEffect(() => {
    if (!active || !open || !activeFile) return;
    if (rootMismatch) {
      setSelected(undefined);
      setPreviewError('');
      return;
    }
    setSelected(activeFile.path);
    setCurrentFolder(parentPath(activeFile.path));
    if (!previews.some((item) => item.path === activeFile.path)) {
      void preview({ name: activeFile.name, path: activeFile.path, directory: false });
    }
  }, [active, open, activeFile?.path, activeFile?.rootFingerprint, root?.id]);

  useEffect(() => {
    if (!active || !explorerOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && compact) {
        event.preventDefault();
        setExplorerOpen(false);
        document.querySelector<HTMLButtonElement>('.workspace-file-canvas [data-files-explorer-toggle="true"]')?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, compact, explorerOpen]);

  function toggleExplorer(): void {
    const currentlyOpen = explorerOpen ?? !compact;
    setExplorerOpen(!currentlyOpen);
  }

  function onTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    items[next]?.focus();
  }

  function renderEntries(relative = '', depth = 0): React.ReactNode {
    return (visibleTree[relative] ?? []).map((entry) => {
      const isExpanded = query.trim() ? autoExpanded?.has(entry.path) ?? false : expanded.has(entry.path);
      const expandedState = query.trim() ? isExpanded && !collapsedSearchFolders.has(entry.path) : isExpanded;
      const actions = entry.directory
        ? [
            { label: isExpanded ? 'Collapse folder' : 'Expand folder', icon: isExpanded ? 'chevron-down' as const : 'chevron-right' as const, onSelect: () => toggleDirectory(entry) },
            { label: 'Copy path', icon: 'trace-copy' as const, onSelect: () => void copyPath(entry.path) },
            { label: 'Reveal in folder', icon: 'external' as const, onSelect: () => void reveal(entry.path) }
          ]
        : [
            { label: 'Open preview', icon: 'file' as const, onSelect: () => void preview(entry) },
            { label: 'Open to side', icon: 'external' as const, onSelect: () => void preview(entry, true) },
            { label: 'Copy path', icon: 'trace-copy' as const, onSelect: () => void copyPath(entry.path) },
            { label: 'Reveal in folder', icon: 'external' as const, onSelect: () => void reveal(entry.path) }
          ];
      return (
        <div key={entry.path} role="none">
          <div
            className="workspace-files__row"
            style={{ '--file-depth': depth } as React.CSSProperties}
            onContextMenu={(event) => {
              event.preventDefault();
              setActionStatus('');
              setContext({ path: entry.path, x: event.clientX, y: event.clientY, nonce: Date.now() });
            }}
            onKeyDown={(event) => {
              if (event.shiftKey && event.key === 'F10') {
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                setActionStatus('');
                setContext({ path: entry.path, x: bounds.left, y: bounds.bottom, nonce: Date.now() });
              }
            }}
          >
            <button
              type="button"
              role="treeitem"
              title={entry.name}
              data-file-path={entry.path}
              aria-expanded={entry.directory ? expandedState : undefined}
              aria-selected={!entry.directory && selected === entry.path}
              onClick={() => entry.directory ? toggleDirectory(entry) : void preview(entry)}
              onKeyDown={(event) => {
                if (entry.directory && event.key === 'ArrowRight' && !expandedState) {
                  event.preventDefault();
                  toggleDirectory(entry);
                } else if (entry.directory && event.key === 'ArrowLeft' && expandedState) {
                  event.preventDefault();
                  toggleDirectory(entry);
                }
              }}
            >
              {entry.directory ? <Icon name="chevron-right" className={`workspace-files__chevron${expandedState ? ' is-expanded' : ''}`} /> : null}
              <Icon name={entry.directory ? expandedState ? 'folder-open' : 'folder' : workspaceFileIcon(entry.name)} />
              <span className="workspace-files__name">{entry.name}</span>
            </button>
            <CompactActionMenu
              contextRequest={context?.path === entry.path ? context : undefined}
              label={`${entry.directory ? 'Folder' : 'File'} actions for ${entry.name}`}
              actions={actions}
            />
          </div>
          {entry.directory && expandedState && visibleTree[entry.path]?.length
            ? <div role="group">{renderEntries(entry.path, depth + 1)}</div>
            : null}
        </div>
      );
    });
  }

  const [context, setContext] = useState<{ path: string; x: number; y: number; nonce: number }>();
  const activePreview = selectedPreview;
  const selectedPath = activePreview?.path ?? selected;
  const displayName = activePreview?.name ?? (selectedPath ? pathParts(selectedPath).at(-1) : undefined);
  const breadcrumbPath = selectedPath ? parentPath(selectedPath) : currentFolder;
  const folderParts = pathParts(breadcrumbPath);
  function renderCode(text: string, label: string): React.ReactNode {
    return (
      <div className="workspace-files__code-scroll" role="region" aria-label={label} tabIndex={0}>
        <pre className="workspace-files__code"><code>
          {text.split(/\r?\n/).map((line, index) => (
            <span className="workspace-files__code-line" key={index}>
              <span className="workspace-files__line-number" aria-hidden="true">{index + 1}</span>
              <span className="workspace-files__code-content">{tokenizeCode(line).map((token, tokenIndex) => <span className={`syntax-token ${token.kind}`} key={`${tokenIndex}-${token.kind}`}>{token.text}</span>)}</span>
            </span>
          ))}
        </code></pre>
      </div>
    );
  }

  function renderPreview(file: WorkspacePreview | undefined): React.ReactNode {
    if (!file) {
      if (rootMismatch && activeFile) {
        return <div className="workspace-files__empty" role="status"><Icon name="folder" size={20} /><h2>Choose the original folder</h2><p>Open “{activeFile.rootName}” again to preview this file.</p></div>;
      }
      if (previewError) return <div className="workspace-files__empty" role="alert"><Icon name="file" size={20} /><h2>Preview unavailable</h2><p>{previewError}</p></div>;
      if (previewLoading || treeLoading) return <p className="workspace-files__loading" role="status">{previewLoading ? 'Loading file preview…' : 'Loading folder…'}</p>;
      return (
        <div className="workspace-files__empty" role="status">
          <Icon name="file" size={20} />
          <h2>Open file</h2>
          <p>Select a file from the workspace.</p>
          {!root ? <button type="button" onClick={() => void chooseRoot()}>Open folder</button> : null}
        </div>
      );
    }
    if (file.kind === 'image') {
      return (
        <div
          className="workspace-files__image"
          data-zoomed={zoom > 100}
          onPointerDown={(event) => {
            if (zoom <= 100 || event.button !== 0) return;
            event.preventDefault();
            imagePointerStyles.current = { userSelect: document.body.style.userSelect, cursor: document.body.style.cursor };
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
            imagePan.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const origin = imagePan.current;
            if (!origin || origin.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.currentTarget.scrollLeft = origin.left - (event.clientX - origin.x);
            event.currentTarget.scrollTop = origin.top - (event.clientY - origin.y);
          }}
          onPointerUp={() => {
            imagePan.current = null;
            restorePointerStyles(imagePointerStyles.current);
            imagePointerStyles.current = null;
          }}
          onPointerCancel={() => {
            imagePan.current = null;
            restorePointerStyles(imagePointerStyles.current);
            imagePointerStyles.current = null;
          }}
          onLostPointerCapture={() => {
            imagePan.current = null;
            restorePointerStyles(imagePointerStyles.current);
            imagePointerStyles.current = null;
          }}
        >
          <img
            src={file.url}
            alt={file.name}
            draggable={false}
            style={zoom <= 100
              ? { maxWidth: '100%', maxHeight: '100%', transform: `scale(${zoom / 100})` }
              : { width: `${zoom}%`, maxWidth: 'none', maxHeight: 'none', height: 'auto' }}
          />
        </div>
      );
    }
    if (file.kind === 'pdf') return <PdfPreview key={file.path} url={file.url!} page={page} zoom={zoom} search={pdfSearch} />;
    if (file.kind === 'document' || file.kind === 'spreadsheet') return <OfficePreview key={file.path} url={file.url!} kind={file.kind} />;
    if (file.kind === 'text') {
      const source = file.text ?? '';
      if (isMarkdownFile(file.name)) {
        return markdownSourceByPath[file.path]
          ? <pre className="workspace-files__text" tabIndex={0}>{source}</pre>
          : <WorkspaceMarkdown source={source} onOpenLink={href=>{void window.codexDesktop.openExternalTarget({target:href}).then(()=>setActionStatus('Opened the link in your browser.')).catch(()=>setActionStatus('This link could not be opened. Check the address and try again.'));}}/>;
      }
      const icon = workspaceFileIcon(file.name);
      return icon === 'code-review' || icon === 'json'
        ? renderCode(source, `${file.name} source`)
        : <pre className="workspace-files__text" tabIndex={0}>{source}</pre>;
    }
    if (file.kind === 'csv') {
      const separator = file.name.toLowerCase().endsWith('.tsv') ? '\t' : ',';
      const rows = csvRows((file.text ?? '').slice(0, 500000), separator).slice(0, 1000).map((row) => row.slice(0, 100));
      return <div className="workspace-files__table"><p>Read-only preview · {rows.length} rows · up to 100 columns</p><table><tbody>{rows.map((row, index) => <tr key={index}><th scope="row">{index + 1}</th>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>;
    }
    return <div className="workspace-files__empty" role="status"><Icon name="file" size={20} /><h2>Preview unavailable</h2><p>{file.reason ?? 'This file type cannot be previewed.'}</p></div>;
  }

  function renderBreadcrumb(): React.ReactNode {
    const label = root?.name ?? activeFile?.rootName ?? 'Workspace';
    const parts = selectedPath ? [...folderParts, displayName ?? ''] : folderParts;
    return (
      <nav className="workspace-files__breadcrumbs" aria-label="File location">
        <button type="button" title={label} onClick={() => void navigateToFolder('')}>{label}</button>
        {parts.map((part, index) => {
          const path = folderParts.slice(0, index + 1).join('/');
          const isFile = !!selectedPath && index === parts.length - 1;
          return (
            <React.Fragment key={`${path}:${index}`}>
              <Icon name="chevron-right" size={14} />
              {isFile
                ? <span aria-current="page" title={part}>{part}</span>
                : <button type="button" title={part} onClick={() => void navigateToFolder(path)}>{part}</button>}
            </React.Fragment>
          );
        })}
      </nav>
    );
  }

  function csvRows(text: string, separator = ','): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]!;
      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = !quoted;
      } else if (character === separator && !quoted) {
        row.push(cell);
        cell = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += character;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function handleResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || workspaceWidth <= 0) return;
    event.preventDefault();
    const minimum = (minimumPreviewWidth / workspaceWidth) * 100;
    const maximum = 100 - (minimumExplorerWidth / workspaceWidth) * 100;
    const next = event.key === 'Home' ? minimum
      : event.key === 'End' ? maximum
        : previewRatio + (event.key === 'ArrowLeft' ? -2 : 2);
    setPreviewRatio(clampFilesPreviewRatio(next, workspaceWidth, minimumPreviewWidth, minimumExplorerWidth));
  }

  return (
    <>
      <div
        className="workspace-files"
        hidden={!active}
        data-explorer-open={explorerOpen}
        role="region"
        aria-label="Files explorer"
      >
          <FilesExplorerHeader rootName={root?.name} refreshDisabled={!root||treeLoading} onRefresh={()=>void refreshTree()} onChooseFolder={()=>void chooseRoot()} compact={compact} onHidePreview={()=>setExplorerOpen(false)}/>
          <label className="workspace-files__search">
            <Icon name="search" />
            <input type="search" aria-label="Filter files" placeholder="Filter files..." value={query} onChange={(event) => setQuery(event.target.value)} />
            {query ? <button type="button" aria-label="Clear file filter" onClick={() => { setQuery(''); setSearchError(''); }}>Clear</button> : null}
          </label>
          <div className="workspace-files__tree-wrap">
            {treeLoading ? <p className="workspace-files__status" role="status">Loading folder…</p> : null}
            {searchLoading ? <p className="workspace-files__status" role="status">Searching files…</p> : null}
            {treeError ? <p className="workspace-files__status" role="alert">{treeError}</p> : null}
            {searchError ? <p className="workspace-files__status" role="alert">{searchError}</p> : null}
            {actionStatus ? <p className="workspace-files__status" role="status">{actionStatus}</p> : null}
            {root ? (
              <div
                className="workspace-files__tree-scroll"
                ref={(node) => {
                  if (node) node.scrollTop = scrollPosition.current;
                }}
                onScroll={(event) => { scrollPosition.current = event.currentTarget.scrollTop; }}
              >
              <div role="tree" aria-label="Workspace files" onKeyDown={onTreeKeyDown}>
                <div className="workspace-files__row workspace-files__root-row">
                  <button type="button" role="treeitem" title={root.name} aria-expanded={query.trim() ? true : expanded.has('')} onClick={() => query.trim() ? undefined : setExpanded((current) => { const next = new Set(current); next.has('') ? next.delete('') : next.add(''); return next; })}>
                    <Icon name="chevron-right" className={`workspace-files__chevron${query.trim() || expanded.has('') ? ' is-expanded' : ''}`} />
                    <Icon name={query.trim() || expanded.has('') ? 'folder-open' : 'folder'} />
                    <span className="workspace-files__name">{root.name}</span>
                  </button>
                </div>
                {query.trim() ? (displayedSearch ? renderEntries() : null) : expanded.has('') ? renderEntries() : null}
                {!query.trim() && !treeLoading && tree['']?.length === 0 ? <p className="workspace-files__status">This folder is empty.</p> : null}
                {query.trim() && displayedSearch?.entries.length === 0 && !searchLoading ? <p className="workspace-files__status">No files or folders match this search.</p> : null}
                {displayedSearch?.truncated ? <p className="workspace-files__status">Showing the first search matches. Refine the filter to narrow results.</p> : null}
              </div>
              </div>
            ) : !treeLoading ? <p className="workspace-files__status">Choose a local folder to browse its files.</p> : null}
          </div>
      </div>
      {canvasTarget ? createPortal(
        <section className="workspace-file-canvas" hidden={!active} aria-label="File preview">
          <header className="workspace-files__toolbar">
            {renderBreadcrumb()}
            <div className="workspace-files__toolbar-actions">
              {selectedPreview?.kind === 'text' && isMarkdownFile(selectedPreview.name)
                ? <MarkdownMode source={!!markdownSourceByPath[selectedPreview.path]} onChange={source=>setMarkdownSourceByPath((current) => ({ ...current, [selectedPreview.path]: source }))}/>
                : null}
              {selectedPath ? <button type="button" aria-label="Reveal file in folder" title="Reveal file in folder" onClick={() => void reveal(selectedPath)}><Icon name="external" /></button> : null}
              {selectedPreview?.kind === 'image' || selectedPreview?.kind === 'pdf'
                ? <>
                    <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 25} onClick={() => setZoom((value) => Math.max(25, value - 25))}><Icon name="zoom-out" /></button>
                    <span className="workspace-files__zoom-value">{zoom}%</span>
                    <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 300} onClick={() => setZoom((value) => Math.min(300, value + 25))}><Icon name="zoom-in" /></button>
                    <button type="button" className="workspace-files__fit" onClick={() => setZoom(100)}>Fit</button>
                  </>
                : null}
              {selectedPreview?.kind === 'pdf'
                ? <>
                    <label className="workspace-files__pdf-search"><Icon name="search" /><input type="search" aria-label="Find on page" placeholder="Find on page" value={pdfSearch} onChange={(event) => setPdfSearch(event.target.value)} /></label>
                    <label className="workspace-files__page">Page <input type="number" min={1} aria-label="PDF page" value={page} onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))} /></label>
                  </>
                : null}
              <button type="button" data-files-explorer-toggle="true" aria-label={explorerOpen ?? !compact ? 'Hide file explorer' : 'Show file explorer'} aria-expanded={explorerOpen ?? !compact} title={explorerOpen ?? !compact ? 'Hide file explorer' : 'Show file explorer'} onClick={toggleExplorer}><Icon name="folder" /></button>
              <button type="button" aria-label="Close Workspace tab" title="Close Workspace tab" onClick={onClose}><Icon name="close" /></button>
            </div>
          </header>
          {actionStatus || splitPreferenceError ? <p className="workspace-files__toolbar-status" role="status">{actionStatus || splitPreferenceError}</p> : null}
          <div className="workspace-files__split" style={{ '--preview-split': `${comparisonSplit}%` } as React.CSSProperties}>
            <article aria-label="Selected file preview">{renderPreview(selectedPreview)}</article>
            {side ? <>
              <div
                className="workspace-files__separator"
                role="separator"
                tabIndex={0}
                aria-label="Resize file previews"
                aria-orientation="vertical"
                aria-valuemin={25}
                aria-valuemax={75}
                aria-valuenow={comparisonSplit}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  setComparisonSplit(event.key === 'Home' ? 25 : event.key === 'End' ? 75 : Math.max(25, Math.min(75, comparisonSplit + (event.key === 'ArrowLeft' ? -5 : 5))));
                }}
                onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
                    setComparisonSplit(Math.max(25, Math.min(75, (event.clientX - bounds.left) / bounds.width * 100)));
                  }
                }}
              />
              <article aria-label="Side file preview">{renderPreview(sidePreview)}</article>
            </> : null}
          </div>
        </section>,
        canvasTarget
      ) : null}
      {workspaceTarget && active && !compact && (explorerOpen ?? true) ? createPortal(
        <div
          className="workspace-files__layout-separator"
          role="separator"
          tabIndex={0}
          aria-label="Resize file preview and explorer"
          aria-orientation="vertical"
          aria-valuemin={Math.round((minimumPreviewWidth / Math.max(workspaceWidth, 1)) * 100)}
          aria-valuemax={Math.round(100 - (minimumExplorerWidth / Math.max(workspaceWidth, 1)) * 100)}
          aria-valuenow={Math.round(effectivePreviewRatio)}
          data-resizing={resizing || undefined}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            splitPointerStyles.current = { userSelect: document.body.style.userSelect, cursor: document.body.style.cursor };
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            splitPointerId.current = event.pointerId;
            setResizing(true);
          }}
        />,
        workspaceTarget
      ) : null}
    </>
  );
}
