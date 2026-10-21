# Dashboard contextual sidebar — recon

## Reused shell and primitives

| Concern | Existing path |
|---|---|
| Application shell | `src/renderer/main.tsx`, `src/renderer/components/WorkspaceShell.tsx` |
| Global rail and sidebar container | `src/renderer/components/ProjectSidebar.tsx` |
| Existing sidebar persistence pattern | `src/renderer/components/ProjectSidebar.tsx` (`localStorage` keys and guarded reads) |
| Shared icons | `src/renderer/components/Icons.tsx` |
| Theme tokens / shell styling | `src/renderer/styles.css` |
| Workspace footer | `ProjectSidebar.tsx` (`sidebar-account`) |

No standalone Home sidebar exists: Home is the Dashboard content surface (`src/renderer/gwira/home/HomePage.tsx`), while the shared shell sidebar is `ProjectSidebar.tsx`. The contextual sidebar is rendered only for the Dashboard route inside that existing secondary sidebar; no Home markup or styles were changed.

## Data-source availability

| UI element | Existing model / selector | Result |
|---|---|---|
| Inbox count | NOT AVAILABLE — local Inbox is approval/activity, not unread conversations | Count hidden |
| My Work count | NOT AVAILABLE — no current-user identity or assigned-user selector | Count hidden |
| Projects | `GwiraLocalState.projects`, but no Projects route exists | Disabled navigation; reported |
| Views | No views model or route | Disabled with required tooltip |
| Pinned | New persisted list: `gwira.dashboard-sidebar.pinned.v1` | Available |
| Channels | NOT AVAILABLE — no conversation/channel model | Empty state |
| People | `GwiraLocalState.people` | Available |
| Doats | `GwiraLocalState.doats` | Available |
| Doat state | `Doat.operations.status` | Available where defined |
| Unread count and preview | NOT AVAILABLE — no conversation model | Omitted |
| Footer | Existing `ProjectSidebar.tsx` footer pattern | Reused in contextual form |

Baseline screenshot capture could not be automated in this repository: it has no browser/screenshot runner or checked-in screenshot command. The implementation leaves Home’s route-specific sidebar branch untouched.
