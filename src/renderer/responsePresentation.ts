import type {TraceEntry} from './activityTraceModel.js';
import {normalizeTerminalText} from './activitySegments.js';
export type ResponseEntry = {kind:'response'; id:string; entries:TraceEntry[]} | Extract<TraceEntry,{kind:'message'}>;
/** User records delimit provider turns. Trace records stay ordered inside that turn.
 * This model has one codex author; other multi-agent feeds retain their own attribution. */
export function groupResponseEntries(entries: readonly TraceEntry[]):ResponseEntry[] {
 const result:ResponseEntry[]=[];
 for(const entry of entries){
  if(entry.kind==='message'&&entry.message.role==='user'){result.push(entry);continue;}
  const previous=result.at(-1);
  if(previous?.kind==='response')previous.entries.push(entry);
  else result.push({kind:'response',id:entry.kind==='trace'?entry.run.id:entry.message.id,entries:[entry]});
 }
 return result;
}
/** Copy source Markdown only, never trace details or DOM-derived metadata. */
export function completeResponseText(entries:readonly TraceEntry[]):string {
 return entries.flatMap(entry=>entry.kind==='message'&&entry.message.role==='codex'&&entry.message.text.trim()?[normalizeTerminalText(entry.message.text)]:[]).join('\n\n');
}
export function spokenResponseText(markdown:string):string {
 return markdown.replace(/```[^\n]*\n[\s\S]*?```/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[`#*_>|]/g,' ').replace(/\s+/g,' ').trim();
}
