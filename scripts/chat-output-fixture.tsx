import React, {useRef,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ConversationHeading} from '../src/renderer/components/ConversationHeading.js';
import {Transcript} from '../src/renderer/components/Transcript.js';
import {useConversationScroll} from '../src/renderer/components/useConversationScroll.js';
import type {SessionMessage} from '../src/shared/types.js';
let root:Root;
const at='2026-11-03T08:00:00Z';
const m=(id:string,role:SessionMessage['role'],text:string):SessionMessage=>({id,role,text,createdAt:at});
export const responseParts=['I’ll inspect the existing navigation and preserve the original records.','## Review the proposal\n\nThe sidebar remains part of Home. Related paragraphs should read as one continuous response.\n\n- Keep the original project context.\n- Review changes before continuing.\n\n| Item | Result |\n| --- | --- |\n| Navigation | Ready for review |','```ts\nconst proposal = { approved: false };\n```\n\nThis is a proposed change, ready for your review.'];
export const paste='# Files pasted by the user:\n\n## "Project brief": /tmp/gwira-chat-qa-brief.txt\n\nPasted text contains the user\'s request.\n\n## My request:\n\nPlease review this brief.';
export function showChatOutputFixture(mode='grouped'){
 if(!import.meta.env.DEV)throw Error('Development only');
 const host=document.getElementById('chat-output-fixture')??document.body.appendChild(Object.assign(document.createElement('div'),{id:'chat-output-fixture'}));
 Object.assign(host.style,{position:'fixed',inset:'38px 0 0 '+(innerWidth<1000?'64px':'324px'),zIndex:'1000',background:'var(--gw-conversation-canvas)'});
 root??=createRoot(host);root.render(<Fixture key={mode} mode={mode}/>);
}
function Fixture({mode}:{mode:string}){
 const ref=useRef<HTMLDivElement>(null);const [messages,setMessages]=useState<SessionMessage[]>(()=>[m('user','user',mode==='paste'?paste:mode==='long-paste'?Array.from({length:25},(_,i)=>`Paragraph ${i+1}: Review all of the original instructions.`).join('\n\n'):'Review the navigation proposal.'),m('a1','codex',responseParts[0]),m('system','system','Command: rg navigation src\nExit code: 0'),m('a2','codex',responseParts[1]),m('a3','codex',responseParts[2]),...(mode==='long'?Array.from({length:12},(_,i)=>[m('u'+i,'user','Review section '+i),m('r'+i,'codex',responseParts.join('\n\n'))]).flat():[])]);
 const scroll=useConversationScroll(ref,messages,'fixture');
 (window as unknown as {appendChatQA:()=>void}).appendChatQA=()=>setMessages(old=>[...old,m('stream','codex','New recorded response content.')]);
 if(mode==='compact')return <aside className="global-assistant" style={{width:320,height:'100%',position:'absolute',right:0}}><div className="global-assistant__feed"><Transcript messages={messages} isRunning={false} compact/></div></aside>;
 return <div className="workspace__view--chat" style={{height:'100%',display:'grid',gridTemplateRows:'auto minmax(0,1fr) auto auto'}}><header className="topbar"><ConversationHeading userText="<external_codex_app_context>Internal transport context</external_codex_app_context>Review the navigation proposal" projectName="Local QA fixture"/></header><div className="content" ref={ref} onScroll={scroll.onScroll}><Transcript messages={messages} isRunning={mode==='streaming'}/></div><div className="conversation-scroll-controls" hidden={scroll.following}><button className="conversation-jump" onClick={scroll.jump}>Jump to latest</button></div><div className="composer-panel"><textarea aria-label="QA composer" placeholder="Message Gwira"/></div></div>;
}
