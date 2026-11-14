/** Examples shown as an animated hint. They describe requests, not completed work. */
export const hintPhrases=[
 'Follow up on overdue customer payments…',
 'Help me organize my team’s work…',
 'Respond to customer inquiries faster…',
 'Prepare this week’s sales report…',
 'Track inventory and alert me when stock runs low…',
 'Help me build a website for my business…'
] as const;

export interface StartingPoint {id:string;icon:'clock'|'users'|'threads'|'file'|'computer'|'archive';title:string;description:string;prompt:string}
/** Editable starting examples. Choosing one fills the composer; it never submits. */
export const startingPoints:readonly StartingPoint[]=[
 {id:'follow-ups',icon:'clock',title:'Customer follow-ups',description:'Prepare messages for overdue payments.',prompt:'Follow up on overdue customer payments'},
 {id:'team',icon:'users',title:'Team coordination',description:'Organize assignments and deadlines.',prompt:'Set up employee assignments for this week'},
 {id:'support',icon:'threads',title:'Customer support',description:'Help respond to incoming requests.',prompt:'Respond to customer WhatsApp messages faster'},
 {id:'reporting',icon:'file',title:'Business reporting',description:'Summarize weekly sales activity.',prompt:'Prepare weekly sales reporting'}
];
export const moreStartingPoints:readonly StartingPoint[]=[
 {id:'website',icon:'computer',title:'Business website',description:'Plan a simple site for your services.',prompt:'Build a simple website for my business'},
 {id:'inventory',icon:'archive',title:'Stock levels',description:'Watch inventory and low stock.',prompt:'Track stock levels and low inventory'}
];
