import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** One tooltip behavior for rail and sidebar toolbar controls. */
export function SidebarTooltip({ label, children, placement = 'right', className = '', revealOnLabelChange = false }: {
  label: string; children: React.ReactElement<{ 'aria-describedby'?: string }>; placement?: 'right' | 'bottom'; className?: string; revealOnLabelChange?: boolean;
}): React.ReactElement {
  const id = useId();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [position, setPosition] = useState<React.CSSProperties>();
  const [visible, setVisible] = useState(false);
  const timing = (token: string) => Number.parseFloat(getComputedStyle(host.current!).getPropertyValue(token)) || 0;
  const close = () => {
    clearTimeout(timer.current);
    setVisible(false);
    timer.current = setTimeout(() => setPosition(undefined), timing('--gw-rail-tooltip-exit'));
  };
  const open = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const element = host.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const gap = Number.parseFloat(style.getPropertyValue('--gw-space-2'));
      const width = Math.min(Number.parseFloat(style.getPropertyValue('--gw-rail-tooltip-max')), window.innerWidth - gap * 2);
      setPosition({ left: Math.max(gap, Math.min(placement === 'bottom' ? rect.left : rect.right + gap, window.innerWidth - width - gap)), top: Math.max(gap, Math.min(placement === 'bottom' ? rect.bottom + gap : rect.top + rect.height / 2, window.innerHeight - rect.height - gap)), maxWidth: width });
      setVisible(true);
    }, timing('--gw-rail-tooltip-delay'));
  };
  useEffect(() => {
    if (revealOnLabelChange && (host.current?.matches(':hover') || host.current?.contains(document.activeElement))) open();
  }, [label, revealOnLabelChange]);
  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element || !visible) return;
    const rect = element.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(element).getPropertyValue('--gw-space-2'));
    const correction = rect.top < gap ? gap - rect.top : rect.bottom > window.innerHeight - gap ? window.innerHeight - gap - rect.bottom : 0;
    if (correction) setPosition((current) => current ? { ...current, top: Number(current.top) + correction } : current);
  }, [visible]);
  useEffect(() => {
    const dismiss = () => { clearTimeout(timer.current); setVisible(false); setPosition(undefined); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    document.addEventListener('scroll', dismiss, true);
    document.addEventListener('keydown', escape);
    return () => { clearTimeout(timer.current); window.removeEventListener('resize', dismiss); window.removeEventListener('blur', dismiss); document.removeEventListener('scroll', dismiss, true); document.removeEventListener('keydown', escape); };
  }, []);
  return <span ref={host} className={`gw-sidebar-tooltip-host ${className}`} onMouseEnter={open} onMouseLeave={() => { if (!host.current?.querySelector('button:focus-visible')) close(); }}
    onFocusCapture={event => { if ((event.target as HTMLElement).matches(':focus-visible')) open(); }} onBlurCapture={close} onClickCapture={close}>
    {React.cloneElement(children, { 'aria-describedby': position ? id : undefined })}
    {position ? createPortal(<div ref={tooltipRef} id={id} role="tooltip" className="gw-rail-tooltip" data-side={placement} data-visible={visible} style={position}>{label}</div>, document.body) : null}
  </span>;
}
