import { describe, expect, it } from 'vitest';
import { checkIcons, inspectIconSource } from '../scripts/check-icons.mjs';

describe('Gwira icon import boundary', () => {
  it('keeps renderer icons behind the approved registry', () => { expect(checkIcons()).toEqual([]); });
  it.each([
    `import { Search } from 'lucide-react';`,
    `export { Search } from 'lucide-react';`,
    `export * from '@heroicons/react/24/outline';`,
    `const icons = await import('react-icons/fi');`,
    `const icons = require('@radix-ui/react-icons');`,
    `import { ShellIcon } from './NavIcons.js';`,
    `export * from '../components/Icons.js';`,
    `const glyph = <svg><path d="M0 0" /></svg>;`,
    `const glyph = React.createElement('svg', null);`,
  ])('rejects a bypass: %s', (source) => { expect(inspectIconSource(source, 'components/Host.tsx').length).toBeGreaterThan(0); });
  it('permits the registry and normal content', () => {
    expect(inspectIconSource(`import { Search } from 'lucide-react';`, 'components/Icon.tsx')).toEqual([]);
    expect(inspectIconSource(`const content = <span>🙂 ×4 → next</span>;`, 'components/Host.tsx')).toEqual([]);
  });
  it('permits exact graph/artwork SVG hosts while rejecting unrelated SVGs in those same files', () => {
    expect(inspectIconSource(`<svg className="work-progress__data-chart" />`, 'gwira/activity/WorkActivity.tsx')).toEqual([]);
    expect(inspectIconSource(`<svg className="unregistered-icon" />`, 'gwira/activity/WorkActivity.tsx')).toHaveLength(1);
    expect(inspectIconSource(`<svg className="gwira-timeline__links" />`, 'gwira/timeline/TimelineView.tsx')).toEqual([]);
    expect(inspectIconSource(`<svg viewBox="0 0 100 90" />`, 'gwira/doats/ui/DoatAvatar.tsx')).toEqual([]);
    expect(inspectIconSource(`<svg className="new-handwritten-icon" />`, 'gwira/timeline/TimelineView.tsx')).toHaveLength(1);
  });
});
