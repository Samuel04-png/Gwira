import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon.js';
import { CompactActionMenu, type CompactAction } from '../../components/CompactActionMenu.js';
import { SidebarTooltip } from '../../components/SidebarTooltip.js';
import { LIBRARY_PREFERENCES_KEY, LIBRARY_STORAGE_KEY, libraryFolderChoices, libraryTypeForName, parseLibraryRecords, readLibraryPreferences, removeLibraryRecord, selectLibraryRecords, type LibraryDocument, type LibraryPreferences, type LibraryTab, type LibraryType } from './libraryModel.js';
import './library.css';
const tabs: LibraryTab[] = ['Suggested','Favorites','Folders','Images','All'];
const typeIcon = (type: LibraryType): IconName => type === 'Image' ? 'image' : type === 'Folder' ? 'folder' : type === 'Spreadsheet' ? 'table' : type === 'Presentation' ? 'presentation' : 'file';
const timeLabel = (item: LibraryDocument): string => new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(item.updatedAt && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : item.createdAt));
type Editor = { kind:'create' | 'edit'; type: 'Doc' | 'Folder'; item?: LibraryDocument } | { kind:'rename' | 'move' | 'delete'; item: LibraryDocument };

export function LibraryHeader({children}:{children?:React.ReactNode}):React.ReactElement {
  return <header className="gw-library__header"><h1>Library</h1>{children}</header>;
}

export function LibraryPage({authenticated=false}:{authenticated?:boolean}={}): React.ReactElement {
  const [records,setRecords] = useState<LibraryDocument[]>([]), [loading,setLoading] = useState(true), [loadError,setLoadError] = useState(''), [error,setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false);
  const [tab,setTab] = useState<LibraryTab>('Suggested'), [query,setQuery] = useState(''), [type,setType] = useState<LibraryType>(), [collection,setCollection] = useState<string>(), [archived,setArchived] = useState(false), [folderId,setFolderId] = useState<string>();
  const [preferences,setPreferences] = useState<LibraryPreferences>(() => { if(authenticated)return readLibraryPreferences(null);try { return readLibraryPreferences(localStorage.getItem(LIBRARY_PREFERENCES_KEY)); } catch { return readLibraryPreferences(null); } });
  const [selectedId,setSelectedId] = useState<string>(), [editor,setEditor] = useState<Editor>();
  const [columns,setColumns] = useState(1);
  const originId = useRef<string | undefined>(undefined);
  const root = useRef<HTMLElement>(null), origin = useRef<HTMLElement | null>(null);
  const load = (): void => { if(authenticated){setLoading(false);return;}setLoading(true); try { setRecords(parseLibraryRecords(localStorage.getItem(LIBRARY_STORAGE_KEY))); setLoadError(''); } catch (value) { setLoadError(value instanceof Error ? value.message : 'Library could not be loaded. Check storage access and retry.'); } finally { setLoading(false); } };
  useEffect(load,[]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(element), gap = parseFloat(style.getPropertyValue('--gw-space-4'));
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const card = parseFloat(style.getPropertyValue('--gw-library-card-width'));
      setColumns(Math.max(1, Math.floor((available + gap) / (card + gap))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const save = (next: LibraryDocument[], message: string): boolean => {
    if(authenticated){setError('Library storage is not connected for authenticated workspaces.');return false;}
    if (loadError) { setError('Library storage must be recovered before you can save changes.'); return false; }
    try { localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(next)); setRecords(next); setError(''); setNotice(message); return true; }
    catch { setError('Library changes could not be saved. Free device storage or check storage permissions, then try again.'); return false; }
  };
  const patchPreferences = (patch: Partial<LibraryPreferences>): void => { const next = {...preferences,...patch}; if(authenticated){setPreferences(next);return;}try { localStorage.setItem(LIBRARY_PREFERENCES_KEY,JSON.stringify(next)); setPreferences(next); setError(''); } catch { setError('Display settings could not be saved. Check device storage and try again.'); } };
  const [pointerInside,setPointerInside] = useState(false);
  const previousOrder = useRef<string[]>([]);
  const visible = useMemo(() => {
    const next = selectLibraryRecords(records,{tab,query,folderId,type,collection,archived,sort:preferences.sort});
    if (pointerInside) {
      const positions = new Map(previousOrder.current.map((id,index)=>[id,index]));
      next.sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity));
    }
    previousOrder.current = next.map(item=>item.id);
    return next;
  },[records,tab,query,folderId,type,collection,archived,preferences.sort,pointerInside]);
  // Distribute sorted items across columns, so the most relevant records begin at
  // the top rather than vanishing below a long, vertically filled CSS column.
  const groups: LibraryDocument[][] = Array.from({length:preferences.view==='grid'?columns:1},()=>[]);
  const heights = groups.map(()=>0);
  for (const item of visible) {
    const target = heights.indexOf(Math.min(...heights));
    groups[target]!.push(item);
    heights[target]! += item.type==='Folder'?128:item.type==='Image'?200:260;
  }
  const selected = records.find(item => item.id === selectedId), folder = records.find(item => item.id === folderId && item.type === 'Folder');
  const collections = [...new Set(records.map(item => item.collection).filter(Boolean))].sort();
  const restoreFocus = (): void => { const item = [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-library-item]')??[])].find(element=>element.dataset.libraryItem===originId.current); (item??(origin.current?.isConnected?origin.current:root.current?.querySelector<HTMLButtonElement>('button')))?.focus(); };
  const edit = (next: Editor): void => { originId.current = 'item'in next?next.item?.id:undefined; origin.current = document.activeElement as HTMLElement; setError(''); setEditor(next); };
  const closeDialog = (): void => { setEditor(undefined); setSelectedId(undefined); requestAnimationFrame(restoreFocus); };
  const open = (item: LibraryDocument, trigger?: HTMLElement): void => { originId.current = item.id; origin.current = trigger ?? document.activeElement as HTMLElement; if (item.type === 'Folder') { setFolderId(item.id); setTab('All'); setQuery(''); } else setSelectedId(item.id); };
  const toggleFavorite = (item: LibraryDocument): void => { save(records.map(record => record.id === item.id ? {...record,favorite:!record.favorite} : record), item.favorite ? 'Removed from Favorites.' : 'Added to Favorites.'); };
  const reveal = async (item: LibraryDocument): Promise<void> => { if (!item.path) return; setNotice('Opening the file location…'); try { await window.codexDesktop.openExternalTarget({target:item.path}); setNotice('File location requested.'); } catch { setError('The original file could not be located. Check that it is still available on this device.'); } };
  const importFiles = async (): Promise<void> => {
    if(authenticated){setError('Adding local files is unavailable in authenticated workspaces.');return;}
    if (busy || loadError) return;
    setBusy(true); setNotice('Choose files to add to Library…'); setError('');
    try {
      const result = await window.codexDesktop.selectFiles();
      if (result.canceled) { setNotice(''); return; }
      const now = new Date().toISOString();
      const paths = new Set(records.map(item => item.path).filter(Boolean));
      const imported: LibraryDocument[] = [];
      for (const file of result.files) { if (paths.has(file.path)) continue; paths.add(file.path); imported.push({id:crypto.randomUUID(),title:file.name,type:libraryTypeForName(file.name),collection:folder?.title ?? 'Unsorted',owner:'',updated:now,updatedAt:now,createdAt:now,access:'Private',doatAccess:'',description:'',path:file.path,parentId:folderId}); }
      if (!imported.length) { setNotice('These files are already in Library.'); return; }
      if (save([...imported,...records],`${imported.length} file${imported.length === 1 ? '' : 's'} added to this device’s Library.`)) { setTab('All'); setQuery(''); setType(undefined); setArchived(false); }
    } catch { setError('Files could not be added. Choose local files that are accessible on this device and retry.'); }
    finally { setBusy(false); }
  };
  const actions = (item: LibraryDocument): CompactAction[] => [
    {label:'Open',icon:typeIcon(item.type),onSelect:()=>open(item)},
    {label:item.favorite?'Remove from Favorites':'Add to Favorites',icon:'bookmark',onSelect:()=>toggleFavorite(item)},
    ...(item.type === 'Doc' && !item.path ? [{label:'Edit document',icon:'new-work' as const,onSelect:()=>edit({kind:'edit',type:'Doc',item})}] : []),
    {label:'Rename',icon:'new-work',onSelect:()=>edit({kind:'rename',item})},
    {label:'Move to folder',icon:'folder',onSelect:()=>edit({kind:'move',item})},
    ...(item.path ? [{label:'Show in folder',icon:'external' as const,onSelect:()=>{void reveal(item);}}] : []),
    {label:item.archived?'Unarchive':'Archive',icon:'archive',onSelect:()=>{save(records.map(record=>record.id===item.id?{...record,archived:!item.archived}:record),item.archived?'Item restored.':'Item archived. Find it in Filters → Archived.');}},
    {label:'Remove from Library',icon:'trash',onSelect:()=>edit({kind:'delete',item})},
  ];
  const filters: CompactAction[] = [
    {label:'All file types',checked:!type,onSelect:()=>setType(undefined)},
    ...(['Doc','Image','PDF','Spreadsheet','Presentation','Folder','File'] as const).map(value=>({label:value==='Doc'?'Documents':value==='Image'?'Images':value,checked:type===value,onSelect:()=>setType(value)})),
    {label:'Archived',checked:archived,checkType:'checkbox',onSelect:()=>setArchived(!archived)},
    ...collections.map(value=>({label:`Collection: ${value}`,checked:collection===value,onSelect:()=>setCollection(collection===value?undefined:value)})),
    {label:'Clear filters',onSelect:()=>{setType(undefined);setCollection(undefined);setArchived(false);setQuery('');}},
  ];
  const display: CompactAction[] = [
    {label:'Recently updated',checked:preferences.sort==='updated',onSelect:()=>patchPreferences({sort:'updated'})},
    {label:'Recently created',checked:preferences.sort==='created',onSelect:()=>patchPreferences({sort:'created'})},
    {label:'Name A–Z',checked:preferences.sort==='name-asc',onSelect:()=>patchPreferences({sort:'name-asc'})},
    {label:'Name Z–A',checked:preferences.sort==='name-desc',onSelect:()=>patchPreferences({sort:'name-desc'})},
    {label:'Show image names',checked:preferences.showNames,checkType:'checkbox',onSelect:()=>patchPreferences({showNames:!preferences.showNames})},
  ];
  const reset = (): void => { setQuery('');setType(undefined);setCollection(undefined);setArchived(false);setTab('All'); };
  const listKeys = (event: React.KeyboardEvent): void => { const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-library-item]')], index=items.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();const item=records.find(record=>record.id===items[index]?.dataset.libraryItem);if(item)open(item,items[index]);return;}if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1)+items.length)%items.length]?.focus();} };
  return <section className="gw-library" aria-label="Library" ref={root} aria-busy={busy||loading} data-testid="library-page">
    <LibraryHeader><div className="gw-library__toolbar">
      <CompactActionMenu label="Filter library" icon="filter" actions={filters}/>
      <div className="gw-library__views" role="group" aria-label="Library layout"><button type="button" aria-label="Grid view" aria-pressed={preferences.view==='grid'} onClick={()=>patchPreferences({view:'grid'})}><Icon name="grid"/></button><button type="button" aria-label="List view" aria-pressed={preferences.view==='list'} onClick={()=>patchPreferences({view:'list'})}><Icon name="list"/></button></div>
      <label className="gw-library__search"><Icon name="search"/><input type="search" aria-label="Search library" placeholder="Search library" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <CompactActionMenu label="New library item" triggerText="New" icon="chevron-down" className="gw-library__new" actions={[{label:'New document',icon:'file',disabled:authenticated||!!loadError,reason:authenticated?'Library storage is not connected.':'Library storage must be recovered before adding items.',onSelect:()=>edit({kind:'create',type:'Doc'})},{label:'New folder',icon:'folder',disabled:authenticated||!!loadError,reason:authenticated?'Library storage is not connected.':'Library storage must be recovered before adding items.',onSelect:()=>edit({kind:'create',type:'Folder'})},{label:'Add files',icon:'attachment',disabled:authenticated||busy||!!loadError,reason:authenticated?'Local file access is unavailable.':'Wait for the current operation or recover Library storage.',onSelect:()=>{void importFiles();}}]}/>
      <CompactActionMenu label="Library display options" icon="views" actions={display}/>
    </div></LibraryHeader>
    <div className="gw-library__tabs" role="tablist" aria-label="Library categories">{tabs.map((value,index)=><button type="button" key={value} role="tab" aria-selected={tab===value} tabIndex={tab===value?0:-1} onClick={()=>setTab(value)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[target]!);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[target]?.focus();}}}>{value}</button>)}</div>
    {folder?<nav className="gw-library__breadcrumb" aria-label="Library folder"><button type="button" onClick={()=>{setFolderId(folder.parentId);setQuery('');}}><Icon name="back"/>{folder.parentId?records.find(item=>item.id===folder.parentId)?.title??'Library':'Library'}</button><span>/</span><span>{folder.title}</span></nav>:null}
    {type||collection||archived?<div className="gw-library__applied"><span>{[type,collection,archived?'Archived':null].filter(Boolean).join(' · ')}</span><button type="button" onClick={reset}>Clear filters</button></div>:null}
    <div role="status" className="gw-library__notice">{notice}</div>
    {error?<div className="gw-library__error" role="alert">{error}<button type="button" onClick={()=>setError('')}>Dismiss</button></div>:null}
    {loading?<div className="gw-library__empty" role="status">Loading Library…</div>:loadError?<div className="gw-library__empty" role="alert"><Icon name="failed"/><h2>Library could not be loaded</h2><p>{loadError}</p><button type="button" onClick={load}>Retry</button></div>:!visible.length?<div className="gw-library__empty"><Icon name={tab==='Images'?'image':tab==='Favorites'?'bookmark':'library'} size={20}/><h2>{authenticated?'Library is unavailable':records.length?'Nothing here yet':'Your Library starts here'}</h2><p>{authenticated?'Workspace library data is not connected yet. Plans remain available from their conversations.':records.length?'Try another category, search or filter.':'Add files, create a document, or organize your work in folders.'}</p>{authenticated?null:records.length?<button type="button" onClick={()=>{reset();setFolderId(undefined);}}>Show all items</button>:<button type="button" onClick={()=>{void importFiles();}}>Add files</button>}</div>:<div className={`gw-library__items is-${preferences.view}`} onKeyDown={listKeys} onPointerEnter={()=>setPointerInside(true)} onPointerLeave={()=>setPointerInside(false)} aria-label="Saved Library items">{groups.map((items,column)=><div className="gw-library__column" key={column}>{items.map(item=><article className={`gw-library__card is-${item.type.toLowerCase()}`} key={item.id}>
      <SidebarTooltip label={`${item.title} · ${item.type} · ${item.collection}`} placement="bottom" className="gw-library__card-host"><button type="button" data-library-item={item.id} aria-label={`Open ${item.title}`} onClick={event=>open(item,event.currentTarget)}>
        {item.type==='Image'&&item.path?<LibraryImage path={item.path} label={item.title}/>:<><div className="gw-library__card-title"><Icon name={typeIcon(item.type)}/><span>{item.title}</span></div><div className="gw-library__paper">{item.type==='Doc'&&item.content?<><p>{item.content}</p><span className="gw-library__file-glyph is-list-only"><Icon name={typeIcon(item.type)} size={20}/></span></>:<span className="gw-library__file-glyph"><Icon name={typeIcon(item.type)} size={20}/></span>}</div></>}
        <div className={`gw-library__caption${preferences.showNames?' show-names':''}`}><strong>{item.title}</strong><small>{item.type} · {timeLabel(item)}</small></div>
      </button></SidebarTooltip>
      <div className="gw-library__card-actions"><button type="button" aria-label={`${item.favorite?'Remove from':'Add to'} Favorites: ${item.title}`} aria-pressed={!!item.favorite} onClick={()=>toggleFavorite(item)}><Icon name="bookmark"/></button><CompactActionMenu label={`Actions for ${item.title}`} actions={actions(item)}/></div>
    </article>)}</div>)}</div>}
    {!authenticated&&<footer className="gw-library__footer">Saved on this device. Imported files remain at their original location.</footer>}
    {selected?<LibraryDialog label={selected.title} onClose={closeDialog}><header><div><small>{selected.type} · {timeLabel(selected)}</small><h2>{selected.title}</h2></div><button type="button" aria-label="Close preview" onClick={closeDialog}><Icon name="close"/></button></header>{selected.type==='Image'&&selected.path?<LibraryImage path={selected.path} label={selected.title} full/>:selected.type==='Doc'&&selected.content?<div className="gw-library-dialog__content">{selected.content}</div>:<div className="gw-library-dialog__unavailable"><Icon name={typeIcon(selected.type)} size={20}/><p>{selected.description||'No preview content is stored for this item.'}</p>{selected.path?<p>Open its location to view it with an application on this device.</p>:null}</div>}<dl><div><dt>Collection</dt><dd>{selected.collection}</dd></div>{selected.owner?<div><dt>Recorded owner</dt><dd>{selected.owner}</dd></div>:null}{selected.path?<div><dt>Original file</dt><dd>{selected.path}</dd></div>:null}</dl><footer><button type="button" onClick={()=>toggleFavorite(selected)}>{selected.favorite?'Remove from Favorites':'Add to Favorites'}</button>{selected.type==='Doc'&&!selected.path?<button type="button" onClick={()=>{setSelectedId(undefined);edit({kind:'edit',type:'Doc',item:selected});}}>Edit document</button>:null}{selected.path?<button type="button" onClick={()=>{void reveal(selected);}}>Show in folder</button>:null}</footer></LibraryDialog>:null}
    {editor?<LibraryEditor key={`${editor.kind}:${'item'in editor?editor.item?.id??'new':'new'}`} editor={editor} records={records} folderId={folderId} onClose={closeDialog} onSave={save} onSaved={()=>{setEditor(undefined);requestAnimationFrame(restoreFocus);}}/>:null}
  </section>;
}

function LibraryImage({path,label,full=false}:{path:string;label:string;full?:boolean}):React.ReactElement {
  const [url,setUrl]=useState<string>(),[failure,setFailure]=useState('');
  useEffect(()=>{let alive=true;setUrl(undefined);setFailure('');void window.codexDesktop.readLocalImage({path}).then(result=>{if(!alive)return;if(result.dataUrl)setUrl(result.dataUrl);else setFailure('The original image is no longer available.');}).catch(()=>{if(alive)setFailure('Image could not be read. Check that the original file is accessible.');});return()=>{alive=false;};},[path]);
  return failure?<div className="gw-library__image-error"><Icon name="image"/><span>{failure}</span><span>Use Show in folder to locate the original.</span></div>:url?<img className={full?'gw-library__image is-full':'gw-library__image'} src={url} alt={label} loading="lazy" onError={()=>setFailure('This image format cannot be previewed here.')}/>:<span className="gw-library__image-loading" role="status">Loading image…</span>;
}
function LibraryDialog({label,onClose,children}:{label:string;onClose:()=>void;children:React.ReactNode}):React.ReactElement {
  const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
  return <dialog ref={ref} className="gw-library-dialog" aria-label={label} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}}} onCancel={event=>{event.preventDefault();onClose();}}>{children}</dialog>;
}
function LibraryEditor({editor,records,folderId,onClose,onSave,onSaved}:{editor:Editor;records:LibraryDocument[];folderId?:string;onClose:()=>void;onSave:(next:LibraryDocument[],message:string)=>boolean;onSaved:()=>void}):React.ReactElement {
  const item='item'in editor?editor.item:undefined;
  const [title,setTitle]=useState(item?.title??''),[content,setContent]=useState(item?.content??''),[parent,setParent]=useState(item?.parentId??''),[error,setError]=useState('');
  const heading=editor.kind==='delete'?'Remove from Library?':editor.kind==='move'?'Move to folder':editor.kind==='rename'?'Rename item':editor.kind==='edit'?'Edit document':'type'in editor&&editor.type==='Folder'?'New folder':'New document';
  return <LibraryDialog label={heading} onClose={onClose}><form onSubmit={event=>{event.preventDefault();setError('');if(editor.kind!=='delete'&&editor.kind!=='move'&&!title.trim()){setError('Enter a name.');return;}const now=new Date().toISOString();let next:LibraryDocument[];if(editor.kind==='delete')next=removeLibraryRecord(records,editor.item.id);else if(editor.kind==='move')next=records.map(record=>record.id===editor.item.id?{...record,parentId:parent||undefined,updatedAt:now}:record);else if(item)next=records.map(record=>record.id===item.id?{...record,title:title.trim(),...(editor.kind==='edit'?{content}:{}),updatedAt:now}:record);else next=[{id:crypto.randomUUID(),title:title.trim(),type:editor.kind==='create'?editor.type:'Doc',collection:'Unsorted',owner:'',updated:now,updatedAt:now,createdAt:now,access:'Private',doatAccess:'',description:'',parentId:folderId,...(editor.kind==='create'&&editor.type==='Doc'?{content}:{})},...records];if(onSave(next,editor.kind==='delete'?'Removed from Library. Original files were not deleted.':'Library changes saved.'))onSaved();else setError('Changes could not be saved. Check device storage and retry.');}}>
    <header><h2>{heading}</h2><button type="button" aria-label="Close library editor" onClick={onClose}><Icon name="close"/></button></header>
    {editor.kind==='delete'?<p>Remove “{item?.title}” from this Library? Original files stay on disk. Items inside a removed folder remain in Library.</p>:editor.kind==='move'?<label>Folder<select autoFocus value={parent} onChange={event=>setParent(event.target.value)}><option value="">No folder</option>{libraryFolderChoices(records,editor.item.id).map(folder=><option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label>:<><label>Name<input autoFocus required maxLength={240} value={title} onChange={event=>setTitle(event.target.value)}/></label>{(editor.kind==='create'&&editor.type==='Doc'||editor.kind==='edit')?<label>Content<textarea maxLength={100000} value={content} onChange={event=>setContent(event.target.value)} placeholder="Write your document…"/></label>:null}</>}
    {error?<p role="alert">{error}</p>:null}<footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className={editor.kind==='delete'?'is-danger':'is-primary'}>{editor.kind==='delete'?'Remove item':editor.kind==='move'?'Move item':'Save'}</button></footer>
  </form></LibraryDialog>;
}
