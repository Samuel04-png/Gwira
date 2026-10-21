import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../src/renderer/${path}`, import.meta.url), 'utf8');

describe('contextual sidebars', () => {
  const project = read('components/ProjectSidebar.tsx');
  const business = read('gwira/dashboard/DashboardSidebar.tsx');
  const shell = read('shell.css');

  it('renders Home and business panels from one sidebar, switched by context', () => {
    expect(project).toContain("sidebarContext === 'business' ? dashboardSidebar");
    expect(project).toContain('gwira-sidebar-header');
    expect(project).toContain('sidebar-account');
    expect(project).toContain('New work');
    expect(project).toContain('threads-section');
    expect(business).toContain('Business navigation');
    for (const label of ['Dashboard', 'Inbox', 'My Work', 'Library', 'Views', 'Pinned', 'Channels', 'People & Doats']) expect(business).toContain(label);
  });

  it('keeps the global top bar out of the sidebars', () => {
    expect(project).not.toContain('window-toolbar');
    expect(business).not.toContain('global-topbar');
  });

  it('scopes shell overrides by context so Home and business styles do not leak', () => {
    expect(shell).toContain('.is-home-sidebar .gwira-secondary-sidebar');
    expect(shell).toContain('.is-business-sidebar .gwira-secondary-sidebar');
    expect(shell).not.toMatch(/^\.gwira-two-layer-sidebar \.gwira-secondary-sidebar \{[^}]*padding-top/m);
  });
});
