import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '../../components/Button.js';
import {Input} from '../../components/Input.js';
import type {GwiraLocalState} from '../domain/types.js';
import type {CloudEmployee} from '../../../shared/cloudDirectory.js';
import type {CloudTeam} from '../../../shared/organizationAccess.js';
import type {ExpectedWorkspace} from '../../../shared/scopedPreferences.js';
import {DirectoryEmptyState,DirectoryEntry} from '../workforce/Directory.js';
import {WorkforceForm} from '../workforce/Forms.js';
import {PersonDetails,TeamDetails} from '../workforce/Details.js';
import {filterPeople,personTeams,workspacePeople,workspaceTeams,type WorkforceAction} from '../workforce/model.js';
import '../workforce/workforce.css';
export interface TeamsPageProps {state:GwiraLocalState;onSaveWorkforce:(action:WorkforceAction)=>void|Promise<void>;onOpenTask?:(id:string)=>void;onOpenRunHistory?:(id:string)=>void;}
function TeamsHeader({onCreateTeam,onAddPerson}:{onCreateTeam?:()=>void;onAddPerson?:()=>void}):React.ReactElement {
 return <header className="workforce-page__header"><div><h1>Teams &amp; People</h1><p>Manage the people and teams in your workspace.</p></div><div><Button variant="secondary" disabled={!onCreateTeam} title={!onCreateTeam?'The team directory is not connected for authenticated workspaces.':undefined} onClick={onCreateTeam}>Create team</Button><Button variant="primary" disabled={!onAddPerson} title={!onAddPerson?'The people directory is not connected for authenticated workspaces.':undefined} onClick={onAddPerson}>Add person</Button></div></header>;
}
function WorkforceTabs({tab,onSelect,counts}:{tab:string;onSelect:(tab:string)=>void;counts?:{people:number;teams:number}}):React.ReactElement {
 return <nav className="workforce-tabs" aria-label="Workforce views">{(['people','teams'] as const).map(t=><button key={t} type="button" aria-current={tab===t?'page':undefined} onClick={()=>onSelect(t)}>{t==='people'?'People':'Teams'} {counts&&<span>{counts[t]}</span>}</button>)}</nav>;
}
function WorkforceSearch({tab,value,onChange}:{tab:string;value?:string;onChange?:(value:string)=>void}):React.ReactElement {
 return <Input type="search" aria-label={tab==='people'?'Search people':'Search teams'} placeholder={tab==='people'?'Search people…':'Find a team…'} value={value??''} onChange={event=>onChange?.(event.target.value)} disabled={!onChange} title={!onChange?'The people and team directory is not connected for authenticated workspaces.':undefined}/>;
}
export function UnavailableTeamsPage():React.ReactElement {
 const [tab,setTab]=useState('people');
 return <section className="workforce-page" aria-label="Teams & People"><TeamsHeader/><WorkforceTabs tab={tab} onSelect={setTab}/><div className="workforce-toolbar"><WorkforceSearch tab={tab}/></div><div className="workforce-body"><div className="workforce-directory"><p role="status">The people and team directory is unavailable in authenticated workspaces.</p></div></div></section>;
}
export function AuthenticatedTeamsPage({scope,teams,active}:{scope:ExpectedWorkspace;teams:CloudTeam[];active:boolean}):React.ReactElement {
 const [tab,setTab]=useState('people'),[query,setQuery]=useState(''),[people,setPeople]=useState<CloudEmployee[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!active)return;
  let live=true;setLoading(true);setError('');
  void window.codexDesktop.directory.request({type:'list'},scope).then(result=>{
   if(!result)throw Error('Invalid directory response.');
   if(live)setPeople(result.employees);
  }).catch(()=>{if(live)setError('People could not be loaded. Check your workspace access and try again.');})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[active,scope.userId,scope.organizationId,retry]);
 const term=query.trim().toLocaleLowerCase();
 const visiblePeople=people.filter(person=>`${person.name} ${person.job_title}`.toLocaleLowerCase().includes(term));
 const visibleTeams=teams.filter(team=>team.organizationId===scope.organizationId&&team.name.toLocaleLowerCase().includes(term));
 return <section className="workforce-page" aria-label="Teams & People">
  <header className="workforce-page__header"><div><h1>Teams &amp; People</h1><p>View the people and teams in your workspace.</p></div><div>
   <Button variant="secondary" disabled title="Team creation is not yet available in authenticated workspaces.">Create team</Button>
   <Button variant="primary" disabled title="Owners and admins can add people from the business sidebar.">Add person</Button>
  </div></header>
  <WorkforceTabs tab={tab} onSelect={value=>{setTab(value);setQuery('');}}/>
  <div className="workforce-toolbar"><WorkforceSearch tab={tab} value={query} onChange={setQuery}/></div>
  <div className="workforce-body"><div className="workforce-directory">
   {tab==='people'&&loading?<p role="status">Loading people…</p>:tab==='people'&&error?<p role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></p>:tab==='people'?
    visiblePeople.length?<ul className="cloud-workforce-list" aria-label="People">{visiblePeople.map(person=><li key={person.id}><strong>{person.name}</strong><span>{person.job_title||'No job title'}</span></li>)}</ul>:<p>{term?'No people match your search.':'No people have been added to this workspace.'}</p>:
    visibleTeams.length?<ul className="cloud-workforce-list" aria-label="Teams">{visibleTeams.map(team=><li key={team.id}><strong>{team.name}</strong></li>)}</ul>:<p>{term?'No teams match your search.':'No teams have been added to this workspace.'}</p>}
   {tab==='teams'&&<p className="cloud-workforce-note">Team membership and editing are not yet available here. Use Refresh access in the account menu to update this list.</p>}
  </div></div>
 </section>;
}
export function TeamsPage({state,onSaveWorkforce,onOpenTask,onOpenRunHistory}:TeamsPageProps):React.ReactElement{
 const [tab,setTab]=useState('people'),[peopleQuery,setPeopleQuery]=useState(''),[teamQuery,setTeamQuery]=useState(''),[teamFilter,setTeamFilter]=useState(''),[roleFilter,setRoleFilter]=useState(''),[departmentFilter,setDepartmentFilter]=useState(''),[detailOpen,setDetailOpen]=useState(false),[selectedPerson,setSelectedPerson]=useState<string>(),[selectedTeam,setSelectedTeam]=useState<string>(),[form,setForm]=useState<{kind:'person'|'team';id?:string}>();
 const query=tab==='people'?peopleQuery:teamQuery;
 const setQuery=(value:string):void=>{if(tab==='people')setPeopleQuery(value);else setTeamQuery(value);};
 const preference=`gwira.workforce.layout.${state.workspace.id}`;
 const [layout,setLayout]=useState(()=>{try{return localStorage.getItem(preference)==='grid'?'grid':'list';}catch{return 'list';}}),[notice,setNotice]=useState('');
 const origin=useRef<HTMLElement|null>(null),detail=useRef<HTMLDivElement>(null),directory=useRef<HTMLDivElement>(null),scroll=useRef<Record<string,number>>({});
 const people=useMemo(()=>workspacePeople(state),[state.people,state.workspace.id]),teams=useMemo(()=>workspaceTeams(state),[state.organizationStructure.teams,state.organization.id]),departments=useMemo(()=>state.organizationStructure.departments.filter(d=>d.organizationId===state.organization.id),[state.organizationStructure.departments,state.organization.id]),filtered=useMemo(()=>filterPeople(state,query,teamFilter,roleFilter,departmentFilter),[state,query,teamFilter,roleFilter,departmentFilter]),filteredTeams=useMemo(()=>teams.filter(t=>`${t.name} ${t.description??''}`.toLowerCase().includes(query.toLowerCase())),[teams,query]);
 const person=people.find(p=>p.id===selectedPerson),team=teams.find(t=>t.id===selectedTeam),hasDetails=detailOpen&&(tab==='people'?!!person:!!team);
 useEffect(()=>{if(hasDetails)detail.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});},[selectedPerson,selectedTeam,tab,hasDetails]);
 function openRecord(kind:'person'|'team',id:string):void {origin.current=document.activeElement as HTMLElement;scroll.current[tab]=directory.current?.scrollTop??0;if(kind==='person')setSelectedPerson(id);else setSelectedTeam(id);setDetailOpen(true);}
 function close():void{setDetailOpen(false);requestAnimationFrame(()=>{if(document.querySelector('[role=dialog]'))return;const selected=directory.current?.querySelector<HTMLButtonElement>('[data-selected] .workforce-entry__open');if(selected)selected.focus({preventScroll:true});else if(origin.current?.isConnected)origin.current.focus({preventScroll:true});if(directory.current)directory.current.scrollTop=scroll.current[tab]??directory.current.scrollTop;});}
 function chooseLayout(value:string):void{setLayout(value);try{localStorage.setItem(preference,value);setNotice('');}catch{setNotice('View changed for this session. Device storage could not save the preference.');}}
 function clear():void{setQuery('');if(tab==='people'){setTeamFilter('');setRoleFilter('');setDepartmentFilter('');}}
 return <section className="workforce-page" data-details={hasDetails||undefined} aria-label="Teams & People"><TeamsHeader onCreateTeam={()=>setForm({kind:'team'})} onAddPerson={()=>setForm({kind:'person'})}/><WorkforceTabs tab={tab} onSelect={setTab} counts={{people:people.length,teams:teams.length}}/><div className="workforce-toolbar"><WorkforceSearch tab={tab} value={query} onChange={setQuery}/>{tab==='people'?<><select aria-label="Filter by team" value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option value="">All teams</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select aria-label="Filter by job title" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="">All job titles</option>{[...new Set(people.map(p=>p.role))].sort().map(r=><option key={r}>{r}</option>)}</select>{departments.length?<select aria-label="Filter by department" value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}><option value="">All departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>:null}</>:null}{(query||tab==='people'&&(teamFilter||roleFilter||departmentFilter))?<Button variant="ghost" onClick={clear}>Clear filters</Button>:null}<div className="workforce-layout" aria-label="Directory layout"><Button variant="ghost" iconOnly icon="list" aria-label="List view" aria-pressed={layout==='list'} onClick={()=>chooseLayout('list')}/><Button variant="ghost" iconOnly icon="grid" aria-label="Grid view" aria-pressed={layout==='grid'} onClick={()=>chooseLayout('grid')}/></div></div>{notice?<p role="status">{notice}</p>:null}<div className="workforce-body" data-details={hasDetails||undefined}><div className="workforce-directory" ref={directory} onKeyDown={e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||!(e.target instanceof HTMLElement)||!e.target.classList.contains('workforce-entry__open'))return;const entries=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('.workforce-entry__open')],index=entries.indexOf(e.target as HTMLButtonElement);const next=e.key==='Home'?0:e.key==='End'?entries.length-1:Math.max(0,Math.min(entries.length-1,index+(e.key==='ArrowDown'?1:-1)));e.preventDefault();entries[next]?.focus();}}>{(tab==='people'?filtered.length:filteredTeams.length)===0?<DirectoryEmptyState kind={tab==='people'?'people':'teams'} filtered={!!query||tab==='people'&&!!(teamFilter||roleFilter||departmentFilter)} onClear={clear} onAdd={()=>setForm({kind:tab==='people'?'person':'team'})}/>:<><div className="workforce-columns" hidden={layout==='grid'}><span>{tab==='people'?'Person':'Team'}</span><span>{tab==='people'?'Job title':'Description'}</span><span>{tab==='people'?'Teams':'Members'}</span></div><div className={`workforce-directory__items workforce-directory__items--${layout}`} aria-label={tab==='people'?'Workspace people':'Workspace teams'}>{tab==='people'?filtered.map(p=><DirectoryEntry key={p.id} id={p.id} colorKey={p.colorKey} name={p.name} description={p.role} secondary={personTeams(state,p.id).map(t=>t.name).join(', ')||'No team'} selected={p.id===selectedPerson} grid={layout==='grid'} onOpen={()=>openRecord('person',p.id)} onEdit={()=>setForm({kind:'person',id:p.id})}/>):filteredTeams.map(t=><DirectoryEntry key={t.id} id={t.id} lead={t.manager?.kind==='person'?people.find(p=>p.id===t.manager?.id)?.name:t.manager?.kind==='doat'?state.doats.find(d=>d.workspaceId===state.workspace.id&&d.id===t.manager?.id)?.identity.name:undefined} name={t.name} description={t.description??'No description'} secondary={`${t.members.length} ${t.members.length===1?'member':'members'}`} team selected={t.id===selectedTeam} grid={layout==='grid'} onOpen={()=>openRecord('team',t.id)} onEdit={()=>setForm({kind:'team',id:t.id})}/>)}</div></>}</div>{hasDetails?<div className="workforce-detail-host" ref={detail}>{tab==='people'&&person?<PersonDetails key={person.id} state={state} person={person} onSave={onSaveWorkforce} onEdit={()=>setForm({kind:'person',id:person.id})} onClose={close} onOpenTask={onOpenTask} onOpenRunHistory={onOpenRunHistory}/>:team?<TeamDetails key={team.id} state={state} team={team} onSave={onSaveWorkforce} onEdit={()=>setForm({kind:'team',id:team.id})} onClose={close} onOpenPerson={id=>{setSelectedPerson(id);setTab('people');setDetailOpen(true);}}/>:null}</div>:null}</div>{form?<WorkforceForm key={`${form.kind}:${form.id??'new'}`} kind={form.kind} person={people.find(p=>p.id===form.id)} team={teams.find(t=>t.id===form.id)} people={people} onSave={async action=>{await onSaveWorkforce(action);setNotice(action.type==='person'?(action.id?'Person updated.':'Person added.'):(action.type==='team'?(action.id?'Team updated.':'Team created.'):'Membership updated.'));}} onClose={()=>setForm(undefined)}/>:null}</section>;
}
