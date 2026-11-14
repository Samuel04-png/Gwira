import {AssistantResponse} from './AssistantResponse.js';
import { GwiraThinkingIndicator } from './GwiraThinkingIndicator.js';
import { currentGeneration } from '../conversationModel.js';
import { Icon } from "./Icon.js";
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SessionMessage } from '../../shared/types.js';
import { normalizeTerminalText } from '../activitySegments.js';
import { groupResponseEntries, completeResponseText, spokenResponseText } from '../responsePresentation.js';
import type { TraceEntry } from '../activityTraceModel.js';
import { buildTraceEntries } from '../activityTraceModel.js';
import { ActivityTrace } from './ActivityTrace.js';
import { tokenizeCode } from '../codeHighlight.js';
import { visibleTranscriptMessages } from '../displayMessages.js';
import { startsMessagePeriod, userMessageContent } from '../messagePresentation.js';
import { formatDayLabel, formatTimeLabel } from '../gwira/inbox/inboxNavModel.js';
import { MessageImageGallery, LocalImagePreview } from './MessageAttachments.js';
export { LocalImagePreview } from './MessageAttachments.js';
import { MessageActionButton } from './MessageActionButton.js';
import { ReadAloudControl } from './ReadAloudControl.js';
import { MessageMoreMenu } from './MessageMoreMenu.js';

function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

export async function copyText(text: string): Promise<void> {
  // The desktop's local selection path avoids prompting for browser clipboard
  // permission. Fall back to the Clipboard API if selection copy is unavailable.
  const previous = document.activeElement as HTMLElement | null;
  const textarea = document.createElement('textarea');
  textarea.value = text; textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed'; textarea.style.opacity = '0';
  document.body.appendChild(textarea); textarea.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } finally { textarea.remove(); previous?.focus(); }
  if (copied) return;
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  throw new Error('Copy is unavailable');
}

function MarkdownCodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const code = nodeText(children).replace(/\n$/, '');
  const language = codeBlockLanguage(children);

  async function handleCopy(): Promise<void> {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1100);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="markdown-code-block">
      {language ? <div className="code-language-label">{language}</div> : null}
      <button className="copy-code-button" type="button" onClick={handleCopy} aria-label="Copy code" title="Copy code">
        {copied ? <Icon name="trace-check" /> : <CopyIcon />}
      </button>
      <pre {...props}><code>{tokenizeCode(code).map((token, index) => <span className={`syntax-token ${token.kind}`} key={`${index}-${token.kind}`}>{token.text}</span>)}</code></pre>
    </div>
  );
}

function codeBlockLanguage(node: React.ReactNode): string | undefined {
  const first = Array.isArray(node) ? node[0] : node;
  if (!React.isValidElement<{ className?: string }>(first)) return undefined;
  const match = /language-([^\s]+)/.exec(first.props.className ?? '');
  return match?.[1];
}

function CopyIcon(): React.ReactElement { return <Icon name="trace-copy" />; }

const markdownComponents: Components = {
  pre: MarkdownCodeBlock, a: MarkdownLink, img: MarkdownImage,
  p: ({node,children,...props}) => node?.children.some(child=>child.type==='element'&&child.tagName==='img') ? <div className="message-image-paragraph">{children}</div> : <p {...props}>{children}</p>
};
const restrictedMarkdownComponents:Components={
 pre:MarkdownCodeBlock,
 a:({children})=><span>{children}</span>,
 img:({alt})=><span>{alt||'Image'}</span>
};
function MarkdownImage({src,alt}: React.ImgHTMLAttributes<HTMLImageElement>): React.ReactElement | null {
  if (!src || typeof src !== 'string') return null;
  const local=src.startsWith('/') || src.startsWith('file://');
  let path=src;
  if(local){try{path=decodeURI(src.replace(/^file:\/\//,''));}catch{path=src;}}
  return <MessageImageGallery images={[{path,name:alt || 'Image attachment',remote:!local}]} />;
}

function MarkdownLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>): React.ReactElement {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    if (!href) return;
    event.preventDefault();
    void window.codexDesktop.openExternalTarget({ target: href });
  }

  return <a {...props} href={href} onClick={handleClick}>{children}</a>;
}

export function UserMessage({ text, compact, restricted = false }: { text: string; compact: boolean; restricted?: boolean }): React.ReactElement {
  const {images,files,body} = useMemo(() => restricted?{images:[],files:[],body:text}:userMessageContent(text), [text,restricted]);
  const content = useRef<HTMLDivElement>(null), preview = useRef<HTMLDivElement>(null);
  const [overflow,setOverflow] = useState(false), [expanded,setExpanded] = useState(false);
  const [fileError,setFileError] = useState('');
  const id=useId();
  useLayoutEffect(()=>{
    const check=():void=>{if(!content.current||!preview.current)return; const limit=Number.parseFloat(getComputedStyle(preview.current).getPropertyValue('--gw-user-preview-height'));setOverflow(content.current.scrollHeight>limit+1);};
    const observer=new ResizeObserver(check); if(content.current)observer.observe(content.current);check();return()=>observer.disconnect();
  },[text,compact]);
  return <div className="user-message-body">
    {images.length?<MessageImageGallery images={images} compact={compact}/>:null}
    {files.length?<div className="message-file-attachments">{files.map((file,i)=><button type="button" key={`${i}:${file.path}`} title={`Open ${file.name}`} aria-label={`Open attachment ${file.name}`} onClick={()=>{void window.codexDesktop.openExternalTarget({target:file.path}).catch(()=>setFileError(`Could not open ${file.name}. Check that the file still exists.`));}}><Icon name="file"/><span>{file.name}</span><small>{file.path.split('.').at(-1)?.toUpperCase()} · Open original</small></button>)}</div>:null}
    {fileError?<p role="status">{fileError}</p>:null}
    {body.trim()?<div className="user-message-bubble"><div ref={preview} id={id} className={`message-user-preview${overflow&&!expanded?' is-collapsed':''}`}><div ref={content} className="message-user-content"><ReactMarkdown remarkPlugins={[remarkGfm]} components={restricted?restrictedMarkdownComponents:markdownComponents}>{body}</ReactMarkdown></div></div>{overflow?<button className="message-show-more" type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Show more'}<Icon name={expanded?'sort-up':'chevron-down'}/></button>:null}</div>:null}
  </div>;
}

export const Transcript = React.memo(function Transcript({ messages, isRunning, hideSystem = false, compact = false, outcome }: { outcome?: 'idle' | 'running' | 'error'; messages: SessionMessage[]; isRunning: boolean; hideSystem?: boolean; compact?: boolean }): React.ReactElement {
  const visibleMessages = useMemo(() => visibleTranscriptMessages(messages).filter((message) => !hideSystem || message.role !== 'system'), [hideSystem, messages]);
  const traceEntries = useMemo(() => buildTraceEntries(visibleMessages, isRunning), [visibleMessages, isRunning]);
  const entries = useMemo(() => groupResponseEntries(traceEntries), [traceEntries]);
  const generation = currentGeneration(messages);
  const recordedActivity = traceEntries.some((entry) => entry.kind === 'trace' && entry.run.live && entry.run.groups.some((group) => !group.background));
  let previousAt: string | undefined;
  return <section className="transcript" data-message-style="refined" aria-label="Conversation messages">
    <span className="conversation-status" role="status" aria-live="polite" aria-atomic="true">{outcome === 'error' ? 'Response failed. Review the error and your saved draft.' : !isRunning ? 'Run finished. Review the response and recorded activity.' : generation.hasResponse ? 'Response started.' : recordedActivity ? 'Gwira is working. Recorded activity is available.' : 'Waiting for Gwira’s response.'}</span>
    {entries.map((entry, index) => {
      if(entry.kind==='response')return <ResponseGroup key={entry.id} id={entry.id} entries={entry.entries} compact={compact} running={isRunning && index === entries.length - 1}/>;
      const period=entry.message.role==='user'&&startsMessagePeriod(entry.message.createdAt,previousAt);previousAt=entry.message.createdAt;
      return <React.Fragment key={entry.message.id}>{period?<div className="message-date-separator"><time dateTime={entry.message.createdAt}>{formatDayLabel(entry.message.createdAt)} {formatTimeLabel(entry.message.createdAt)}</time></div>:null}<TranscriptMessage showIdentity={false} message={entry.message} compact={compact} running={isRunning&&generation.messages.some(m=>m.id===entry.message.id)}/></React.Fragment>;
    })}
    {isRunning && !generation.hasResponse && !recordedActivity ? <GwiraThinkingIndicator key={generation.startedAt ?? 'pending'} startedAt={generation.startedAt} compact={compact} /> : null}
  </section>;
});

function ResponseGroup({id,entries,compact,running}:{id:string;entries:TraceEntry[];compact:boolean;running:boolean}):React.ReactElement {
  const response=useRef<HTMLDivElement>(null);
  const [copied,setCopied]=useState<'idle'|'copied'|'failed'>('idle');
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const text=completeResponseText(entries);
  async function copy():Promise<void>{try{await copyText(text);setCopied('copied');}catch{setCopied('failed');}clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied('idle'),1500);}
  return <section className="assistant-turn" aria-label="Gwira response" data-response-id={id}>
    {text ? <AssistantResponse identity /> : null}
    <div className="assistant-turn__content" ref={response}>{entries.map(entry=>entry.kind==='trace'?<ActivityTrace key={entry.run.id} run={entry.run} onCopy={copyText}/>:entry.message.text.trim()?<TranscriptMessage key={entry.message.id} message={entry.message} compact={compact} running={running} showIdentity={false} block/>:null)}</div>
    {text ? <div className="conversation-message-actions response-actions" role="group" aria-label="Complete response actions">
      <MessageActionButton label={copied==='copied'?'Copied entire response':'Copy entire response'} icon={copied==='copied'?'trace-check':'trace-copy'} onClick={()=>void copy()}/>
      <ReadAloudControl id={`response:${id}`} response={response} text={spokenResponseText(text)} label="Read entire response aloud" running={running}/>
      <MessageActionButton label="Good response" icon="thumbs-up" disabledReason="Response ratings cannot be saved: no message feedback store or user attribution API is connected."/>
      <MessageActionButton label="Poor response" icon="thumbs-down" disabledReason="Response ratings cannot be saved: no message feedback store or user attribution API is connected."/>
      <MessageMoreMenu/>
      <span className={copied==='failed'?'message-action-error':'message-copy-status'} role="status">{copied==='copied'?'Copied entire response':copied==='failed'?'Could not copy. Select the response to copy it manually.':''}</span>
    </div> : null}
  </section>;
}

const TranscriptMessage = React.memo(function TranscriptMessage({ message, compact, running, showIdentity, block = false }: { message: SessionMessage; compact: boolean; running: boolean; showIdentity:boolean; block?:boolean }): React.ReactElement {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const response = useRef<HTMLDivElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  async function copy(): Promise<void> {
    try { await copyText(message.text); setCopyState('copied'); } catch { setCopyState('failed'); }
    clearTimeout(timer.current);timer.current=setTimeout(()=>setCopyState('idle'),1500);
  }
  const time=formatTimeLabel(message.createdAt);
  const timestamp=time?<time className="message-timestamp" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{time}</time>:null;
  return <article className={`message ${message.role}${block ? ' response-block' : ''}`} data-message-id={message.id}>
    {message.role === 'user' ? <UserMessage text={message.text} compact={compact}/> : null}
    {message.role === 'codex' ? <AssistantResponse className="message-response" ref={response} identity={showIdentity}><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{normalizeTerminalText(message.text)}</ReactMarkdown></AssistantResponse> : null}
    {message.role === 'user' || message.role === 'codex' ? <div className="conversation-message-actions" role="group" aria-label={message.role==='user'?'Your message actions':'Gwira response actions'}>
      {message.role==='user'?timestamp:null}
      <MessageActionButton label={copyState==='copied'?'Copied':message.role==='user'?'Copy your message':'Copy Gwira response'} icon={copyState==='copied'?'trace-check':'trace-copy'} onClick={()=>void copy()}/>
      {message.role==='user'?<MessageActionButton label="Edit message" icon="new-work" disabledReason="Editing historical messages is not supported by the conversation provider. The original message and attachments are preserved."/>:<><ReadAloudControl id={message.id} response={response} running={running}/>{!block ? <><MessageActionButton label="Good response" icon="thumbs-up" disabledReason="Response ratings cannot be saved: no message feedback store or user attribution API is connected."/><MessageActionButton label="Poor response" icon="thumbs-down" disabledReason="Response ratings cannot be saved: no message feedback store or user attribution API is connected."/><MessageMoreMenu/></> : null}{timestamp}</>}
      <span className={copyState==='failed'?'message-action-error':'message-copy-status'} role="status">{copyState==='copied'?'Copied':copyState==='failed'?'Could not copy. Select the text to copy it manually.':''}</span>
    </div> : null}
  </article>;
});
