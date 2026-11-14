import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Transcript } from '../src/renderer/components/Transcript.js';
import type { SessionMessage } from '../src/shared/types.js';
let root: Root;
const now = new Date(); now.setHours(8, 44, 0, 0);
const image = '/Users/premierpluspawn/Pictures/Screenshots/Screenshot 2026-10-28 at 08.55.47.png';
export const originalLongText = Array.from({length:24},(_,i)=>`Paragraph ${i+1}. Preserve this complete instruction, including repeated words, line breaks, and the original content.\n\n- Review the actual source.\n- Keep the original attachment.\n`).join('\n');
export function showMessageFixture(mode: 'short' | 'long' | 'images' | 'missing' | 'returned' | 'files' = 'short', compact = false, width = 380): void {
 if (!import.meta.env.DEV) throw Error('Development fixture only');
 const node=document.getElementById('message-presentation-fixture') ?? document.body.appendChild(Object.assign(document.createElement('div'),{id:'message-presentation-fixture'}));
 Object.assign(node.style,{position:'fixed',inset:'38px 0 0 324px',zIndex:'1000',background:'var(--gw-conversation-canvas)'});
 if(innerWidth<900)node.style.left='64px';
 root ??= createRoot(node);
 const images=Array.from({length:mode==='missing'?1:20},(_,i)=>`<image name=[Reference ${i+1}] path="${mode==='missing'?'/missing/message-qa.png':i%2===0?image:'/Users/premierpluspawn/Pictures/Screenshots/Screenshot 2026-10-28 at 08.51.23.png'}">\n</image>`).join('\n');
 const messages:SessionMessage[]=[{id:'qa-user',role:'user',text:mode==='short'||mode==='returned'?'Review the recorded conversation.':mode==='files'?'Use attached file: Request.txt (/missing/request.txt)\n\nUse attached file: Notes.txt (/missing/notes.txt)\n\nReview the attached documents.':mode==='long'?originalLongText:images+'\n'+(mode==='images'?'## Review these references\n\nKeep the images in their original order.\n\n'+originalLongText:'This attachment is unavailable.'),createdAt:now.toISOString()},{id:'qa-answer',role:'codex',text:(mode==='returned'?`![Returned reference](${encodeURI(image)})\n\n`:'')+'The message surface uses **selective emphasis**, regular body text, and shared controls.\n\n## Recorded context\n\n- The original message stays intact.\n- Attachments remain associated with the message.\n  - Nested lists keep their indentation.\n\n1. Inspect the source.\n2. Review the result.\n\nA [reference](https://example.com) and `record_id` stay readable.\n\n> Keep decisions with the responsible person.\n\n| Item | Status |\n| --- | --- |\n| Source | Read |\n\n```ts\nconst source = "recorded";\n```',createdAt:new Date(now.getTime()+180000).toISOString()}];
 root.render(compact?<aside className="global-assistant" style={{width,position:'absolute',inset:'0 0 0 auto',display:'flex'}}><div className="global-assistant__feed"><Transcript messages={messages} isRunning={false} compact /></div></aside>:<div className="workspace__view--chat" style={{height:'100%',display:'block'}}><div className="content" style={{height:'100%'}}><div style={{maxWidth:'var(--gw-conversation-width)',margin:'auto'}}><Transcript messages={messages} isRunning={false}/></div></div></div>);
}
