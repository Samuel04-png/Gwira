import React from 'react';
import type { NavigationIconKey } from '../navigationTypes.js';

const paths: Record<NavigationIconKey | 'back' | 'forward' | 'sidebar' | 'inspector' | 'search' | 'bell' | 'plus' | 'new-work', React.ReactNode> = {
  home: <><path d="M3 8 8 3.5 13 8" /><path d="M4.5 7.5V13h7V7.5" /></>,
  dashboard: <><rect x="2.5" y="2.5" width="4.5" height="5" rx="1" /><rect x="9" y="2.5" width="4.5" height="3" rx="1" /><rect x="2.5" y="9.5" width="4.5" height="4" rx="1" /><rect x="9" y="7.5" width="4.5" height="6" rx="1" /></>,
  inbox: <><path d="M2.5 9.5 4.3 3.5h7.4l1.8 6" /><path d="M2.5 9.5v3h11v-3h-3.2a2.3 2.3 0 0 1-4.6 0Z" /></>,
  work: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="m5.5 8 1.7 1.7L10.5 6.3" /></>,
  library: <><path d="M3.5 2.5v11" /><path d="M6.5 2.5v11" /><path d="m9.5 3.3 3-.8 1 10.7-3 .8Z" /></>,
  views: <><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /><circle cx="5" cy="4" r=".6" /><circle cx="9" cy="8" r=".6" /><circle cx="6.5" cy="12" r=".6" /></>,
  teams: <><circle cx="6" cy="5.5" r="2" /><path d="M2.5 13c0-2.2 1.5-3.5 3.5-3.5s3.5 1.3 3.5 3.5" /><path d="M10.5 3.8a2 2 0 0 1 0 3.4M12 9.8c1 .5 1.5 1.5 1.5 3.2" /></>,
  doats: <><rect x="3" y="5" width="10" height="7.5" rx="2" /><path d="M8 5V2.8" /><circle cx="6" cy="8.6" r=".7" /><circle cx="10" cy="8.6" r=".7" /></>,
  agents: <><path d="m5.5 5-3 3 3 3" /><path d="m10.5 5 3 3-3 3" /><path d="m9 3.5-2 9" /></>,
  integrations: <><path d="M6 3v3M10 3v3" /><path d="M4.5 6h7v2.5a3.5 3.5 0 0 1-7 0Z" /><path d="M8 12v1.5" /></>,
  settings: <><circle cx="8" cy="8" r="2" /><path d="M8 2.2v1.6M8 12.2v1.6M2.2 8h1.6M12.2 8h1.6M3.9 3.9l1.1 1.1M11 11l1.1 1.1M3.9 12.1 5 11M11 5l1.1-1.1" /></>,
  skills: <><path d="m8 2.5 1.5 3.3 3.5.4-2.6 2.4.7 3.5L8 10.3l-3.1 1.8.7-3.5L3 6.2l3.5-.4Z" /></>,
  back: <path d="m9.5 3.5-4.5 4.5 4.5 4.5" />,
  forward: <path d="m6.5 3.5 4.5 4.5-4.5 4.5" />,
  sidebar: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M6.5 3v10" /></>,
  inspector: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M9.5 3v10" /></>,
  search: <><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></>,
  bell: <><path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.2H3Z" /><path d="M6.6 13.8a1.5 1.5 0 0 0 2.8 0" /></>,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  'new-work': <><path d="M8.5 3H4a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 4 13.5h7.5A1.5 1.5 0 0 0 13 12V7.5" /><path d="m7 9 .4-2 5-5a1.2 1.2 0 0 1 1.7 1.7l-5 5Z" /></>
};

export type ShellIconKey = keyof typeof paths;

export function ShellIcon({ name, className = 'shell-icon' }: { name: ShellIconKey; className?: string }): React.ReactElement {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
