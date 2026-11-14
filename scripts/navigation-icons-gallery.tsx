// Test-only gallery loaded explicitly by the Electron verification harness.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NavigationIcon, navigationIconRegistry } from '../src/renderer/components/Icon.js';
export function showNavigationPairs(): void {
  const host = document.createElement('div');
  host.id = 'navigation-pair-gallery';
  host.style.cssText = 'position:fixed;inset:40px 0 0;z-index:10000;background:var(--gw-surface);padding:24px;overflow:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:16px';
  document.body.append(host);
  createRoot(host).render(<>{Object.keys(navigationIconRegistry).map((key) => {
    const name = key as keyof typeof navigationIconRegistry;
    return <div key={name} data-pair={name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <NavigationIcon name={name} /><NavigationIcon name={name} active /><span>{name}</span>
    </div>;
  })}</>);
}
