import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipHandle { show: (lines: string[], x: number, y: number) => void; hide: () => void }

interface Tip { lines: string[]; x: number; y: number }

/** Hover and focus card. Holds its own state so moving the pointer never re-renders the timeline. */
export const TimelineTooltip = forwardRef<TooltipHandle>(function TimelineTooltip(_props, ref) {
  const [tip, setTip] = useState<Tip | null>(null);
  useImperativeHandle(ref, () => ({ show: (lines, x, y) => setTip({ lines, x, y }), hide: () => setTip(null) }), []);
  if (!tip) return null;
  const left = Math.max(8, Math.min(tip.x + 12, window.innerWidth - 308));
  const flip = tip.y > window.innerHeight - 170;
  return createPortal(
    <div role="tooltip" className="gwira-timeline-tip" style={{ left, ...(flip ? { bottom: window.innerHeight - tip.y + 12 } : { top: tip.y + 16 }) }}>
      <strong>{tip.lines[0]}</strong>
      {tip.lines.slice(1).map((line, index) => <span key={index}>{line}</span>)}
    </div>,
    document.body
  );
});
