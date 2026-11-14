import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {Components} from 'react-markdown';
import {tokenizeCode} from '../codeHighlight.js';

function markdownText(node:React.ReactNode):string {
 if(node===null||node===undefined||typeof node==='boolean')return '';
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(markdownText).join('');
 if(React.isValidElement<{children?:React.ReactNode}>(node))return markdownText(node.props.children);
 return '';
}

export function WorkspaceMarkdown({source,onOpenLink}:{source:string;onOpenLink?:(href:string)=>void}):React.ReactElement {
 const components:Components={
  a:({href,children,...props})=>onOpenLink&&href?<a {...props} href={href} target="_blank" rel="noreferrer" onClick={event=>{event.preventDefault();onOpenLink(href);}}>{children}</a>:<span>{children}</span>,
  code:({children,className,...props})=>{
   const code=markdownText(children);
   return className?<code {...props} className={className}>{tokenizeCode(code.replace(/\n$/,'')).map((token,index)=><span className={`syntax-token ${token.kind}`} key={`${index}-${token.kind}`}>{token.text}</span>)}</code>:<code {...props}>{children}</code>;
  },
  img:({alt})=><span className="workspace-files__markdown-image" role="note">{alt?`Image not shown: ${alt}`:'Image not shown in this preview.'}</span>
 };
 return <article className="workspace-files__markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{source}</ReactMarkdown></article>;
}
