import type { CodexSession, CodexThreadHistory } from '../shared/types.js';
import { getProjectThreadRows } from './projectThreads.js';

/** Reuse the existing history/live-session reconciliation; never combine source folders. */
export function globalChatRows(cwd: string | undefined, sessions: CodexSession[], histories: CodexThreadHistory[], activeId: string | undefined, query: string, runningOnly: boolean) {
  if (!cwd) return [];
  const text = query.trim().toLocaleLowerCase();
  return getProjectThreadRows({ projectId: cwd, activeProjectId: cwd, activeSessionId: activeId, expandedProjectIds: new Set([cwd]), sessions: sessions.filter(s => s.cwd === cwd), histories: histories.filter(h => h.cwd === cwd) })
    .filter(row => (!runningOnly || row.running) && (!text || (row.kind === 'session' ? row.title : row.history.title).toLocaleLowerCase().includes(text)));
}
export function clampChatWidth(width: number): number { return Math.max(320, Math.min(540, Number.isFinite(width) ? Math.round(width) : 392)); }
