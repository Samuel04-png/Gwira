import type {GwiraLocalState, Person} from '../domain/types.js';
import {reduceGwira} from '../domain/reducer.js';
import type {Team} from '../organization/domain/organizationTypes.js';
export type WorkforceAction =
 | {type:'person';id?:string;name:string;role:string}
 | {type:'team';id?:string;name:string;description:string;managerId?:string}
 | {type:'membership';teamId:string;personId:string;add:boolean};
const normalized=(s:string)=>s.trim().toLocaleLowerCase();
export function workspacePeople(state:GwiraLocalState):Person[]{return state.people.filter(p=>p.workspaceId===state.workspace.id).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));}
export function workspaceTeams(state:GwiraLocalState):Team[]{return state.organizationStructure.organizationId===state.organization.id?state.organizationStructure.teams.filter(t=>t.organizationId===state.organization.id).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)):[];}
export function personTeams(state:GwiraLocalState,id:string):Team[]{return workspaceTeams(state).filter(t=>t.members.some(m=>m.kind==='person'&&m.id===id));}
export function filterPeople(state:GwiraLocalState,query:string,teamId:string,role:string,departmentId=''):Person[]{const q=normalized(query);return workspacePeople(state).filter(p=>{const teams=personTeams(state,p.id),departments=state.organizationStructure.departments.filter(d=>d.organizationId===state.organization.id&&d.humanMemberIds.includes(p.id));return (!departmentId||departments.some(d=>d.id===departmentId))&&(!teamId||teams.some(t=>t.id===teamId))&&(!role||p.role===role)&&(!q||[p.name,p.role,...teams.map(t=>t.name),...departments.map(d=>d.name)].some(s=>normalized(s).includes(q)));});}
function required(value:string,label:string):string{const text=value.trim();if(!text||text.length>200)throw Error(`${label} must contain 1–200 characters.`);return text;}
/** Existing local records only. Team membership describes organization, never authorization. */
export function applyWorkforceAction(state:GwiraLocalState,action:WorkforceAction,id:string,now:string):GwiraLocalState{
 if(action.type==='person'){
  const name=required(action.name,'Full name'),role=required(action.role,'Job title');
  if(workspacePeople(state).some(p=>p.id!==action.id&&normalized(p.name)===normalized(name)&&normalized(p.role)===normalized(role)))throw Error('A person with this name and job title already exists. Open their profile to edit it.');
  if(action.id){if(!workspacePeople(state).some(p=>p.id===action.id))throw Error('This person is no longer in this workspace.');return reduceGwira(state,{type:'UPDATE_PERSON',personId:action.id,workspaceId:state.workspace.id,name,role});}
  return reduceGwira(state,{type:'ADD_PERSON',person:{id,workspaceId:state.workspace.id,name,role,createdAt:now}});
 }
 const teams=workspaceTeams(state);let next:Team;
 if(action.type==='team'){
  const name=required(action.name,'Team name');if(action.description.length>16000)throw Error('Use a description of 16,000 characters or fewer.');
  if(teams.some(t=>t.id!==action.id&&normalized(t.name)===normalized(name)))throw Error('A team with this name already exists.');
  const existing=action.id?teams.find(t=>t.id===action.id):undefined;if(action.id&&!existing)throw Error('This team is no longer available.');
  if(action.managerId&&!workspacePeople(state).some(p=>p.id===action.managerId))throw Error('Choose a team lead from this workspace.');
  next={...existing,id:existing?.id??id,organizationId:state.organization.id,name,description:action.description.trim()||undefined,members:existing?.members??[],createdAt:existing?.createdAt??now,updatedAt:now,manager:action.managerId?{kind:'person',id:action.managerId}:existing?.manager?.kind==='doat'?existing.manager:undefined};
 }else{
  const team=teams.find(t=>t.id===action.teamId);if(!team||!workspacePeople(state).some(p=>p.id===action.personId))throw Error('The person or team is no longer available in this workspace.');
  const members=team.members.filter(m=>!(m.kind==='person'&&m.id===action.personId));if(action.add)members.push({kind:'person',id:action.personId});next={...team,members,updatedAt:now};
 }
 const structure={...state.organizationStructure,updatedAt:now,teams:state.organizationStructure.teams.some(t=>t.id===next.id)?state.organizationStructure.teams.map(t=>t.id===next.id?next:t):[...state.organizationStructure.teams,next]};
 const result=reduceGwira(state,{type:'SET_ORGANIZATION_STRUCTURE',structure,activityId:id,at:now});if(result===state)throw Error('This change conflicts with the organization structure. Review the team and try again.');return result;
}
