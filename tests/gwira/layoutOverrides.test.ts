import { describe, expect, it } from 'vitest';
import { isEditedLayout, layoutScopeKey, placeNewEditedStep, snapPosition } from '../../src/renderer/gwira/graph/layoutOverrides.js';

describe('workflow layout overrides', () => {
  it('switches to Edited only when its own scope has overrides', () => {
    const overrides = { 'objective-a': { 'step:a': { x: 8, y: 16 } } };
    expect(isEditedLayout(overrides, 'objective-a')).toBe(true);
    expect(isEditedLayout(overrides, 'objective-b')).toBe(false);
    expect(layoutScopeKey('objective-a', 'parent')).toBe('objective-a/parent');
  });

  it('places a new edited step one rank right of its upstream step and below a collision', () => {
    expect(placeNewEditedStep({ x: 16, y: 24 }, [], 240, 96)).toEqual({ x: 352, y: 24 });
    expect(placeNewEditedStep({ x: 16, y: 24 }, [{ x: 352, y: 24 }], 240, 96)).toEqual({ x: 352, y: 104 });
    expect(snapPosition({ x: 17, y: 21 })).toEqual({ x: 16, y: 24 });
  });
});
