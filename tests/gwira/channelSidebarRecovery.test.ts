import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('channel sidebar recovery',()=>{
 it('wires the authenticated error retry to a channel refresh',()=>{
  const section=readFileSync(new URL('../../src/renderer/gwira/dashboard/DashboardChannels.tsx',import.meta.url),'utf8');
  const sidebar=readFileSync(new URL('../../src/renderer/gwira/dashboard/DashboardSidebar.tsx',import.meta.url),'utf8');
  expect(section).toContain('role="alert">{error} {onRetry&&<button type="button" onClick={onRetry}>Retry</button>}');
  expect(sidebar).toContain('error={channels.error} onRetry={()=>void channels.refresh()}');
 });
});
