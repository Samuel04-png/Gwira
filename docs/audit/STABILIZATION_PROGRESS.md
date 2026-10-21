# Stabilization progress

Started: 2026-10-14

## Completed

### 1. Bound and cache Codex history loading

- Replaced global `Promise.all(readFile(...).split(...))` history loading with `CodexHistoryIndex` in `src/main/codexHistory.ts`.
- The index discovers newest paths first, caps discovery at 1,000 sessions, streams only the first 512 KiB needed for metadata, limits reads to eight concurrent workers, caches unchanged entries by mtime/size, and coalesces simultaneous calls.
- Opening an individual thread now streams its JSONL messages instead of buffering a full line array.
- Added regression coverage for bounded discovery, cache reuse, changed files, concurrent-call coalescing and streamed thread restoration.
- Validation after fix: `tests/codexHistory.test.ts` passed (15 tests); TypeScript check passed.

### 2. Safer coding-agent permission default

- Changed new renderer sessions from `full-access` to `default`, which maps to Codex `workspace-write`.
- Kept Full Access available in the existing picker and labeled it “use with care.” No Codex CLI capability was removed.
- Validation after fix: focused command/history tests passed (27 tests); TypeScript check passed.

### 3. More reliable project and thread loading

- Project file scans now ignore stale results after a project switch and show a failure message instead of silently failing.
- History refreshes verify the project still exists before updating state and surface retrieval failures.
- Opening a history now catches and displays resume/load failures. Skills refresh also reports failures.
- Validation after fix: focused history/project-file/command tests passed (31 tests); TypeScript check and production build passed.

### 4. Reliable process stop and bounded live output

- Replaced immediate stop completion with a single guarded terminal path. Stop now sends `SIGTERM`, waits for the child close event, and escalates to `SIGKILL` after five seconds if necessary.
- A terminal event can be emitted once only, so a stopped process closing with a non-zero code cannot overwrite the session as an error.
- Live process output is bounded to 4 MiB per running session with 64 KiB event chunks; retained stderr for an exit error is bounded to 64 KiB. A single visible notice explains output truncation while full CLI history remains on disk.
- Added controlled child-process regression tests for single exit, escalation and output truncation.
- Validation after fix: `tests/codexExecManager.test.ts` passed (3 tests); TypeScript check passed.

### 5. Full Access requires explicit confirmation

- Selecting Full Access now opens a confirmation dialog explaining that it bypasses sandbox and approval checks. The permission remains workspace write unless the user confirms.
- Added pure selection-policy tests.
- Validation after fix: `tests/permissionSelection.test.ts` passed (2 tests); TypeScript check passed.

### 6. Bounded, cancellable project scanning

- File listing now accepts an abort signal, has a 2-second deadline and stops after 10,000 inspected entries while retaining the existing 2,000-result limit.
- IPC cancels a renderer's previous project-file scan when a new one starts. Aborted scans return no stale result.
- Added cancellation and entry-bound regression tests.
- Validation after fix: `tests/projectFiles.test.ts` passed (5 tests); TypeScript check passed.

### 7. Navigation audit and production Electron smoke test

- Added [UI_CONTROL_AUDIT.md](UI_CONTROL_AUDIT.md). All existing controls were traced.
- Automations, Settings, project rename/path edit, permanent worktree, and Git branch creation are now visibly disabled with explanations instead of silently doing nothing.
- Git branch switch errors are surfaced in the existing error banner.
- Added `npm run test:electron-smoke`, which builds and launches the real local Electron binary with an isolated temporary profile. It verifies startup, project creation through the real renderer→preload→IPC path (using a test-only temporary dialog fixture), persisted-project loading, project switching through a thread action, Skills navigation, New Thread return, thread-control presence, and disabled unavailable navigation.
- Validation after fix: Electron smoke test passed.

## Investigated features

| Feature | Stabilization decision |
|---|---|
| Automations | No implementation exists beyond a sidebar button. It is now visibly disabled; workflow behavior requires the Gwira workflow/task design. |
| Settings | No state model, page or IPC exists. It is now visibly disabled; local preferences need a defined schema and tests, while organization/account settings belong to Gwira Core. |
| Skills | Existing local discovery, refresh, detail, enable/disable and uninstall flows are real. Error visibility was improved. Installing/trusting/executing third-party skills is not safe to add without provenance and permissions. |
| Project menu worktree/edit actions | No backend exists. Worktree, rename and path edit controls are now visibly disabled rather than silent no-ops. |

## Remaining stabilization work

1. Add a targeted high-frequency repeated project-selection test; the initial DOM-loop benchmark attempt timed out and is not a passing result.
2. Add a deliberate persistence policy for selected permission and session/transcript retention.
3. Add a confirmation/preflight for Git switching with a dirty worktree.
4. Run a minimal live Codex CLI/provider test only after approval for paid usage.
5. Define product/backend requirements before enabling Automations, Settings, project worktree/rename or Git branch creation.

## Validation record

- `npm test -- --run tests/codexHistory.test.ts tests/projectFiles.test.ts tests/codexCommand.test.ts`: passed, 3 files / 31 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:electron-smoke`: passed against the real local Electron binary and production build.
- `npm run test:electron-history`: passed for isolated 100/1,000/5,000 synthetic conversations; no OOM/crash and main heap recovered after GC.
- `npm run test:electron-agent-lifecycle`: passed against an isolated local mock CLI, including streaming, stop, resume, persistence, error handling, safe default and Full Access confirmation.

## Phase 1 final validation

- Added canonical real-path comparison for history matching, fixing macOS `/var` versus `/private/var` project/session mismatches. Regression coverage passed.
- See [PHASE_1_FINAL_REPORT.md](PHASE_1_FINAL_REPORT.md) for measurements, verified scope, remaining limitations and the validation-harness isolation note.

The host continues to warn that its Node 26 alpha runtime is unsupported by npm 11.19.0. No system-wide runtime change was made.
