import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './itemTitle.css';
import { Icon } from './Icon.js';

export interface ItemPreview { context?: string; metadata?: string; status?: string; sources?: string[] }

/** One-line overflow reveal. Metadata uses a preview instead of a competing marquee. */
export function ItemTitle({ text, preview, children, sidebar = false, className = '' }: {
  text: string; preview?: ItemPreview; children?: React.ReactNode; sidebar?: boolean; className?: string;
}): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [overflow, setOverflow] = useState(0);
  const overflowRef = useRef(0);
  const [hovered, setHovered] = useState(false);
  const [card, setCard] = useState<{ left: number; top: number; width: number; maxHeight: number }>();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissed = useRef(false);
  const clearTimers = () => { clearTimeout(closeTimer.current); clearTimeout(openTimer.current); };
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const content = element.firstElementChild as HTMLElement;
    const measure = () => {
      overflowRef.current = Math.max(0, Math.max(content.scrollWidth, content.getBoundingClientRect().width) - element.clientWidth);
      setOverflow(overflowRef.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(content);
    let mounted = true;
    void document.fonts.ready.then(() => { if (mounted) measure(); });
    return () => { mounted = false; observer.disconnect(); };
  }, [text]);

  useEffect(() => {
    const element = ref.current;
    const host = element?.closest<HTMLElement>('button,[role="button"],[data-micro-row]');
    if (!element || !host) return;
    const timing = (name: string) => Number.parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0;
    const close = () => { clearTimers(); setCard(undefined); setHovered(false); };
    const open = (keyboard: boolean) => {
      clearTimers();
      if (dismissed.current || (!preview && overflowRef.current <= 1)) return;
      openTimer.current = setTimeout(() => {
        if (!host.isConnected || host.closest('[hidden]')) return;
        const bounds = host.getBoundingClientRect();
        const gap = sidebar ? timing('--gw-space-3') : 12;
        const width = Math.min(sidebar ? timing('--gw-sidebar-preview-width') : 320, window.innerWidth - gap * 2);
        const sidebarBounds = host.closest('.gwira-secondary-sidebar')?.getBoundingClientRect();
        const anchor = sidebar && sidebarBounds ? sidebarBounds.right : bounds.right;
        const left = Math.max(gap, Math.min(anchor + gap, window.innerWidth - width - gap));
        document.dispatchEvent(new CustomEvent('gw-item-preview-open', { detail: id }));
        const top = Math.max(gap, Math.min(bounds.top, window.innerHeight - (sidebar ? gap : 220)));
        setCard({ width, left, top, maxHeight: window.innerHeight - top - gap });
      }, timing(keyboard ? '--gw-preview-focus-delay' : '--gw-preview-delay'));
    };
    const enter = () => { dismissed.current = false; setHovered(true); if (preview || window.matchMedia('(prefers-reduced-motion: reduce)').matches) open(false); };
    const leave = () => { if (document.activeElement instanceof HTMLElement && host.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) return; clearTimeout(openTimer.current); setHovered(false); closeTimer.current = setTimeout(() => setCard(undefined), timing('--gw-preview-exit-delay')); };
    const focus = (event: FocusEvent) => {
      // Focusing a sibling row action must not obscure its menu or tooltip.
      if (event.target instanceof HTMLElement && event.target.matches(':focus-visible') && (event.target === host || event.target.contains(element))) {
        dismissed.current = false; setHovered(false); open(true);
      }
    };
    const blur = () => { close(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { dismissed.current = true; close(); } };
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Node && document.getElementById(id)?.contains(event.target)) return;
      dismissed.current = true; close();
    };
    const otherPreview = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !document.getElementById(id)?.contains(event.target)) close(); };
    host.addEventListener('mouseenter', enter); host.addEventListener('mouseleave', leave);
    host.addEventListener('focusin', focus); host.addEventListener('focusout', blur);
    document.addEventListener('gw-item-preview-open', otherPreview);
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', pointer);
    window.addEventListener('blur', close); window.addEventListener('resize', close); document.addEventListener('scroll', scroll, true);
    return () => {
      clearTimers();
      host.removeEventListener('mouseenter', enter); host.removeEventListener('mouseleave', leave);
      host.removeEventListener('focusin', focus); host.removeEventListener('focusout', blur);
      document.removeEventListener('gw-item-preview-open', otherPreview);
      document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', pointer);
      window.removeEventListener('blur', close); window.removeEventListener('resize', close); document.removeEventListener('scroll', scroll, true);
    };
  }, [id, text, Boolean(preview), preview?.context, preview?.metadata, preview?.status, preview?.sources?.join('\n'), sidebar]);

  useLayoutEffect(() => {
    if (!sidebar || !card || !previewRef.current || !ref.current) return;
    const element = previewRef.current;
    const gap = Number.parseFloat(getComputedStyle(element).getPropertyValue('--gw-space-3'));
    const border = Number.parseFloat(getComputedStyle(element).getPropertyValue('--gw-hairline'));
    const height = Math.min(element.scrollHeight + border * 2, window.innerHeight - gap * 2);
    const host = ref.current.closest<HTMLElement>('button,[role="button"],[data-micro-row]');
    if (!host) return;
    const top = Math.max(gap, Math.min(host.getBoundingClientRect().top, window.innerHeight - height - gap));
    setCard(current => current ? { ...current, top, maxHeight: window.innerHeight - top - gap } : current);
  }, [Boolean(card), sidebar, text]);

  useEffect(() => {
    if (!card) return;
    const host = ref.current?.closest<HTMLElement>('button,[role="button"],[data-micro-row]');
    if (!host) return;
    const previous = host.getAttribute('aria-describedby');
    host.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => { if (previous) host.setAttribute('aria-describedby', previous); else host.removeAttribute('aria-describedby'); };
  }, [card, id]);

  return <><span ref={ref} className={`gw-item-title ${sidebar ? 'gw-sidebar-overflow' : ''} ${className}`} data-overflow={overflow > 1}
    data-revealing={hovered && (sidebar || (!preview && !card)) && overflow > 1}
    style={{ '--gw-title-distance': `${overflow}px`, '--gw-title-duration': `${Math.max(2, overflow / (sidebar ? 34 : 28) + (sidebar ? 0 : 1))}s` } as React.CSSProperties}>
    <span className="gw-item-title__text">{children ?? text}</span>
  </span>{card ? createPortal(<div ref={previewRef} id={id} role="tooltip" className={`gw-item-preview ${sidebar ? 'gw-sidebar-preview' : ''}`} style={card}
    onMouseEnter={() => { clearTimeout(closeTimer.current); }}
    onMouseLeave={() => { closeTimer.current = setTimeout(() => setCard(undefined), Number.parseFloat(getComputedStyle(ref.current!).getPropertyValue('--gw-preview-exit-delay')) || 0); }}>
    <strong>{text}</strong>
    {preview?.context ? <span>{sidebar ? <Icon name="folder" /> : null}{preview.context}</span> : null}
    {preview?.metadata ? <span>{sidebar ? <Icon name="clock" /> : null}{preview.metadata}</span> : null}
    {sidebar ? preview?.sources?.map(source => <span className="gw-sidebar-preview__source" key={source}><Icon name="folder" />{source}</span>) : null}
    {preview?.status ? <span>{preview.status}</span> : null}
  </div>, document.body) : null}</>;
}
