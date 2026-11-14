import { GwiraLogo } from './GwiraLogo.js';
import React, { useEffect, useRef, useState } from 'react';
import { thinkingFrame } from '../conversationModel.js';
import { ShellIcon } from './Icon.js';

export function GwiraThinkingIndicator({ startedAt, status = 'thinking', activityLabel, compact = false, tone = 'playful' }: {
  startedAt?: string; status?: 'thinking' | 'working' | 'waiting' | 'failed' | 'completed'; activityLabel?: string; compact?: boolean; tone?: 'professional' | 'playful';
}): React.ReactElement {
  const fallbackStart = useRef(Date.now());
  const start = startedAt && Number.isFinite(Date.parse(startedAt)) ? Date.parse(startedAt) : fallbackStart.current;
  const [now, setNow] = useState(Date.now);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = (): void => setReduced(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setNow(Date.now());
    if (status !== 'thinking' || reduced || tone === 'professional' || activityLabel) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 1000);
    return () => window.clearInterval(timer);
  }, [start, status, reduced, tone, activityLabel]);
  const elapsed = Math.max(0, now - start);
  const frame = thinkingFrame(elapsed, reduced || tone === 'professional', [...(startedAt ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0));
  const factual = activityLabel ?? (status === 'failed' ? 'Response failed' : status === 'waiting' ? 'Waiting for approval' : status === 'completed' ? 'Response completed' : status === 'working' ? 'Gwira is working…' : undefined);
  return <div className={`gwira-thinking${compact ? ' is-compact' : ''}`} data-thinking-state={status} data-mascot-state={status}>
    <span className="gwira-thinking__mark" aria-hidden="true">{status==='failed'||status==='waiting'?<ShellIcon name={status==='failed'?'failed':'waiting'}/>:<GwiraLogo size="compact"/>}</span>
    <span className="gwira-thinking__visual" aria-hidden="true"><span key={factual ?? frame.index}>{factual ?? frame.primary}</span>{!factual && frame.decorative ? <small>{frame.decorative}</small> : null}</span>
    <span className="sr-only" role="status">{factual ?? 'Waiting for Gwira’s response'}</span>
    {!factual && elapsed >= 12000 ? <time aria-label="Elapsed wait" dateTime={`PT${Math.floor(elapsed / 1000)}S`}>{Math.floor(elapsed / 1000)}s</time> : null}
  </div>;
}
