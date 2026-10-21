import type { BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';

export function buildMainWindowOptions(preloadPath = path.join(process.cwd(), 'dist/preload/index.js'), platform: NodeJS.Platform = process.platform): BrowserWindowConstructorOptions {
  const windowsOptions: BrowserWindowConstructorOptions = platform === 'win32' ? {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f3f3f3', symbolColor: '#46515d', height: 38 }
  } : {
    titleBarStyle: 'hiddenInset',
    // Centered in the 38px global top bar, which reserves space for this group.
    trafficLightPosition: { x: 16, y: 13 }
  };

  return {
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f3f3f3',
    autoHideMenuBar: true,
    ...windowsOptions,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}
