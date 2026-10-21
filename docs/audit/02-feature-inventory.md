# Feature inventory

Classifications reflect source tracing and automated checks on 2026-10-14; “Working” is limited to verified helper/build behavior, not unperformed GUI testing.

| Feature | UI exists | Backend exists | Works | Issue | Relevant files |
|---|---:|---:|---|---|---|
| Project add/switch/remove | Yes | Dialog + localStorage | Partially implemented | Paths/names are local only; edit action opens picker but does not edit selected project; worktree item is a no-op | `renderer/main.tsx`, `projects.ts`, `projectStateStorage.ts`, `main/ipc.ts` |
| Project history/onboarding | Yes | Yes | Broken at scale | Global recursive full-history scan runs for each project and retains large parse structures | `codexHistory.ts`, `renderer/main.tsx` |
| Thread create/resume/delete | Yes | Yes | Partially implemented | In-memory live sessions vanish on restart; delete acts directly on CLI history; no error boundary around all opens | `codexExecManager.ts`, `sessionStore.ts`, `codexHistory.ts` |
| Conversation streaming | Yes | Yes | Partially implemented | JSONL mapping is heuristic; no output backpressure/size cap; lifecycle has possible duplicate exit on stop | `codexExecManager.ts`, `codexEvents.ts` |
| Model/reasoning pickers | Yes | Yes | Partially implemented | Falls back silently to hard-coded model; compatibility depends on installed CLI | `codexModels.ts`, `codexCommand.ts`, `main.tsx` |
| Permission controls | Yes | Yes | Broken-safe-default | UI default is `full-access`; full access bypasses sandbox and approvals | `main.tsx`, `codexCommand.ts` |
| Codex CLI bootstrap | Yes | Yes | Partially implemented | Runs global npm install from UI; no publisher/version verification or progress cancellation | `codexBootstrap.ts`, `ipc.ts` |
| Skills page | Yes | Yes | Partially implemented | Discovers/local enables/disables/uninstalls only; no install, trust, permissions, execution registry or isolation | `skillStore.ts`, `main.tsx` |
| Automations | Yes | No | UI only | Button has no handler/view/IPC/automation code | `renderer/main.tsx:846` |
| Settings | Yes | No | UI only | Button has no handler/view/persistent preference system | `renderer/main.tsx:922` |
| File `@` search | Yes | Yes | Partially implemented | Recursive scan on project selection; no cancellation, symlink policy or access boundary | `projectFiles.ts`, `projectFileSearch.ts`, `main.tsx` |
| Attachments/pasted images | Yes | Yes | Partially implemented | Arbitrary selected paths and pasted temp files; no file-size/type retention policy or cleanup | `ipc.ts`, `composerAttachments.ts`, `main.tsx` |
| Git branch controls | Yes | Yes | Partially implemented | Switch has no dirty-worktree confirmation or timeout; errors are largely not surfaced | `gitBranches.ts`, `main.tsx` |
| Activity logs/tool calls | Yes | Yes | Partially implemented | Display-only parsing, not a durable structured audit log; CLI schema changes can break it | `codexEvents.ts`, `activitySegments.ts` |
| Sidebar/navigation | Yes | Renderer state | Partially implemented | Only chat/skills states exist; Automations/Settings no-op; no routes | `main.tsx`, `navigationState.ts` |
| Context menus | Yes | Minimal | Broken/partial | “Create permanent worktree” and “Edit name” buttons do not perform the labeled action | `main.tsx:925-930` |
| Keyboard shortcuts | Yes | Renderer state | Partially implemented | Composer Enter, command menu arrows/Tab/Escape and row Enter/Space exist; no documented/global shortcuts | `main.tsx` |
| Error handling | Yes | Partial | Partially implemented | Some awaits are caught, many initial/list/switch actions are fire-and-forget with no user error state | `main.tsx`, `ipc.ts` |

There is no implementation for organizations, users, teams, tasks, approvals, schedules, workflows, notifications, inboxes, integrations, dashboards, cloud persistence, or multi-agent collaboration.
