// Verification-only fixture, loaded explicitly in the isolated Electron profile.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ItemTitle } from '../src/renderer/components/ItemTitle.js';
import { Icon } from '../src/renderer/components/Icon.js';
export function showMicroPolish(): void {
  const host = document.createElement('div'); host.id = 'micro-fixture';
  host.style.cssText = 'position:fixed;inset:60px 24px 24px 80px;z-index:100;background:var(--gw-surface);padding:24px;display:flex;gap:24px;align-items:flex-start';document.body.append(host);
  createRoot(host).render(<>
    <div style={{ display: 'grid', gap: 12, width: 200, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <button id="micro-short"><ItemTitle text="Short title" /></button>
      <button id="micro-long"><ItemTitle text="Review the complete quarterly operating plan and follow up on outstanding decisions with the project team" /></button>
      <button id="micro-preview"><ItemTitle text="Quarterly operating plan" preview={{ context: 'Test-only workspace', metadata: 'Project: Operations', status: 'Awaiting review' }} /></button>
    </div>
    <div className="gw-inbox-row-item" style={{ width: 200 }}>
      <button className="gw-inbox-row" id="micro-action-row"><span className="gw-inbox-row__main"><ItemTitle text="An item with contextual controls and a title that overflows" /></span></button>
      <span className="gw-inbox-row__actions"><button className="gw-inbox-row__action" id="micro-action" aria-label="Pin test item" title="Pin test item"><Icon name="pin" /></button></span>
    </div>
  </>);
}
