export type WorkKind = 'collections' | 'website' | 'people' | 'inventory' | 'messages' | 'approvals' | 'reporting' | 'bookings' | 'general';
export type Act = 'opening' | 'clarifying' | 'proposal' | 'review' | 'result';
export interface Answer { question: string; answer: string }
export interface MeetState { act: Act; goal: string; answers: Answer[]; asked: number }
export interface Decision { kind: WorkKind; question?: string; options: string[] }
export const initialMeetState: MeetState = { act:'opening', goal:'', answers:[], asked:0 };
export function decide(goal:string, answers:Answer[], asked:number):Decision {
  const text=[goal,...answers.map(a=>a.answer)].join(' ').toLowerCase();
  const classify=(value:string):WorkKind => /website|web site/.test(value)?'website':/stock|inventory/.test(value)?'inventory':/outgoing.*payment|payment approval/.test(value)?'approvals':/collect|lending|overdue|late.*payment/.test(value)?'collections':/report/.test(value)?'reporting':/appointment|booking workflow/.test(value)?'bookings':/employee|assign|staff|team/.test(value)?'people':/whatsapp|email|enquir|inquir|customer (message|repl)/.test(value)?'messages':'general';
  const primary=classify(goal.toLowerCase());
  const kind:WorkKind=primary==='general'?classify(text):primary;
  if(asked>=3 || answers.some(a=>a.answer==='Skip' || a.answer==="I’m not sure"))return {kind,options:[]};
  if(kind==='general' && !answers.length)return {kind,question:'Which piece of work would make the biggest difference?',options:['Customer collections','A business website','Employee assignments']};
  if(kind!=='general' && !answers.some(a=>a.question!== 'Which piece of work would make the biggest difference?')) {
    if(kind==='website' && !/book|sell|contact|showcase/.test(text))return {kind,question:'What should visitors be able to do?',options:['Contact us','Book a service','Browse our work']};
    if(kind==='collections' && !/approval|assign|draft/.test(text))return {kind,question:'What should the first collections plan focus on?',options:['Draft messages for approval','Prepare collection assignments']};
    if(kind==='people' && !/project|daily|weekly/.test(text))return {kind,question:'What kind of assignments are you organizing?',options:['Daily operations','Project work']};
  }
  return {kind,options:[]};
}
export type MeetEvent={type:'submit';text:string}|{type:'skip'}|{type:'review'}|{type:'back'}|{type:'export'}|{type:'edit'}|{type:'reset'};
export function meetReducer(state:MeetState,event:MeetEvent):MeetState {
  if(event.type==='reset')return initialMeetState;
  if(event.type==='edit')return {...initialMeetState,goal:state.goal};
  if(event.type==='review'&&state.act==='proposal')return {...state,act:'review'};
  if(event.type==='back'&&(state.act==='review'||state.act==='result'))return {...state,act:'proposal'};
  if(event.type==='export'&&state.act==='review')return {...state,act:'result'};
  if(event.type==='submit'||event.type==='skip') {
    const text=event.type==='skip'?'Skip':event.text.trim();if(!text)return state;
    if(state.act==='opening'){const d=decide(text,[],0);return {...state,goal:text,act:d.question?'clarifying':'proposal',asked:d.question?1:0};}
    if(state.act==='clarifying'){const d=decide(state.goal,state.answers,state.asked-1);const answers=[...state.answers,{question:d.question??'Additional context',answer:text}];const next=decide(state.goal,answers,state.asked);return {...state,answers,asked:state.asked+(next.question?1:0),act:next.question?'clarifying':'proposal'};}
  }
  return state;
}
export const plans:Record<WorkKind,{name:string;doat:string;steps:[string,string][]}>={
 collections:{name:'Prepare customer collections',doat:'Collections Doat',steps:[['Review the source records','Identify the records and fields needed; no customer data has been read.'],['Prepare follow-up work','Outline assignments or message drafts using the context you provide.'],['Review before sending','A human checks recipients, wording and any proposed payment action.']]},
 website:{name:'Prepare a business website',doat:'Website Doat',steps:[['Define the brief','Capture the visitor outcome and content needed for the site.'],['Outline pages and content','Propose a page structure and a small first build.'],['Review the build plan','Confirm scope and assets before any coding or publishing.']]},
 people:{name:'Organize employee assignments',doat:'Operations Doat',steps:[['List work and constraints','Outline the work to assign without inventing employees or availability.'],['Propose responsibilities','Match work to real people only after their details are provided.'],['Confirm assignments','Review owners, capacity and deadlines before recording changes.']]},
 inventory:{name:'Track inventory',doat:'Inventory planning',steps:[]},
 messages:{name:'Prepare customer replies',doat:'Response planning',steps:[]},
 approvals:{name:'Plan payment approvals',doat:'Approval planning',steps:[]},
 reporting:{name:'Plan business reporting',doat:'Reporting planning',steps:[]},
 bookings:{name:'Plan appointment booking',doat:'Scheduling planning',steps:[]},
 general:{name:'Prepare an operations brief',doat:'Operations Doat',steps:[['Clarify the outcome','Record the goal in your own words.'],['Outline the next steps','Identify the information and decisions needed to proceed.'],['Review the proposal','Choose a small piece of work to create when the workspace is ready.']]}
};
export function brief(state:MeetState):string {const p=propose(state);return `# ${p.name}\n\nGoal: ${state.goal}\n\n${state.answers.map(a=>`${a.question}\n${a.answer}`).join('\n\n')}\n\n## Suggested workflow\n${p.steps.map(([t,d],i)=>`${i+1}. ${t} — ${d}`).join('\n')}\n\nProposed worker: ${p.doat} — ${p.role}. Not created or active.\nHuman review required. No tasks, messages or connections have been created.\n`}

export interface WorkProposal {
 name:string;
 doat:string;
 role:string;
 rationale:string;
 steps:[string,string][];
 integrations:{id:string;name:string;reason:string}[];
}
/** Local proposal builder. Uses supplied context only; never implies model reasoning or execution. */
export function propose(state:Pick<MeetState,'goal'|'answers'>):WorkProposal {
 const text=[state.goal,...state.answers.map(a=>a.answer)].join(' ').toLowerCase();
 const kind=decide(state.goal,state.answers,3).kind;
 const period=/this week|weekly/.test(text)?'this week':/daily|every day/.test(text)?'each day':'';
 const source=/excel/.test(text)?'the Excel file you mentioned':/spreadsheet|sheets/.test(text)?'the spreadsheet you mentioned':null;
 let p:WorkProposal={...plans[kind],steps:plans[kind].steps.map(([t,d])=>[t,d]),role:plans[kind].name,rationale:'Start with a small, reviewable plan for your goal.',integrations:[]};
 if(kind==='collections') {
  const assignments=/assignment|assign|task/.test(text);p={...p,name:assignments?'Prepare collection assignments':/overdue|late/.test(text)?'Follow up on overdue payments':'Prepare customer collections',role:'Collections planning',rationale:assignments?'Prepare the collection work for your review before assigning owners.':'Turn the payment follow-up work into a reviewable list and draft messages.',steps:[['Identify payments to follow up',source?`Propose the fields needed from ${source}: account reference, amount and due date. The file has not been opened.`:'Outline the customer records, amounts and due dates needed to identify payments that require attention.'],[assignments?'Draft collection assignments':'Draft follow-up messages',assignments?'Propose follow-up tasks and leave owners unassigned until you provide the real team.':'Prepare a proposed message structure and follow-up order; no customer details or messages are accessed.'],['Approve the next action','Review the records, recipients and wording before any assignment or outgoing message.']],integrations:[{id:'email',name:'Gmail',reason:'For approved email follow-ups, after a scoped mail connector is available.'}]};
 } else if(kind==='website') {
  const outcome=/book/.test(text)?'booking requests':/sell|store|shop/.test(text)?'product browsing and purchase enquiries':/contact/.test(text)?'customer enquiries':'introducing your business';p={...p,name:/simple/.test(text)?'Plan a simple business website':'Plan your business website',role:'Website planning',rationale:`Shape a first website around ${outcome}, then review scope before building.`,steps:[['Define the visitor journey',`Outline how visitors will move from learning about the business to ${outcome}.`],['Outline the first pages',`Propose the page structure, copy and assets needed for ${outcome}; flag details you still need to provide.`],['Review scope before building','Confirm the pages, content and acceptance criteria before creating code or publishing a site.']]};
 } else if(kind==='people') {
  p={...p,name:period?`Plan employee assignments ${period}`:'Organize employee assignments',role:'Work coordination',rationale:`Make the work${period?' for '+period:''} visible before choosing owners and confirming capacity.`,steps:[['Gather work and availability',`List the ${/project/.test(text)?'project tasks':'operational work'}${period?' for '+period:''} and ask for real team availability.`],['Draft an assignment board','Propose responsibilities and dependencies; leave names and dates open until you supply them.'],['Confirm owners and workload','Review capacity and priorities with the team before recording or assigning any work.']]};
 } else if(kind==='inventory') {
  p={...p,name:'Track stock and low-inventory items',role:'Inventory planning',rationale:'Start with a stock register and a replenishment review, without assuming current stock levels.',steps:[['Outline the stock register',source?`Define item, quantity and reorder-point fields for ${source}. No stock data has been read.`:'List the item codes, stock quantities and reorder points needed for a useful register.'],['Propose a low-stock view','Define how items below an agreed reorder point would appear for review. Do not invent quantities or thresholds.'],['Review replenishment decisions','Confirm stock records and purchasing rules before creating any order or alert.']],integrations:[{id:/excel/.test(text)?'microsoft-365':'google-sheets',name:/excel/.test(text)?'Microsoft 365':'Google Sheets',reason:'A possible home for the stock register once scoped file access is implemented.'}]};
 } else if(kind==='messages') {
  const whatsapp=/whatsapp/.test(text);p={...p,name:whatsapp?'Prepare faster WhatsApp customer replies':'Organize incoming customer enquiries',role:'Customer response planning',rationale:'Group incoming questions and draft responses while keeping outgoing communication under review.',steps:[['Define enquiry categories',`Outline the types of customer questions coming through ${whatsapp?'WhatsApp':'email'} and what information each needs.`],['Draft replies and routing rules','Propose response templates and handoff rules for questions that need a person. No conversations have been accessed.'],['Review before replying','Confirm tone, escalation rules and recipients before any message is sent.']],integrations:[{id:whatsapp?'whatsapp-business':'email',name:whatsapp?'WhatsApp Business':'Gmail',reason:'Relevant for customer conversations later; connector setup and authorization are unavailable in this preview.'}]};
 } else if(kind==='approvals') {
  p={...p,name:'Design outgoing-payment approvals',role:'Approval process planning',rationale:'Define a clear review path before anyone authorizes an outgoing payment.',steps:[['Define payment request details','Outline the amount, payee, purpose and supporting records needed for review.'],['Propose approval rules','Ask for authorized approvers and thresholds; do not infer permissions or grant payment authority.'],['Review the approval path','Confirm the rules and exception handling. No payment is initiated or approved.']]};
 } else if(kind==='reporting') {
  p={...p,name:/sales/.test(text)?(/weekly|this week/.test(text)?'Prepare a weekly sales-report outline':'Prepare a sales-report outline'):'Prepare a business-report outline',role:'Reporting planning',rationale:'Agree what the report should answer before connecting a source or calculating results.',steps:[['Choose report questions','Define the decisions the report should support and the metrics that matter.'],['Map the source fields',source?`Outline fields and calculations needed from ${source}; no figures have been calculated.`:'List the data fields and reporting period needed, without inventing results.'],['Review the report format','Confirm the sections and checks before generating or distributing a report.']],integrations:[{id:'google-sheets',name:'Google Sheets',reason:'Possible reporting source once file authorization and a connector are available.'}]};
 } else if(kind==='bookings') {
  p={...p,name:'Plan appointment booking',role:'Scheduling planning',rationale:'Define availability and booking rules before opening a calendar or confirming appointments.',steps:[['Define booking requirements','Ask which services, durations and availability windows should be offered.'],['Outline the booking journey','Propose request, confirmation and cancellation steps. No calendar has been read.'],['Review scheduling rules','Confirm availability, conflict handling and approval requirements before creating events.']],integrations:[{id:'google-calendar',name:'Google Calendar',reason:'Possible calendar connection after scoped authorization and scheduling support exist.'}]};
 }
 // Stable proposed identity; unrelated to real employee records or active Doats.
 const identities:Record<WorkKind,string[]>= {collections:['Mira Vale','Nia Reed','Ellis Ward'],website:['Theo Page','Ada Lane','Leo Hart'],people:['Rowan Ellis','Lena Park','Ari Quinn'],inventory:['Iris Wells','Noah Finch','Maya Holt'],messages:['Cleo Lane','Sam Arden','Nora Bell'],approvals:['Vera North','Eden Shaw','Alex Hale'],reporting:['Owen Sage','Tess Morgan','Remy Grey'],bookings:['Sora West','June Avery','Kai Brook'],general:['Robin Dale','Jamie Wynn','Drew Rowan']};
 let hash=0;for(const char of state.goal.trim().toLowerCase())hash=(hash*31+char.charCodeAt(0))>>>0;
 return {...p,doat:identities[kind][hash%identities[kind].length]};
}
