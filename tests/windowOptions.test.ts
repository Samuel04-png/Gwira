import { describe, expect, it } from 'vitest';
import { buildMainWindowOptions } from '../src/main/windowOptions.js';

describe('buildMainWindowOptions', () => {
  it('uses a standard desktop-sized window instead of a large default canvas', () => {
    const options = buildMainWindowOptions();

    expect(options.width).toBe(1280);
    expect(options.height).toBe(820);
    expect(options.fullscreen).not.toBe(true);
    expect(options.maximizable).not.toBe(false);
  });
});


  it('matches the global top bar with the Windows window controls', () => {
    const options = buildMainWindowOptions('/tmp/preload.js', 'win32');

    expect(options.titleBarStyle).toBe('hidden');
    expect(options.titleBarOverlay).toEqual({ color: '#f3f3f3', symbolColor: '#46515d', height: 38 });
  });

  it('keeps the native macOS traffic-light group in the native toolbar', () => {
    const options = buildMainWindowOptions('/tmp/preload.js', 'darwin');

    expect(options.titleBarStyle).toBe('hiddenInset');
    expect(options.trafficLightPosition).toEqual({ x: 16, y: 13 });
  });
