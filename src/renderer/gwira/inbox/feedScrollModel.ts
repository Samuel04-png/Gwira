/** Ephemeral viewport metadata only. No message bodies or business records are retained. */
export interface FeedScrollSnapshot {
  anchorId?: string;
  anchorOffset: number;
  scrollTop: number;
  followLatest: boolean;
}

export function feedScrollKey(scopeActorKey: string, conversationId: string): string {
  return JSON.stringify([scopeActorKey, conversationId]);
}

export function restoredFeedScrollTop(snapshot: FeedScrollSnapshot, anchorTop: number | undefined, maxScrollTop: number): number {
  const top = snapshot.followLatest ? maxScrollTop : anchorTop === undefined ? snapshot.scrollTop : anchorTop - snapshot.anchorOffset;
  return Math.max(0, Math.min(Math.max(0, maxScrollTop), Number.isFinite(top) ? top : 0));
}

/** Bounded UI-only cache survives a feed unmount when inspecting Activity or Saved. */
export function createFeedScrollCache(limit = 100): { get: (key: string) => FeedScrollSnapshot | undefined; set: (key: string, snapshot: FeedScrollSnapshot) => void } {
  const positions = new Map<string, FeedScrollSnapshot>();
  return {
    get: (key) => positions.get(key),
    set: (key, snapshot) => {
      positions.delete(key);
      positions.set(key, { ...snapshot });
      while (positions.size > Math.max(1, limit)) positions.delete(positions.keys().next().value!);
    }
  };
}
