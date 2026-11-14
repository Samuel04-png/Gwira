import { describe, expect, it } from 'vitest';
import { parseBusinessSidebarPreferences, parseChannelSidebarPreferences } from '../../src/renderer/gwira/dashboard/businessSidebarPreferences.js';

describe('business sidebar preferences', () => {
  it('uses the original expanded default and restores saved sections', () => {
    expect(parseBusinessSidebarPreferences(null)).toEqual({ pinned: true, channels: true, people: true });
    expect(parseBusinessSidebarPreferences('{"pinned":false,"channels":true,"people":false}'))
      .toEqual({ pinned: false, channels: true, people: false });
  });

  describe('channel sidebar preferences', () => {
    it('restores supported filters and sorting', () => {
      expect(parseChannelSidebarPreferences(null)).toEqual({filter:'all',sort:'recent'});
      expect(parseChannelSidebarPreferences('{"filter":"muted","sort":"name"}')).toEqual({filter:'muted',sort:'name'});
    });
    it('rejects invalid stored data', () => {
      for (const raw of ['null', '[]', '{}', '{"filter":"all","sort":"other"}', '{"filter":"other","sort":"name"}', 'not json']) {
        expect(() => parseChannelSidebarPreferences(raw)).toThrow();
      }
    });
  });
  it('rejects invalid stored data', () => {
    for (const raw of ['null', '[]', '{}', '{"pinned":true,"channels":true,"people":"false"}', 'not json']) {
      expect(() => parseBusinessSidebarPreferences(raw)).toThrow();
    }
  });
});
