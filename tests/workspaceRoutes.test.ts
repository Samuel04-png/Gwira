import { describe, expect, it } from 'vitest';
import { WORKSPACE_NAVIGATION_ITEMS, WORKSPACE_ROUTES, routesInGroup } from '../src/renderer/navigationTypes.js';

describe('workspace route registry', () => {
  it('has unique views with labels and icons', () => {
    const views = WORKSPACE_ROUTES.map((route) => route.view);
    expect(new Set(views).size).toBe(views.length);
    for (const route of WORKSPACE_ROUTES) {
      expect(route.label.length).toBeGreaterThan(0);
      expect(route.icon).toBeTruthy();
    }
  });

  it('places every route in exactly one sidebar group', () => {
    const grouped = (['primary', 'workspace', 'footer'] as const).flatMap((group) => routesInGroup(group));
    expect(grouped.length).toBe(WORKSPACE_ROUTES.length);
    expect(new Set(grouped.map((route) => route.view)).size).toBe(WORKSPACE_ROUTES.length);
  });

  it('offers every registry route as a tab destination', () => {
    const choices = WORKSPACE_NAVIGATION_ITEMS.map((item) => item.view);
    for (const route of WORKSPACE_ROUTES) expect(choices).toContain(route.view);
  });
});
