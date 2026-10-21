import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SessionMessage } from '../../shared/types.js';
import { diffLineClass, isMarkdownActivityText, normalizeTerminalText, splitActivitySegments } from '../activitySegments.js';
import { tokenizeCode } from '../codeHighlight.js';
import { visibleTranscriptMessages } from '../displayMessages.js';
import { splitUserMessageParts } from '../messageParts.js';

function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
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
        {copied ? '✓' : <CopyIcon />}
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

function CopyIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5 2.5A1.5 1.5 0 0 1 6.5 1h6A1.5 1.5 0 0 1 14 2.5v6a1.5 1.5 0 0 1-1.5 1.5H11V8.5h1.5v-6h-6V4H5V2.5Z" />
      <path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h6A1.5 1.5 0 0 1 11 6.5v7A1.5 1.5 0 0 1 9.5 15h-6A1.5 1.5 0 0 1 2 13.5v-7Zm1.5 0v7h6v-7h-6Z" />
    </svg>
  );
}

const markdownComponents: Components = { pre: MarkdownCodeBlock, a: MarkdownLink };

function MarkdownLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>): React.ReactElement {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    if (!href) return;
    event.preventDefault();
    void window.codexDesktop.openExternalTarget({ target: href });
  }

  return <a {...props} href={href} onClick={handleClick}>{children}</a>;
}

function ActivityMessage({ text }: { text: string }): React.ReactElement {
  return (
    <details className="activity-block" open>
      <summary>activity</summary>
      <div className="activity-body">
        {splitActivitySegments(text).map((segment, index) => segment.type === 'diff' ? (
          <pre className="activity-diff" key={`${segment.type}-${index}`}>
            {segment.text.split('\n').map((line, lineIndex) => <span className={diffLineClass(line)} key={`${lineIndex}-${line}`}>{line || ' '}</span>)}
          </pre>
        ) : isMarkdownActivityText(segment.text) ? (
          <div className="activity-markdown" key={`${segment.type}-${index}`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{segment.text}</ReactMarkdown></div>
        ) : <pre className="activity-text" key={`${segment.type}-${index}`}>{segment.text}</pre>)}
      </div>
    </details>
  );
}

function UserMessage({ text }: { text: string }): React.ReactElement {
  return <div className="user-message-body">
    {splitUserMessageParts(normalizeTerminalText(text)).map((part, index) => part.type === 'image' ? (
      <LocalImagePreview imagePath={part.path} name={part.name} key={`${part.path}-${index}`} />
    ) : part.text.trim().length > 0 ? <pre key={`text-${index}`}>{part.text}</pre> : null)}
  </div>;
}

export function LocalImagePreview({ imagePath, name, compact = false }: { imagePath: string; name: string; compact?: boolean }): React.ReactElement {
  const [source, setSource] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSource(undefined);
    setFailed(false);
    void window.codexDesktop.readLocalImage({ path: imagePath }).then((result) => {
      if (cancelled) return;
      if (result.dataUrl) setSource(result.dataUrl);
      else setFailed(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [imagePath]);

  return (
    <figure className={compact ? 'composer-image-preview' : 'user-image-preview'}>
      {source ? <button className="image-preview-button" type="button" onClick={() => setOpen(true)}><img src={source} alt={name} /></button> : <div className="image-preview-fallback">{failed ? 'Image expired' : 'Loading image...'}</div>}
      {compact ? null : <figcaption>{name}</figcaption>}
      {open && source ? <div className="image-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
        <button className="image-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close image preview">×</button>
        <img src={source} alt={name} onClick={(event) => event.stopPropagation()} />
      </div> : null}
    </figure>
  );
}

export const Transcript = React.memo(function Transcript({ messages, isRunning, hideSystem = false }: { messages: SessionMessage[]; isRunning: boolean; hideSystem?: boolean }): React.ReactElement {
  const visibleMessages = useMemo(() => visibleTranscriptMessages(messages).filter((message) => !hideSystem || message.role !== 'system'), [hideSystem, messages]);
  return <section className="transcript">
    {visibleMessages.map((message) => <TranscriptMessage message={message} key={message.id} />)}
    {isRunning ? <div className="thinking">Thinking</div> : null}
  </section>;
});

const TranscriptMessage = React.memo(function TranscriptMessage({ message }: { message: SessionMessage }): React.ReactElement {
  return <article className={`message ${message.role}`}>
    {message.role === 'system' ? <ActivityMessage text={message.text} /> : null}
    {message.role === 'user' ? <UserMessage text={message.text} /> : null}
    {message.role === 'codex' ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{normalizeTerminalText(message.text)}</ReactMarkdown> : null}
  </article>;
});
