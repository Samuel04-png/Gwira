import {decide,propose,type MeetState,type WorkKind} from './meetGwiraModel.js';

export interface PlanStep {title:string;description:string}
export interface PlanDoc {
 title:string;goal:string;
 context:Array<{question:string;answer:string}>;
 understanding:string;assumptions:string[];steps:PlanStep[];
 doat:{name:string;role:string};integrations:Array<{name:string;reason:string}>;
 outputs:string[];revisions:string[];
}

const outputs:Record<WorkKind,string[]>={
 collections:['A reviewable list of accounts to follow up, once your records are connected','Draft reminder messages for your approval'],
 website:['A page outline and content checklist','A build brief you can review before any work starts'],
 people:['A draft assignment sheet for your review'],
 inventory:['A stock-register outline','A low-stock review checklist'],
 messages:['Enquiry categories and draft reply templates'],
 approvals:['A written draft of the approval rules'],
 reporting:['A report outline that lists the questions it answers'],
 bookings:['An outline of booking rules and availability'],
 general:['A short operations brief']
};

/** Builds a plan from the conversation using the local rules. It cites only what the user said. */
export function buildPlan(state:Pick<MeetState,'goal'|'answers'>):PlanDoc {
 const proposal=propose(state),kind=decide(state.goal,state.answers,3).kind;
 const text=[state.goal,...state.answers.map(a=>a.answer)].join(' ').toLowerCase();
 const answered=state.answers.filter(a=>a.answer!=='Skip'&&a.answer!=='I’m not sure');
 const assumptions=['No accounts, files or integrations are connected, so Gwira has not read any of your business data.',
  /spreadsheet|sheets|excel/.test(text)?'Your records are assumed to be in the spreadsheet you mentioned. It has not been connected.':'Where your records are kept has not been confirmed.'];
 if(state.answers.some(a=>a.answer==='Skip'||a.answer==='I’m not sure'))assumptions.push('Some questions were skipped, so this plan uses general defaults you can correct.');
 return {title:proposal.name,goal:state.goal.trim(),context:answered.map(a=>({question:a.question,answer:a.answer})),
  understanding:proposal.rationale,assumptions,steps:proposal.steps.map(([title,description])=>({title,description})),
  doat:{name:proposal.doat,role:proposal.role},integrations:proposal.integrations.map(i=>({name:i.name,reason:i.reason})),
  outputs:outputs[kind],revisions:[]};
}

export function renderPlanMarkdown(plan:PlanDoc):string {
 const lines=[`# ${plan.title}`,'','## Goal',plan.goal,''];
 if(plan.context.length)lines.push('## What you told Gwira',...plan.context.map(c=>`- ${c.question} **${c.answer}**`),'');
 lines.push('## What Gwira understands',plan.understanding,'','## Assumptions and missing information',...plan.assumptions.map(a=>`- ${a}`),'');
 lines.push('## Proposed workflow',...plan.steps.map((s,i)=>`${i+1}. **${s.title}** — ${s.description}`),'');
 lines.push('## Who does what','- Gwira (proposed): prepares the outlines and drafts described above.','- You: review every result and decide what happens next.','');
 lines.push('## Suggested Doat',`**${plan.doat.name}** — ${plan.doat.role}. Proposed only: not created, no tool access, not running.`,'');
 if(plan.integrations.length)lines.push('## Required integrations',...plan.integrations.map(i=>`- **${i.name}** — ${i.reason} Not connected.`),'');
 lines.push('## Approval requirements','- Approving records your agreement with this approach for this version only.','- Sending messages, publishing, payments and deleting records each need separate authorization. Approval does not grant them.','');
 lines.push('## Expected outputs',...plan.outputs.map(o=>`- ${o}`),'');
 lines.push('## Next steps','- Read the plan and ask for any changes in the conversation.','- Approve the plan when it is right.',...plan.integrations.map(i=>`- Connect ${i.name} when you are ready. Nothing connects automatically.`));
 if(plan.revisions.length)lines.push('','## Revisions',...plan.revisions.map(r=>`- ${r}`));
 return lines.join('\n')+'\n';
}

export type PlanStatus='draft'|'approved';
/** Status is shown at read time so approving never has to rewrite a saved version. */
export function previewMarkdown(plan:PlanDoc,meta:{status:PlanStatus;version:number;approvedAt?:string}):string {
 const label=meta.status==='approved'?`Approved${meta.approvedAt?` ${new Date(meta.approvedAt).toLocaleDateString()}`:''}`:'Draft · awaiting your approval';
 const [title,...rest]=renderPlanMarkdown(plan).split('\n');
 return [title,'',`*${label} · Version ${meta.version} · Prepared with suggested rules, not live AI. Nothing is connected or running.*`,...rest].join('\n');
}

export function parsePlanDoc(value:unknown):PlanDoc|undefined {
 if(!value||typeof value!=='object')return undefined;const v=value as Record<string,unknown>;
 const text=(x:unknown):x is string=>typeof x==='string'&&x.length<=2000;
 const list=(x:unknown):x is string[]=>Array.isArray(x)&&x.length<=20&&x.every(text);
 const steps=v.steps,context=v.context,integrations=v.integrations,doat=v.doat as Record<string,unknown>|undefined;
 if(!text(v.title)||!v.title||!text(v.goal)||!text(v.understanding)||!list(v.assumptions)||!list(v.outputs)||!list(v.revisions))return undefined;
 if(!Array.isArray(steps)||steps.length<1||steps.length>12||!steps.every(s=>s&&text(s.title)&&text(s.description)))return undefined;
 if(!Array.isArray(context)||context.length>10||!context.every(c=>c&&text(c.question)&&text(c.answer)))return undefined;
 if(!Array.isArray(integrations)||integrations.length>10||!integrations.every(i=>i&&text(i.name)&&text(i.reason)))return undefined;
 if(!doat||!text(doat.name)||!text(doat.role))return undefined;
 return {title:v.title,goal:v.goal,context:context.map(c=>({question:c.question,answer:c.answer})),understanding:v.understanding,assumptions:v.assumptions,
  steps:steps.map(s=>({title:s.title,description:s.description})),doat:{name:doat.name as string,role:doat.role as string},
  integrations:integrations.map(i=>({name:i.name,reason:i.reason})),outputs:v.outputs,revisions:v.revisions};
}

const numberWords:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8};
const stepNumber=(raw:string):number|undefined=>{const m=/\bstep\s*(\d+|one|two|three|four|five|six|seven|eight)\b/i.exec(raw);if(!m)return undefined;const n=/^\d+$/.test(m[1])?Number(m[1]):numberWords[m[1].toLowerCase()];return n};
const sentence=(raw:string):string=>{const t=raw.replace(/\s+/g,' ').trim().replace(/^[\s,.:;-]+/,'').replace(/^(?:to|so that|so|that)\s+/i,'').replace(/^(?:i(?:'d| would)? (?:want|like|need|prefer)|please|we (?:want|need))\s+(?:to\s+|the\s+)?/i,'');return t?t.charAt(0).toUpperCase()+t.slice(1).replace(/[.!\s]*$/,'.'):''};
export type PlanEdit={kind:'edited';plan:PlanDoc;summary:string}|{kind:'needs_detail';question:string}|{kind:'unsupported'};

/** Applies a plain-language revision. Only the edits listed here are understood; anything else is declined, never guessed. */
export function applyPlanEdit(plan:PlanDoc,message:string):PlanEdit {
 const raw=message.trim();const n=stepNumber(raw);
 const rename=/\b(?:rename|retitle)\s+(?:the\s+)?plan\s+(?:to|as)\s+(.{3,120})$/i.exec(raw);
 if(rename){const title=rename[1].replace(/["“”.!]+$/g,'').replace(/^["“”]+/,'').trim();return {kind:'edited',plan:{...plan,title,revisions:[...plan.revisions,`Renamed the plan to “${title}”.`].slice(-10)},summary:`I renamed the plan to “${title}”.`};}
 const add=/\badd\s+(?:a\s+)?(?:new\s+)?step\b[\s:,-]*(.*)$/i.exec(raw);
 if(add&&/^\W*(?:please\s+)?(?:can you\s+)?(?:also\s+)?add\b/i.test(raw)){const body=sentence(add[1]);if(!body)return {kind:'needs_detail',question:'What should the new step say?'};if(plan.steps.length>=12)return {kind:'unsupported'};
  const title=body.split(' ').slice(0,6).join(' ').replace(/[.,;:]+$/,'');const steps=[...plan.steps,{title,description:body}];
  return {kind:'edited',plan:{...plan,steps,revisions:[...plan.revisions,`Added step ${steps.length}: ${title}.`].slice(-10)},summary:`I added step ${steps.length}: “${title}”.`};}
 if(n!==undefined){
  if(n<1||n>plan.steps.length)return {kind:'needs_detail',question:`The plan has ${plan.steps.length} steps. Which step do you mean?`};
  if(/\b(remove|delete|drop)\b/i.test(raw)){if(plan.steps.length<=1)return {kind:'needs_detail',question:'A plan needs at least one step. What should it say instead?'};
   const steps=plan.steps.filter((_,i)=>i!==n-1);return {kind:'edited',plan:{...plan,steps,revisions:[...plan.revisions,`Removed step ${n}: ${plan.steps[n-1].title}.`].slice(-10)},summary:`I removed step ${n}, “${plan.steps[n-1].title}”.`};}
  if(/\b(change|update|edit|revise|replace|rewrite|modify|adjust|make)\b/i.test(raw)){
   const body=sentence(raw.replace(/^.*?\bstep\s*(?:\d+|one|two|three|four|five|six|seven|eight)\b[\s,.:;-]*/i,'').replace(/^(?:to|so that|should|so)\s+/i,''));
   if(!body)return {kind:'needs_detail',question:`What should step ${n} say instead?`};
   const steps=plan.steps.map((s,i)=>i===n-1?{...s,description:body}:s);
   return {kind:'edited',plan:{...plan,steps,revisions:[...plan.revisions,`Step ${n} (${plan.steps[n-1].title}) now reads: ${body}`].slice(-10)},summary:`Step ${n}, “${plan.steps[n-1].title}”, now reads: ${body}`};
  }
 }
 return {kind:'unsupported'};
}

export type PlanIntent='approve'|'unclear_approval'|'edit'|'other';
const hedge=/\b(maybe|perhaps|later|not yet|not now|don'?t|do not|never|can'?t|cannot|won'?t|unless|if|once|after|before|until|wait|hold off|not sure|should i|can i|could i|would it|what if|whether)\b|\?/i;
const otherObject=/\bapprove\s+(?:the\s+|this\s+|that\s+|my\s+|our\s+)?(?:payments?|invoices?|emails?|messages?|expenses?|requests?|transfers?|purchases?|leave|orders?|refunds?)\b/i;
const strong=[/\bi(?:'d| would)?\s+(?:hereby\s+)?approve\b(?!\s+(?:of\b))/i,/\bwe\s+approve\b/i,/^(?:yes[,!. ]+)?(?:please\s+)?approve\b/i,/\bapproved\b.*\bplan\b|\bplan\b.*\bapproved\b/i];
const proceed=/^(?:(?:yes|ok|okay|great|good|perfect)[,!. ]+)?(?:looks good|that looks good|this looks good)?[,!. ]*(?:please\s+)?(?:proceed|go ahead|continue)(?:\s+with\s+(?:this|the|that)\s+(?:plan|workflow))?\W*$/i;
const editVerb=/\b(change|update|edit|revise|replace|rewrite|modify|adjust|add|remove|delete|rename|instead)\b/i;
const quoted=/["“”'‘’][^"“”'‘’]*approv[^"“”'‘’]*["“”'‘’]/i;

/** Decides what a chat message means for the plan. Approval needs a clear, unhedged, plan-directed statement. */
export function classifyPlanMessage(raw:string):PlanIntent {
 const text=raw.trim();const mentionsApproval=/\bapprov/i.test(text);
 if(!text)return 'other';
 if(mentionsApproval&&(hedge.test(text)||quoted.test(text)||otherObject.test(text)||editVerb.test(text)||text.length>160))return 'unclear_approval';
 if(strong.some(p=>p.test(text))||(proceed.test(text)&&!hedge.test(text)))return 'approve';
 if(mentionsApproval)return 'unclear_approval';
 if(editVerb.test(text))return 'edit';
 return 'other';
}
