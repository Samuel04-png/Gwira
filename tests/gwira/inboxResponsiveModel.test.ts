import { describe, expect, it } from 'vitest';
import { getInboxResponsiveLayout } from '../../src/renderer/gwira/inbox/inboxResponsiveModel.js';

const layout = (contentWidth: number, activityMode = false, contextOpen = false) => getInboxResponsiveLayout({ contentWidth, activityMode, contextOpen });

describe('Inbox content-width layout', () => {
  it('keeps one master/detail threshold so Needs review never restructures the navigator', () => {
    expect(layout(699).isMasterDetail).toBe(true);
    expect(layout(700).isMasterDetail).toBe(false);
    expect(layout(699, true).isMasterDetail).toBe(true);
    expect(layout(700, true).isMasterDetail).toBe(false);
    expect(layout(836, true)).toEqual({ ...layout(836, false), contextMode: 'closed' });
    expect(layout(700).navigatorWidth).toBe(270);
    expect(layout(1000, true).navigatorWidth).toBe(270);
  });

  it('only docks conversation context when actual content preserves the feed budget', () => {
    expect(layout(1099, false, true).contextMode).toBe('overlay');
    expect(layout(1100, false, true).contextMode).toBe('inline');
    expect(1100 - layout(1100).navigatorWidth - layout(1100).contextWidth - 2).toBeGreaterThanOrEqual(480);
    expect(layout(1116, false, false).contextMode).toBe('closed');
    expect(layout(1116, true, true).contextMode).toBe('closed');
  });

  it('matches expanded, collapsed and zoomed shell content budgets without viewport assumptions', () => {
    expect(layout(1116, false, true)).toMatchObject({ isMasterDetail: false, isNarrow: false, contextWidth: 320 });
    expect(layout(956, false, true)).toMatchObject({ isMasterDetail: false, isNarrow: true, contextMode: 'overlay' });
    expect(layout(576, false, true)).toMatchObject({ isMasterDetail: true, contextWidth: 576 });
    expect(layout(836, true)).toMatchObject({ isMasterDetail: false, navigatorWidth: 270 });
    expect(layout(1216, true)).toMatchObject({ isMasterDetail: false, navigatorWidth: 270 });
    expect(layout(386, false, true)).toMatchObject({ isMasterDetail: true, contextWidth: 386 });
  });

  it('stays conservative until a valid content measurement exists', () => {
    for (const width of [0, -1, NaN, Infinity]) {
      expect(layout(width, false, true)).toMatchObject({ isMasterDetail: true, isNarrow: true, contextMode: 'overlay', contextWidth: 0 });
    }
  });
});
