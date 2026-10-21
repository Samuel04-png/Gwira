# Phase 2B — sidebar redesign report

## Scope

Only the existing sidebar and strictly necessary smoke-test support were changed. The coding workspace, Electron window options, Codex CLI execution, IPC bridge, project storage, histories and agent runtime were not redesigned or changed.

## Implemented visual changes

- Replaced the dark sidebar treatment with a restrained pale-blue, blue-gray and mint vertical gradient.
- Added the compact **Gwira** workspace heading, chevron and a visibly disabled search control.
- Changed the visible existing thread-creation label from **New thread** to **New chat**; it calls the same existing callback.
- Added Scheduled and Explore as visibly disabled items with explanatory tooltips; Skills continues to open the existing working surface.
- Added a compact Pinned section with the honest empty state “No pinned chats.” No pin preference or Codex history file was created because no prior pinning model exists.
- Renamed the visible thread section to Projects, retaining the dynamic folder tree, expand/collapse, active project/thread states, project menu, truncation and scrolling behavior.
- Added a fixed neutral local-workspace account footer. It does not claim authentication or a signed-in user.
- Added screenshot support to the existing test-only Electron smoke harness. It runs only when `ELECTRON_SMOKE_SCREENSHOT_PATH` is explicitly supplied.

## Screenshot review

The isolated Electron smoke capture is [PHASE_2B_SIDEBAR.png](PHASE_2B_SIDEBAR.png). It contains only synthetic test project names.

Verified in the capture: compact sidebar width, light gradient, Gwira header, navigation active/disabled states, project-tree nesting, active thread highlight, scrollable project region, and fixed account footer. No horizontal clipping or overflow was observed at the 1280×820 smoke window size.

The supplied request did not include the referenced screenshot image file, only its written specification. Therefore an exact pixel comparison was not possible. The native macOS traffic lights are provided by the unchanged Electron `hiddenInset` title-bar configuration; Electron off-screen capture did not render them, so their visual presentation remains a native macOS manual check.

## Functionality preserved

- New chat, Skills, project addition, project switching, expand/collapse, thread opening/resume and deletion callbacks.
- Existing real project context-menu action (Remove); unsupported worktree and rename actions remain disabled.
- Codex CLI lifecycle, streaming, session persistence, history bounds, file scanning, permission safeguards and Electron IPC.
- Existing local project preference key and conversation history files were not modified.

## Validation

- Focused sidebar/project/navigation tests: **5 files, 18 tests passed**.
- TypeScript typecheck: **passed**.
- Full suite: **29 files, 127 tests passed**.
- Production build: **passed**.
- Electron smoke test: **passed** with an isolated temporary user-data directory.
- Electron screenshot capture: **passed**; visual review completed as described above.

## Remaining limitations

- Search, Scheduled and Explore are intentionally unavailable; no fake functionality was added.
- Pinning remains unavailable pending an approved, durable interaction model. The sidebar displays an honest empty state instead.
- Account identity/authentication does not exist; the footer remains neutral.
- No direct comparison to the requested reference image can be made until that image is supplied.
- Phase 2B does not authorize redesign of the workspace, Skills screen, or future Gwira business pages. Await FlutterFlow references and approval for Phase 2C.

## October 2026 two-layer navigation update

The sidebar has since been revised against the supplied reference captures. This update supersedes the earlier single-panel description above.

- Navigation is now a 68px primary rail plus a contextual secondary panel. The rail exposes Dashboard, Workspace, disabled Scheduled work, More, disabled Help, and a neutral local avatar.
- Dashboard replaces the former Home identity without changing the existing dashboard content. Its panel exposes real New work and Library actions and retains the actual project/thread tree.
- Workspace exposes Inbox, My Work, Views (the existing Organization surface), disabled Pipelines, Teams, Doats, and Integrations. More exposes the working Agents, Skills, and Settings surfaces.
- Collapse state is locally persisted. The rail continues to navigate while collapsed, and More expands the contextual panel before showing its menu.
- Favorites, channels, and team conversations deliberately use empty states because no durable data model exists. Notifications, Search, Pipelines, Scheduled work, and Help are visibly disabled with explanatory labels.

Validation for this update: typecheck passed; the full suite passed (**48 files, 199 tests**); production build passed (with only the existing Vite chunk-size advisory); and the isolated Electron smoke test passed. The smoke test creates/switches synthetic projects, opens a thread, covers Dashboard/Workspace/More/Skills navigation, verifies collapse/expand and disabled controls, and opens New work. An isolated mocked agent-lifecycle run also passed after the navigation update, verifying streamed output, persistence, resume, stop, handled execution errors, workspace-write default, and Full Access confirmation. The first lifecycle attempt hit its pre-existing approval timing window; the immediate isolated rerun passed with no application change.

## Sidebar refinement 1 — visual polish

This pass changed CSS only. It reserves the primary rail's title-bar area and positions the collapse toggle below the native macOS traffic-light controls, while leaving the secondary-panel traffic spacer as a drag region. It also applies a tighter 40px rail rhythm, aligns the header controls, reduces navigation label weight, makes section labels consistent, compacts the project/thread rows and timestamps, softens selection treatment, and removes the redundant footer avatar while retaining local-workspace status.

The isolated Electron smoke capture was reviewed after the change. The project list still occupies the flexible, independently scrolling region and the account-status footer remains anchored. Typecheck, production build, and Electron smoke passed. Conversation-title normalization, Recent/Favorites data behavior, and any other non-visual changes were intentionally deferred.

## Final sidebar top-bar fix

The native macOS traffic-light group now uses Electron's `trafficLightPosition` at **6 DIP × 16 DIP**. This keeps all three native controls inside the 68 DIP primary rail and clear of its vertical divider at standard and Retina backing scales. The rail toggle remains below the title-bar area; the `hiddenInset` title bar, drag region, native window controls, rounded corners, and sidebar dimensions are unchanged. A focused window-options regression test, typecheck, production build, and isolated Electron smoke test passed. Electron's content capture excludes native chrome, so it cannot itself render the traffic lights; placement is verified from the BrowserWindow's native options rather than simulated controls.

## Primary rail visual refinement

The primary rail now uses a compact neutral selected tile rather than cyan, with a filled Dashboard glyph and consistent 19px outline glyphs elsewhere. Hover, pressed, disabled, and keyboard focus states are explicitly scoped to the rail; disabled controls do not acquire a hover background. The rail's selected context now also follows programmatic business-route changes (`home` selects Dashboard; non-chat destinations select Workspace), and Electron smoke coverage asserts that relationship. No project, conversation, routing, or agent-execution behavior was otherwise changed.

## Codex-toolbar reference alignment

The desktop shell now begins beneath a light native-window toolbar, matching the supplied Codex reference's composition. The real sidebar-collapse control occupies the toolbar next to the native traffic-light group; no synthetic macOS or history controls were added. The rounded application card contains the unchanged 68px rail and contextual sidebar, with Dashboard now the first rail destination below the toolbar. This makes the divider begin below the traffic lights, so the normal native inset position (`16 DIP × 16 DIP`) is safe again. The change is limited to desktop shell/rail CSS and native window placement.

## Global light-mode refinement

Gwira now defaults to a centralized token-based light palette: `#FAFAF9` canvas, `#F3F3F3` sidebar, white surfaces, `#E5E7EB` borders, charcoal primary text, muted slate secondary text, and subtle neutral selected states. The existing coding workspace, composer, transcript, Skills, modals, project menus, onboarding, business pages, Doat profiles, organization views, inputs, cards, errors, and menus all resolve to the same palette. Syntax code blocks remain deliberately dark for readability. No theme selector, business logic, storage, agent execution, or Dashboard-content redesign was added. Isolated Electron smoke captures were reviewed for both chat and fully rendered onboarding/dashboard surfaces; the smoke harness waits for the existing page-enter animation before the dashboard capture.

## Application shell refinement — October 15, 2026

The desktop application no longer sits inside a second rounded card. On desktop it begins below a compact 38px native title-bar strip, retains the actual macOS title-bar controls and drag area, and uses a 64px primary rail with a 260px contextual panel. Neutral one-pixel dividers now separate the rail, secondary sidebar, and workspace.

The fresh New work state is deliberately neutral in the primary rail: neither Dashboard nor Workspace is highlighted, while its existing project panel remains available. Its empty `New thread` breadcrumb is omitted; a breadcrumb returns only for a persisted Codex conversation with a user message. Electron smoke coverage asserts both conditions.

Validation: TypeScript typecheck passed; full Vitest suite passed (**48 files, 200 tests**); production build passed (with the pre-existing Vite chunk-size advisory); and the isolated Electron smoke run passed. The off-screen Electron capture confirmed the seamless renderer shell, rail dimensions, dividers, header alignment, and native-titlebar-adjacent toggle. Native macOS traffic lights are compositor chrome and are not included in `capturePage`; their unchanged native `hiddenInset` configuration remains the source of truth.

## Compact navigation toolbar and sidebar spacing — October 15, 2026

The native title strip now presents real renderer navigation controls in the same order as the reference: native macOS traffic lights, Back, Forward, then the real sidebar collapse/expand control. Back and Forward operate on the application’s destination history, disable accurately at either end of that history, and do not create decorative or browser-like controls.

The secondary sidebar’s top spacer is now a single 6px layout value. This raises Gwira, its header controls, and all following sidebar content together without absolute-positioning individual rows. The 64px rail, 40px rail targets, light theme, native drag region, and collapse behavior remain unchanged. Electron smoke coverage now validates Back/Forward availability and round-trip navigation in addition to the existing project, thread, and sidebar flows.

## Duplicate project control removal — October 15, 2026

The bottom “Add project” button has been removed. The folder-plus control beside the Projects heading is now the sole creation action, retains the existing native picker workflow, and exposes both an accessible name and an “Add project” tooltip. The project list remains the flexible, independently scrolling sidebar region and the Local workspace footer remains anchored at the bottom. Electron smoke now creates its temporary project through the heading icon and asserts that no duplicate button is rendered.
