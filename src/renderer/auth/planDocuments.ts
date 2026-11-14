import type {PlanRecord} from '../../shared/accountAuth.js';
import {documentRoot,type GwiraDocuments} from '../workspaceTools/gwiraDocuments.js';
import {parsePlanDoc,previewMarkdown,renderPlanMarkdown} from '../gwira/onboarding/planDocument.js';

const fileName=(title:string):string=>`${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Plan'}.md`;
/** The text shown in the Files preview: the saved plan plus its live status. Falls back to the saved Markdown if the structure is unreadable. */
export function planText(plan:PlanRecord):string {
 const doc=parsePlanDoc(plan.structured);
 return doc?previewMarkdown(doc,{status:plan.status,version:plan.version,approvedAt:plan.approvedAt}):plan.markdown||renderPlanMarkdown({title:plan.title,goal:'',context:[],understanding:'',assumptions:[],steps:[{title:'—',description:'—'}],doat:{name:'—',role:'—'},integrations:[],outputs:[],revisions:[]});
}
export function planDocuments(organizationId:string|undefined,plan:PlanRecord|null|undefined):GwiraDocuments|undefined {
 if(!organizationId||!plan)return undefined;const name=fileName(plan.title);
 return {root:documentRoot(organizationId),files:[{path:name,name,text:planText(plan)}]};
}
export function planDestination(organizationId:string,plan:PlanRecord):{type:'file';rootName:string;rootFingerprint:string;path:string;name:string} {
 const root=documentRoot(organizationId),name=fileName(plan.title);
 return {type:'file',rootName:root.name,rootFingerprint:root.fingerprint,path:name,name};
}
