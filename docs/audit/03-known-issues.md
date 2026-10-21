# Known issues and crash investigation

## Resolved in stabilization: unbounded Codex history loading

Evidence:

1. `listCodexHistories()` in `src/main/codexHistory.ts` recursively discovers **every** `.jsonl` in `~/.codex/sessions`.
2. It then performs `Promise.all(files.map(...readFile(...).split(...)))`: every file is read fully into memory, copied/split into an array, and parsed concurrently.
3. `listCodexHistoriesByCwd(cwd)` does this global load before filtering the target cwd.
4. Renderer `refreshAllProjectHistories()` calls it once per configured project whenever the project array changes; each completed execution triggers it again. First-run project discovery also calls `listCodexProjectCandidates()`, which performs the same global scan.

This directly explained multi-GB V8 heap use for a large accumulated Codex history, and created repeated concurrent work when multiple projects were configured. It was the most likely root cause of the reported `CALL_AND_RETRY_LAST Allocation failed` crash. This is code evidence, not a live reproduction: no large/private session corpus was inspected.

The temporary empty history replacement is **not** present: `codexHistory.ts` contains the full implementation. `codexHistory.ts.before-debug` is absent. Do not restore or overwrite anything.

### Safe reproduction protocol (manual, after approval)

1. Record baseline Electron renderer/main heap and the count/total size of `~/.codex/sessions` without opening contents.
2. Start with a new local user or temporarily point a test build at a synthetic, non-private session directory; use a small corpus then progressively larger JSONL files.
3. Add two or more project entries and capture IPC call count, main-process heap, elapsed time and number of open file reads.
4. Select/open a history, finish a turn, and compare post-refresh heap after GC where available.
5. Confirm small corpus behavior separately. Never alter real session data.

### Implemented correction (2026-10-14)

`CodexHistoryIndex` now walks newest date-named entries first, considers at most 1,000 session files, reads no more than the first 512 KiB of each changed file for metadata, limits metadata work to eight concurrent reads, and caches entries by mtime/size. Concurrent list requests share one in-flight refresh. Thread messages are streamed when a user explicitly opens a thread rather than first loading the full file into a line array. Regression tests use a synthetic session tree and verify bounded selection, cache reuse, changed-entry refresh and request coalescing.

This eliminates the prior all-files/all-content/concurrent allocation pattern. An isolated production-Electron benchmark subsequently passed at 100, 1,000 and 5,000 synthetic conversations (the latter capped to 1,000 visible histories) without OOM or crash; see `PHASE_1_FINAL_REPORT.md`. Remaining limitation: the sidebar shows only the newest 1,000 discovered sessions and full opened transcripts are intentionally retained in the active session for display. Pagination, transcript-size limits and high-frequency project-switch stress coverage remain follow-up work.

## Other important defects

| Severity | Finding | Evidence / impact | Proposed correction |
|---|---|---|---|
| Resolved | Full Access default | Renderer had initialized `permissionMode` to `full-access`; command emits `--dangerously-bypass-approvals-and-sandbox`. | New sessions now default to workspace write. Full Access remains an explicitly labeled opt-in; a confirmation dialog is future hardening. |
| Resolved | Stop race/double exit | Stop now marks intent, waits for one close terminal event and escalates TERM to KILL after five seconds. Regression tests cover non-zero stopped close and escalation. | Add real CLI cancellation coverage. |
| Partially resolved | Unbounded in-memory session/output | Live process output is capped at 4 MiB per session and 64 KiB per event; retained exit stderr is capped at 64 KiB. Opened historical transcripts and user prompts are still retained in memory for display. | Define transcript retention/truncation UX and add real-run stress test. |
| Resolved | Project scan can be expensive | Scan now has cancellation, a two-second deadline, a 10,000-entry ceiling and a 2,000-result limit. | Add telemetry/real large-repository test. |
| Resolved | Placeholder controls | Automations, Settings, worktree, rename/path edit and branch creation controls are visibly disabled with explanations. | Implement only after approved product/backend design. |
| Medium | Git switch UX | Runs `git switch` directly, may fail on dirty worktree and error propagation is weak. | Preflight status, confirmation, surfaced errors and timeout. |
| Low | Node runtime is experimental | npm warns Node 26.8.0-alpha is unsupported by npm 11.19.0; README targets Node 20+. | Validate supported LTS versions in CI; do not change this environment during audit. |

No UI crash was live-reproduced, so crashes outside the history path remain unverified. `projectFiles.ts`, `gitBranches.ts`, `main.tsx`, `ipc.ts`, and `scripts/dev.mjs` were inspected; only history provided a direct high-memory allocation pattern. `scripts/dev.mjs` does have simplistic SIGTERM-only child cleanup, but it is not evidence of the reported heap OOM.
