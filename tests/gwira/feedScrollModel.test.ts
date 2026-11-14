import { describe, expect, it } from 'vitest';
import { createFeedScrollCache, feedScrollKey, restoredFeedScrollTop } from '../../src/renderer/gwira/inbox/feedScrollModel.js';

describe('feed scroll restoration', () => {
  it('isolates actor/scope and conversation keys without delimiter collisions', () => {
    expect(feedScrollKey('org:actor-a', 'conversation')).not.toEqual(feedScrollKey('org:actor-b', 'conversation'));
    expect(feedScrollKey('a', 'b:c')).not.toEqual(feedScrollKey('a:b', 'c'));
  });
  it('restores the anchor offset after reflow or earlier history changes', () => {
    const snapshot = { anchorId: 'message-5', anchorOffset: 12, scrollTop: 200, followLatest: false };
    expect(restoredFeedScrollTop(snapshot, 400, 1000)).toBe(388);
    expect(restoredFeedScrollTop(snapshot, undefined, 1000)).toBe(200);
    expect(restoredFeedScrollTop(snapshot, 12, 1000)).toBe(0);
    expect(restoredFeedScrollTop(snapshot, 1200, 1000)).toBe(1000);
  });
  it('preserves following the bottom separately from a reading position', () => {
    expect(restoredFeedScrollTop({ anchorOffset: 0, scrollTop: 20, followLatest: true }, 300, 900)).toBe(900);
    expect(restoredFeedScrollTop({ anchorOffset: 0, scrollTop: 20, followLatest: false }, undefined, 900)).toBe(20);
  });
  it('bounds session metadata and stores independent snapshots', () => {
    const cache = createFeedScrollCache(2);
    const snapshot = { anchorOffset: 0, scrollTop: 20, followLatest: false };
    cache.set('a', snapshot); snapshot.scrollTop = 900;
    cache.set('b', snapshot); cache.set('c', snapshot);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')?.scrollTop).toBe(900);
    cache.set('b', { ...snapshot, scrollTop: 70 });
    cache.set('d', snapshot);
    expect(cache.get('c')).toBeUndefined();
    expect(cache.get('b')?.scrollTop).toBe(70);
  });
});
