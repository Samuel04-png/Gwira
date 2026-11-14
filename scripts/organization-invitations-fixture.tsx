import React,{useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {OrganizationAccess,InviteMemberDialog} from '../src/renderer/gwira/workforce/OrganizationAccess.js';
import type {OrganizationAccessApi,OrganizationInvitation,CloudOrganization} from '../src/shared/organizationAccess.js';
import '../src/renderer/gwira/workforce/workforce.css';
let root:Root;
const org:CloudOrganization={id:'11111111-1111-4111-8111-111111111111',name:'Example organization',role:'owner'};
const teams=[{id:'22222222-2222-4222-8222-222222222222',organizationId:org.id,name:'Operations'}];
let rows:OrganizationInvitation[]=[];
const api:OrganizationAccessApi={listInvitations:async()=>rows,invite:async input=>{if(input.email==='failed@example.test')throw {code:'delivery_failed'};rows=[...rows,{id:crypto.randomUUID(),organizationId:input.organizationId,email:input.email,role:input.role,teamIds:input.teamIds,invitedBy:'owner@example.test',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),status:'pending',delivery:'sent'}];},resend:async()=>{},revoke:async id=>{rows=rows.map(row=>row.id===id?{...row,status:'revoked'}:row);}};
function Preview({mode}:{mode:string}):React.ReactElement{const [open,setOpen]=useState(mode==='dialog');return <div style={{padding:'var(--gw-space-6)',height:'100%',boxSizing:'border-box',overflow:'auto',background:'var(--gw-surface)'}}><p role="note">Development preview · simulated API · no email sent</p><OrganizationAccess organization={org} teams={teams} api={api} sendingEnabled={mode!=='disabled'}/>{open?<InviteMemberDialog organization={org} teams={teams} onSave={api.invite} onClose={()=>setOpen(false)}/>:null}</div>;}
export function showInvitationFixture(mode='list'):void{
 if(!import.meta.env.DEV)throw Error('Development fixture only');
 rows=mode==='empty'?[]:[{id:'33333333-3333-4333-8333-333333333333',organizationId:org.id,email:'colleague@example.test',role:'member',teamIds:[teams[0].id],invitedBy:'owner@example.test',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),status:'pending',delivery:'sent'}];
 const node=document.getElementById('organization-fixture')??document.body.appendChild(Object.assign(document.createElement('div'),{id:'organization-fixture'}));const bounds=document.querySelector('.workforce-page')!.getBoundingClientRect();Object.assign(node.style,{position:'fixed',left:bounds.left+'px',top:bounds.top+'px',right:Math.max(0,innerWidth-bounds.right)+'px',bottom:'0',zIndex:'calc(var(--gw-views-modal-layer) - 1)'});root??=createRoot(node);root.render(<Preview key={mode+Date.now()} mode={mode}/>);
}
