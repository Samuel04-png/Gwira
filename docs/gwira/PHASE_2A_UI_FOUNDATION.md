# Phase 2A — UI foundation implementation

Completed on `gwira-development`. This phase is a structural refactor only: no Gwira product page, visual redesign, backend/IPC change, Codex CLI behavior change, local-storage migration, or project/history reset was made.

## Component structure

```text
App (src/renderer/main.tsx)
├── application state and existing renderer-to-preload callbacks
├── ProjectSidebar
│   ├── existing New thread / Skills navigation
│   ├── intentionally disabled Automations and Settings controls
│   └── project, thread, history and project-menu entry points
├── WorkspaceShell
│   ├── SkillsView
│   └── current coding chat surface
│       └── Transcript
├── ProjectControls
│   ├── Welcome
│   └── ProjectSelectorPopover
├── InlineSelect
└── shared Icons
```

`App` intentionally remains the state and capability coordinator for now. It continues to own session lifecycle, streaming output, project selection, history refresh, agent permission selection, error state and all calls to `window.codexDesktop`. This preserves the Phase 1 process, memory and safety guarantees while UI boundaries are established.

## Reusable UI modules

| Module | Responsibility | Future customization boundary |
|---|---|---|
| `components/ProjectSidebar.tsx` | Existing primary navigation, project/thread tree, disabled unavailable controls | Gwira navigation styling and project-area composition. No new destination is active yet. |
| `components/WorkspaceShell.tsx` | Restricts renderer routing to the two currently supported surfaces: chat and Skills | Add a Gwira destination only when it has an approved data contract and real state behavior. |
| `components/SkillsView.tsx` | Existing local Skills list, filtering, refresh and controls | Can adopt an approved visual design without changing local skill behavior. |
| `components/Transcript.tsx` | Markdown, code-copy, activity output, user messages and local-image preview | Independent chat/transcript presentation boundary. |
| `components/ProjectControls.tsx` | Empty-workspace project selector and saved-project popover | Project-selection visual treatment. |
| `components/InlineSelect.tsx` | Model, reasoning and permission pickers | Shared menu styling while preserving Full Access confirmation policy. |
| `components/Icons.tsx` | Shared existing SVG controls | Icon replacement only after an approved design system exists. |

## Preserved behavior

- Codex CLI discovery, execution, streaming, stop lifecycle, resume and error behavior.
- Bounded/cached history loading, bounded live output and cancellable project scans.
- Local project list and active-project preference key; no preferences were read, changed or reset by this work.
- Existing project/thread management, Skills management, composer attachments, file/skill references, Git branch switching and error display.
- Workspace write as the default permission; Full Access still requires the existing explicit confirmation.
- The intentionally disabled Automations, Settings, project rename/path edit, worktree and branch-creation controls.

## Ready for Phase 2B

The sidebar, workspace shell, Skills surface, transcript, project controls, select menus and icons are now separable styling targets for the FlutterFlow references. The next phase can apply approved layout and visual changes without moving Codex process code into presentation components.

The following remain deliberately unimplemented until product requirements and visual references are supplied: Home, Inbox, My Work, Views, Teams, business Agents, Automations and Settings. No mock data or fake working pages were created.

Commercial distribution remains blocked pending the licensing clarification identified in `PHASE_2_UI_PLAN.md` and the Phase 1 audit.
