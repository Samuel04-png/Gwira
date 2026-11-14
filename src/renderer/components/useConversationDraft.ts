import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
const storageKey = 'gwira.conversation-drafts.v1';
let drafts: Record<string, string> | undefined;
const listeners = new Set<() => void>();
function snapshot(): Record<string, string> {
  if (!drafts) {
    try { const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); drafts = value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string')) : {}; } catch { drafts = {}; }
  }
  return drafts;
}
function setScopedDraft(key: string, value: SetStateAction<string>): void {
  const current = snapshot(), text = typeof value === 'function' ? value(current[key] ?? '') : value;
  drafts = { ...current, [key]: text };
  if (!text) delete drafts[key];
  try { localStorage.setItem(storageKey, JSON.stringify(drafts)); } catch { /* Keep the live draft if local storage is unavailable. */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Both surfaces use the same session-scoped draft; text survives a local restart. */
export function useConversationDraft(key: string): [string, Dispatch<SetStateAction<string>>, (key: string, text: SetStateAction<string>) => void] {
  const current = useSyncExternalStore(subscribe, snapshot);
  return [current[key] ?? '', value => setScopedDraft(key, value), setScopedDraft];
}
