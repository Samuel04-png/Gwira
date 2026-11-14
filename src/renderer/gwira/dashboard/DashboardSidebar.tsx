import { recordedSidebarActivity } from './sidebarActivity.js';
import { SidebarSection as Section } from '../../components/SidebarSection.js';
import type { NavigationStatusKind } from '../../components/NavigationStatus.js';
import { CompactActionMenu } from '../../components/CompactActionMenu.js';
import { NavigationStatus } from '../../components/NavigationStatus.js';
import { ChannelsSection, DashboardChannels, type ChannelSidebarPreferences } from './DashboardChannels.js';
import { ItemTitle } from '../../components/ItemTitle.js';
import { Icon, NavigationIcon } from "../../components/Icon.js";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GwiraLocalState, Person } from '../domain/types.js';
import type { Doat, DoatOperationalStatus } from '../doats/domain/types.js';
import type { WorkspaceNavigation } from '../../navigationTypes.js';
import type {ExpectedWorkspace} from '../../../shared/scopedPreferences.js';
import type {CloudDirectory,CloudEmployee} from '../../../shared/cloudDirectory.js';
import {DirectoryDialog} from '../../components/DirectoryDialog.js';
import {parseBusinessSidebarPreferences,parseChannelSidebarPreferences} from './businessSidebarPreferences.js';
import {parsePendingChannelCreate,type PendingChannelCreate} from './pendingChannelCreate.js';
import {CreateConversationDialog} from '../inbox/InboxPage.js';
import {createPortal} from 'react-dom';
import type {useAuthenticatedChannels} from '../../auth/useAuthenticatedChannels.js';
import {WorkforceForm} from '../workforce/Forms.js';
import {parsePendingDirectoryPerson,type PendingDirectoryPerson} from './pendingDirectoryPerson.js';
import '../workforce/workforce.css';

export type SidebarSelection = { kind: 'person'; id: string } | { kind: 'doat'; id: string } | { kind: 'channel'; id: string };
export type OpenOptions = { openInspector: true; tab: 'chat' };
export function useDashboardSelection(onSelect?: (selection: SidebarSelection, options?: OpenOptions) => void): { selected: SidebarSelection | null; select: (selection: SidebarSelection, options?: OpenOptions) => void } {
  const [selected, setSelected] = useState<SidebarSelection | null>(null);
  return { selected, select: (selection, options) => { setSelected(selection); onSelect?.(selection, options); } };
}

type Entry = { id: string; kind: SidebarSelection['kind']; name: string; updatedAt: string; status?: DoatOperationalStatus; activity?: NavigationStatusKind; completionVersion?: string; task?: string };
const pinKey = 'gwira.dashboard-sidebar.pinned.v1';
const collapsedKey = 'gwira.dashboard-sidebar.sections.v1';
function readArray(key: string): string[] { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }
function readPins(scope: string): string[] { try { return localStorage.getItem(`${pinKey}:${scope}`) === null ? readArray(pinKey) : readArray(`${pinKey}:${scope}`); } catch { return []; } }
function readSections(): Record<string, boolean> { try { const value: unknown = JSON.parse(localStorage.getItem(collapsedKey) ?? '{}'); return value && typeof value === 'object' ? value as Record<string, boolean> : {}; } catch { return {}; } }
function initials(name: string): string { return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'; }
function statusSentence(entry: Entry): string | undefined {
  if (!entry.status) return undefined;
  switch (entry.status) { case 'working': return `${entry.name} is working${entry.task ? ` on ${entry.task}` : ''}.`; case 'waiting_for_approval': return `${entry.name} is waiting for your approval.`; case 'idle': return `${entry.name} is idle.`; case 'paused': return `${entry.name} is paused.`; case 'failed': return `${entry.name} failed during its last run.`; case 'completed': return `${entry.name} completed its last run.`; default: return undefined; }
}
export type BusinessNavigation = Exclude<WorkspaceNavigation, 'home' | 'chat' | 'skills'>;
export function DashboardSidebarNavigation({activeView,onNavigate}:{activeView:WorkspaceNavigation;onNavigate:(view:BusinessNavigation)=>void}):React.ReactElement {
  const navRows: Array<{ view: BusinessNavigation; label: string; icon: React.ReactNode }> = [
    { view: 'dashboard', label: 'Dashboard', icon: <NavigationIcon name="dashboard" active={activeView === 'dashboard'} size={18} /> },
    { view: 'inbox', label: 'Inbox', icon: <NavigationIcon name="inbox" active={activeView === 'inbox'} size={18} /> },
    { view: 'my-work', label: 'My Work', icon: <NavigationIcon name="work" active={activeView === 'my-work'} size={18} /> },
    { view: 'organization', label: 'Views', icon: <NavigationIcon name="views" active={activeView === 'organization'} size={18} /> }
  ];
  return <><header className="dashboard-sidebar__header"><strong>Gwira</strong></header><div className="dashboard-sidebar__nav">
    {navRows.map(row=><button key={row.view} type="button" data-navigation-view={row.view} className={`dashboard-sidebar__nav-row ${activeView === row.view ? 'is-active active' : ''}`} aria-current={activeView === row.view ? 'page' : undefined} onClick={()=>onNavigate(row.view)}>{row.icon}{row.label}</button>)}
  </div></>;
}
export function AuthenticatedDashboardSidebar({activeView,onNavigate,workspace,scope,channels,onOpenChannel,canManageDirectory}:{activeView:WorkspaceNavigation;onNavigate:(view:BusinessNavigation)=>void;workspace:string;scope:ExpectedWorkspace;channels:ReturnType<typeof useAuthenticatedChannels>;onOpenChannel:(id:string)=>void;canManageDirectory:boolean}):React.ReactElement {
  const [expanded,setExpanded]=useState({pinned:true,channels:true,people:true});
  const [directory,setDirectory]=useState<CloudDirectory>({employees:[],pins:[]});
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<CloudEmployee>();
  const [filter,setFilter]=useState<'all'|'person'|'doat'>('all');
  const [showAll,setShowAll]=useState({pinned:false,people:false});
  const [sectionLoaded,setSectionLoaded]=useState(false),[sectionError,setSectionError]=useState('');
  const live=useRef(false),sequence=useRef(0),lock=useRef(false);
  const sectionRevision=useRef(0),sectionWrites=useRef<Promise<void>>(Promise.resolve());
  const [sectionRetry,setSectionRetry]=useState(0);
  const [channelPreferences,setChannelPreferences]=useState<ChannelSidebarPreferences>({filter:'all',sort:'recent'});
  const [channelPreferencesLoaded,setChannelPreferencesLoaded]=useState(false),[channelPreferencesError,setChannelPreferencesError]=useState(''),[channelPreferencesRetry,setChannelPreferencesRetry]=useState(0);
  const channelRevision=useRef(0),channelWrites=useRef<Promise<void>>(Promise.resolve());
  const [createChannel,setCreateChannel]=useState(false),[creatingChannel,setCreatingChannel]=useState(false),[channelError,setChannelError]=useState('');
  const [pendingCreate,setPendingCreate]=useState<PendingChannelCreate|null>(null),[pendingCreateLoaded,setPendingCreateLoaded]=useState(false),[pendingCreateError,setPendingCreateError]=useState(''),[pendingCreateRetry,setPendingCreateRetry]=useState(0);
  const createTrigger=useRef<HTMLButtonElement>(null),createLock=useRef(false);
  const [personForm,setPersonForm]=useState(false),[personPending,setPersonPending]=useState<PendingDirectoryPerson|null>(null);
  const [personLoaded,setPersonLoaded]=useState(false),[personError,setPersonError]=useState(''),[personBusy,setPersonBusy]=useState(false),[personRetry,setPersonRetry]=useState(0);
  const personLock=useRef(false);
  const businessActive=['dashboard','inbox','my-work','organization'].includes(activeView);
  const wasBusinessActive=useRef(false);
  async function load():Promise<void>{
    const request=++sequence.current;setLoading(true);setError('');
    try {
      const result=await window.codexDesktop.directory.request({type:'list'},scope);
      if(!result)throw Error('Invalid directory response.');
      if(live.current&&request===sequence.current)setDirectory(result);
    } catch {if(live.current&&request===sequence.current)setError('Directory could not be loaded. Check your connection and try again.');}
    finally {if(live.current&&request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{live.current=true;void load();return()=>{live.current=false;sequence.current++;};},[scope.userId,scope.organizationId]);
  useEffect(()=>{
    if(businessActive&&!wasBusinessActive.current)void load();
    wasBusinessActive.current=businessActive;
  },[businessActive]);
  useEffect(()=>{
    if(sectionLoaded)return;
    let active=true;
    void window.codexDesktop.scopedPreferences.read('business-sidebar',scope).then(raw=>{
      const value=parseBusinessSidebarPreferences(raw);
      if(!active)return;
      if(sectionRevision.current===0)setExpanded(value);
      setSectionError('');setSectionLoaded(true);
    }).catch(()=>{if(active)setSectionError('Business sidebar preferences could not be loaded.');});
    return()=>{active=false;};
  },[scope.userId,scope.organizationId,sectionRetry,sectionLoaded]);
  useEffect(()=>{
    if(!sectionLoaded||sectionRevision.current===0)return;
    let active=true;
    const revision=sectionRevision.current;
    const pending=sectionWrites.current.catch(()=>{}).then(async()=>{
      if(!active||revision!==sectionRevision.current)return;
      await window.codexDesktop.scopedPreferences.write('business-sidebar',JSON.stringify(expanded),scope);
    });
    sectionWrites.current=pending;
    void pending.then(()=>{if(active)setSectionError('');}).catch(()=>{if(active)setSectionError('Business sidebar preferences could not be saved.');});
    return()=>{active=false;};
  },[expanded,sectionLoaded,scope.userId,scope.organizationId,sectionRetry]);
  useEffect(()=>{
    if(channelPreferencesLoaded)return;
    let active=true;
    void window.codexDesktop.scopedPreferences.read('business-channels',scope).then(raw=>{
      const value=parseChannelSidebarPreferences(raw);
      if(active){setChannelPreferences(value);setChannelPreferencesError('');setChannelPreferencesLoaded(true);}
    }).catch(()=>{if(active)setChannelPreferencesError('Channel navigation preferences could not be loaded.');});
    return()=>{active=false;};
  },[scope.userId,scope.organizationId,channelPreferencesRetry,channelPreferencesLoaded]);
  useEffect(()=>{
    if(pendingCreateLoaded)return;
    let active=true;
    void window.codexDesktop.scopedPreferences.read('pending-channel-create',scope).then(raw=>{
      const value=parsePendingChannelCreate(raw);
      if(active){setPendingCreate(value);setPendingCreateError(value?'Channel creation is unconfirmed. Retry to avoid creating a duplicate.':'');setPendingCreateLoaded(true);}
    }).catch(()=>{if(active)setPendingCreateError('Pending channel creation could not be loaded.');});
    return()=>{active=false;};
  },[scope.userId,scope.organizationId,pendingCreateRetry,pendingCreateLoaded]);
  useEffect(()=>{
    if(personLoaded)return;
    let active=true;
    void window.codexDesktop.scopedPreferences.read('pending-directory-person',scope).then(raw=>{
      const value=parsePendingDirectoryPerson(raw);
      if(active){setPersonPending(value);setPersonError(value?'Person creation is unconfirmed. Retry before adding another person.':'');setPersonLoaded(true);}
    }).catch(()=>{if(active)setPersonError('Pending person creation could not be loaded.');});
    return()=>{active=false;};
  },[scope.userId,scope.organizationId,personRetry,personLoaded]);
  useEffect(()=>{
    if(!channelPreferencesLoaded||channelRevision.current===0)return;
    let active=true;
    const revision=channelRevision.current;
    const pending=channelWrites.current.catch(()=>{}).then(async()=>{
      if(!active||revision!==channelRevision.current)return;
      await window.codexDesktop.scopedPreferences.write('business-channels',JSON.stringify(channelPreferences),scope);
    });
    channelWrites.current=pending;
    void pending.then(()=>{if(active)setChannelPreferencesError('');}).catch(()=>{if(active)setChannelPreferencesError('Channel navigation preferences could not be saved.');});
    return()=>{active=false;};
  },[channelPreferences,channelPreferencesLoaded,scope.userId,scope.organizationId,channelPreferencesRetry]);
  async function pin(id:string,pinned:boolean):Promise<void>{
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {await window.codexDesktop.directory.request({type:'pin',id,pinned},scope);if(live.current)await load();}
    catch {if(live.current)setError('The pin could not be saved. Check your connection and try again.');}
    finally {lock.current=false;if(live.current)setBusy(false);}
  }
  const toggle=(key:keyof typeof expanded)=>{sectionRevision.current++;setExpanded(current=>({...current,[key]:!current[key]}));};
  const onListKey=(event:React.KeyboardEvent<HTMLElement>)=>{
    const rows=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('.dashboard-sidebar__row')].filter(row=>!row.closest('[hidden]'));
    const index=rows.indexOf(document.activeElement as HTMLButtonElement);
    if(index<0)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();rows[(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length]?.focus();}
    if(event.key==='Home'||event.key==='End'){event.preventDefault();rows[event.key==='Home'?0:rows.length-1]?.focus();}
  };
  const renderRows=(section:'pinned'|'people',people:CloudEmployee[])=>{
    const visible=showAll[section]?people:people.slice(0,6);
    return <>{visible.map(person=><ConversationRow key={person.id} workspaceName={workspace} entry={{id:`person:${person.id}`,kind:'person',name:person.name,updatedAt:person.created_at}} selected={selected?.id===person.id} onOpen={()=>setSelected(person)} onPin={()=>void pin(person.id,!directory.pins.includes(person.id))} pinned={directory.pins.includes(person.id)} pinDisabled={busy||loading}/>)}
      {people.length>6&&<button type="button" className="dashboard-sidebar__show-all" onClick={()=>setShowAll(value=>({...value,[section]:!value[section]}))}>{showAll[section]?'Show less':`Show all ${people.length}`}</button>}</>;
  };
  const pinned=directory.employees.filter(person=>directory.pins.includes(person.id));
  const people=directory.employees.filter(person=>!directory.pins.includes(person.id));
  const participants=directory.employees.flatMap(person=>person.user_id?[{ref:{kind:'human' as const,id:person.user_id},name:person.name,available:true,role:person.job_title}]:[]);
  const closeCreate=()=>{if(creatingChannel)return;setCreateChannel(false);setChannelError('');createTrigger.current?.focus();};
  async function confirmCreate(request:PendingChannelCreate):Promise<void>{
    try {
      await window.codexDesktop.channels.request(request,scope);
      await window.codexDesktop.scopedPreferences.write('pending-channel-create','null',scope);
      if(!live.current)return;
      setPendingCreate(null);setPendingCreateError('');await channels.refresh();createTrigger.current?.focus();
    } catch {if(live.current)setPendingCreateError('Channel creation could not be confirmed. Retry to avoid creating a duplicate.');}
  }
  async function retryCreate():Promise<void>{
    if(!pendingCreate||createLock.current)return;
    createLock.current=true;setCreatingChannel(true);
    try{await confirmCreate(pendingCreate);}finally{createLock.current=false;if(live.current)setCreatingChannel(false);}
  }
  async function confirmPerson(request:PendingDirectoryPerson):Promise<void>{
    try {
      await window.codexDesktop.directory.request(request,scope);
      await window.codexDesktop.scopedPreferences.write('pending-directory-person','null',scope);
      if(live.current){setPersonPending(null);setPersonError('');await load();}
    }catch{if(live.current)setPersonError('Person creation could not be confirmed. Retry or check whether the person already exists before discarding this request.');}
  }
  async function retryPerson():Promise<void>{
    if(!personPending||personLock.current)return;
    personLock.current=true;setPersonBusy(true);
    try{await confirmPerson(personPending);}finally{personLock.current=false;if(live.current)setPersonBusy(false);}
  }
  async function discardPerson():Promise<void>{
    if(personLock.current)return;
    personLock.current=true;setPersonBusy(true);
    try{await window.codexDesktop.scopedPreferences.write('pending-directory-person','null',scope);if(live.current){setPersonPending(null);setPersonError('');await load();}}
    catch{if(live.current)setPersonError('The pending person request could not be discarded.');}
    finally{personLock.current=false;if(live.current)setPersonBusy(false);}
  }
  const createDialog=createChannel?createPortal(<CreateConversationDialog initialKind="channel" availableKinds={['channel']} storageNote="Shared with authorized workspace members" participants={participants} selfPersonId={scope.userId} saving={creatingChannel} error={channelError} onClose={closeCreate} onCreate={(_kind,values)=>{
    if(createLock.current||pendingCreate||!pendingCreateLoaded)return;
    const members=values.members.filter(member=>member.kind==='human').map(member=>member.id);
    const request:PendingChannelCreate={type:'create',id:crypto.randomUUID(),name:values.name,topic:values.topic,visibility:values.visibility??'org',members};
    createLock.current=true;setCreatingChannel(true);setChannelError('');
    void (async()=>{
      try{
        await window.codexDesktop.scopedPreferences.write('pending-channel-create',JSON.stringify(request),scope);
        if(!live.current)return;
        setPendingCreate(request);setCreateChannel(false);await confirmCreate(request);
      }catch{if(live.current)setChannelError('Channel creation could not be prepared for a safe retry.');}
      finally{createLock.current=false;if(live.current)setCreatingChannel(false);}
    })();
  }}/>,document.body):null;
  return <nav className="dashboard-sidebar" aria-label="Business navigation" onKeyDown={onListKey}>
    <DashboardSidebarNavigation activeView={activeView} onNavigate={onNavigate}/>
    <div className="dashboard-sidebar__scroll">
      {error&&<p className="dashboard-sidebar__empty" role="alert">{error} <button type="button" disabled={loading||busy} onClick={()=>void load()}>Retry</button></p>}
      {sectionError&&<p className="dashboard-sidebar__empty" role="alert">{sectionError} <button type="button" onClick={()=>setSectionRetry(value=>value+1)}>Retry</button></p>}
      {channelPreferencesError&&<p className="dashboard-sidebar__empty" role="alert">{channelPreferencesError} <button type="button" onClick={()=>setChannelPreferencesRetry(value=>value+1)}>Retry</button></p>}
      {pendingCreateError&&<p className="dashboard-sidebar__empty" role="alert">{pendingCreateError} <button type="button" disabled={creatingChannel} onClick={()=>pendingCreate?void retryCreate():setPendingCreateRetry(value=>value+1)}>Retry</button></p>}
      {personError&&<p className="dashboard-sidebar__empty" role="alert">{personError} <button type="button" disabled={personBusy||!!personPending&&!canManageDirectory} onClick={()=>personPending?void retryPerson():setPersonRetry(value=>value+1)}>Retry</button>{personPending&&<button type="button" disabled={personBusy} onClick={()=>void discardPerson()}>Discard pending request</button>}</p>}
      {pendingCreate&&!pendingCreateError&&<p className="dashboard-sidebar__empty" role="status">Confirming channel creation…</p>}
      {loading&&<p className="dashboard-sidebar__empty" role="status">Loading directory…</p>}
      <Section id="authenticated-dashboard-pinned" label="Pinned" expanded={expanded.pinned} onToggle={()=>toggle('pinned')}>{pinned.length?renderRows('pinned',pinned):<p className="dashboard-sidebar__empty">Nothing pinned yet.</p>}</Section>
      <ChannelsSection id="authenticated-dashboard-channels" expanded={expanded.channels} onToggle={()=>toggle('channels')} entries={channels.channels.map(channel=>({id:channel.id,title:channel.name,unread:channel.unread,muted:channel.muted,sortAt:channel.updated_at}))} preferences={channelPreferences} preferencesDisabled={!channelPreferencesLoaded} onPreferences={update=>{channelRevision.current++;setChannelPreferences(current=>({...current,...update}));}} onOpen={onOpenChannel} createTitle={pendingCreate?'Confirm the pending channel first.':'Create channel'} createDisabled={channels.loading||!!channels.error||loading||!pendingCreateLoaded||!!pendingCreate||creatingChannel} createButtonRef={createTrigger} onCreate={()=>{setChannelError('');setCreateChannel(true);}} createDialog={createDialog} error={channels.error} onRetry={()=>void channels.refresh()} loading={channels.loading}/>
      <Section id="authenticated-dashboard-people" label="Directory" expanded={expanded.people} onToggle={()=>toggle('people')} actions={<div className="dashboard-sidebar__section-actions"><CompactActionMenu label="Directory options" actions={(['all','person','doat'] as const).map(value=>({label:value==='all'?'All':value==='person'?'People':'Daots',checked:filter===value,onSelect:()=>setFilter(value)}))}/><CompactActionMenu label="Add to Directory" icon="plus" actions={[{label:'Add person',disabled:!canManageDirectory||!personLoaded||!!personPending||personBusy,reason:!canManageDirectory?'Only workspace owners and admins can add people.':'Resolve the pending person request first.',onSelect:()=>setPersonForm(true)},{label:'Create Daot',disabled:true,reason:'Creating Daots is not available in authenticated workspaces.',onSelect:()=>{}}]}/></div>}>
        {filter==='doat'?<p className="dashboard-sidebar__empty">Daots are unavailable.</p>:people.length?<><p className="sidebar-group-label">People</p>{renderRows('people',people)}</>:<p className="dashboard-sidebar__empty">No people added yet.</p>}
      </Section>
    </div>
    <footer className="dashboard-sidebar__footer"><strong>{workspace}</strong><small>Authenticated workspace</small></footer>
    {selected&&<DirectoryDialog title={selected.name} onClose={()=>setSelected(undefined)}><div className="gwira-workspace-form"><strong>{selected.job_title||'Person'}</strong><p>{workspace}</p></div></DirectoryDialog>}
    {personForm&&<WorkforceForm kind="person" people={[]} onClose={()=>setPersonForm(false)} onSave={async action=>{
      if(action.type!=='person'||personLock.current||personPending||!personLoaded||!canManageDirectory)throw Error('Person creation is unavailable. Check workspace access and retry.');
      const request:PendingDirectoryPerson={type:'create',id:crypto.randomUUID(),name:action.name.trim(),jobTitle:action.role.trim()};
      personLock.current=true;setPersonBusy(true);
      try{
        await window.codexDesktop.scopedPreferences.write('pending-directory-person',JSON.stringify(request),scope);
        if(!live.current)throw Error('Workspace changed. Retry in the original workspace.');
        setPersonPending(request);
        await confirmPerson(request);
      }finally{personLock.current=false;if(live.current)setPersonBusy(false);}
    }}/>}
  </nav>;
}
export function DashboardSidebar({ state, activeView, onNavigate, onOpenDoat, onOpenPerson, onCreateDoat, onAddPerson, onOpenChannel }:  { state: GwiraLocalState; activeView: WorkspaceNavigation; onNavigate: (view: BusinessNavigation) => void; onOpenDoat: (id: string) => void; onOpenPerson?: () => void; onCreateDoat: () => void; onAddPerson: () => void; onOpenChannel?: (id: string) => void }): React.ReactElement {
  const { selected, select } = useDashboardSelection((item) => { if (item.kind === 'doat') onOpenDoat(item.id); else if (item.kind === 'person') onOpenPerson?.(); });
  const scopeKey = `${state.organization.id}:${state.workspace.id}`;
  const [pinned, setPinned] = useState<string[]>(() => readPins(scopeKey));
  const [acknowledged, setAcknowledged] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(`gwira.sidebar.seen:${scopeKey}`) ?? '{}'); } catch { return {}; } });
  const acknowledge = (entry: Entry): void => { if (!entry.completionVersion) return; const next = { ...acknowledged, [entry.id]: entry.completionVersion }; setAcknowledged(next); try { localStorage.setItem(`gwira.sidebar.seen:${scopeKey}`, JSON.stringify(next)); } catch { /* acknowledgement lasts for this session */ } };
  const [directoryFilter, setDirectoryFilter] = useState<'all' | 'person' | 'doat'>('all');
  const [expanded, setExpanded] = useState(() => ({ pinned: readSections().pinned !== false, channels: readSections().channels !== false, people: readSections().people !== false }));
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => { try { localStorage.setItem(`${pinKey}:${scopeKey}`, JSON.stringify(pinned)); } catch { /* pinning remains local for this session */ } }, [pinned]);
  useEffect(() => { try { localStorage.setItem(collapsedKey, JSON.stringify(expanded)); } catch { /* expanded is the safe fallback */ } }, [expanded]);
  const people = useMemo<Entry[]>(() => state.people.filter(person => person.workspaceId === state.workspace.id).map((person: Person) => ({ id: `person:${person.id}`, kind: 'person', name: person.name, updatedAt: person.createdAt })), [state.people]);
  const doats = useMemo<Entry[]>(() => state.doats.filter((doat: Doat) => !doat.archivedAt && doat.workspaceId === state.workspace.id).map((doat: Doat) => {
    const task = state.tasks.find((item) => item.id === doat.operations.activeTaskId);
    // A configured/available Doat is not evidence of an executing run. Keep a
    // stale "working" operation from producing a misleading activity glyph.
    const status = doat.operations.status === 'working' && task?.agentRun?.status !== 'running' ? undefined : doat.operations.status;
    const activity = recordedSidebarActivity(doat, state, acknowledged[`doat:${doat.id}`]);
    return { id: `doat:${doat.id}`, kind: 'doat', name: doat.identity.name, updatedAt: doat.operations.updatedAt, status: status === 'waiting_for_approval' ? undefined : status, activity: activity.status, completionVersion: activity.version, task: task?.title };
  }), [state.doats, state.tasks, acknowledged]);
  const all = useMemo(() => [...people, ...doats].sort((a, b) => { const attention = (entry: Entry) => entry.status === 'waiting_for_approval' || entry.status === 'failed' ? 1 : 0; return attention(b) - attention(a) || b.updatedAt.localeCompare(a.updatedAt); }), [people, doats]);
  const pinnedEntries = all.filter((entry) => pinned.includes(entry.id));
  const unpinned = all.filter((entry) => !pinned.includes(entry.id));
  const togglePin = (id: string) => setPinned((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleSection = (section: keyof typeof expanded) => setExpanded((current) => ({ ...current, [section]: !current[section] }));
  const onListKey = (event: React.KeyboardEvent<HTMLElement>) => { const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.dashboard-sidebar__row')]; const index = rows.indexOf(document.activeElement as HTMLButtonElement); if (index < 0) return; if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus(); } if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); rows[event.key === 'Home' ? 0 : rows.length - 1]?.focus(); } };
  const renderRows = (key: string, entries: Entry[]) => { const visible = showAll[key] ? entries : entries.slice(0, 6); return <>{visible.map((entry) => <ConversationRow key={entry.id} workspaceName={state.workspace.name} entry={entry} selected={selected?.kind === entry.kind && selected.id === entry.id.slice(entry.kind.length + 1)} onOpen={() => { acknowledge(entry); select({ kind: entry.kind, id: entry.id.slice(entry.kind.length + 1) }, { openInspector: true, tab: 'chat' }); }} onPin={() => togglePin(entry.id)} pinned={pinned.includes(entry.id)} />)}{entries.length > 6 ? <button type="button" className="dashboard-sidebar__show-all" onClick={() => setShowAll((current) => ({ ...current, [key]: !current[key] }))}>{showAll[key] ? 'Show less' : `Show all ${entries.length}`}</button> : null}</>; };
  return <nav className="dashboard-sidebar" aria-label="Business navigation" ref={listRef} onKeyDown={onListKey}>
    <DashboardSidebarNavigation activeView={activeView} onNavigate={onNavigate}/>
    <div className="dashboard-sidebar__scroll">
      <Section id="dashboard-pinned" label="Pinned" expanded={expanded.pinned} onToggle={() => toggleSection('pinned')}>{pinnedEntries.length ? renderRows('pinned', pinnedEntries) : <p className="dashboard-sidebar__empty">Nothing pinned yet.</p>}</Section>
      <DashboardChannels state={state} activeView={activeView} expanded={expanded.channels} onToggle={() => toggleSection('channels')} onOpen={(id) => onOpenChannel?.(id)} />
      <Section id="dashboard-people" label="Directory" expanded={expanded.people} onToggle={() => toggleSection('people')} actions={<div className="dashboard-sidebar__section-actions"><CompactActionMenu label="Directory options" actions={(['all', 'person', 'doat'] as const).map(value => ({ label: value === 'all' ? 'All' : value === 'person' ? 'People' : 'Daots', checked: directoryFilter === value, onSelect: () => setDirectoryFilter(value) }))} /><CompactActionMenu label="Add to Directory" icon="plus" actions={[{ label: 'Add person', onSelect: onAddPerson }, { label: 'Create Daot', onSelect: onCreateDoat }]} /></div>}>
        {unpinned.length ? <>{directoryFilter !== 'doat' && unpinned.some(entry => entry.kind === 'person') ? <><p className="sidebar-group-label">People</p>{renderRows('people', unpinned.filter(entry => entry.kind === 'person'))}</> : null}{directoryFilter !== 'person' && unpinned.some(entry => entry.kind === 'doat') ? <><p className="sidebar-group-label">Daots</p>{renderRows('doats', unpinned.filter(entry => entry.kind === 'doat'))}</> : null}{!unpinned.some(entry => directoryFilter === 'all' || entry.kind === directoryFilter) ? <p className="dashboard-sidebar__empty">No matching entries.</p> : null}</> : <p className="dashboard-sidebar__empty">No people or Daots added yet.</p>}
      </Section>
    </div>
    <footer className="dashboard-sidebar__footer"><strong>Local workspace</strong><small>No account connected</small></footer>
  </nav>;
}

function ConversationRow({ entry, workspaceName, selected, onOpen, onPin, pinned, pinDisabled=false }: { entry: Entry; workspaceName: string; selected: boolean; onOpen: () => void; onPin: () => void; pinned: boolean; pinDisabled?: boolean }): React.ReactElement {
  const sentence = statusSentence(entry);
  return <div className={`dashboard-sidebar__conversation ${selected ? 'is-selected' : ''}`}><button type="button" className="dashboard-sidebar__row" aria-current={selected ? 'page' : undefined} onClick={onOpen}><span className={`dashboard-sidebar__avatar ${entry.kind === 'doat' ? 'is-doat' : ''}`}>{initials(entry.name)}</span><ItemTitle className="dashboard-sidebar__name" text={entry.name} preview={{ context: `${workspaceName} · ${entry.kind === 'doat' ? 'Doat' : 'Person'}`, metadata: entry.task, status: sentence }} /><span className="dashboard-sidebar__status"><NavigationStatus status={entry.activity} label={entry.activity === 'working' ? 'Work is running' : entry.activity === 'failed' ? 'Last run failed' : 'New completed result'} /></span><span className="dashboard-sidebar__right-slot" aria-hidden="true" /></button><CompactActionMenu className="dashboard-sidebar__more" label={`More actions for ${entry.name}`} actions={[{ label: pinned ? 'Unpin' : 'Pin', icon: pinned ? 'unpin' : 'pin', disabled:pinDisabled, onSelect: onPin }]} /></div>;
}
