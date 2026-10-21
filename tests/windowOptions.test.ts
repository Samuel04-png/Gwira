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


  it('uses a dark native title bar on Windows instead of the default white bar', () => {
    const options = buildMainWindowOptions('/tmp/preload.js', 'win32');

    expect(options.titleBarStyle).toBe('hidden');
    expect(options.titleBarOverlay).toEqual({ color: '#111111', symbolColor: '#d8d8d8', height: 34 });
  });

  it('keeps the native macOS traffic-light group in the native toolbar', () => {
    const options = buildMainWindowOptions('/tmp/preload.js', 'darwin');

    expect(options.titleBarStyle).toBe('hiddenInset');
    expect(options.trafficLightPosition).toEqual({ x: 16, y: 16 });
  });
