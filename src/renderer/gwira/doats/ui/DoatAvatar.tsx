import React from 'react';
import { expressionForOperationalStatus, readableDoatStatus } from './avatarModel.js';
import type { DoatAvatarSpec, DoatOperationalStatus } from './types.js';

export interface DoatAvatarProps {
  spec: DoatAvatarSpec;
  status?: DoatOperationalStatus;
  size?: number;
  label?: string;
  className?: string;
}

/** Accessible deterministic SVG fallback, not an AI-generated image. */
export function DoatAvatar({ spec, status = 'idle', size = 72, label, className = '' }: DoatAvatarProps): React.ReactElement {
  const expression = spec.expression ?? expressionForOperationalStatus(status);
  const dimmed = status === 'unavailable' || status === 'paused';
  const blink = expression === 'celebrating' ? '⌒' : expression === 'concerned' ? '◔' : expression === 'quiet' ? '−' : expression === 'focused' ? '▰' : '•';
  const mouth = expression === 'celebrating' ? 'M40 49 Q50 58 60 49' : expression === 'concerned' ? 'M42 57 Q50 49 58 57' : expression === 'focused' ? 'M43 54 L57 54' : 'M44 52 Q50 56 56 52';
  const body = spec.shape === 'prism' ? <path d="M50 10 78 27 70 67 30 67 22 27Z" />
    : spec.shape === 'leaf' ? <path d="M50 10 C79 22 84 58 50 75 C16 58 21 22 50 10Z" />
    : spec.shape === 'satellite' ? <rect x="20" y="20" width="60" height="50" rx="22" />
    : spec.shape === 'arch' ? <path d="M19 70V45a31 31 0 0 1 62 0v25Z" />
    : <circle cx="50" cy="48" r="32" />;
  return <figure className={`gwira-doat-avatar ${className}`.trim()} style={{ width: size, margin: 0 }} aria-label={label ? `${label}: ${readableDoatStatus(status)}` : `Doat: ${readableDoatStatus(status)}`}>
    <svg viewBox="0 0 100 90" width={size} height={size * .9} role="img" aria-hidden="true" focusable="false" style={{ opacity: dimmed ? .52 : 1 }}>
      <defs><linearGradient id={`doat-${spec.seed.replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'avatar'}`} x1="0" x2="1"><stop stopColor={spec.primaryColor} /><stop offset="1" stopColor={spec.secondaryColor} /></linearGradient></defs>
      {spec.accessory === 'halo' && <ellipse cx="50" cy="11" rx="24" ry="6" fill="none" stroke={spec.secondaryColor} strokeWidth="3" />}
      {spec.accessory === 'orbit' && <ellipse cx="50" cy="46" rx="43" ry="18" fill="none" stroke={spec.secondaryColor} strokeWidth="2" opacity=".8" />}
      <g fill={`url(#doat-${spec.seed.replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'avatar'})`} stroke="rgba(11,16,29,.4)" strokeWidth="2">{body}</g>
      {spec.accessory === 'antenna' && <path d="M50 18V7m0 0 5 5m-5-5-5 5" stroke={spec.secondaryColor} strokeWidth="3" fill="none" strokeLinecap="round" />}
      {spec.accessory === 'visor' && <path d="M30 37h40v14H30z" fill="rgba(11,16,29,.55)" rx="5" />}
      <g fill="#141a2b"><text x="39" y="45" fontSize="16">{blink}</text><text x="55" y="45" fontSize="16">{blink}</text><path d={mouth} fill="none" stroke="#141a2b" strokeWidth="2.5" strokeLinecap="round" /></g>
      {expression === 'celebrating' && <path d="M17 25l-5-5m71 5 5-5" stroke={spec.secondaryColor} strokeWidth="3" strokeLinecap="round" />}
    </svg>
    <figcaption className="gwira-doat-avatar__status">{readableDoatStatus(status)}</figcaption>
  </figure>;
}
